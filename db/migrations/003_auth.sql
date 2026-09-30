-- =============================================================================
-- OMNIA RECON — Migration 003: authentication
-- -----------------------------------------------------------------------------
-- Adds local sign-in to app_users (scrypt password hash, lockout counters) and
-- server-side sessions. Session cookies carry a random token; only its SHA-256
-- is stored, so a database leak does not yield usable sessions.
-- User administration is audited, with the password hash stripped from the log.
-- =============================================================================

BEGIN;

ALTER TABLE app_users
    ADD COLUMN password_hash       text,            -- scrypt$N$r$p$salt$hash; NULL = cannot sign in
    ADD COLUMN password_changed_at timestamptz,
    ADD COLUMN last_login_at       timestamptz,
    ADD COLUMN failed_login_count  integer NOT NULL DEFAULT 0 CHECK (failed_login_count >= 0),
    ADD COLUMN locked_until        timestamptz;

-- Sign-in is by e-mail, case-insensitive.
CREATE UNIQUE INDEX app_users_email_lower_uq ON app_users (lower(email));

CREATE TABLE user_sessions (
    id               text PRIMARY KEY,                -- sha256 hex of the cookie token
    user_id          uuid NOT NULL REFERENCES app_users(id) ON DELETE CASCADE,
    created_at       timestamptz NOT NULL DEFAULT now(),
    last_seen_at     timestamptz NOT NULL DEFAULT now(),
    expires_at       timestamptz NOT NULL,            -- absolute lifetime
    ip               text,
    user_agent       text,
    CHECK (expires_at > created_at)
);
CREATE INDEX ON user_sessions (user_id);
CREATE INDEX ON user_sessions (expires_at);

-- Audit user administration. Login bookkeeping (last_login_at, failed_login_count,
-- locked_until) is deliberately not audited; password changes are, without the hash.
CREATE FUNCTION audit_app_user() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
    INSERT INTO audit_log (table_name, row_id, action, old_row, new_row, changed_by)
    VALUES (TG_TABLE_NAME,
            CASE WHEN TG_OP = 'DELETE' THEN OLD.id ELSE NEW.id END,
            TG_OP,
            CASE WHEN TG_OP IN ('UPDATE','DELETE') THEN to_jsonb(OLD) - 'password_hash' END,
            CASE WHEN TG_OP IN ('INSERT','UPDATE') THEN to_jsonb(NEW) - 'password_hash' END,
            current_setting('app.user_email', true));
    RETURN NULL;
END $$;

CREATE TRIGGER t_audit_ins_del AFTER INSERT OR DELETE ON app_users
    FOR EACH ROW EXECUTE FUNCTION audit_app_user();
CREATE TRIGGER t_audit_upd AFTER UPDATE OF email, full_name, role, is_active, password_hash ON app_users
    FOR EACH ROW EXECUTE FUNCTION audit_app_user();

COMMIT;
