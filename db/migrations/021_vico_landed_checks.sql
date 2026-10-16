-- =============================================================================
-- OMNIA RECON — Migration 021: Vico landed checks
-- -----------------------------------------------------------------------------
-- One row per Vico export: the latest read-only check of whether its receipts show in VECO as SLP rows.
-- id exists because audit_row() reads NEW.id/OLD.id; export_id is the upsert key.
-- No FK on export_id: it is external_refs.external_key2 (not unique), and other suites TRUNCATE external_refs.
-- =============================================================================

BEGIN;

CREATE TABLE vico_landed_checks (
    id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    export_id             text NOT NULL UNIQUE,
    checked_at            timestamptz NOT NULL,
    snapshot_refreshed_at text CHECK (snapshot_refreshed_at ~ '^\d{4}-\d{2}-\d{2} \d{2}:\d{2}$'),
    rows                  int NOT NULL CHECK (rows >= 0),
    landed                int NOT NULL CHECK (landed BETWEEN 0 AND rows),
    total_amount          numeric(12,2) NOT NULL,
    landed_amount         numeric(12,2) NOT NULL,
    banks                 jsonb NOT NULL DEFAULT '[]'
);

COMMENT ON COLUMN vico_landed_checks.snapshot_refreshed_at IS
    'VECO snapshot last_refreshed as UK local wall-clock time, YYYY-MM-DD HH:MM. Not a UTC instant.';

CREATE TRIGGER t_audit AFTER INSERT OR UPDATE OR DELETE ON vico_landed_checks
    FOR EACH ROW EXECUTE FUNCTION audit_row();

COMMIT;
