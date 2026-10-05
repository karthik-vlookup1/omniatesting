-- =============================================================================
-- OMNIA RECON — Migration 005: audit reference data
-- -----------------------------------------------------------------------------
-- Branches, bank accounts, landlords and properties become editable in the app,
-- so their changes are recorded in audit_log like the other business tables.
-- =============================================================================

BEGIN;

CREATE TRIGGER t_audit AFTER INSERT OR UPDATE OR DELETE ON branches
    FOR EACH ROW EXECUTE FUNCTION audit_row();
CREATE TRIGGER t_audit AFTER INSERT OR UPDATE OR DELETE ON bank_accounts
    FOR EACH ROW EXECUTE FUNCTION audit_row();
CREATE TRIGGER t_audit AFTER INSERT OR UPDATE OR DELETE ON landlords
    FOR EACH ROW EXECUTE FUNCTION audit_row();
CREATE TRIGGER t_audit AFTER INSERT OR UPDATE OR DELETE ON properties
    FOR EACH ROW EXECUTE FUNCTION audit_row();

COMMIT;
