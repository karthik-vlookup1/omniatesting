-- =============================================================================
-- OMNIA RECON — Migration 006: rent terms and the rent account
-- -----------------------------------------------------------------------------
-- Staff set rent, benefit awards and payer splits in the app; rent charges per
-- period per payer are generated from them. Opt-in per tenancy (charges_from), so
-- Veco-synced tenancies are not given years of invented arrears.
-- generate_rent_charges(uuid, date) from 001 is unchanged; a 3-argument overload
-- adds the start date. Xero stays the ledger of record: nothing here posts to it.
-- =============================================================================

BEGIN;

-- NULL = no rent account for this tenancy.
ALTER TABLE tenancies ADD COLUMN charges_from date;

-- Earliest date whose charges are stale and must be regenerated.
CREATE TABLE rent_charge_dirty (
    tenancy_id uuid PRIMARY KEY REFERENCES tenancies(id) ON DELETE CASCADE,
    from_date  date NOT NULL
);

-- Same as the 2-argument version, but periods that end before p_from are skipped.
CREATE FUNCTION generate_rent_charges(p_tenancy uuid, p_until date, p_from date) RETURNS integer
LANGUAGE plpgsql AS $$
DECLARE
    t   tenancies%ROWTYPE;
    s   rent_schedules%ROWTYPE;
    sp  payer_splits%ROWTYPE;
    n   integer;
    ps  date; pe date; eff_end date;
    full_rent numeric; rent numeric; share numeric; third_party numeric;
    created integer := 0;
BEGIN
    SELECT * INTO t FROM tenancies WHERE id = p_tenancy;
    FOR s IN SELECT * FROM rent_schedules WHERE tenancy_id = p_tenancy ORDER BY effective_from LOOP
        n := 0;
        LOOP
            ps := period_start_n(s.effective_from, s.frequency, n);
            pe := period_start_n(s.effective_from, s.frequency, n + 1) - 1;
            EXIT WHEN ps > p_until
                   OR (s.effective_to IS NOT NULL AND ps > s.effective_to)
                   OR (t.end_date IS NOT NULL AND ps > t.end_date);
            full_rent := s.amount;
            rent := full_rent;
            eff_end := least(pe, coalesce(t.end_date, pe), coalesce(s.effective_to, pe));
            IF eff_end < p_from THEN
                n := n + 1;
                CONTINUE;
            END IF;
            IF eff_end < pe THEN                                   -- pro-rate the last period
                rent := round(full_rent * (eff_end - ps + 1) / (pe - ps + 1), 2);
            END IF;

            third_party := 0;
            FOR sp IN SELECT * FROM payer_splits
                       WHERE tenancy_id = p_tenancy AND effective_from <= ps
                         AND (effective_to IS NULL OR effective_to >= ps)
                       ORDER BY payer LOOP
                share := CASE WHEN sp.share_percent IS NOT NULL
                              THEN round(rent * sp.share_percent / 100, 2)
                              ELSE round(sp.fixed_amount * rent / nullif(full_rent,0), 2) END;
                share := least(share, rent - third_party);             -- never more than the rent
                IF share > 0 THEN
                    INSERT INTO rent_charges (tenancy_id, payer, period_start, period_end, due_date, amount, rent_schedule_id)
                    VALUES (p_tenancy, sp.payer, ps, eff_end, ps, share, s.id)
                    ON CONFLICT DO NOTHING;
                    IF FOUND THEN created := created + 1; END IF;
                    third_party := third_party + share;
                END IF;
            END LOOP;

            IF rent - third_party > 0 THEN
                INSERT INTO rent_charges (tenancy_id, payer, period_start, period_end, due_date, amount, rent_schedule_id)
                VALUES (p_tenancy, 'tenant', ps, eff_end, ps, rent - third_party, s.id)
                ON CONFLICT DO NOTHING;
                IF FOUND THEN created := created + 1; END IF;
            END IF;
            n := n + 1;
        END LOOP;
    END LOOP;
    RETURN created;
END $$;

-- Marks the tenancy's charges stale from the earliest date a change can affect.
CREATE FUNCTION mark_rent_dirty() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
    o jsonb := CASE WHEN TG_OP IN ('UPDATE','DELETE') THEN to_jsonb(OLD) END;
    n jsonb := CASE WHEN TG_OP IN ('INSERT','UPDATE') THEN to_jsonb(NEW) END;
    d date;
    k uuid;
    f text;
    changed boolean;
    o_to date; n_to date;
BEGIN
    IF TG_TABLE_NAME = 'tenancies' THEN
        k := NEW.id;
        IF NEW.charges_from IS DISTINCT FROM OLD.charges_from THEN
            d := '-infinity'::date;
        ELSIF NEW.end_date IS DISTINCT FROM OLD.end_date THEN
            d := least(coalesce(OLD.end_date, NEW.end_date), coalesce(NEW.end_date, OLD.end_date));
        ELSE
            RETURN NULL;
        END IF;
    ELSE
        k := coalesce(n->>'tenancy_id', o->>'tenancy_id')::uuid;
        IF TG_OP = 'INSERT' THEN
            d := (n->>'effective_from')::date;
        ELSIF TG_OP = 'DELETE' THEN
            d := (o->>'effective_from')::date;
        ELSE
            changed := false;
            FOREACH f IN ARRAY ARRAY['amount','frequency','share_percent','fixed_amount','payer','effective_from'] LOOP
                IF (n->f) IS DISTINCT FROM (o->f) THEN changed := true; END IF;
            END LOOP;
            IF changed THEN
                d := least((o->>'effective_from')::date, (n->>'effective_from')::date);
            ELSIF (n->>'effective_to') IS DISTINCT FROM (o->>'effective_to') THEN
                o_to := (o->>'effective_to')::date;
                n_to := (n->>'effective_to')::date;
                d := least(coalesce(o_to, n_to), coalesce(n_to, o_to));
            ELSE
                RETURN NULL;
            END IF;
        END IF;
    END IF;

    INSERT INTO rent_charge_dirty (tenancy_id, from_date)
    SELECT id, d FROM tenancies WHERE id = k AND charges_from IS NOT NULL
    ON CONFLICT (tenancy_id) DO UPDATE
        SET from_date = least(rent_charge_dirty.from_date, EXCLUDED.from_date);
    RETURN NULL;
END $$;

CREATE TRIGGER t_rent_dirty AFTER INSERT OR UPDATE OR DELETE ON rent_schedules
    FOR EACH ROW EXECUTE FUNCTION mark_rent_dirty();
CREATE TRIGGER t_rent_dirty AFTER INSERT OR UPDATE OR DELETE ON payer_splits
    FOR EACH ROW EXECUTE FUNCTION mark_rent_dirty();
CREATE TRIGGER t_rent_dirty AFTER UPDATE OF end_date, charges_from ON tenancies
    FOR EACH ROW EXECUTE FUNCTION mark_rent_dirty();

-- Brings a tenancy's schedule charges up to date: drops stale ones, generates missing ones
-- up to today, re-applies receipts. Returns the number of charge rows created.
CREATE FUNCTION refresh_rent_charges(p_tenancy uuid) RETURNS integer LANGUAGE plpgsql AS $$
DECLARE
    t tenancies%ROWTYPE;
    fd date;
    n integer;
BEGIN
    SELECT * INTO t FROM tenancies WHERE id = p_tenancy FOR UPDATE;   -- serialises the job and the API
    IF NOT FOUND OR t.charges_from IS NULL THEN RETURN 0; END IF;

    SELECT from_date INTO fd FROM rent_charge_dirty WHERE tenancy_id = p_tenancy;
    IF FOUND THEN
        DELETE FROM allocations a USING rent_charges rc
         WHERE a.rent_charge_id = rc.id AND rc.tenancy_id = p_tenancy
           AND rc.source = 'schedule' AND rc.period_end >= fd;
        DELETE FROM rent_charges
         WHERE tenancy_id = p_tenancy AND source = 'schedule' AND period_end >= fd;
        DELETE FROM rent_charge_dirty WHERE tenancy_id = p_tenancy;
    END IF;

    n := generate_rent_charges(p_tenancy, current_date, t.charges_from);
    PERFORM reallocate_tenancy(p_tenancy);
    RETURN n;
END $$;

COMMIT;
