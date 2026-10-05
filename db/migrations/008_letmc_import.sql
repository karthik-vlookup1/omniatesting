-- =============================================================================
-- OMNIA RECON — Migration 008: LetMC import
-- -----------------------------------------------------------------------------
-- Records each LetMC CSV import run and the opening balance carried over for a
-- tenancy per payer at the cutover date. An opening arrear is a rent_charges row
-- (source 'opening_balance'); an opening credit is a negative adjustment.
-- =============================================================================

BEGIN;

-- Not used inside this migration (a new enum value cannot be used in its own transaction).
ALTER TYPE adjustment_kind ADD VALUE IF NOT EXISTS 'opening_balance';

CREATE TABLE letmc_import_runs (
    id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    entity_type   text NOT NULL CHECK (entity_type IN ('landlords', 'properties', 'tenants', 'tenancies')),
    file_name     text NOT NULL,
    file_sha256   text NOT NULL,
    cutover_date  date,
    counts        jsonb NOT NULL,
    created_by    uuid REFERENCES app_users(id),
    created_at    timestamptz NOT NULL DEFAULT now(),
    CHECK ((entity_type = 'tenancies') = (cutover_date IS NOT NULL))
);

CREATE TABLE letmc_opening_balances (
    id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenancy_id     uuid NOT NULL REFERENCES tenancies(id) ON DELETE CASCADE,
    payer          payer_type NOT NULL,
    cutover_date   date NOT NULL,
    amount_pence   bigint NOT NULL CHECK (amount_pence <> 0),
    rent_charge_id uuid REFERENCES rent_charges(id),
    adjustment_id  uuid REFERENCES adjustments(id),
    import_run_id  uuid NOT NULL REFERENCES letmc_import_runs(id),
    UNIQUE (tenancy_id, payer),
    CHECK ((rent_charge_id IS NULL) <> (adjustment_id IS NULL))
);

CREATE TRIGGER t_audit AFTER INSERT OR UPDATE OR DELETE ON letmc_import_runs
    FOR EACH ROW EXECUTE FUNCTION audit_row();
CREATE TRIGGER t_audit AFTER INSERT OR UPDATE OR DELETE ON letmc_opening_balances
    FOR EACH ROW EXECUTE FUNCTION audit_row();

COMMIT;
