-- =============================================================================
-- OMNIA RECON — Migration 013: agentOS formatted bank record intake
-- -----------------------------------------------------------------------------
-- One batch per uploaded CSV (Date,TID,Payer Name,Amount,Type,Will deposit to,Description),
-- one line per incoming payment. Lines start 'pending'; matching is added later (recon-503).
-- agentos_tenant_id is ON DELETE SET NULL so agentos-seed can still DELETE FROM agentos_tenants.
-- =============================================================================

BEGIN;

CREATE TABLE agentos_intake_batches (
    id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    file_name          text NOT NULL,
    file_sha256        text NOT NULL UNIQUE CHECK (file_sha256 ~ '^[0-9a-f]{64}$'),
    rows_total         int NOT NULL CHECK (rows_total > 0),
    amount_total_pence bigint NOT NULL CHECK (amount_total_pence > 0),
    period_from        date NOT NULL,
    period_to          date NOT NULL,
    uploaded_by        uuid NOT NULL REFERENCES app_users(id),
    uploaded_at        timestamptz NOT NULL DEFAULT now(),
    CHECK (period_from <= period_to)
);

CREATE TABLE agentos_intake_lines (
    id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    batch_id           uuid NOT NULL REFERENCES agentos_intake_batches(id) ON DELETE CASCADE,
    line_no            int NOT NULL CHECK (line_no >= 2),
    received_on        date NOT NULL,
    tid_raw            text CHECK (tid_raw ~ '^\d{4}$'),
    payer_name         text NOT NULL CHECK (length(payer_name) BETWEEN 1 AND 200),
    amount_pence       integer NOT NULL CHECK (amount_pence > 0),
    payment_type       text NOT NULL,
    deposit_to         text NOT NULL,
    description        text NOT NULL DEFAULT '',
    warnings           text[] NOT NULL DEFAULT '{}',
    match_status       text NOT NULL DEFAULT 'pending'
                       CHECK (match_status IN ('pending','matched','name_mismatch','unmatched','deposit_mismatch')),
    agentos_tenant_id  uuid REFERENCES agentos_tenants(id) ON DELETE SET NULL,
    posting_status     text NOT NULL DEFAULT 'not_ready'
                       CHECK (posting_status IN ('not_ready','ready','exported','posted')),
    created_at         timestamptz NOT NULL DEFAULT now(),
    updated_at         timestamptz NOT NULL DEFAULT now(),
    UNIQUE (batch_id, line_no)
);
CREATE INDEX ON agentos_intake_lines (tid_raw);
CREATE INDEX ON agentos_intake_lines (match_status);

CREATE TRIGGER t_audit AFTER INSERT OR UPDATE OR DELETE ON agentos_intake_batches
    FOR EACH ROW EXECUTE FUNCTION audit_row();
CREATE TRIGGER t_audit AFTER INSERT OR UPDATE OR DELETE ON agentos_intake_lines
    FOR EACH ROW EXECUTE FUNCTION audit_row();

COMMIT;
