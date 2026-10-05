-- =============================================================================
-- OMNIA RECON — Migration 007: known payer accounts
-- -----------------------------------------------------------------------------
-- Staff link known payer bank accounts (hash + last 4 only) to a tenancy or landlord.
--   * holder_type gains 'relative' (shown in the matching reason text)
--   * one link per account per landlord
--   * full sort codes are never kept on payer_bank_accounts (trigger, including the
--     confirm_match "remember" path)
-- =============================================================================

BEGIN;

DO $$
DECLARE c text;
BEGIN
    SELECT conname INTO c FROM pg_constraint
     WHERE conrelid = 'payer_bank_accounts'::regclass AND contype = 'c'
       AND pg_get_constraintdef(oid) LIKE '%holder_type%';
    IF c IS NOT NULL THEN
        EXECUTE format('ALTER TABLE payer_bank_accounts DROP CONSTRAINT %I', c);
    END IF;
END $$;

ALTER TABLE payer_bank_accounts ADD CONSTRAINT payer_bank_accounts_holder_type_check
    CHECK (holder_type IN ('landlord', 'tenant', 'relative', 'guarantor', 'council', 'dwp', 'other'));

CREATE UNIQUE INDEX payer_account_landlord_uq ON payer_bank_accounts (account_hash, landlord_id)
    WHERE tenancy_id IS NULL AND landlord_id IS NOT NULL;

UPDATE payer_bank_accounts SET sort_code = NULL WHERE sort_code IS NOT NULL;

CREATE FUNCTION strip_payer_sort_code() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
    NEW.sort_code := NULL;
    RETURN NEW;
END $$;

CREATE TRIGGER t_strip_sort_code BEFORE INSERT OR UPDATE ON payer_bank_accounts
    FOR EACH ROW EXECUTE FUNCTION strip_payer_sort_code();

COMMIT;
