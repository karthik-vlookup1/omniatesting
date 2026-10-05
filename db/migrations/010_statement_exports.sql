-- =============================================================================
-- OMNIA RECON — Migration 010: statement download log
-- -----------------------------------------------------------------------------
-- One row per filled-in bank statement CSV download. audit_log.action only allows row actions
-- (INSERT/UPDATE/DELETE), so this table is the download log; the audit trigger records who.
-- No FK on bank_account_id: other suites TRUNCATE bank_accounts without CASCADE.
-- =============================================================================

BEGIN;

CREATE TABLE statement_exports (
    id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    requested_by    text NOT NULL,
    bank_account_id uuid,
    date_from       date NOT NULL,
    date_to         date NOT NULL,
    statuses        text[] NOT NULL DEFAULT '{}',
    row_count       int NOT NULL,
    created_at      timestamptz NOT NULL DEFAULT now()
);

CREATE TRIGGER t_audit AFTER INSERT OR UPDATE OR DELETE ON statement_exports
    FOR EACH ROW EXECUTE FUNCTION audit_row();

COMMIT;
