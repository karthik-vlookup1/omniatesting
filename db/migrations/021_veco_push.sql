-- =============================================================================
-- OMNIA RECON — Migration 021: direct push to VECO (test database)
-- -----------------------------------------------------------------------------
-- Omnia Recon's own history of pushes. Nothing here touches any VECO database.
--   veco_staff_link   Omnia Recon user -> VECO Staff.StaffPK, and whether the user may push
--   veco_push_batch   one row per push (all or nothing)
--   veco_push_item    one row per receipt pushed, with the PKs we generated and the values sent
-- =============================================================================

BEGIN;

CREATE TABLE veco_staff_link (
    user_id     uuid PRIMARY KEY REFERENCES app_users(id) ON DELETE CASCADE,
    id          uuid NOT NULL UNIQUE DEFAULT gen_random_uuid(),   -- audit_row() reads NEW.id
    staff_fk    uuid NOT NULL,
    source      text NOT NULL CHECK (source IN ('email', 'admin')),
    can_push    boolean NOT NULL DEFAULT false,
    updated_by  text NOT NULL,
    updated_at  timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE veco_push_batch (
    id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    idempotency_key  uuid NOT NULL UNIQUE,
    target_db        text NOT NULL CHECK (target_db = 'Test Database Read Write'),
    batch_reference  text NOT NULL,
    pushed_by        uuid NOT NULL REFERENCES app_users(id),
    staff_fk         uuid NOT NULL,
    status           text NOT NULL CHECK (status IN ('previewed', 'pushing', 'pushed', 'verified', 'failed', 'deleted')),
    receipts         integer NOT NULL,
    total            numeric(14,2) NOT NULL,
    totals_by_bank   jsonb NOT NULL DEFAULT '[]'::jsonb,
    held             jsonb NOT NULL DEFAULT '[]'::jsonb,
    verify_result    jsonb,
    error            text,
    created_at       timestamptz NOT NULL DEFAULT now(),
    pushed_at        timestamptz,
    verified_at      timestamptz,
    deleted_at       timestamptz
);

CREATE TABLE veco_push_item (
    id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    batch_id         uuid NOT NULL REFERENCES veco_push_batch(id) ON DELETE CASCADE,
    payment_id       uuid NOT NULL REFERENCES receipts(id),
    source_bank      text NOT NULL,
    tid              text NOT NULL,
    amount           numeric(12,2) NOT NULL,
    payment_date     date NOT NULL,
    transaction_pk   uuid NOT NULL UNIQUE,
    allocation_pk    uuid NOT NULL UNIQUE,
    banking_ref      text NOT NULL,
    veco_row         jsonb NOT NULL,
    allocation_row   jsonb NOT NULL,
    status           text NOT NULL CHECK (status IN ('pushing', 'pushed', 'failed', 'deleted')),
    error            text
);

-- A receipt can be live in one push at a time; a delete frees it for a later push.
CREATE UNIQUE INDEX veco_push_item_live ON veco_push_item (payment_id) WHERE status IN ('pushing', 'pushed');
CREATE INDEX veco_push_item_batch ON veco_push_item (batch_id);

CREATE TRIGGER t_audit AFTER INSERT OR UPDATE OR DELETE ON veco_staff_link
    FOR EACH ROW EXECUTE FUNCTION audit_row();
CREATE TRIGGER t_audit AFTER INSERT OR UPDATE OR DELETE ON veco_push_batch
    FOR EACH ROW EXECUTE FUNCTION audit_row();
CREATE TRIGGER t_audit AFTER INSERT OR UPDATE OR DELETE ON veco_push_item
    FOR EACH ROW EXECUTE FUNCTION audit_row();

COMMIT;
