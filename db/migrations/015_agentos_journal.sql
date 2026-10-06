-- =============================================================================
-- OMNIA RECON — Migration 015: agentOS Journal Transfer, tenant to tenant, export-once, mark posted
-- -----------------------------------------------------------------------------
-- A transfer moves an amount from one agentOS tenant (TID) to another and is stored as one
-- transfer with two entries (from = -amount, to = +amount). A deferred constraint trigger makes
-- any transfer whose entries do not number 2 and sum to 0 impossible. Entries snapshot the tenant
-- details so the stored CSV stays stable if tenants change later. Each transfer is exported at
-- most once (not_exported -> exported -> posted), like migration 014.
-- =============================================================================

BEGIN;

CREATE TABLE agentos_journal_exports (
    id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    transfers_total    int NOT NULL CHECK (transfers_total >= 0),
    amount_total_pence bigint NOT NULL CHECK (amount_total_pence >= 0),
    csv                text NOT NULL,
    created_by         uuid NOT NULL REFERENCES app_users(id),
    created_at         timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE agentos_journal_transfers (
    id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    from_tid       text NOT NULL CHECK (from_tid ~ '^\d{4}$'),
    to_tid         text NOT NULL CHECK (to_tid ~ '^\d{4}$'),
    amount_pence   bigint NOT NULL CHECK (amount_pence > 0 AND amount_pence <= 9999999999),
    description    text NOT NULL CHECK (char_length(description) BETWEEN 1 AND 200),
    nominal_code   text NOT NULL CHECK (char_length(nominal_code) BETWEEN 1 AND 50),
    account_type   text NOT NULL CHECK (char_length(account_type) BETWEEN 1 AND 50),
    posting_status text NOT NULL DEFAULT 'not_exported'
                   CHECK (posting_status IN ('not_exported','exported','posted')),
    export_id      uuid REFERENCES agentos_journal_exports(id),
    posted_at      timestamptz,
    posted_by      uuid REFERENCES app_users(id),
    created_by     uuid NOT NULL REFERENCES app_users(id),
    created_at     timestamptz NOT NULL DEFAULT now(),
    updated_at     timestamptz NOT NULL DEFAULT now(),
    CHECK (from_tid <> to_tid),
    CONSTRAINT agentos_journal_transfers_export_chk
        CHECK ((posting_status IN ('exported','posted')) = (export_id IS NOT NULL)),
    CONSTRAINT agentos_journal_transfers_posted_chk
        CHECK ((posting_status = 'posted') = (posted_at IS NOT NULL AND posted_by IS NOT NULL))
);
CREATE INDEX ON agentos_journal_transfers (export_id);
CREATE INDEX ON agentos_journal_transfers (created_at DESC);

CREATE TABLE agentos_journal_entries (
    id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    transfer_id       uuid NOT NULL REFERENCES agentos_journal_transfers(id) ON DELETE CASCADE,
    side              text NOT NULL CHECK (side IN ('from','to')),
    agentos_tenant_id uuid REFERENCES agentos_tenants(id) ON DELETE SET NULL,
    tid               text NOT NULL,
    person            text NOT NULL,
    branch            text NOT NULL,
    property          text NOT NULL,
    amount_pence      bigint NOT NULL,
    UNIQUE (transfer_id, side),
    CHECK ((side = 'from') = (amount_pence < 0)),
    CHECK (amount_pence <> 0)
);

CREATE FUNCTION agentos_journal_zero_sum() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF (SELECT count(*) <> 2 OR coalesce(sum(amount_pence),0) <> 0
        FROM agentos_journal_entries WHERE transfer_id = NEW.transfer_id) THEN
    RAISE EXCEPTION 'journal transfer % must have 2 entries summing to 0', NEW.transfer_id;
  END IF;
  RETURN NULL;
END $$;

CREATE CONSTRAINT TRIGGER t_zero_sum AFTER INSERT OR UPDATE OF amount_pence ON agentos_journal_entries
    DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION agentos_journal_zero_sum();

CREATE TRIGGER t_audit AFTER INSERT OR UPDATE OR DELETE ON agentos_journal_exports
    FOR EACH ROW EXECUTE FUNCTION audit_row();
CREATE TRIGGER t_audit AFTER INSERT OR UPDATE OR DELETE ON agentos_journal_transfers
    FOR EACH ROW EXECUTE FUNCTION audit_row();
CREATE TRIGGER t_audit AFTER INSERT OR UPDATE OR DELETE ON agentos_journal_entries
    FOR EACH ROW EXECUTE FUNCTION audit_row();

COMMIT;
