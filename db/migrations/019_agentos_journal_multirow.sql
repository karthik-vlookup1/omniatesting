-- =============================================================================
-- OMNIA RECON — Migration 019: multi-row Journal Transfer (2-20 entries) on the Omnia ledger
-- -----------------------------------------------------------------------------
-- A transfer now has 2-20 entries (line_no, account_type, signed amount) that net to zero. side keeps
-- meaning the sign (from = negative). from_tid/to_tid/account_type on the transfer are only set when
-- they are well defined. client_request_id makes creation idempotent. Existing transfers are backfilled
-- into the ledger (one ledger transaction each, tenant postings equal to the entries).
-- =============================================================================

BEGIN;
SET LOCAL app.user_email = 'migration:019';

ALTER TABLE agentos_journal_entries DROP CONSTRAINT agentos_journal_entries_transfer_id_side_key;
ALTER TABLE agentos_journal_entries ADD COLUMN line_no int NOT NULL DEFAULT 1 CHECK (line_no BETWEEN 1 AND 20);
ALTER TABLE agentos_journal_entries ADD COLUMN account_type text;
UPDATE agentos_journal_entries SET line_no = 2 WHERE side = 'to';
UPDATE agentos_journal_entries e SET account_type = t.account_type
  FROM agentos_journal_transfers t WHERE t.id = e.transfer_id;
-- An entry inserted without an account type takes the parent transfer's (keeps the recon-506 insert shape working).
CREATE FUNCTION agentos_journal_entry_defaults() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.account_type IS NULL THEN
    SELECT account_type INTO NEW.account_type FROM agentos_journal_transfers WHERE id = NEW.transfer_id;
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER t_entry_defaults BEFORE INSERT ON agentos_journal_entries
    FOR EACH ROW EXECUTE FUNCTION agentos_journal_entry_defaults();
ALTER TABLE agentos_journal_entries ALTER COLUMN account_type SET NOT NULL;
ALTER TABLE agentos_journal_entries ADD CHECK (char_length(account_type) BETWEEN 1 AND 50);
ALTER TABLE agentos_journal_entries ADD CONSTRAINT agentos_journal_entries_line_key UNIQUE (transfer_id, line_no);

ALTER TABLE agentos_journal_transfers ALTER COLUMN from_tid DROP NOT NULL;
ALTER TABLE agentos_journal_transfers ALTER COLUMN to_tid DROP NOT NULL;
ALTER TABLE agentos_journal_transfers ALTER COLUMN account_type DROP NOT NULL;
ALTER TABLE agentos_journal_transfers DROP CONSTRAINT agentos_journal_transfers_check;
ALTER TABLE agentos_journal_transfers ADD COLUMN client_request_id uuid UNIQUE;
ALTER TABLE agentos_journal_transfers ADD CONSTRAINT agentos_journal_transfers_pair_chk
    CHECK (from_tid IS NULL OR to_tid IS NULL OR from_tid <> to_tid);

CREATE OR REPLACE FUNCTION agentos_journal_zero_sum() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF (SELECT count(*) < 2 OR coalesce(sum(amount_pence),0) <> 0
        FROM agentos_journal_entries WHERE transfer_id = NEW.transfer_id) THEN
    RAISE EXCEPTION 'journal transfer % must have at least 2 entries summing to 0', NEW.transfer_id;
  END IF;
  RETURN NULL;
END $$;

INSERT INTO ledger_transactions (kind, source_id, idempotency_key, effective_on, description, created_by, created_at)
SELECT 'journal_transfer', id, 'journal_transfer:' || id, created_at::date,
       left('Journal Transfer - ' || description, 300), created_by, created_at
  FROM agentos_journal_transfers;

INSERT INTO ledger_postings (transaction_id, account_kind, account_ref, account_type, amount_pence)
SELECT lt.id, 'tenant', e.tid, e.account_type, e.amount_pence
  FROM agentos_journal_entries e
  JOIN ledger_transactions lt ON lt.kind = 'journal_transfer' AND lt.source_id = e.transfer_id;

COMMIT;
