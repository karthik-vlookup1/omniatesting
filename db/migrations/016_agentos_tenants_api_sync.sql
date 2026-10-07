-- =============================================================================
-- OMNIA RECON — Migration 016: agentOS tenants filled from the read-only v4 API sync
-- -----------------------------------------------------------------------------
-- Joint tenants may share a TID, so the TID UNIQUE goes; seed rows keep uniqueness through a
-- partial unique index. API rows may lack a TID (no number in Forename) or the ten-/crm- refs.
-- Down (hand-written, only possible while no source='api' rows exist): drop agentos_sync_runs,
-- the new indexes/checks/columns, then restore tid UNIQUE + checks and the three NOT NULLs.
-- =============================================================================

BEGIN;

ALTER TABLE agentos_tenants
    DROP CONSTRAINT agentos_tenants_tid_key,
    DROP CONSTRAINT agentos_tenants_tid_check,
    DROP CONSTRAINT agentos_tenants_forename_check,
    ALTER COLUMN tid DROP NOT NULL,
    ALTER COLUMN agentos_ref DROP NOT NULL,
    ALTER COLUMN crm_ref DROP NOT NULL;

ALTER TABLE agentos_tenants
    ADD COLUMN source         text NOT NULL DEFAULT 'seed' CHECK (source IN ('seed','api')),
    ADD COLUMN agentos_oid    text UNIQUE CHECK (agentos_oid ~* '^[0-9a-f]{4}(-[0-9a-f]{4}){3}$'),
    ADD COLUMN tenancy_oid    text,
    ADD COLUMN property_oid   text,
    ADD COLUMN global_reference text,
    ADD COLUMN title          text,
    ADD COLUMN email          text,
    ADD COLUMN phone          text,
    ADD COLUMN is_archived    boolean NOT NULL DEFAULT false,
    ADD COLUMN sync_flags     text[] NOT NULL DEFAULT '{}',
    ADD COLUMN last_synced_at timestamptz;

ALTER TABLE agentos_tenants
    ADD CONSTRAINT agentos_tenants_tid_format CHECK (tid IS NULL OR tid ~ '^\d{4,5}$'),
    ADD CONSTRAINT agentos_tenants_seed_complete CHECK (
        source = 'api' OR (tid IS NOT NULL AND agentos_ref IS NOT NULL AND crm_ref IS NOT NULL AND forename ~ '^\d{4} .+')),
    ADD CONSTRAINT agentos_tenants_api_has_oid CHECK (source = 'seed' OR agentos_oid IS NOT NULL);

CREATE UNIQUE INDEX agentos_tenants_seed_tid_key ON agentos_tenants (tid) WHERE source = 'seed';
CREATE INDEX ON agentos_tenants (tid);
CREATE INDEX ON agentos_tenants (tenancy_oid);

CREATE TABLE agentos_sync_runs (
    id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    started_at  timestamptz NOT NULL,
    finished_at timestamptz NOT NULL,
    counts      jsonb NOT NULL
);

COMMIT;
