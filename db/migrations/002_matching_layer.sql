-- =============================================================================
-- OMNIA RECON — Migration 002: bank CSV profiles + matching layer
-- -----------------------------------------------------------------------------
-- Adds, on top of 001_baseline.sql:
--   * bank_csv_profiles     read each bank's CSV by HEADER NAME (column order never matters)
--   * payer_bank_accounts   landlord / third-party accounts, stored as keyed hash + last 4
--   * bank_transactions     columns for what was extracted and what it resolved to
--   * integration_settings  constants (Vico sort code/account, Xero field mapping, ...)
--   * functions             secure_hash, extract_tid, suggest_matches, auto_match, confirm_match
--   * views                 v_bank_statement_enriched (replaces the Google Sheet), v_vico_export
--
-- The app must run, per connection:  SET app.hash_key = '<secret from env>';
-- (the same key hashes NI numbers and bank accounts, so lookups line up)
-- =============================================================================

-- New enum value must be committed before use, so it sits outside the transaction.
ALTER TYPE match_method ADD VALUE IF NOT EXISTS 'payer_account' BEFORE 'amount_and_name';

BEGIN;

-- -----------------------------------------------------------------------------
-- Hashing and extraction helpers
-- -----------------------------------------------------------------------------
-- Keyed hash for NI numbers and bank accounts. Normalises first, so
-- "ab 12 34 56 c" and "AB123456C" hash the same.
CREATE FUNCTION secure_hash(p_value text) RETURNS text
LANGUAGE sql STABLE AS $$
    SELECT CASE WHEN p_value IS NULL OR btrim(p_value) = '' THEN NULL
           ELSE encode(hmac(regexp_replace(upper(p_value), '[^A-Z0-9]', '', 'g'),
                            current_setting('app.hash_key'), 'sha256'), 'hex') END
$$;

-- Finds a Tenancy ID in free text: "t 1234", "T-1234", "REF T1234 RENT" -> 'T1234'.
-- Requires the T not to be glued to a preceding letter (so "APT1234" is ignored).
CREATE FUNCTION extract_tid(p_text text) RETURNS text
LANGUAGE sql IMMUTABLE AS $$
    SELECT 'T' || m[1]
      FROM regexp_match(upper(coalesce(p_text, '')), '(?:^|[^A-Z])T[\s\-]?(\d{3,6})(?!\d)') AS m
$$;

-- Finds a UK NI number in free text and returns it normalised (never stored raw).
CREATE FUNCTION extract_ni(p_text text) RETURNS text
LANGUAGE sql IMMUTABLE AS $$
    SELECT regexp_replace(m[1], '\s', '', 'g')
      FROM regexp_match(upper(coalesce(p_text, '')),
           '(?:^|[^A-Z0-9])([A-CEGHJ-PR-TW-Z]{2}\s?\d{2}\s?\d{2}\s?\d{2}\s?[A-D])(?![A-Z0-9])') AS m
$$;

-- -----------------------------------------------------------------------------
-- Bank CSV profiles (replaces bank_accounts.csv_profile)
-- -----------------------------------------------------------------------------
ALTER TABLE bank_accounts DROP COLUMN csv_profile;

CREATE TABLE bank_csv_profiles (
    id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    bank_account_id  uuid NOT NULL REFERENCES bank_accounts(id),
    version          integer NOT NULL,
    header_aliases   jsonb NOT NULL,
    required_fields  text[] NOT NULL DEFAULT ARRAY['txn_date', 'description'],
    amount_mode      text NOT NULL CHECK (amount_mode IN ('signed', 'split_in_out')),
    date_format      text NOT NULL DEFAULT 'DD/MM/YYYY',
    skip_rows        integer NOT NULL DEFAULT 0 CHECK (skip_rows >= 0),
    is_active        boolean NOT NULL DEFAULT true,
    notes            text,
    created_at       timestamptz NOT NULL DEFAULT now(),
    UNIQUE (bank_account_id, version),
    CHECK (jsonb_typeof(header_aliases) = 'object')
);
CREATE UNIQUE INDEX one_active_profile_per_bank ON bank_csv_profiles (bank_account_id) WHERE is_active;
COMMENT ON TABLE bank_csv_profiles IS
  'How to read one bank''s CSV. Columns are located by header NAME (case/space-insensitive), never by position. '
  'Canonical fields: txn_date, description, reference, amount | paid_in + paid_out, counterparty, payer_sort_code, '
  'payer_account_number, balance, bank_txn_id, tid, ni_number. '
  'Example header_aliases: {"txn_date":["Date","Transaction Date"],"paid_in":["Paid in","Credit"],"tid":["Tenant ID"]}. '
  'A bank that renames a header = insert version N+1 with the new alias, deactivate N. No code change.';

-- -----------------------------------------------------------------------------
-- Payer bank accounts (landlord / relative / tenant's own account)
-- -----------------------------------------------------------------------------
CREATE TABLE payer_bank_accounts (
    id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    account_hash     text NOT NULL,                      -- secure_hash(sort_code || account_number)
    sort_code        text,
    account_last4    text NOT NULL,
    holder_name      text,
    holder_type      text NOT NULL CHECK (holder_type IN ('landlord', 'tenant', 'guarantor', 'council', 'dwp', 'other')),
    landlord_id      uuid REFERENCES landlords(id),      -- a landlord account: may cover all their tenancies
    tenant_id        uuid REFERENCES tenants(id),
    tenancy_id       uuid REFERENCES tenancies(id),      -- set when it pays for exactly this tenancy
    payer            payer_type NOT NULL DEFAULT 'other_third_party',
    is_active        boolean NOT NULL DEFAULT true,
    learned_from_txn uuid REFERENCES bank_transactions(id),
    created_at       timestamptz NOT NULL DEFAULT now(),
    CHECK (tenancy_id IS NOT NULL OR landlord_id IS NOT NULL OR tenant_id IS NOT NULL)
);
CREATE INDEX ON payer_bank_accounts (account_hash) WHERE is_active;
CREATE UNIQUE INDEX payer_account_tenancy_uq ON payer_bank_accounts (account_hash, tenancy_id) WHERE tenancy_id IS NOT NULL;

-- -----------------------------------------------------------------------------
-- Bank transactions: what was extracted, what it resolved to
-- -----------------------------------------------------------------------------
ALTER TABLE bank_transactions
    ADD COLUMN profile_id          uuid REFERENCES bank_csv_profiles(id),
    ADD COLUMN extracted_tid       text,
    ADD COLUMN extracted_ni_hash   text,
    ADD COLUMN payer_sort_code     text,
    ADD COLUMN payer_account_hash  text,
    ADD COLUMN payer_account_last4 text,
    ADD COLUMN resolved_tenancy_id uuid REFERENCES tenancies(id),
    ADD COLUMN resolved_via        match_method;
CREATE INDEX ON bank_transactions (extracted_tid) WHERE extracted_tid IS NOT NULL;
CREATE INDEX ON bank_transactions (extracted_ni_hash) WHERE extracted_ni_hash IS NOT NULL;
CREATE INDEX ON bank_transactions (payer_account_hash) WHERE payer_account_hash IS NOT NULL;

CREATE TABLE integration_settings (
    system           ext_system NOT NULL,
    key              text NOT NULL,
    value            text NOT NULL,
    updated_at       timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (system, key)
);
COMMENT ON TABLE integration_settings IS
  'e.g. (vico, sort_code, ...), (vico, account_number, ...), (xero, field_map, {json})';

-- -----------------------------------------------------------------------------
-- Matching
-- -----------------------------------------------------------------------------
-- What we expect this payer to pay for this tenancy around a date:
-- the payment method's expected amount, else the charge for the period containing the date.
CREATE FUNCTION expected_payment(p_tenancy uuid, p_payer payer_type, p_on date) RETURNS numeric
LANGUAGE sql STABLE AS $$
    SELECT coalesce(
        (SELECT expected_amount FROM payment_methods
          WHERE tenancy_id = p_tenancy AND payer = p_payer AND expected_amount IS NOT NULL
            AND effective_from <= p_on AND (effective_to IS NULL OR effective_to >= p_on)
          ORDER BY is_primary DESC, effective_from DESC LIMIT 1),
        (SELECT amount FROM rent_charges
          WHERE tenancy_id = p_tenancy AND payer = p_payer
            AND p_on BETWEEN period_start AND period_end
          ORDER BY period_start DESC LIMIT 1))
$$;

-- A tenancy counts as "live" on a date if it has started and not ended before it.
CREATE FUNCTION tenancy_live_on(t tenancies, p_on date) RETURNS boolean
LANGUAGE sql IMMUTABLE AS $$
    SELECT t.start_date <= p_on AND (t.end_date IS NULL OR t.end_date >= p_on)
$$;

-- Runs the cascade for ONE bank line and writes candidates to match_suggestions.
-- Stops at the first step that finds anything. Sets status to needs_review,
-- yet_to_take or excluded. Returns the number of suggestions written.
--   1  TID in text                     1.00  payer = tenancy's council/DWP split, else council_hb
--   2  NI -> tenant, one live tenancy  0.95  payer = tenant (reason flags arrears on older tenancies)
--   2b NI -> several live tenancies    0.60  each
--   3  payer account -> one tenancy    0.95  payer = account's payer (a person confirmed it before)
--   3b payer account -> many tenancies 0.70 where expected payment = amount, else 0.40
--   4  learned payment_references      0.95
--   5  fuzzy name + amount within 5%   <= 0.60
--   6  nothing                         status yet_to_take, note 'Yet to take'
CREATE FUNCTION suggest_matches(p_txn uuid) RETURNS integer
LANGUAGE plpgsql AS $$
DECLARE
    bt   bank_transactions%ROWTYPE;
    txt  text;
    n    integer := 0;
    cnt  integer;
    rec  record;
BEGIN
    SELECT * INTO bt FROM bank_transactions WHERE id = p_txn FOR UPDATE;
    IF bt.status IN ('matched', 'excluded') THEN RETURN 0; END IF;

    IF bt.amount <= 0 THEN
        UPDATE bank_transactions SET status = 'excluded', exclusion_reason = 'money_out' WHERE id = p_txn;
        RETURN 0;
    END IF;

    txt := upper(coalesce(bt.description, '') || ' ' || coalesce(bt.reference, '') || ' ' || coalesce(bt.counterparty, ''));

    -- 1. TID
    IF bt.extracted_tid IS NOT NULL THEN
        INSERT INTO match_suggestions (bank_transaction_id, tenancy_id, payer, method, confidence, reason)
        SELECT p_txn, t.id,
               coalesce((SELECT ps.payer FROM payer_splits ps
                          WHERE ps.tenancy_id = t.id AND ps.payer IN ('council_hb', 'dwp_uc')
                            AND ps.effective_from <= bt.txn_date
                            AND (ps.effective_to IS NULL OR ps.effective_to >= bt.txn_date)
                          ORDER BY ps.payer LIMIT 1), 'council_hb'),
               'tid_in_reference', 1.000, 'TID ' || t.tid || ' found on the bank line'
          FROM tenancies t WHERE t.tid = bt.extracted_tid
        ON CONFLICT DO NOTHING;
        GET DIAGNOSTICS cnt = ROW_COUNT; n := n + cnt;
    END IF;

    -- 2. NI number
    IF n = 0 AND bt.extracted_ni_hash IS NOT NULL THEN
        SELECT count(*) INTO cnt
          FROM tenants tn JOIN tenancy_tenants tt ON tt.tenant_id = tn.id JOIN tenancies t ON t.id = tt.tenancy_id
         WHERE tn.ni_hash = bt.extracted_ni_hash AND tenancy_live_on(t, bt.txn_date);

        INSERT INTO match_suggestions (bank_transaction_id, tenancy_id, payer, method, confidence, reason)
        SELECT p_txn, t.id, 'tenant', 'ni_in_reference',
               CASE WHEN cnt = 1 THEN 0.950 ELSE 0.600 END,
               'NI number matches ' || tn.full_name || ' (' || t.tid || ')' ||
               CASE WHEN cnt > 1 THEN '; tenant has ' || cnt || ' live tenancies' ELSE '' END ||
               coalesce((SELECT '; older tenancy ' || string_agg(o.tid || ' owes ' || b.balance, ', ')
                           FROM tenancy_tenants ot JOIN tenancies o ON o.id = ot.tenancy_id
                           JOIN v_tenancy_balance b ON b.tenancy_id = o.id AND b.payer = 'tenant'
                          WHERE ot.tenant_id = tn.id AND o.id <> t.id AND NOT tenancy_live_on(o, bt.txn_date)
                            AND b.balance > 0), '')
          FROM tenants tn JOIN tenancy_tenants tt ON tt.tenant_id = tn.id JOIN tenancies t ON t.id = tt.tenancy_id
         WHERE tn.ni_hash = bt.extracted_ni_hash AND tenancy_live_on(t, bt.txn_date)
        ON CONFLICT DO NOTHING;
        GET DIAGNOSTICS cnt = ROW_COUNT; n := n + cnt;
    END IF;

    -- 3. Payer bank account (direct tenancy links, plus every live tenancy of a linked landlord)
    IF n = 0 AND bt.payer_account_hash IS NOT NULL THEN
        FOR rec IN
            WITH cand AS (
                SELECT pba.tenancy_id, pba.payer, pba.holder_name, pba.holder_type
                  FROM payer_bank_accounts pba
                 WHERE pba.account_hash = bt.payer_account_hash AND pba.is_active AND pba.tenancy_id IS NOT NULL
                UNION
                SELECT t.id, pba.payer, pba.holder_name, pba.holder_type
                  FROM payer_bank_accounts pba
                  JOIN properties p ON p.landlord_id = pba.landlord_id
                  JOIN tenancies t ON t.property_id = p.id
                 WHERE pba.account_hash = bt.payer_account_hash AND pba.is_active
                   AND pba.tenancy_id IS NULL AND pba.landlord_id IS NOT NULL)
            SELECT c.*, t.tid, count(*) OVER () AS total,
                   expected_payment(c.tenancy_id, c.payer, bt.txn_date) AS expected
              FROM cand c JOIN tenancies t ON t.id = c.tenancy_id
             WHERE tenancy_live_on(t, bt.txn_date)
        LOOP
            INSERT INTO match_suggestions (bank_transaction_id, tenancy_id, payer, method, confidence, reason)
            VALUES (p_txn, rec.tenancy_id, rec.payer, 'payer_account',
                    CASE WHEN rec.total = 1 THEN 0.950
                         WHEN rec.expected = bt.amount THEN 0.700 ELSE 0.400 END,
                    'Paid from known ' || rec.holder_type || ' account' ||
                    coalesce(' (' || rec.holder_name || ')', '') || ' ending ' || coalesce(bt.payer_account_last4, '????') ||
                    CASE WHEN rec.total > 1 THEN '; covers ' || rec.total || ' tenancies' ||
                         CASE WHEN rec.expected = bt.amount THEN '; amount equals expected for ' || rec.tid ELSE '' END
                    ELSE '' END)
            ON CONFLICT DO NOTHING;
            n := n + 1;
        END LOOP;
    END IF;

    -- 4. Learned reference rules
    IF n = 0 THEN
        INSERT INTO match_suggestions (bank_transaction_id, tenancy_id, payer, method, confidence, reason)
        SELECT DISTINCT ON (pr.tenancy_id) p_txn, pr.tenancy_id, pr.payer, 'reference_rule', 0.950,
               'Learned rule: ' || pr.match_kind || ' "' || pr.pattern || '"'
          FROM payment_references pr
         WHERE pr.is_active
           AND (pr.bank_account_id IS NULL OR pr.bank_account_id = bt.bank_account_id)
           AND CASE pr.match_kind
                    WHEN 'exact'    THEN regexp_replace(upper(coalesce(bt.reference, bt.description)), '\s+', ' ', 'g') = pr.pattern
                    WHEN 'contains' THEN position(pr.pattern IN regexp_replace(txt, '\s+', ' ', 'g')) > 0
                    WHEN 'regex'    THEN txt ~ pr.pattern
               END
        ON CONFLICT DO NOTHING;
        GET DIAGNOSTICS cnt = ROW_COUNT; n := n + cnt;
    END IF;

    -- 5. Fuzzy tenant name + amount close to what they are expected to pay
    IF n = 0 THEN
        INSERT INTO match_suggestions (bank_transaction_id, tenancy_id, payer, method, confidence, reason)
        SELECT p_txn, x.tenancy_id, 'tenant', 'name_fuzzy', round(least(0.6, x.sim)::numeric, 3),
               'Name looks like ' || x.full_name || ' (' || x.tid || '), amount close to expected ' || x.expected
          FROM (SELECT t.id AS tenancy_id, t.tid, tn.full_name,
                       word_similarity(upper(tn.full_name), txt) AS sim,
                       expected_payment(t.id, 'tenant', bt.txn_date) AS expected
                  FROM tenants tn JOIN tenancy_tenants tt ON tt.tenant_id = tn.id JOIN tenancies t ON t.id = tt.tenancy_id
                 WHERE tenancy_live_on(t, bt.txn_date)) x
         WHERE x.sim >= 0.5 AND x.expected IS NOT NULL AND abs(x.expected - bt.amount) <= 0.05 * x.expected
        ON CONFLICT DO NOTHING;
        GET DIAGNOSTICS cnt = ROW_COUNT; n := n + cnt;
    END IF;

    -- 6. Outcome
    UPDATE bank_transactions
       SET status = CASE WHEN n = 0 THEN 'yet_to_take'::txn_status ELSE 'needs_review'::txn_status END,
           note   = CASE WHEN n = 0 THEN 'Yet to take' ELSE note END
     WHERE id = p_txn;
    RETURN n;
END $$;

-- Creates the receipt for a chosen tenancy/payer, allocates it oldest-first,
-- marks the line matched and (optionally) remembers the payer for next time.
-- Used both by auto_match and by staff confirming a suggestion or a manual match.
CREATE FUNCTION confirm_match(p_txn uuid, p_tenancy uuid, p_payer payer_type, p_method match_method,
                              p_remember boolean DEFAULT false, p_user uuid DEFAULT NULL,
                              p_amount numeric DEFAULT NULL) RETURNS uuid
LANGUAGE plpgsql AS $$
DECLARE
    bt   bank_transactions%ROWTYPE;
    t    tenancies%ROWTYPE;
    remaining numeric;
    amt  numeric;
    rid  uuid;
BEGIN
    SELECT * INTO bt FROM bank_transactions WHERE id = p_txn FOR UPDATE;
    SELECT * INTO t  FROM tenancies WHERE id = p_tenancy;
    remaining := bt.amount - coalesce((SELECT sum(amount) FROM receipts
                                        WHERE bank_transaction_id = p_txn AND status = 'active'), 0);
    amt := coalesce(p_amount, remaining);
    IF amt <= 0 OR amt > remaining THEN
        RAISE EXCEPTION 'Amount % is not available on this bank line (remaining %)', amt, remaining;
    END IF;

    INSERT INTO receipts (bank_transaction_id, tenancy_id, payer, amount, received_on, category, matched_via, matched_by)
    VALUES (p_txn, p_tenancy, p_payer, amt, bt.txn_date,
            CASE WHEN t.end_date IS NOT NULL AND bt.txn_date > t.end_date
                 THEN 'ended_overpayment' ELSE 'regular' END::receipt_category,
            p_method, p_user)
    RETURNING id INTO rid;
    PERFORM allocate_oldest_first(rid);

    UPDATE match_suggestions
       SET status = CASE WHEN tenancy_id = p_tenancy THEN 'accepted' ELSE 'rejected' END::suggestion_status,
           decided_by = p_user, decided_at = now()
     WHERE bank_transaction_id = p_txn AND status = 'open';

    UPDATE bank_transactions
       SET status = CASE WHEN amt = remaining THEN 'matched' ELSE 'partially_matched' END::txn_status,
           resolved_tenancy_id = CASE WHEN amt = remaining AND resolved_tenancy_id IS NULL THEN p_tenancy ELSE resolved_tenancy_id END,
           resolved_via = coalesce(resolved_via, p_method),
           note = CASE WHEN note = 'Yet to take' THEN NULL ELSE note END
     WHERE id = p_txn;

    IF p_remember THEN
        IF bt.payer_account_hash IS NOT NULL THEN
            INSERT INTO payer_bank_accounts (account_hash, sort_code, account_last4, holder_type, tenancy_id, payer, learned_from_txn)
            VALUES (bt.payer_account_hash, bt.payer_sort_code, coalesce(bt.payer_account_last4, '????'),
                    CASE p_payer WHEN 'tenant' THEN 'tenant' WHEN 'council_hb' THEN 'council'
                                 WHEN 'dwp_uc' THEN 'dwp' ELSE 'other' END,
                    p_tenancy, p_payer, p_txn)
            ON CONFLICT DO NOTHING;
        ELSIF coalesce(bt.reference, '') <> '' THEN
            INSERT INTO payment_references (tenancy_id, payer, bank_account_id, match_kind, pattern, created_by)
            VALUES (p_tenancy, p_payer, bt.bank_account_id, 'exact',
                    regexp_replace(upper(bt.reference), '\s+', ' ', 'g'), p_user)
            ON CONFLICT DO NOTHING;
        END IF;
    END IF;
    RETURN rid;
END $$;

-- Runs the cascade, then auto-confirms when exactly one suggestion reaches the
-- threshold (the app passes AUTO_MATCH_THRESHOLD; default 0.95).
-- Returns the final status of the line.
CREATE FUNCTION auto_match(p_txn uuid, p_threshold numeric DEFAULT NULL) RETURNS txn_status
LANGUAGE plpgsql AS $$
DECLARE
    thr numeric := coalesce(p_threshold, 0.95);   -- app passes AUTO_MATCH_THRESHOLD from config
    s   match_suggestions%ROWTYPE;
    cnt integer;
    st  txn_status;
BEGIN
    PERFORM suggest_matches(p_txn);
    SELECT count(*) INTO cnt FROM match_suggestions
     WHERE bank_transaction_id = p_txn AND status = 'open' AND confidence >= thr;
    IF cnt = 1 THEN
        SELECT * INTO s FROM match_suggestions
         WHERE bank_transaction_id = p_txn AND status = 'open' AND confidence >= thr;
        PERFORM confirm_match(p_txn, s.tenancy_id, s.payer, s.method);
    END IF;
    SELECT status INTO st FROM bank_transactions WHERE id = p_txn;
    RETURN st;
END $$;

-- -----------------------------------------------------------------------------
-- Views
-- -----------------------------------------------------------------------------
-- Replaces the "Bank Statement" Google Sheet: every money-in line, filled in.
CREATE VIEW v_bank_statement_enriched AS
SELECT bt.id                      AS bank_transaction_id,
       bt.txn_date                AS date,
       ba.code                    AS bank,
       bt.amount,
       bt.description,
       bt.reference,
       coalesce(t.tid, bt.extracted_tid)                   AS tid,
       CASE WHEN tn.ni_last3 IS NOT NULL THEN '•••••' || tn.ni_last3 END AS ni_masked,
       tn.full_name               AS tenant_name,
       p.property_ref             AS property_id,
       b.code                     AS branch,
       t.management_type          AS mg_rg_status,
       bt.status,
       bt.resolved_via,
       CASE WHEN bt.payer_account_last4 IS NOT NULL THEN '****' || bt.payer_account_last4 END AS payer_account,
       bt.note,
       (SELECT count(*) FROM receipts r WHERE r.bank_transaction_id = bt.id AND r.status = 'active') AS receipts
  FROM bank_transactions bt
  JOIN bank_accounts ba ON ba.id = bt.bank_account_id
  LEFT JOIN tenancies t        ON t.id = bt.resolved_tenancy_id
  LEFT JOIN properties p       ON p.id = t.property_id
  LEFT JOIN branches b         ON b.id = p.branch_id
  LEFT JOIN tenancy_tenants tt ON tt.tenancy_id = t.id AND tt.is_lead AND tt.left_on IS NULL
  LEFT JOIN tenants tn         ON tn.id = tt.tenant_id
 WHERE bt.amount > 0;

-- Receipts not yet sent to Vico: TID + amount + the two constants Vico wants.
-- After a successful upload, insert external_refs (system 'vico', entity 'receipt').
CREATE VIEW v_vico_export AS
SELECT r.id          AS receipt_id,
       t.tid,
       r.amount,
       r.received_on AS date,
       (SELECT value FROM integration_settings WHERE system = 'vico' AND key = 'sort_code')      AS sort_code,
       (SELECT value FROM integration_settings WHERE system = 'vico' AND key = 'account_number') AS account_number
  FROM receipts r
  JOIN tenancies t ON t.id = r.tenancy_id
 WHERE r.status = 'active'
   AND NOT EXISTS (SELECT 1 FROM external_refs e
                    WHERE e.system = 'vico' AND e.entity_type = 'receipt' AND e.entity_id = r.id);

-- Audit the new tables too.
CREATE TRIGGER t_audit AFTER INSERT OR UPDATE OR DELETE ON payer_bank_accounts
    FOR EACH ROW EXECUTE FUNCTION audit_row();
CREATE TRIGGER t_audit AFTER INSERT OR UPDATE OR DELETE ON bank_csv_profiles
    FOR EACH ROW EXECUTE FUNCTION audit_row();

COMMIT;
