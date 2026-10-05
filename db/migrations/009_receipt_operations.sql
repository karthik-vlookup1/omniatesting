-- =============================================================================
-- OMNIA RECON — Migration 009: receipt operations
-- -----------------------------------------------------------------------------
-- Split / remittance receipts, manual allocation overrides, reversal, write-offs
-- and refunds. Adds the columns those need, makes allocate_oldest_first respect a
-- manual override, makes refresh_rent_charges keep manual pins, and adds
-- recompute_line_status for reversal.
-- =============================================================================

BEGIN;

ALTER TABLE receipts
    ADD COLUMN allocation_mode     text NOT NULL DEFAULT 'auto' CHECK (allocation_mode IN ('auto', 'manual')),
    ADD COLUMN reversed_by         uuid REFERENCES app_users(id),
    ADD COLUMN reversed_at         timestamptz,
    ADD COLUMN external_correction text;

ALTER TABLE adjustments
    ADD COLUMN reverses_adjustment_id uuid UNIQUE REFERENCES adjustments(id),
    ADD CONSTRAINT adjustments_reverses_is_correction
        CHECK (reverses_adjustment_id IS NULL OR kind = 'correction');

-- An advice is superseded when every receipt made from its line has been reversed; that frees the
-- line for a new upload (same file or another).
ALTER TABLE remittance_advices ADD COLUMN superseded_at timestamptz;
CREATE UNIQUE INDEX remittance_advices_bank_txn_uq ON remittance_advices (bank_transaction_id)
    WHERE bank_transaction_id IS NOT NULL AND superseded_at IS NULL;

CREATE TRIGGER t_audit AFTER INSERT OR UPDATE OR DELETE ON remittance_advices
    FOR EACH ROW EXECUTE FUNCTION audit_row();
CREATE TRIGGER t_audit AFTER INSERT OR UPDATE OR DELETE ON remittance_lines
    FOR EACH ROW EXECUTE FUNCTION audit_row();

-- 001 body, plus: a receipt pinned by hand (allocation_mode 'manual') is never auto-allocated.
CREATE OR REPLACE FUNCTION allocate_oldest_first(p_receipt uuid) RETURNS numeric
LANGUAGE plpgsql AS $$
DECLARE
    r receipts%ROWTYPE;
    c record;
    remaining numeric;
    take numeric;
BEGIN
    SELECT * INTO r FROM receipts WHERE id = p_receipt FOR UPDATE;
    IF r.status <> 'active' THEN RETURN 0; END IF;
    IF r.allocation_mode = 'manual' THEN
        RETURN r.amount - coalesce((SELECT sum(amount) FROM allocations WHERE receipt_id = p_receipt), 0);
    END IF;
    remaining := r.amount - coalesce((SELECT sum(amount) FROM allocations WHERE receipt_id = p_receipt), 0);

    FOR c IN
        SELECT rc.id, rc.amount - coalesce(sum(a.amount), 0) AS outstanding
          FROM rent_charges rc
          LEFT JOIN allocations a ON a.rent_charge_id = rc.id
         WHERE rc.tenancy_id = r.tenancy_id AND rc.payer = r.payer
         GROUP BY rc.id
        HAVING rc.amount - coalesce(sum(a.amount), 0) > 0
         ORDER BY rc.due_date, rc.period_start
    LOOP
        EXIT WHEN remaining <= 0;
        take := least(remaining, c.outstanding);
        INSERT INTO allocations (receipt_id, rent_charge_id, amount)
        VALUES (p_receipt, c.id, take)
        ON CONFLICT (receipt_id, rent_charge_id) DO UPDATE SET amount = allocations.amount + EXCLUDED.amount;
        remaining := remaining - take;
    END LOOP;
    RETURN remaining;          -- > 0 means credit / overpayment
END $$;

-- 006 body, plus: manual allocation pins on schedule charges are re-applied to the regenerated
-- charge of the same payer and period, so a rent change never silently drops a manual override.
CREATE OR REPLACE FUNCTION refresh_rent_charges(p_tenancy uuid) RETURNS integer LANGUAGE plpgsql AS $$
DECLARE
    t tenancies%ROWTYPE;
    fd date;
    n integer;
    v_pins jsonb;
    pin jsonb;
    v_charge uuid;
    v_out numeric;
    v_take numeric;
BEGIN
    SELECT * INTO t FROM tenancies WHERE id = p_tenancy FOR UPDATE;   -- serialises the job and the API
    IF NOT FOUND OR t.charges_from IS NULL THEN RETURN 0; END IF;

    SELECT from_date INTO fd FROM rent_charge_dirty WHERE tenancy_id = p_tenancy;
    IF FOUND THEN
        v_pins := (SELECT jsonb_agg(jsonb_build_object('r', a.receipt_id, 'p', rc.payer, 's', rc.period_start,
                                                       'a', a.amount, 'by', a.allocated_by))
                     FROM allocations a
                     JOIN rent_charges rc ON rc.id = a.rent_charge_id
                     JOIN receipts r ON r.id = a.receipt_id
                    WHERE rc.tenancy_id = p_tenancy AND rc.source = 'schedule' AND rc.period_end >= fd
                      AND r.allocation_mode = 'manual');
        DELETE FROM allocations a USING rent_charges rc
         WHERE a.rent_charge_id = rc.id AND rc.tenancy_id = p_tenancy
           AND rc.source = 'schedule' AND rc.period_end >= fd;
        DELETE FROM rent_charges
         WHERE tenancy_id = p_tenancy AND source = 'schedule' AND period_end >= fd;
        DELETE FROM rent_charge_dirty WHERE tenancy_id = p_tenancy;
    END IF;

    n := generate_rent_charges(p_tenancy, current_date, t.charges_from);

    IF v_pins IS NOT NULL THEN
        FOR pin IN SELECT * FROM jsonb_array_elements(v_pins)
        LOOP
            SELECT rc.id, rc.amount - coalesce((SELECT sum(a.amount) FROM allocations a WHERE a.rent_charge_id = rc.id), 0)
              INTO v_charge, v_out
              FROM rent_charges rc
             WHERE rc.tenancy_id = p_tenancy AND rc.source = 'schedule'
               AND rc.payer = (pin->>'p')::payer_type AND rc.period_start = (pin->>'s')::date
             LIMIT 1;
            CONTINUE WHEN v_charge IS NULL;
            v_take := least((pin->>'a')::numeric, v_out,
                            (SELECT r.amount FROM receipts r WHERE r.id = (pin->>'r')::uuid)
                            - coalesce((SELECT sum(a.amount) FROM allocations a WHERE a.receipt_id = (pin->>'r')::uuid), 0));
            CONTINUE WHEN v_take <= 0;
            INSERT INTO allocations (receipt_id, rent_charge_id, amount, allocated_by)
            VALUES ((pin->>'r')::uuid, v_charge, v_take, pin->>'by')
            ON CONFLICT (receipt_id, rent_charge_id) DO UPDATE SET amount = allocations.amount + EXCLUDED.amount;
        END LOOP;
    END IF;

    PERFORM reallocate_tenancy(p_tenancy);
    RETURN n;
END $$;

-- Sets a bank line's status from its active receipts (used after a reversal).
CREATE FUNCTION recompute_line_status(p_txn uuid) RETURNS void LANGUAGE plpgsql AS $$
DECLARE
    bt bank_transactions%ROWTYPE;
    s  numeric;
BEGIN
    SELECT * INTO bt FROM bank_transactions WHERE id = p_txn FOR UPDATE;
    IF NOT FOUND THEN RETURN; END IF;
    SELECT coalesce(sum(amount), 0) INTO s FROM receipts WHERE bank_transaction_id = p_txn AND status = 'active';
    IF s = 0 THEN
        UPDATE bank_transactions
           SET status = 'needs_review', resolved_tenancy_id = NULL, resolved_via = NULL, note = 'Receipt reversed'
         WHERE id = p_txn;
        UPDATE remittance_advices SET superseded_at = now()
         WHERE bank_transaction_id = p_txn AND superseded_at IS NULL;
    ELSE
        -- resolved_tenancy_id must point at a receipt that is still active (the oldest one).
        UPDATE bank_transactions
           SET status = CASE WHEN s < bt.amount THEN 'partially_matched' ELSE 'matched' END::txn_status,
               resolved_tenancy_id = (SELECT r.tenancy_id FROM receipts r
                                       WHERE r.bank_transaction_id = p_txn AND r.status = 'active'
                                       ORDER BY r.created_at, r.id LIMIT 1)
         WHERE id = p_txn;
    END IF;
END $$;

COMMIT;
