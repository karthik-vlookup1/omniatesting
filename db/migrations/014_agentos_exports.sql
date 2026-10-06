-- =============================================================================
-- OMNIA RECON — Migration 014: agentOS Take a Payment CSV export, export-once, mark posted
-- -----------------------------------------------------------------------------
-- agentos_exports stores each generated CSV verbatim so re-downloads are byte-stable even if
-- tenants change later. Each matched intake line is exported at most once
-- (not_ready|ready -> exported -> posted); the CHECKs make an 'exported' line without an export
-- (or a 'posted' line without posted_at/posted_by) impossible.
-- =============================================================================

BEGIN;

CREATE TABLE agentos_exports (
    id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    batch_id           uuid NOT NULL REFERENCES agentos_intake_batches(id) ON DELETE CASCADE,
    rows_total         int NOT NULL CHECK (rows_total >= 0),
    amount_total_pence bigint NOT NULL CHECK (amount_total_pence >= 0),
    csv                text NOT NULL,
    created_by         uuid NOT NULL REFERENCES app_users(id),
    created_at         timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX ON agentos_exports (batch_id);

CREATE TRIGGER t_audit AFTER INSERT OR UPDATE OR DELETE ON agentos_exports
    FOR EACH ROW EXECUTE FUNCTION audit_row();

ALTER TABLE agentos_intake_lines
    ADD COLUMN export_id uuid REFERENCES agentos_exports(id),
    ADD COLUMN posted_at timestamptz,
    ADD COLUMN posted_by uuid REFERENCES app_users(id),
    ADD CONSTRAINT agentos_intake_lines_export_chk
        CHECK ((posting_status IN ('exported','posted')) = (export_id IS NOT NULL)),
    ADD CONSTRAINT agentos_intake_lines_posted_chk
        CHECK ((posting_status = 'posted') = (posted_at IS NOT NULL AND posted_by IS NOT NULL));
CREATE INDEX ON agentos_intake_lines (export_id);

COMMIT;
