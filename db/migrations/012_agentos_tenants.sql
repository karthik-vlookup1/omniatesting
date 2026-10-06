-- =============================================================================
-- OMNIA RECON — Migration 012: agentOS tenant records (synthetic seed target)
-- -----------------------------------------------------------------------------
-- One row per agentOS tenant record. TID = the 4-digit number at the start of Forename.
-- tenancy_id links by tenancies.tid when a tenancy with that TID exists, else NULL.
-- No FK on tenancy_id: other suites TRUNCATE tenancies without CASCADE (same reason as 011).
-- =============================================================================

BEGIN;

CREATE TABLE agentos_tenants (
    id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tid                text NOT NULL UNIQUE CHECK (tid ~ '^\d{4}$'),
    agentos_ref        text NOT NULL UNIQUE CHECK (agentos_ref ~ '^ten-\d+$'),
    crm_ref            text NOT NULL CHECK (crm_ref ~ '^crm-\d+$'),
    forename           text NOT NULL CHECK (forename ~ '^\d{4} .+'),
    surname            text NOT NULL,
    managed_by         text NOT NULL,
    residence          text NOT NULL,
    tenancy_descriptor text NOT NULL,
    is_head_tenant     boolean NOT NULL DEFAULT true,
    deposit_to         text NOT NULL,
    tenancy_id         uuid,
    created_at         timestamptz NOT NULL DEFAULT now(),
    updated_at         timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX ON agentos_tenants (tenancy_id);

CREATE TRIGGER t_audit AFTER INSERT OR UPDATE OR DELETE ON agentos_tenants
    FOR EACH ROW EXECUTE FUNCTION audit_row();

COMMIT;
