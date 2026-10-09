-- =============================================================================
-- OMNIA RECON — Migration 020: charge generator v2
-- -----------------------------------------------------------------------------
-- Rent periods are anchored on a per-schedule anchor_date that survives rent changes of the
-- same frequency (the rent day stays put). A rent change or payer split mid-period cuts the
-- period into pieces, pro-rated by actual days, that sum exactly to the segment rent. A period
-- that starts before the tenancy's charges_from belongs to the old system and is skipped whole.
-- =============================================================================

BEGIN;

ALTER TABLE rent_schedules ADD COLUMN anchor_date date;

-- Anchor = previous schedule's anchor if it has the same frequency, else this schedule's start.
CREATE FUNCTION set_schedule_anchor() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
    prev rent_schedules%ROWTYPE;
BEGIN
    SELECT * INTO prev FROM rent_schedules
     WHERE tenancy_id = NEW.tenancy_id AND effective_from < NEW.effective_from AND id <> NEW.id
     ORDER BY effective_from DESC LIMIT 1;
    IF FOUND AND prev.frequency = NEW.frequency AND prev.anchor_date IS NOT NULL THEN
        NEW.anchor_date := prev.anchor_date;
    ELSE
        NEW.anchor_date := NEW.effective_from;
    END IF;
    RETURN NEW;
END $$;

-- Backfill in effective_from order with the same rule.
DO $$
DECLARE
    s rent_schedules%ROWTYPE;
    prev_t uuid; prev_f rent_frequency; prev_a date; a date;
BEGIN
    FOR s IN SELECT * FROM rent_schedules ORDER BY tenancy_id, effective_from LOOP
        IF prev_t = s.tenancy_id AND prev_f = s.frequency THEN a := prev_a; ELSE a := s.effective_from; END IF;
        UPDATE rent_schedules SET anchor_date = a WHERE id = s.id;
        prev_t := s.tenancy_id; prev_f := s.frequency; prev_a := a;
    END LOOP;
END $$;

ALTER TABLE rent_schedules ALTER COLUMN anchor_date SET NOT NULL;
ALTER TABLE rent_schedules ADD CONSTRAINT rent_schedules_anchor_chk CHECK (anchor_date <= effective_from);

CREATE TRIGGER t_schedule_anchor BEFORE INSERT OR UPDATE OF frequency, effective_from ON rent_schedules
    FOR EACH ROW EXECUTE FUNCTION set_schedule_anchor();

-- Creates any missing schedule charges up to p_until (inclusive). Safe to re-run.
CREATE OR REPLACE FUNCTION generate_rent_charges(p_tenancy uuid, p_until date, p_from date) RETURNS integer
LANGUAGE plpgsql AS $$
DECLARE
    t   tenancies%ROWTYPE;
    s   rent_schedules%ROWTYPE;
    sp  payer_splits%ROWTYPE;
    n   integer;
    aps date; ape date;
    sa  date; sb date;                       -- segment bounds
    seg_rent numeric; seg_days integer;
    starts date[]; k integer;
    pa  date; pb date; prent numeric; paid numeric;
    share numeric; third_party numeric;
    created integer := 0;
BEGIN
    SELECT * INTO t FROM tenancies WHERE id = p_tenancy;
    FOR s IN SELECT * FROM rent_schedules WHERE tenancy_id = p_tenancy ORDER BY effective_from LOOP
        n := 0;
        LOOP
            aps := period_start_n(s.anchor_date, s.frequency, n);
            ape := period_start_n(s.anchor_date, s.frequency, n + 1) - 1;
            n := n + 1;
            CONTINUE WHEN ape < s.effective_from;
            EXIT WHEN aps > p_until
                   OR (s.effective_to IS NOT NULL AND aps > s.effective_to)
                   OR (t.end_date IS NOT NULL AND aps > t.end_date);
            CONTINUE WHEN aps < p_from;      -- belongs to the old system

            sa := greatest(aps, s.effective_from);
            sb := least(ape, coalesce(s.effective_to, ape), coalesce(t.end_date, ape));
            CONTINUE WHEN sb < sa;
            seg_days := sb - sa + 1;
            IF sa = aps AND sb = ape THEN
                seg_rent := s.amount;
            ELSE
                seg_rent := round(s.amount * seg_days / (ape - aps + 1), 2);
            END IF;

            -- cut the segment at every payer split boundary inside it
            SELECT array_agg(d ORDER BY d) INTO starts FROM (
                SELECT sa AS d
                UNION
                SELECT effective_from FROM payer_splits
                 WHERE tenancy_id = p_tenancy AND effective_from > sa AND effective_from <= sb
                UNION
                SELECT effective_to + 1 FROM payer_splits
                 WHERE tenancy_id = p_tenancy AND effective_to IS NOT NULL
                   AND effective_to + 1 > sa AND effective_to + 1 <= sb
            ) c;

            paid := 0;
            FOR k IN 1 .. array_length(starts, 1) LOOP
                pa := starts[k];
                pb := CASE WHEN k < array_length(starts, 1) THEN starts[k + 1] - 1 ELSE sb END;
                IF k = array_length(starts, 1) THEN
                    prent := seg_rent - paid;
                ELSE
                    prent := round(seg_rent * (pb - pa + 1) / seg_days, 2);
                    paid := paid + prent;
                END IF;

                third_party := 0;
                FOR sp IN SELECT * FROM payer_splits
                           WHERE tenancy_id = p_tenancy AND effective_from <= pa
                             AND (effective_to IS NULL OR effective_to >= pa)
                           ORDER BY payer LOOP
                    share := CASE WHEN sp.share_percent IS NOT NULL
                                  THEN round(prent * sp.share_percent / 100, 2)
                                  ELSE round(sp.fixed_amount * prent / nullif(s.amount, 0), 2) END;
                    share := least(share, prent - third_party);
                    IF share > 0 THEN
                        INSERT INTO rent_charges (tenancy_id, payer, period_start, period_end, due_date, amount, rent_schedule_id)
                        VALUES (p_tenancy, sp.payer, pa, pb, aps, share, s.id)
                        ON CONFLICT DO NOTHING;
                        IF FOUND THEN created := created + 1; END IF;
                        third_party := third_party + share;
                    END IF;
                END LOOP;

                IF prent - third_party > 0 THEN
                    INSERT INTO rent_charges (tenancy_id, payer, period_start, period_end, due_date, amount, rent_schedule_id)
                    VALUES (p_tenancy, 'tenant', pa, pb, aps, prent - third_party, s.id)
                    ON CONFLICT DO NOTHING;
                    IF FOUND THEN created := created + 1; END IF;
                END IF;
            END LOOP;
        END LOOP;
    END LOOP;
    RETURN created;
END $$;

CREATE OR REPLACE FUNCTION generate_rent_charges(p_tenancy uuid, p_until date) RETURNS integer
LANGUAGE sql AS $$ SELECT generate_rent_charges(p_tenancy, p_until, '-infinity'::date) $$;

-- Existing charges were made by the old rules: regenerate every rent account.
INSERT INTO rent_charge_dirty (tenancy_id, from_date)
SELECT id, '-infinity'::date FROM tenancies WHERE charges_from IS NOT NULL
ON CONFLICT (tenancy_id) DO UPDATE SET from_date = '-infinity'::date;

COMMIT;
