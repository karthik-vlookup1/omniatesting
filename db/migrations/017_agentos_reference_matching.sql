-- =============================================================================
-- OMNIA RECON — Migration 017: agentOS reference-driven receipts matching (recon-510)
-- -----------------------------------------------------------------------------
-- A TID means a council / third party paid; an NI Number cell (NI or sort code + account)
-- means the tenant paid. Only secure_hash + last 3-4 chars of the reference are stored.
-- Deposit text resolves to a bank_accounts code (case/space-insensitive) or a seeded alias.
-- Statuses become pending|matched|ambiguous|unmatched; payer_type is set whenever matched.
-- Down (hand-written): map ambiguous back to name_mismatch, restore the old status CHECK,
-- drop the new lines columns/constraints/index, drop agentos_deposit_account,
-- agentos_deposit_aliases and agentos_norm. The step-e data fix is one-way (audited).
-- =============================================================================

BEGIN;
SET LOCAL app.user_email = 'migration:017';

CREATE FUNCTION agentos_norm(t text) RETURNS text
    LANGUAGE sql IMMUTABLE AS $$ SELECT lower(regexp_replace(btrim(t), '\s+', ' ', 'g')) $$;

CREATE TABLE agentos_deposit_aliases (
    alias_norm        text PRIMARY KEY CHECK (alias_norm <> '' AND alias_norm = agentos_norm(alias_norm)),
    bank_account_code text NOT NULL,
    created_at        timestamptz NOT NULL DEFAULT now()
);
INSERT INTO agentos_deposit_aliases (alias_norm, bank_account_code) VALUES
    ('hsbc', 'HSBC'), ('apollo hsbc', 'HSBC'), ('lloyds', 'LLOYDS'),
    ('tw', 'APOLLO_TW'), ('apollo tw', 'APOLLO_TW'), ('isl', 'ISL'),
    ('army', 'ARMY'), ('redstone', 'REDSTONE');

CREATE FUNCTION agentos_deposit_account(t text) RETURNS text
    LANGUAGE sql STABLE AS $$
    SELECT CASE WHEN count(*) = 1 THEN min(code) END FROM (
        SELECT b.code FROM bank_accounts b
         WHERE b.is_active
           AND (agentos_norm(b.code) = agentos_norm(t)
                OR agentos_norm(replace(b.code, '_', ' ')) = agentos_norm(t)
                OR b.code IN (SELECT a.bank_account_code FROM agentos_deposit_aliases a
                               WHERE a.alias_norm = agentos_norm(t)))
    ) m
$$;

ALTER TABLE agentos_intake_lines
    ADD COLUMN ref_kind text CHECK (ref_kind IN ('ni','account')),
    ADD COLUMN ref_hash text,
    ADD COLUMN ref_last text,
    ADD COLUMN payer_type text CHECK (payer_type IN ('tenant','third_party')),
    ADD COLUMN receiving_account_code text,
    ADD CONSTRAINT agentos_intake_lines_ref_pair CHECK ((ref_kind IS NULL) = (ref_hash IS NULL));
CREATE INDEX ON agentos_intake_lines (ref_hash);

ALTER TABLE agentos_intake_lines DROP CONSTRAINT agentos_intake_lines_match_status_check;

UPDATE agentos_intake_lines
   SET match_status = 'matched', payer_type = 'third_party'
 WHERE match_status IN ('matched', 'deposit_mismatch', 'name_mismatch') AND agentos_tenant_id IS NOT NULL;
UPDATE agentos_intake_lines SET match_status = 'ambiguous' WHERE match_status = 'name_mismatch';
UPDATE agentos_intake_lines SET receiving_account_code = agentos_deposit_account(deposit_to);

ALTER TABLE agentos_intake_lines
    ADD CONSTRAINT agentos_intake_lines_match_status_check
        CHECK (match_status IN ('pending','matched','ambiguous','unmatched')),
    ADD CONSTRAINT agentos_intake_lines_payer_type_set CHECK ((match_status = 'matched') = (payer_type IS NOT NULL));

ALTER TABLE agentos_tenants ALTER COLUMN deposit_to DROP NOT NULL;
UPDATE agentos_tenants SET deposit_to = NULL WHERE source = 'api';

COMMIT;
