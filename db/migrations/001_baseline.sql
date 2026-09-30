-- =============================================================================
-- OMNIA RECON — Rent reconciliation database (PostgreSQL 16, PERN stack)
-- -----------------------------------------------------------------------------
-- Single source of truth for tenancies, rent charges, bank receipts and
-- allocations. Xero, Vico and Google Sheets are downstream sync targets.
--
-- Layers (read top to bottom):
--   1. Reference data      branches, bank accounts, landlords, properties, users
--   2. People & tenancies  tenants, tenancies, rent schedules
--   3. Who pays what       benefit awards (LHA/UC/HB), payer splits, payment methods
--   4. What is owed        rent_charges (one row per period per payer)
--   5. Money in            import batches, bank transactions, remittances
--   6. Matching            payment references, match suggestions
--   7. Money applied       receipts, allocations, adjustments
--   8. Xero                ledger rules, invoices
--   9. Sync & audit        external_refs, outbox, inbox, audit_log
--
-- Money is NUMERIC(12,2) in GBP. All ids are UUIDs. All timestamps are timestamptz.
-- =============================================================================

BEGIN;

CREATE EXTENSION IF NOT EXISTS pgcrypto;    -- gen_random_uuid(), digest()
CREATE EXTENSION IF NOT EXISTS btree_gist;  -- no-overlap constraints on date ranges
CREATE EXTENSION IF NOT EXISTS pg_trgm;     -- fuzzy tenant-name matching

-- -----------------------------------------------------------------------------
-- ENUMS
-- -----------------------------------------------------------------------------
CREATE TYPE management_type   AS ENUM ('RG', 'MG', 'IRG');           -- drives Xero ledger code
CREATE TYPE rent_frequency    AS ENUM ('weekly', 'fortnightly', 'four_weekly', 'monthly', 'quarterly');
CREATE TYPE tenancy_status    AS ENUM ('pending', 'active', 'ended');
CREATE TYPE payer_type        AS ENUM ('tenant', 'council_hb', 'dwp_uc', 'other_third_party');
CREATE TYPE benefit_type      AS ENUM ('UC', 'HB', 'DHP');            -- DHP = discretionary housing payment
CREATE TYPE benefit_paid_to   AS ENUM ('landlord_direct', 'tenant');
CREATE TYPE pay_method_kind   AS ENUM ('standing_order', 'bank_transfer', 'direct_debit', 'uc_managed_payment',
                                       'hb_direct', 'card', 'cash', 'cheque', 'other');
CREATE TYPE import_source     AS ENUM ('bank_csv', 'remittance', 'letmc_legacy', 'vico_export', 'xero_export', 'google_sheet');
CREATE TYPE import_status     AS ENUM ('uploaded', 'parsed', 'failed', 'rolled_back');
CREATE TYPE txn_status        AS ENUM ('new', 'excluded', 'needs_review', 'yet_to_take', 'partially_matched', 'matched');
CREATE TYPE match_method      AS ENUM ('tid_in_reference', 'ni_in_reference', 'reference_rule', 'remittance_line',
                                       'amount_and_name', 'name_fuzzy', 'manual');
CREATE TYPE suggestion_status AS ENUM ('open', 'accepted', 'rejected');
CREATE TYPE receipt_category  AS ENUM ('regular', 'backdated', 'ended_overpayment');
CREATE TYPE receipt_status    AS ENUM ('active', 'reversed');
CREATE TYPE charge_source     AS ENUM ('schedule', 'manual', 'opening_balance', 'legacy_import');
CREATE TYPE adjustment_kind   AS ENUM ('write_off', 'credit_note', 'refund_paid', 'transfer_in', 'transfer_out', 'correction');
CREATE TYPE xero_inv_status   AS ENUM ('pending_export', 'exported', 'draft', 'approved', 'voided', 'error');
CREATE TYPE ext_system        AS ENUM ('xero', 'vico', 'google_sheets', 'letmc');
CREATE TYPE sync_op           AS ENUM ('upsert', 'delete');
CREATE TYPE sync_status       AS ENUM ('pending', 'in_flight', 'done', 'failed', 'dead');
CREATE TYPE inbox_status      AS ENUM ('pending', 'applied', 'conflict', 'ignored');

-- Shared helper: keep updated_at current.
CREATE FUNCTION touch_updated_at() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at := now(); RETURN NEW; END $$;

-- =============================================================================
-- 1. REFERENCE DATA
-- =============================================================================
CREATE TABLE app_users (
    id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    email        text NOT NULL UNIQUE,
    full_name    text NOT NULL,
    role         text NOT NULL DEFAULT 'staff' CHECK (role IN ('admin', 'accounts', 'staff', 'readonly', 'system')),
    is_active    boolean NOT NULL DEFAULT true,
    created_at   timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE branches (
    id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    code             text NOT NULL UNIQUE,              -- as used in Xero tracking category
    name             text NOT NULL,
    xero_tracking_option text,                           -- Xero tracking option name for "Branch"
    created_at       timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE bank_accounts (
    id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    code             text NOT NULL UNIQUE,              -- 'HSBC', 'LLOYDS', 'APOLLO_TW', 'REDSTONE', 'ARMY', 'ISL', ...
    bank_name        text NOT NULL,
    account_name     text NOT NULL,
    sort_code_last2  text,                               -- never store full account numbers here
    account_last4    text,
    csv_profile      jsonb NOT NULL DEFAULT '{}'::jsonb, -- column mapping for this bank's CSV layout
    xero_account_id  text,                               -- Xero bank account the receipts land in
    is_active        boolean NOT NULL DEFAULT true,
    created_at       timestamptz NOT NULL DEFAULT now()
);
COMMENT ON COLUMN bank_accounts.csv_profile IS
  'e.g. {"date_col":"Date","date_format":"DD/MM/YYYY","amount_cols":{"credit":"Paid in","debit":"Paid out"},"desc_col":"Description","skip_rows":3}';

CREATE TABLE landlords (
    id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    landlord_ref     text UNIQUE,
    name             text NOT NULL,
    email            text,
    phone            text,
    created_at       timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE properties (
    id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    property_ref     text NOT NULL UNIQUE,              -- "Property ID" in the sheets
    branch_id        uuid NOT NULL REFERENCES branches(id),
    landlord_id      uuid REFERENCES landlords(id),
    address_line1    text NOT NULL,
    address_line2    text,
    town             text,
    postcode         text NOT NULL,
    bedrooms         smallint CHECK (bedrooms >= 0),
    brma             text,                               -- Broad Rental Market Area (sets the LHA rate)
    default_management_type management_type,
    is_active        boolean NOT NULL DEFAULT true,
    created_at       timestamptz NOT NULL DEFAULT now(),
    updated_at       timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX ON properties (branch_id);
CREATE INDEX ON properties (postcode);

CREATE TABLE property_units (                           -- rooms / flats inside a property (HMOs)
    id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    property_id      uuid NOT NULL REFERENCES properties(id) ON DELETE CASCADE,
    unit_ref         text NOT NULL,
    description      text,
    bedrooms         smallint CHECK (bedrooms >= 0),
    UNIQUE (property_id, unit_ref)
);

-- =============================================================================
-- 2. PEOPLE & TENANCIES
-- =============================================================================
CREATE TABLE tenants (
    id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_ref       text UNIQUE,                        -- legacy "T number" if different from TID
    title            text,
    first_name       text NOT NULL,
    last_name        text NOT NULL,
    full_name        text GENERATED ALWAYS AS (trim(coalesce(first_name,'') || ' ' || coalesce(last_name,''))) STORED,
    email            text,
    phone            text,
    -- National Insurance number: store encrypted + a keyed hash for exact matching.
    ni_encrypted     bytea,                              -- app-side encryption (e.g. AES-GCM with KMS key)
    ni_hash          text UNIQUE,                        -- HMAC-SHA256(normalised NI, app secret) -> lookups
    ni_last3         text,                               -- for display: "•••••123C"
    employment_status text CHECK (employment_status IN ('employed', 'self_employed', 'unemployed', 'retired', 'student', 'unknown')),
    notes            text,
    created_at       timestamptz NOT NULL DEFAULT now(),
    updated_at       timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX tenants_name_trgm ON tenants USING gin (full_name gin_trgm_ops);

CREATE TABLE tenancies (
    id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tid              text NOT NULL UNIQUE,              -- Tenancy ID (TID): the main matching key
    property_id      uuid NOT NULL REFERENCES properties(id),
    unit_id          uuid REFERENCES property_units(id),
    management_type  management_type NOT NULL,           -- RG / MG / IRG
    start_date       date NOT NULL,
    end_date         date,                               -- set when the tenancy ends
    status           tenancy_status NOT NULL DEFAULT 'active',
    allocation_mode  text NOT NULL DEFAULT 'oldest_first' CHECK (allocation_mode IN ('oldest_first', 'manual')),
    created_at       timestamptz NOT NULL DEFAULT now(),
    updated_at       timestamptz NOT NULL DEFAULT now(),
    CHECK (end_date IS NULL OR end_date >= start_date),
    CHECK (status <> 'ended' OR end_date IS NOT NULL)
);
CREATE INDEX ON tenancies (property_id);
CREATE INDEX ON tenancies (status);

CREATE TABLE tenancy_tenants (                          -- joint tenancies; tenant history
    tenancy_id       uuid NOT NULL REFERENCES tenancies(id) ON DELETE CASCADE,
    tenant_id        uuid NOT NULL REFERENCES tenants(id),
    is_lead          boolean NOT NULL DEFAULT true,      -- lead tenant = Xero contact
    joined_on        date,
    left_on          date,
    PRIMARY KEY (tenancy_id, tenant_id)
);
CREATE UNIQUE INDEX one_lead_per_tenancy ON tenancy_tenants (tenancy_id) WHERE is_lead AND left_on IS NULL;
CREATE INDEX ON tenancy_tenants (tenant_id);

CREATE TABLE rent_schedules (                           -- rent amount + cycle, with history
    id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenancy_id       uuid NOT NULL REFERENCES tenancies(id) ON DELETE CASCADE,
    amount           numeric(12,2) NOT NULL CHECK (amount >= 0),   -- full rent per period
    frequency        rent_frequency NOT NULL,
    effective_from   date NOT NULL,                      -- also the anchor date for period starts
    effective_to     date,                               -- inclusive; NULL = open-ended
    reason           text,                               -- 'initial', 'annual increase', ...
    created_at       timestamptz NOT NULL DEFAULT now(),
    CHECK (effective_to IS NULL OR effective_to >= effective_from),
    EXCLUDE USING gist (tenancy_id WITH =, daterange(effective_from, effective_to, '[]') WITH &&)
);

-- =============================================================================
-- 3. WHO PAYS WHAT
-- =============================================================================
-- LHA / UC / HB award per tenant, with history. A change = close the old row, insert a new one.
CREATE TABLE benefit_awards (
    id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id        uuid NOT NULL REFERENCES tenants(id),
    tenancy_id       uuid NOT NULL REFERENCES tenancies(id),
    benefit          benefit_type NOT NULL,
    paying_body      text NOT NULL,                      -- 'DWP', 'Birmingham City Council', ...
    claim_reference  text,                               -- HB claim no. / UC reference seen on remittances
    lha_rate         numeric(12,2),                      -- LHA cap for the household
    lha_frequency    rent_frequency,
    award_amount     numeric(12,2) NOT NULL CHECK (award_amount >= 0), -- housing element actually awarded
    award_frequency  rent_frequency NOT NULL,
    paid_to          benefit_paid_to NOT NULL,
    effective_from   date NOT NULL,
    effective_to     date,
    verified_on      date,
    evidence_url     text,
    created_at       timestamptz NOT NULL DEFAULT now(),
    CHECK (effective_to IS NULL OR effective_to >= effective_from),
    EXCLUDE USING gist (tenancy_id WITH =, benefit WITH =, daterange(effective_from, effective_to, '[]') WITH &&)
);
CREATE INDEX ON benefit_awards (tenant_id);
CREATE INDEX ON benefit_awards (claim_reference);

-- Third-party share of the rent. The TENANT always owes the remainder
-- (rent - sum of third-party shares), so an LHA shortfall or a "pays half" rule
-- falls out automatically.
CREATE TABLE payer_splits (
    id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenancy_id       uuid NOT NULL REFERENCES tenancies(id) ON DELETE CASCADE,
    payer            payer_type NOT NULL CHECK (payer <> 'tenant'),
    benefit_award_id uuid REFERENCES benefit_awards(id),
    share_percent    numeric(5,2) CHECK (share_percent > 0 AND share_percent <= 100),
    fixed_amount     numeric(12,2) CHECK (fixed_amount >= 0),  -- per RENT period of this tenancy
    effective_from   date NOT NULL,
    effective_to     date,
    CHECK ((share_percent IS NULL) <> (fixed_amount IS NULL)),  -- exactly one of the two
    CHECK (effective_to IS NULL OR effective_to >= effective_from),
    EXCLUDE USING gist (tenancy_id WITH =, payer WITH =, daterange(effective_from, effective_to, '[]') WITH &&)
);

-- How each payer actually pays (the "separate record of his payment method").
CREATE TABLE payment_methods (
    id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenancy_id       uuid NOT NULL REFERENCES tenancies(id) ON DELETE CASCADE,
    tenant_id        uuid REFERENCES tenants(id),        -- NULL when the payer is a council/DWP
    payer            payer_type NOT NULL,
    method           pay_method_kind NOT NULL,
    expected_bank_account_id uuid REFERENCES bank_accounts(id),
    expected_amount  numeric(12,2),
    expected_frequency rent_frequency,
    expected_day     smallint CHECK (expected_day BETWEEN 1 AND 31),
    reference_hint   text,                               -- what they usually type as reference
    is_primary       boolean NOT NULL DEFAULT true,
    effective_from   date NOT NULL,
    effective_to     date,
    notes            text,
    created_at       timestamptz NOT NULL DEFAULT now(),
    CHECK (effective_to IS NULL OR effective_to >= effective_from)
);
CREATE INDEX ON payment_methods (tenancy_id);

-- =============================================================================
-- 4. WHAT IS OWED
-- =============================================================================
-- One row per rent period PER PAYER. Generated from rent_schedules + payer_splits.
CREATE TABLE rent_charges (
    id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenancy_id       uuid NOT NULL REFERENCES tenancies(id),
    payer            payer_type NOT NULL,
    period_start     date NOT NULL,
    period_end       date NOT NULL,
    due_date         date NOT NULL,
    amount           numeric(12,2) NOT NULL CHECK (amount >= 0),
    source           charge_source NOT NULL DEFAULT 'schedule',
    rent_schedule_id uuid REFERENCES rent_schedules(id),
    notes            text,
    created_at       timestamptz NOT NULL DEFAULT now(),
    CHECK (period_end >= period_start),
    UNIQUE (tenancy_id, payer, period_start, source)
);
CREATE INDEX ON rent_charges (tenancy_id, payer, due_date);

-- =============================================================================
-- 5. MONEY IN
-- =============================================================================
CREATE TABLE import_batches (
    id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    source           import_source NOT NULL,
    bank_account_id  uuid REFERENCES bank_accounts(id),
    file_name        text NOT NULL,
    file_sha256      text NOT NULL UNIQUE,               -- same file twice = rejected
    storage_url      text,                               -- original file kept (S3 etc.)
    period_from      date,
    period_to        date,
    rows_total       integer,
    rows_inserted    integer,
    rows_duplicate   integer,
    status           import_status NOT NULL DEFAULT 'uploaded',
    error            text,
    uploaded_by      uuid REFERENCES app_users(id),
    uploaded_at      timestamptz NOT NULL DEFAULT now(),
    CHECK (source <> 'bank_csv' OR bank_account_id IS NOT NULL)
);

CREATE TABLE bank_transactions (
    id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    bank_account_id  uuid NOT NULL REFERENCES bank_accounts(id),
    import_batch_id  uuid NOT NULL REFERENCES import_batches(id),
    txn_date         date NOT NULL,
    amount           numeric(12,2) NOT NULL,             -- + money in, - money out
    description      text NOT NULL,
    reference        text,                               -- parsed reference, if the bank gives one
    counterparty     text,
    balance_after    numeric(12,2),
    raw_row          jsonb NOT NULL,                     -- the untouched CSV row
    dedupe_key       text NOT NULL,                      -- sha256(account|date|amount|description|balance_after|occurrence)
    status           txn_status NOT NULL DEFAULT 'new',
    exclusion_reason text,                               -- 'expense', 'internal transfer', 'not rent'
    note             text,                               -- e.g. 'Yet to take'
    created_at       timestamptz NOT NULL DEFAULT now(),
    updated_at       timestamptz NOT NULL DEFAULT now(),
    UNIQUE (bank_account_id, dedupe_key),
    CHECK (status <> 'excluded' OR exclusion_reason IS NOT NULL)
);
CREATE INDEX ON bank_transactions (status) WHERE status IN ('new', 'needs_review', 'yet_to_take', 'partially_matched');
CREATE INDEX ON bank_transactions (txn_date);
CREATE INDEX bank_txn_desc_trgm ON bank_transactions USING gin (description gin_trgm_ops);

-- Council / DWP bulk payments: one bank line + a remittance listing many tenants.
CREATE TABLE remittance_advices (
    id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    import_batch_id  uuid REFERENCES import_batches(id),
    bank_transaction_id uuid REFERENCES bank_transactions(id),
    paying_body      text NOT NULL,
    remittance_ref   text,
    remittance_date  date NOT NULL,
    total_amount     numeric(12,2) NOT NULL,
    created_at       timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE remittance_lines (
    id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    remittance_id    uuid NOT NULL REFERENCES remittance_advices(id) ON DELETE CASCADE,
    claim_reference  text,
    tenant_name      text,
    ni_hash          text,
    period_from      date,
    period_to        date,
    amount           numeric(12,2) NOT NULL,
    matched_tenancy_id uuid REFERENCES tenancies(id),
    raw_row          jsonb
);

-- =============================================================================
-- 6. MATCHING
-- =============================================================================
-- Learned rules: every manual match can save the reference so next time it's automatic.
CREATE TABLE payment_references (
    id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenancy_id       uuid NOT NULL REFERENCES tenancies(id) ON DELETE CASCADE,
    payer            payer_type NOT NULL,
    bank_account_id  uuid REFERENCES bank_accounts(id),  -- NULL = any account
    match_kind       text NOT NULL CHECK (match_kind IN ('exact', 'contains', 'regex')),
    pattern          text NOT NULL,                      -- stored upper-case, whitespace squashed
    is_active        boolean NOT NULL DEFAULT true,
    created_by       uuid REFERENCES app_users(id),
    created_at       timestamptz NOT NULL DEFAULT now(),
    UNIQUE (bank_account_id, match_kind, pattern)
);

CREATE TABLE match_suggestions (                        -- the review queue
    id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    bank_transaction_id uuid NOT NULL REFERENCES bank_transactions(id) ON DELETE CASCADE,
    tenancy_id       uuid NOT NULL REFERENCES tenancies(id),
    payer            payer_type NOT NULL,
    method           match_method NOT NULL,
    confidence       numeric(4,3) NOT NULL CHECK (confidence BETWEEN 0 AND 1),
    reason           text,                               -- "TID T1234 found in reference"
    status           suggestion_status NOT NULL DEFAULT 'open',
    decided_by       uuid REFERENCES app_users(id),
    decided_at       timestamptz,
    UNIQUE (bank_transaction_id, tenancy_id, method)
);

-- =============================================================================
-- 7. MONEY APPLIED
-- =============================================================================
-- A receipt = money credited to ONE tenancy from ONE payer.
-- One bank transaction can produce many receipts (bulk council payment).
CREATE TABLE receipts (
    id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    bank_transaction_id uuid REFERENCES bank_transactions(id),   -- NULL only for legacy imports
    remittance_line_id uuid REFERENCES remittance_lines(id),
    tenancy_id       uuid NOT NULL REFERENCES tenancies(id),
    payer            payer_type NOT NULL,
    amount           numeric(12,2) NOT NULL CHECK (amount > 0),
    received_on      date NOT NULL,
    category         receipt_category NOT NULL DEFAULT 'regular',
    ledger_code      text,                               -- set by trigger from xero_ledger_rules
    matched_via      match_method NOT NULL,
    matched_by       uuid REFERENCES app_users(id),
    status           receipt_status NOT NULL DEFAULT 'active',
    reversed_reason  text,
    notes            text,
    created_at       timestamptz NOT NULL DEFAULT now(),
    CHECK (bank_transaction_id IS NOT NULL OR matched_via = 'manual')
);
CREATE INDEX ON receipts (tenancy_id, payer, received_on);
CREATE INDEX ON receipts (bank_transaction_id);

CREATE TABLE allocations (                              -- receipt -> rent period(s)
    id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    receipt_id       uuid NOT NULL REFERENCES receipts(id) ON DELETE CASCADE,
    rent_charge_id   uuid NOT NULL REFERENCES rent_charges(id),
    amount           numeric(12,2) NOT NULL CHECK (amount > 0),
    allocated_by     text NOT NULL DEFAULT 'auto_oldest_first',   -- or a user email
    created_at       timestamptz NOT NULL DEFAULT now(),
    UNIQUE (receipt_id, rent_charge_id)
);
CREATE INDEX ON allocations (rent_charge_id);

-- Anything that changes a balance without being rent or a receipt.
-- Sign convention: + increases what is owed, - reduces it.
CREATE TABLE adjustments (
    id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenancy_id       uuid NOT NULL REFERENCES tenancies(id),
    payer            payer_type NOT NULL,
    kind             adjustment_kind NOT NULL,
    amount           numeric(12,2) NOT NULL CHECK (amount <> 0),
    effective_on     date NOT NULL,
    reason           text NOT NULL,
    approved_by      uuid REFERENCES app_users(id),
    created_at       timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX ON adjustments (tenancy_id, payer);

-- =============================================================================
-- 8. XERO
-- =============================================================================
CREATE TABLE xero_ledger_rules (
    id               serial PRIMARY KEY,
    category         receipt_category NOT NULL,
    management_type  management_type,                    -- NULL = any
    ledger_code      text NOT NULL,
    description      text NOT NULL,
    UNIQUE NULLS NOT DISTINCT (category, management_type)
);
INSERT INTO xero_ledger_rules (category, management_type, ledger_code, description) VALUES
  ('regular',           'RG',  '001',  'Regular rental income - RG'),
  ('regular',           'MG',  '001B', 'Regular rental income - MG'),
  ('regular',           'IRG', '001G', 'Regular rental income - IRG'),
  ('backdated',         'RG',  '206',  'Back-dated rental payment - RG'),
  ('backdated',         'MG',  '207',  'Back-dated rental payment - MG'),
  ('backdated',         'IRG', '208',  'Back-dated rental payment - IRG'),
  ('ended_overpayment', NULL,  '001C', 'Ended tenancy overpayment - any status');

-- One Xero sales invoice per receipt (mirrors today's CSV import process).
CREATE TABLE xero_invoices (
    id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    receipt_id       uuid NOT NULL UNIQUE REFERENCES receipts(id),
    xero_invoice_id  text UNIQUE,                        -- Xero InvoiceID once created
    invoice_number   text UNIQUE,                        -- our number, e.g. RI-2026-000123
    contact_name     text NOT NULL,                      -- Xero ContactName (lead tenant or council)
    invoice_date     date NOT NULL,
    due_date         date NOT NULL,
    reference        text,                               -- TID
    status           xero_inv_status NOT NULL DEFAULT 'pending_export',
    total            numeric(12,2) NOT NULL,
    last_error       text,
    exported_at      timestamptz,
    approved_at      timestamptz,
    created_at       timestamptz NOT NULL DEFAULT now(),
    updated_at       timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE xero_invoice_lines (
    id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    invoice_id       uuid NOT NULL REFERENCES xero_invoices(id) ON DELETE CASCADE,
    line_no          smallint NOT NULL,
    description      text NOT NULL,                      -- "Rent T1234 - 12 High St - Jun 2026"
    quantity         numeric(10,2) NOT NULL DEFAULT 1,
    unit_amount      numeric(12,2) NOT NULL,
    account_code     text NOT NULL,                      -- ledger code 001/001B/...
    tax_type         text NOT NULL DEFAULT 'No VAT',     -- residential rent is VAT-exempt
    tracking_branch  text,
    tracking_property text,
    UNIQUE (invoice_id, line_no)
);

-- =============================================================================
-- 9. SYNC & AUDIT
-- =============================================================================
-- Maps our rows to ids in other systems. The ONLY place external ids live.
CREATE TABLE external_refs (
    id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    system           ext_system NOT NULL,
    entity_type      text NOT NULL,                      -- 'tenant', 'tenancy', 'property', 'receipt', ...
    entity_id        uuid NOT NULL,
    external_id      text NOT NULL,
    external_key2    text,                               -- e.g. Google Sheets row number
    last_synced_at   timestamptz,
    last_synced_hash text,                               -- hash of payload last sent/received
    UNIQUE (system, entity_type, entity_id),
    UNIQUE (system, entity_type, external_id)
);

-- Outbound: every change that other systems must hear about. Workers drain it.
CREATE TABLE sync_outbox (
    id               bigserial PRIMARY KEY,
    system           ext_system NOT NULL,
    entity_type      text NOT NULL,
    entity_id        uuid NOT NULL,
    op               sync_op NOT NULL,
    payload          jsonb NOT NULL,
    idempotency_key  text NOT NULL UNIQUE,
    status           sync_status NOT NULL DEFAULT 'pending',
    attempts         integer NOT NULL DEFAULT 0,
    next_attempt_at  timestamptz NOT NULL DEFAULT now(),
    last_error       text,
    created_at       timestamptz NOT NULL DEFAULT now(),
    done_at          timestamptz
);
CREATE INDEX ON sync_outbox (system, status, next_attempt_at) WHERE status IN ('pending', 'failed');

-- Inbound: edits made in Sheets / Vico / Xero, applied only after checks.
CREATE TABLE sync_inbox (
    id               bigserial PRIMARY KEY,
    system           ext_system NOT NULL,
    entity_type      text NOT NULL,
    external_id      text NOT NULL,
    payload          jsonb NOT NULL,
    payload_hash     text NOT NULL,
    received_at      timestamptz NOT NULL DEFAULT now(),
    status           inbox_status NOT NULL DEFAULT 'pending',
    conflict_detail  text,
    resolved_by      uuid REFERENCES app_users(id),
    resolved_at      timestamptz,
    UNIQUE (system, entity_type, external_id, payload_hash)
);

CREATE TABLE audit_log (
    id               bigserial PRIMARY KEY,
    table_name       text NOT NULL,
    row_id           uuid,
    action           text NOT NULL CHECK (action IN ('INSERT', 'UPDATE', 'DELETE')),
    old_row          jsonb,
    new_row          jsonb,
    changed_by       text,                               -- from SET app.user_email = '<email>' per request
    changed_at       timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX ON audit_log (table_name, row_id);

-- =============================================================================
-- TRIGGERS: integrity, ledger codes, audit
-- =============================================================================
CREATE TRIGGER t_touch BEFORE UPDATE ON properties        FOR EACH ROW EXECUTE FUNCTION touch_updated_at();
CREATE TRIGGER t_touch BEFORE UPDATE ON tenants           FOR EACH ROW EXECUTE FUNCTION touch_updated_at();
CREATE TRIGGER t_touch BEFORE UPDATE ON tenancies         FOR EACH ROW EXECUTE FUNCTION touch_updated_at();
CREATE TRIGGER t_touch BEFORE UPDATE ON bank_transactions FOR EACH ROW EXECUTE FUNCTION touch_updated_at();
CREATE TRIGGER t_touch BEFORE UPDATE ON xero_invoices     FOR EACH ROW EXECUTE FUNCTION touch_updated_at();

-- Receipts from one bank line can never add up to more than the bank line.
CREATE FUNCTION check_receipt_total() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE v_txn numeric; v_sum numeric;
BEGIN
    IF NEW.bank_transaction_id IS NULL THEN RETURN NEW; END IF;
    SELECT amount INTO v_txn FROM bank_transactions WHERE id = NEW.bank_transaction_id FOR UPDATE;
    SELECT coalesce(sum(amount), 0) INTO v_sum FROM receipts
     WHERE bank_transaction_id = NEW.bank_transaction_id AND status = 'active' AND id <> NEW.id;
    IF NEW.status = 'active' AND v_sum + NEW.amount > v_txn THEN
        RAISE EXCEPTION 'Receipts (%) exceed bank transaction amount (%)', v_sum + NEW.amount, v_txn;
    END IF;
    RETURN NEW;
END $$;
CREATE TRIGGER t_receipt_total BEFORE INSERT OR UPDATE ON receipts
    FOR EACH ROW EXECUTE FUNCTION check_receipt_total();

-- Pick the Xero ledger code from the rules table.
CREATE FUNCTION set_receipt_ledger_code() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE v_mt management_type;
BEGIN
    SELECT management_type INTO v_mt FROM tenancies WHERE id = NEW.tenancy_id;
    SELECT ledger_code INTO NEW.ledger_code FROM xero_ledger_rules
     WHERE category = NEW.category AND (management_type = v_mt OR management_type IS NULL)
     ORDER BY management_type NULLS LAST LIMIT 1;
    IF NEW.ledger_code IS NULL THEN
        RAISE EXCEPTION 'No Xero ledger rule for category % / %', NEW.category, v_mt;
    END IF;
    RETURN NEW;
END $$;
CREATE TRIGGER t_receipt_ledger BEFORE INSERT OR UPDATE OF category, tenancy_id ON receipts
    FOR EACH ROW EXECUTE FUNCTION set_receipt_ledger_code();

-- Allocations can't over-spend a receipt or over-pay a charge, and must stay
-- within the same tenancy.
CREATE FUNCTION check_allocation() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE r receipts%ROWTYPE; c rent_charges%ROWTYPE; v_r numeric; v_c numeric;
BEGIN
    SELECT * INTO r FROM receipts WHERE id = NEW.receipt_id FOR UPDATE;
    SELECT * INTO c FROM rent_charges WHERE id = NEW.rent_charge_id FOR UPDATE;
    IF r.tenancy_id <> c.tenancy_id THEN
        RAISE EXCEPTION 'Allocation crosses tenancies';
    END IF;
    IF r.status <> 'active' THEN RAISE EXCEPTION 'Receipt is reversed'; END IF;
    SELECT coalesce(sum(amount),0) INTO v_r FROM allocations WHERE receipt_id = NEW.receipt_id AND id <> NEW.id;
    SELECT coalesce(sum(amount),0) INTO v_c FROM allocations WHERE rent_charge_id = NEW.rent_charge_id AND id <> NEW.id;
    IF v_r + NEW.amount > r.amount THEN RAISE EXCEPTION 'Allocation exceeds receipt'; END IF;
    IF v_c + NEW.amount > c.amount THEN RAISE EXCEPTION 'Allocation exceeds charge'; END IF;
    RETURN NEW;
END $$;
CREATE TRIGGER t_allocation_check BEFORE INSERT OR UPDATE ON allocations
    FOR EACH ROW EXECUTE FUNCTION check_allocation();

-- Generic audit trigger. The API sets: SET LOCAL app.user_email = 'jane@omnia...';
CREATE FUNCTION audit_row() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
    INSERT INTO audit_log (table_name, row_id, action, old_row, new_row, changed_by)
    VALUES (TG_TABLE_NAME,
            CASE WHEN TG_OP = 'DELETE' THEN OLD.id ELSE NEW.id END,
            TG_OP,
            CASE WHEN TG_OP IN ('UPDATE','DELETE') THEN to_jsonb(OLD) END,
            CASE WHEN TG_OP IN ('INSERT','UPDATE') THEN to_jsonb(NEW) END,
            current_setting('app.user_email', true));
    RETURN NULL;
END $$;
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['tenants','tenancies','rent_schedules','benefit_awards','payer_splits',
                           'payment_methods','rent_charges','bank_transactions','receipts',
                           'allocations','adjustments','xero_invoices']
  LOOP
    EXECUTE format('CREATE TRIGGER t_audit AFTER INSERT OR UPDATE OR DELETE ON %I
                    FOR EACH ROW EXECUTE FUNCTION audit_row()', t);
  END LOOP;
END $$;

-- =============================================================================
-- FUNCTIONS: charge generation and allocation
-- =============================================================================
-- Start of the n-th period after an anchor date (no month-end drift).
CREATE FUNCTION period_start_n(anchor date, freq rent_frequency, n integer) RETURNS date
LANGUAGE sql IMMUTABLE AS $$
    SELECT CASE freq
        WHEN 'weekly'      THEN anchor + 7  * n
        WHEN 'fortnightly' THEN anchor + 14 * n
        WHEN 'four_weekly' THEN anchor + 28 * n
        WHEN 'monthly'     THEN (anchor + make_interval(months => n))::date
        WHEN 'quarterly'   THEN (anchor + make_interval(months => 3 * n))::date
    END
$$;

-- Create any missing rent_charges for a tenancy up to p_until (inclusive).
-- Each period is split: third-party payers first, tenant gets the remainder.
-- The final period is pro-rated by day if the tenancy ends mid-period.
-- Safe to re-run: existing periods are skipped.
CREATE FUNCTION generate_rent_charges(p_tenancy uuid, p_until date) RETURNS integer
LANGUAGE plpgsql AS $$
DECLARE
    t   tenancies%ROWTYPE;
    s   rent_schedules%ROWTYPE;
    sp  payer_splits%ROWTYPE;
    n   integer;
    ps  date; pe date; eff_end date;
    full_rent numeric; rent numeric; share numeric; third_party numeric;
    created integer := 0;
BEGIN
    SELECT * INTO t FROM tenancies WHERE id = p_tenancy;
    FOR s IN SELECT * FROM rent_schedules WHERE tenancy_id = p_tenancy ORDER BY effective_from LOOP
        n := 0;
        LOOP
            ps := period_start_n(s.effective_from, s.frequency, n);
            pe := period_start_n(s.effective_from, s.frequency, n + 1) - 1;
            EXIT WHEN ps > p_until
                   OR (s.effective_to IS NOT NULL AND ps > s.effective_to)
                   OR (t.end_date IS NOT NULL AND ps > t.end_date);
            full_rent := s.amount;
            rent := full_rent;
            eff_end := least(pe, coalesce(t.end_date, pe), coalesce(s.effective_to, pe));
            IF eff_end < pe THEN                                   -- pro-rate the last period
                rent := round(full_rent * (eff_end - ps + 1) / (pe - ps + 1), 2);
            END IF;

            third_party := 0;
            FOR sp IN SELECT * FROM payer_splits
                       WHERE tenancy_id = p_tenancy AND effective_from <= ps
                         AND (effective_to IS NULL OR effective_to >= ps)
                       ORDER BY payer LOOP
                share := CASE WHEN sp.share_percent IS NOT NULL
                              THEN round(rent * sp.share_percent / 100, 2)
                              ELSE round(sp.fixed_amount * rent / nullif(full_rent,0), 2) END;
                share := least(share, rent - third_party);             -- never more than the rent
                IF share > 0 THEN
                    INSERT INTO rent_charges (tenancy_id, payer, period_start, period_end, due_date, amount, rent_schedule_id)
                    VALUES (p_tenancy, sp.payer, ps, eff_end, ps, share, s.id)
                    ON CONFLICT DO NOTHING;
                    IF FOUND THEN created := created + 1; END IF;
                    third_party := third_party + share;
                END IF;
            END LOOP;

            IF rent - third_party > 0 THEN
                INSERT INTO rent_charges (tenancy_id, payer, period_start, period_end, due_date, amount, rent_schedule_id)
                VALUES (p_tenancy, 'tenant', ps, eff_end, ps, rent - third_party, s.id)
                ON CONFLICT DO NOTHING;
                IF FOUND THEN created := created + 1; END IF;
            END IF;
            n := n + 1;
        END LOOP;
    END LOOP;
    RETURN created;
END $$;

-- Apply one receipt's unallocated money to the oldest unpaid charges of the
-- SAME payer on the SAME tenancy. Leftover stays on the receipt as credit and
-- is picked up automatically when new charges are generated (re-run this).
CREATE FUNCTION allocate_oldest_first(p_receipt uuid) RETURNS numeric
LANGUAGE plpgsql AS $$
DECLARE
    r receipts%ROWTYPE;
    c record;
    remaining numeric;
    take numeric;
BEGIN
    SELECT * INTO r FROM receipts WHERE id = p_receipt FOR UPDATE;
    IF r.status <> 'active' THEN RETURN 0; END IF;
    remaining := r.amount - coalesce((SELECT sum(amount) FROM allocations WHERE receipt_id = p_receipt), 0);

    FOR c IN
        SELECT rc.id, rc.amount - coalesce(sum(a.amount), 0) AS outstanding
          FROM rent_charges rc
          LEFT JOIN allocations a ON a.rent_charge_id = rc.id
         WHERE rc.tenancy_id = r.tenancy_id AND rc.payer = r.payer
         GROUP BY rc.id
        HAVING rc.amount - coalesce(sum(a.amount), 0) > 0
         ORDER BY rc.due_date, rc.period_start
    LOOP
        EXIT WHEN remaining <= 0;
        take := least(remaining, c.outstanding);
        INSERT INTO allocations (receipt_id, rent_charge_id, amount)
        VALUES (p_receipt, c.id, take)
        ON CONFLICT (receipt_id, rent_charge_id) DO UPDATE SET amount = allocations.amount + EXCLUDED.amount;
        remaining := remaining - take;
    END LOOP;
    RETURN remaining;          -- > 0 means credit / overpayment
END $$;

-- Re-run allocation for every receipt on a tenancy with money left (oldest receipt first).
CREATE FUNCTION reallocate_tenancy(p_tenancy uuid) RETURNS void LANGUAGE plpgsql AS $$
DECLARE rid uuid;
BEGIN
    FOR rid IN SELECT r.id FROM receipts r
                WHERE r.tenancy_id = p_tenancy AND r.status = 'active'
                  AND r.amount > coalesce((SELECT sum(amount) FROM allocations WHERE receipt_id = r.id), 0)
                ORDER BY r.received_on, r.created_at
    LOOP
        PERFORM allocate_oldest_first(rid);
    END LOOP;
END $$;

-- =============================================================================
-- VIEWS
-- =============================================================================
-- Each rent period with what has been paid against it.
CREATE VIEW v_charge_status AS
SELECT rc.*,
       coalesce(a.paid, 0)                         AS paid,
       rc.amount - coalesce(a.paid, 0)             AS outstanding,
       CASE WHEN coalesce(a.paid,0) = 0 THEN 'unpaid'
            WHEN coalesce(a.paid,0) < rc.amount THEN 'part_paid'
            ELSE 'paid' END                        AS pay_state
  FROM rent_charges rc
  LEFT JOIN (SELECT rent_charge_id, sum(amount) AS paid FROM allocations GROUP BY rent_charge_id) a
         ON a.rent_charge_id = rc.id;

-- Rent account per tenancy per payer. balance > 0 = arrears, < 0 = in credit.
CREATE VIEW v_tenancy_balance AS
WITH ch AS (SELECT tenancy_id, payer, sum(amount) amt FROM rent_charges
             WHERE due_date <= current_date GROUP BY 1,2),
     rc AS (SELECT tenancy_id, payer, sum(amount) amt FROM receipts WHERE status = 'active' GROUP BY 1,2),
     ad AS (SELECT tenancy_id, payer, sum(amount) amt FROM adjustments GROUP BY 1,2),
     keys AS (SELECT tenancy_id, payer FROM ch UNION SELECT tenancy_id, payer FROM rc UNION SELECT tenancy_id, payer FROM ad)
SELECT t.tid, k.tenancy_id, k.payer,
       coalesce(ch.amt,0) AS charged_to_date,
       coalesce(rc.amt,0) AS received,
       coalesce(ad.amt,0) AS adjustments,
       coalesce(ch.amt,0) + coalesce(ad.amt,0) - coalesce(rc.amt,0) AS balance
  FROM keys k
  JOIN tenancies t ON t.id = k.tenancy_id
  LEFT JOIN ch USING (tenancy_id, payer)
  LEFT JOIN rc USING (tenancy_id, payer)
  LEFT JOIN ad USING (tenancy_id, payer);

-- Arrears ageing (outstanding charges that are already due).
CREATE VIEW v_arrears_aging AS
SELECT t.tid, cs.tenancy_id, cs.payer,
       sum(cs.outstanding) FILTER (WHERE current_date - cs.due_date <= 30)              AS days_0_30,
       sum(cs.outstanding) FILTER (WHERE current_date - cs.due_date BETWEEN 31 AND 60)  AS days_31_60,
       sum(cs.outstanding) FILTER (WHERE current_date - cs.due_date BETWEEN 61 AND 90)  AS days_61_90,
       sum(cs.outstanding) FILTER (WHERE current_date - cs.due_date > 90)               AS days_90_plus,
       sum(cs.outstanding)                                                             AS total_arrears
  FROM v_charge_status cs
  JOIN tenancies t ON t.id = cs.tenancy_id
 WHERE cs.outstanding > 0 AND cs.due_date <= current_date
 GROUP BY t.tid, cs.tenancy_id, cs.payer;

-- Replaces the "Rental Income for Xero" Google Sheet: every column the
-- flow chart says staff check, one row per receipt.
CREATE VIEW v_xero_rental_income AS
SELECT r.id                    AS receipt_id,
       t.tid,
       ba.code                 AS bank,
       r.amount                AS rent_amount,
       r.received_on           AS date,
       tn.full_name            AS tenant_name,
       t.management_type       AS mg_rg_status,
       concat_ws(', ', p.address_line1, p.address_line2, p.town, p.postcode) AS property_address,
       p.property_ref          AS property_id,
       (r.category = 'backdated')          AS bd,
       (r.category = 'ended_overpayment')  AS end_op,
       CASE r.payer WHEN 'dwp_uc' THEN 'UC' WHEN 'council_hb' THEN 'HB' ELSE NULL END AS uc_hb,
       b.code                  AS branch,
       r.ledger_code,
       xi.status               AS xero_status
  FROM receipts r
  JOIN tenancies t        ON t.id = r.tenancy_id
  JOIN properties p       ON p.id = t.property_id
  JOIN branches b         ON b.id = p.branch_id
  LEFT JOIN bank_transactions bt ON bt.id = r.bank_transaction_id
  LEFT JOIN bank_accounts ba     ON ba.id = bt.bank_account_id
  LEFT JOIN tenancy_tenants tt   ON tt.tenancy_id = t.id AND tt.is_lead AND tt.left_on IS NULL
  LEFT JOIN tenants tn           ON tn.id = tt.tenant_id
  LEFT JOIN xero_invoices xi     ON xi.receipt_id = r.id
 WHERE r.status = 'active';

COMMIT;
