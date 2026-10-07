-- =============================================================================
-- OMNIA RECON — Migration 018: Omnia ledger (append-only double entry) + single Take a Payment
-- -----------------------------------------------------------------------------
-- ledger_transactions + ledger_postings: every transaction has at least 2 postings summing to 0
-- (deferred constraint trigger), is idempotent through idempotency_key = kind:source_id, and rows
-- can never be updated or deleted (history cannot be rewritten). A + posting credits the account
-- (a tenant paying in); a tenant's balance is the sum of its postings.
-- agentos_payments holds one manual Take a Payment; agentos_exports gets a 'manual' source so the
-- existing CSV download serves manual exports unchanged.
-- Note: agentos_payment_types has no id column, so audit_row() (which reads NEW.id) is not attached.
-- =============================================================================

BEGIN;
SET LOCAL app.user_email = 'migration:018';

CREATE TABLE ledger_transactions (
    id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    kind            text NOT NULL CHECK (kind IN ('take_payment','journal_transfer')),
    source_id       uuid NOT NULL,
    idempotency_key text NOT NULL UNIQUE CHECK (idempotency_key = kind || ':' || source_id::text),
    effective_on    date NOT NULL DEFAULT current_date,
    description     text NOT NULL CHECK (char_length(description) BETWEEN 1 AND 300),
    created_by      uuid NOT NULL REFERENCES app_users(id),
    created_at      timestamptz NOT NULL DEFAULT now(),
    UNIQUE (kind, source_id)
);

CREATE TABLE ledger_postings (
    id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    transaction_id uuid NOT NULL REFERENCES ledger_transactions(id),
    account_kind   text NOT NULL CHECK (account_kind IN ('tenant','bank')),
    account_ref    text NOT NULL,
    account_type   text CHECK (char_length(account_type) BETWEEN 1 AND 50),
    amount_pence   bigint NOT NULL CHECK (amount_pence <> 0 AND abs(amount_pence) <= 9999999999),
    created_at     timestamptz NOT NULL DEFAULT now(),
    CHECK (account_kind <> 'tenant' OR account_ref ~ '^\d{4,5}$')
);
CREATE INDEX ON ledger_postings (account_kind, account_ref);
CREATE INDEX ON ledger_postings (transaction_id);

CREATE FUNCTION ledger_zero_sum() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE tx uuid;
BEGIN
  IF TG_TABLE_NAME = 'ledger_transactions' THEN
    tx := NEW.id;
  ELSE
    tx := NEW.transaction_id;
  END IF;
  IF (SELECT count(*) < 2 OR coalesce(sum(amount_pence),0) <> 0
        FROM ledger_postings WHERE transaction_id = tx) THEN
    RAISE EXCEPTION 'ledger transaction % must have at least 2 postings summing to 0', tx;
  END IF;
  RETURN NULL;
END $$;

CREATE CONSTRAINT TRIGGER t_zero_sum AFTER INSERT ON ledger_postings
    DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION ledger_zero_sum();
CREATE CONSTRAINT TRIGGER t_zero_sum AFTER INSERT ON ledger_transactions
    DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION ledger_zero_sum();

CREATE FUNCTION ledger_append_only() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'ledger rows are append-only';
END $$;

CREATE TRIGGER t_append_only BEFORE UPDATE OR DELETE ON ledger_transactions
    FOR EACH ROW EXECUTE FUNCTION ledger_append_only();
CREATE TRIGGER t_append_only BEFORE UPDATE OR DELETE ON ledger_postings
    FOR EACH ROW EXECUTE FUNCTION ledger_append_only();

CREATE TRIGGER t_audit AFTER INSERT OR UPDATE OR DELETE ON ledger_transactions
    FOR EACH ROW EXECUTE FUNCTION audit_row();
CREATE TRIGGER t_audit AFTER INSERT OR UPDATE OR DELETE ON ledger_postings
    FOR EACH ROW EXECUTE FUNCTION audit_row();

CREATE VIEW ledger_balances AS
    SELECT account_kind, account_ref,
           sum(amount_pence)::bigint AS balance_pence,
           count(*)::int AS postings,
           max(created_at) AS last_posted_at
      FROM ledger_postings
     GROUP BY account_kind, account_ref;

CREATE TABLE agentos_payment_types (
    code       text PRIMARY KEY CHECK (code ~ '^[A-Z_]{2,20}$'),
    label      text NOT NULL,
    is_active  boolean NOT NULL DEFAULT true,
    created_at timestamptz NOT NULL DEFAULT now()
);
INSERT INTO agentos_payment_types (code, label) VALUES ('CARD', 'Card');

CREATE TABLE agentos_payments (
    id                     uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    client_request_id      uuid NOT NULL UNIQUE,
    agentos_tenant_id      uuid REFERENCES agentos_tenants(id) ON DELETE SET NULL,
    tid                    text NOT NULL CHECK (tid ~ '^\d{4,5}$'),
    payment_from           text NOT NULL CHECK (char_length(payment_from) BETWEEN 1 AND 300),
    receiving_account_code text NOT NULL REFERENCES bank_accounts(code),
    deposit_to             text NOT NULL,
    payment_type           text NOT NULL REFERENCES agentos_payment_types(code),
    amount_pence           bigint NOT NULL CHECK (amount_pence > 0 AND amount_pence <= 9999999999),
    description            text NOT NULL DEFAULT '' CHECK (char_length(description) <= 500),
    card_auth_code         text CHECK (card_auth_code ~ '^[A-Za-z0-9]{1,20}$'),
    posting_status         text NOT NULL DEFAULT 'not_exported'
                           CHECK (posting_status IN ('not_exported','exported','posted')),
    export_id              uuid REFERENCES agentos_exports(id),
    posted_at              timestamptz,
    posted_by              uuid REFERENCES app_users(id),
    created_by             uuid NOT NULL REFERENCES app_users(id),
    created_at             timestamptz NOT NULL DEFAULT now(),
    updated_at             timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT agentos_payments_export_chk
        CHECK ((posting_status IN ('exported','posted')) = (export_id IS NOT NULL)),
    CONSTRAINT agentos_payments_posted_chk
        CHECK ((posting_status = 'posted') = (posted_at IS NOT NULL AND posted_by IS NOT NULL))
);
CREATE INDEX ON agentos_payments (export_id);
CREATE INDEX ON agentos_payments (created_at DESC);

CREATE TRIGGER t_audit AFTER INSERT OR UPDATE OR DELETE ON agentos_payments
    FOR EACH ROW EXECUTE FUNCTION audit_row();

ALTER TABLE agentos_exports
    ALTER COLUMN batch_id DROP NOT NULL,
    ADD COLUMN source text NOT NULL DEFAULT 'intake' CHECK (source IN ('intake','manual')),
    ADD CONSTRAINT agentos_exports_source_batch_chk CHECK ((source = 'intake') = (batch_id IS NOT NULL));

COMMIT;
