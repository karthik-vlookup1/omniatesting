-- =============================================================================
-- OMNIA RECON — Migration 011: report download log
-- -----------------------------------------------------------------------------
-- One row per tenant rent statement CSV or PDF download (JSON previews are not logged).
-- No FK on tenancy_id: other suites TRUNCATE tenancies without CASCADE.
-- =============================================================================

BEGIN;

CREATE TABLE report_downloads (
    id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    report       text NOT NULL CHECK (report IN ('tenant_statement')),
    format       text NOT NULL CHECK (format IN ('csv','pdf')),
    tenancy_id   uuid,
    tid          text NOT NULL,
    date_from    date NOT NULL,
    date_to      date NOT NULL,
    row_count    int NOT NULL,
    requested_by text NOT NULL,
    created_at   timestamptz NOT NULL DEFAULT now()
);

CREATE TRIGGER t_audit AFTER INSERT OR UPDATE OR DELETE ON report_downloads
    FOR EACH ROW EXECUTE FUNCTION audit_row();

COMMIT;
