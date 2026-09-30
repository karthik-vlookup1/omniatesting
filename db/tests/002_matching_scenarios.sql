-- Matching-layer scenarios for 002_matching_layer.sql. Every check RAISES on failure.
-- Run on a fresh DB after 001 + 002 (and optionally 001_scenarios.sql - ids don't clash).
-- All data here is synthetic.
\set ON_ERROR_STOP 1
SET app.user_email = 'test@omnia';
SET app.hash_key   = 'test-only-key';

CREATE FUNCTION pg_temp.check(label text, got anyelement, expected anyelement) RETURNS void
LANGUAGE plpgsql AS $$
BEGIN
    IF got IS DISTINCT FROM expected THEN
        RAISE EXCEPTION 'FAIL %: got %, expected %', label, got, expected;
    END IF;
    RAISE NOTICE 'ok  %', label;
END $$;

-- ---------------------------------------------------------------- helpers
SELECT pg_temp.check('extract_tid spaced',  extract_tid('BCC HB t 2001 JUL'), 'T2001');
SELECT pg_temp.check('extract_tid dashed',  extract_tid('REF T-2001'), 'T2001');
SELECT pg_temp.check('extract_tid ignores APT', extract_tid('APT1234 RENT'), NULL::text);
SELECT pg_temp.check('extract_ni spaced',   extract_ni('RENT AB 12 34 56 C'), 'AB123456C');
SELECT pg_temp.check('secure_hash normalises', secure_hash('ab 12 34 56 c'), secure_hash('AB123456C'));

-- ---------------------------------------------------------------- reference data
INSERT INTO branches (code, name) VALUES ('B2', 'Branch Two');
INSERT INTO bank_accounts (code, bank_name, account_name) VALUES ('TEST2', 'Test Bank', 'Omnia Test');
INSERT INTO bank_csv_profiles (bank_account_id, version, header_aliases, amount_mode)
SELECT id, 1, '{"txn_date":["Date"],"description":["Description"],"paid_in":["Paid in"],"paid_out":["Paid out"],"reference":["Reference"]}', 'split_in_out'
  FROM bank_accounts WHERE code = 'TEST2';
INSERT INTO landlords (landlord_ref, name) VALUES ('L200', 'Lenny Landlord');
INSERT INTO properties (property_ref, branch_id, landlord_id, address_line1, postcode)
SELECT 'P2' || lpad(g::text, 2, '0'), b.id,
       CASE WHEN g BETWEEN 5 AND 7 THEN (SELECT id FROM landlords WHERE landlord_ref = 'L200') END,
       g || ' Test Road', 'B2 2BB'
  FROM branches b, generate_series(1, 10) g WHERE b.code = 'B2';

INSERT INTO tenants (first_name, last_name, ni_hash, ni_last3) VALUES
  ('Dana', 'Council',  NULL, NULL),
  ('Eli',  'Selfpay',  secure_hash('AB123456C'), '56C'),
  ('Fay',  'Mover',    secure_hash('CE654321A'), '21A'),
  ('Lx',   'One',      NULL, NULL), ('Ly', 'Two', NULL, NULL), ('Lz', 'Three', NULL, NULL),
  ('Gus',  'Ended',    NULL, NULL),
  ('Hal',  'Grandma',  NULL, NULL),
  ('Ivy',  'Nguyen',   NULL, NULL),
  ('Jo',   'Flatnine', NULL, NULL);

INSERT INTO tenancies (tid, property_id, management_type, start_date, end_date, status)
SELECT x.tid, p.id, x.mt::management_type, x.sd::date, x.ed::date, x.st::tenancy_status
  FROM (VALUES ('T2001','P201','RG', '2026-07-01',NULL,'active'),
               ('T2002','P202','MG', '2026-07-01',NULL,'active'),
               ('T2003','P203','RG', '2026-01-01','2026-06-30','ended'),
               ('T2004','P204','RG', '2026-07-01',NULL,'active'),
               ('T2005','P205','RG', '2026-07-01',NULL,'active'),
               ('T2006','P206','RG', '2026-07-01',NULL,'active'),
               ('T2007','P207','RG', '2026-07-01',NULL,'active'),
               ('T2008','P208','IRG','2026-05-01','2026-07-15','ended'),
               ('T2009','P209','RG', '2026-07-01',NULL,'active'),
               ('T2010','P210','RG', '2026-07-01',NULL,'active')) x(tid, pref, mt, sd, ed, st)
  JOIN properties p ON p.property_ref = x.pref;

INSERT INTO tenancy_tenants (tenancy_id, tenant_id)
SELECT t.id, tn.id FROM tenancies t JOIN tenants tn ON (t.tid, tn.first_name) IN
  (('T2001','Dana'),('T2002','Eli'),('T2003','Fay'),('T2004','Fay'),('T2005','Lx'),('T2006','Ly'),
   ('T2007','Lz'),('T2008','Gus'),('T2009','Hal'),('T2010','Ivy'));
-- Jo shares T2010's pattern-free case below via a learned reference on T2009 instead.

INSERT INTO rent_schedules (tenancy_id, amount, frequency, effective_from)
SELECT t.id, x.amt, 'monthly', t.start_date FROM tenancies t
  JOIN (VALUES ('T2001',600),('T2002',500),('T2003',450),('T2004',450),('T2005',500),('T2006',650),
               ('T2007',700),('T2008',600),('T2009',300),('T2010',520)) x(tid, amt) USING (tid);

-- Dana: council HB pays a fixed 400 of 600. Gus: HB pays 100%.
INSERT INTO payer_splits (tenancy_id, payer, fixed_amount, effective_from)
SELECT id, 'council_hb', 400, start_date FROM tenancies WHERE tid = 'T2001';
INSERT INTO payer_splits (tenancy_id, payer, share_percent, effective_from)
SELECT id, 'council_hb', 100, start_date FROM tenancies WHERE tid = 'T2008';

-- Landlord Lenny's account pays the tenant share for all three of his tenancies.
INSERT INTO payer_bank_accounts (account_hash, sort_code, account_last4, holder_name, holder_type, landlord_id, payer)
SELECT secure_hash('200000' || '12345678'), '20-00-00', '5678', 'Lenny Landlord', 'landlord', id, 'tenant'
  FROM landlords WHERE landlord_ref = 'L200';

SELECT count(*) AS charges_created FROM (SELECT generate_rent_charges(id, '2026-09-30') FROM tenancies) s;

-- ---------------------------------------------------------------- bank lines
INSERT INTO import_batches (source, bank_account_id, file_name, file_sha256)
SELECT 'bank_csv', id, 'test2_aug.csv', 'sha-test2-aug' FROM bank_accounts WHERE code = 'TEST2';

CREATE FUNCTION pg_temp.line(p_key text, p_date date, p_amount numeric, p_desc text, p_ref text,
                             p_sort text DEFAULT NULL, p_acct text DEFAULT NULL) RETURNS uuid
LANGUAGE sql AS $$
    INSERT INTO bank_transactions (bank_account_id, import_batch_id, txn_date, amount, description, reference,
                                   raw_row, dedupe_key, extracted_tid, extracted_ni_hash,
                                   payer_sort_code, payer_account_hash, payer_account_last4, profile_id)
    SELECT ba.id, ib.id, p_date, p_amount, p_desc, p_ref, '{}'::jsonb, p_key,
           extract_tid(p_desc || ' ' || coalesce(p_ref, '')),
           secure_hash(extract_ni(p_desc || ' ' || coalesce(p_ref, ''))),
           p_sort, secure_hash(regexp_replace(p_sort, '\D', '', 'g') || p_acct), right(p_acct, 4),
           (SELECT id FROM bank_csv_profiles WHERE bank_account_id = ba.id AND is_active)
      FROM bank_accounts ba, import_batches ib
     WHERE ba.code = 'TEST2' AND ib.file_sha256 = 'sha-test2-aug'
    RETURNING id
$$;

CREATE TEMP TABLE lines AS
SELECT * FROM (VALUES
  ('council_tid',  pg_temp.line('k01', '2026-08-05', 400,   'BIRMINGHAM CC HB t 2001', NULL)),
  ('ni_one',       pg_temp.line('k02', '2026-08-02', 500,   'E SELFPAY AB 12 34 56 C', NULL)),
  ('ni_moved',     pg_temp.line('k03', '2026-08-03', 450,   'FAY MOVER CE654321A', NULL)),
  ('landlord',     pg_temp.line('k04', '2026-08-04', 650,   'L LANDLORD RENT', NULL, '20-00-00', '12345678')),
  ('ended_overpay',pg_temp.line('k05', '2026-08-06', 300,   'BCC HB T2008', NULL)),
  ('grandma_1',    pg_temp.line('k06', '2026-08-07', 300,   'M SMITH', NULL, '11-22-33', '87654321')),
  ('flat9_1',      pg_temp.line('k07', '2026-08-08', 520,   'FASTER PAYMENT', 'FLAT 9  RENT')),
  ('fuzzy',        pg_temp.line('k08', '2026-08-09', 520,   'IVY NGUYEN RENT', NULL)),
  ('nothing',      pg_temp.line('k09', '2026-08-10', 75,    'CASH DEPOSIT', NULL)),
  ('money_out',    pg_temp.line('k10', '2026-08-10', -120,  'PLUMBER LTD', NULL))
) v(name, txn_id);

CREATE TEMP TABLE results AS
SELECT name, txn_id, auto_match(txn_id)::text AS status FROM lines;
SELECT name, status FROM results ORDER BY name;

-- ---------------------------------------------------------------- expectations
CREATE FUNCTION pg_temp.status(p_name text) RETURNS text LANGUAGE sql AS
$$ SELECT status::text FROM bank_transactions WHERE id = (SELECT txn_id FROM lines WHERE name = p_name) $$;
CREATE FUNCTION pg_temp.resolved(p_name text) RETURNS text LANGUAGE sql AS
$$ SELECT t.tid FROM bank_transactions bt JOIN tenancies t ON t.id = bt.resolved_tenancy_id
    WHERE bt.id = (SELECT txn_id FROM lines WHERE name = p_name) $$;

-- 1. Council pays with TID -> auto, payer from the tenancy's HB split
SELECT pg_temp.check('council TID auto-matched', pg_temp.status('council_tid'), 'matched');
SELECT pg_temp.check('council TID resolved',     pg_temp.resolved('council_tid'), 'T2001');
SELECT pg_temp.check('council receipt payer',
  (SELECT payer::text FROM receipts WHERE bank_transaction_id = (SELECT txn_id FROM lines WHERE name='council_tid')), 'council_hb');
SELECT pg_temp.check('council receipt ledger code RG',
  (SELECT ledger_code FROM receipts WHERE bank_transaction_id = (SELECT txn_id FROM lines WHERE name='council_tid')), '001');

-- 2. Tenant pays with NI, one live tenancy -> auto
SELECT pg_temp.check('NI auto-matched', pg_temp.status('ni_one'), 'matched');
SELECT pg_temp.check('NI resolved',     pg_temp.resolved('ni_one'), 'T2002');
SELECT pg_temp.check('NI receipt ledger code MG',
  (SELECT ledger_code FROM receipts WHERE bank_transaction_id = (SELECT txn_id FROM lines WHERE name='ni_one')), '001B');

-- 2'. Tenant who moved: goes to the live tenancy, reason flags the old arrears
SELECT pg_temp.check('moved tenant -> new TID', pg_temp.resolved('ni_moved'), 'T2004');
SELECT pg_temp.check('old arrears flagged',
  (SELECT reason LIKE '%older tenancy T2003 owes 2700.00%' FROM match_suggestions
    WHERE bank_transaction_id = (SELECT txn_id FROM lines WHERE name='ni_moved')), true);

-- 3b. Landlord account covering 3 tenancies -> review; the 650 tenancy ranked first
SELECT pg_temp.check('landlord line needs review', pg_temp.status('landlord'), 'needs_review');
SELECT pg_temp.check('landlord: 3 suggestions',
  (SELECT count(*)::int FROM match_suggestions WHERE bank_transaction_id = (SELECT txn_id FROM lines WHERE name='landlord')), 3);
SELECT pg_temp.check('landlord: best guess is amount match',
  (SELECT t.tid FROM match_suggestions s JOIN tenancies t ON t.id = s.tenancy_id
    WHERE s.bank_transaction_id = (SELECT txn_id FROM lines WHERE name='landlord')
    ORDER BY s.confidence DESC LIMIT 1), 'T2006');

-- Ended tenancy, paid after end date via TID -> auto, 001C
SELECT pg_temp.check('ended overpayment matched', pg_temp.status('ended_overpay'), 'matched');
SELECT pg_temp.check('ended overpayment category',
  (SELECT category::text || '/' || ledger_code FROM receipts
    WHERE bank_transaction_id = (SELECT txn_id FROM lines WHERE name='ended_overpay')), 'ended_overpayment/001C');

-- Unknown account, unknown reference, no identifiers -> Yet to take
SELECT pg_temp.check('grandma first time: yet to take', pg_temp.status('grandma_1'), 'yet_to_take');
SELECT pg_temp.check('flat 9 first time: yet to take',  pg_temp.status('flat9_1'),   'yet_to_take');
SELECT pg_temp.check('cash deposit: yet to take',       pg_temp.status('nothing'),   'yet_to_take');
SELECT pg_temp.check('yet to take note',
  (SELECT note FROM bank_transactions WHERE id = (SELECT txn_id FROM lines WHERE name='nothing')), 'Yet to take');

-- 5. Fuzzy name + amount -> suggestion only
SELECT pg_temp.check('fuzzy needs review', pg_temp.status('fuzzy'), 'needs_review');
SELECT pg_temp.check('fuzzy capped at 0.6',
  (SELECT max(confidence) <= 0.6 FROM match_suggestions WHERE bank_transaction_id = (SELECT txn_id FROM lines WHERE name='fuzzy')), true);

-- Money out -> excluded
SELECT pg_temp.check('money out excluded', pg_temp.status('money_out'), 'excluded');

-- ---------------------------------------------------------------- staff actions + learning
-- Staff confirm the landlord line for T2006, and match grandma + flat 9 by hand with "remember".
SELECT confirm_match((SELECT txn_id FROM lines WHERE name='landlord'),
                     (SELECT id FROM tenancies WHERE tid='T2006'), 'tenant', 'payer_account');
SELECT confirm_match((SELECT txn_id FROM lines WHERE name='grandma_1'),
                     (SELECT id FROM tenancies WHERE tid='T2009'), 'tenant', 'manual', true);
SELECT confirm_match((SELECT txn_id FROM lines WHERE name='flat9_1'),
                     (SELECT id FROM tenancies WHERE tid='T2010'), 'tenant', 'manual', true);
SELECT pg_temp.check('landlord confirmed', pg_temp.status('landlord'), 'matched');
SELECT pg_temp.check('other suggestions rejected',
  (SELECT count(*)::int FROM match_suggestions WHERE bank_transaction_id = (SELECT txn_id FROM lines WHERE name='landlord') AND status='rejected'), 2);

-- Next month the same payers come back -> matched automatically.
INSERT INTO lines VALUES
  ('grandma_2', pg_temp.line('k11', '2026-09-07', 300, 'M SMITH', NULL, '112233', '87654321')),
  ('flat9_2',   pg_temp.line('k12', '2026-09-08', 520, 'FASTER PAYMENT', 'flat 9 rent'));
SELECT pg_temp.check('grandma learned -> auto', auto_match((SELECT txn_id FROM lines WHERE name='grandma_2'))::text, 'matched');
SELECT pg_temp.check('grandma resolved',        pg_temp.resolved('grandma_2'), 'T2009');
SELECT pg_temp.check('flat 9 learned -> auto',  auto_match((SELECT txn_id FROM lines WHERE name='flat9_2'))::text, 'matched');
SELECT pg_temp.check('flat 9 resolved',         pg_temp.resolved('flat9_2'), 'T2010');

-- Can't confirm more than the bank line holds
DO $$ BEGIN
  PERFORM confirm_match((SELECT txn_id FROM lines WHERE name='nothing'),
                        (SELECT id FROM tenancies WHERE tid='T2009'), 'tenant', 'manual', false, NULL, 76);
  RAISE EXCEPTION 'FAIL over-confirm was allowed';
EXCEPTION WHEN raise_exception THEN
  IF SQLERRM LIKE 'FAIL%' THEN RAISE; END IF;
  RAISE NOTICE 'ok  over-confirm blocked (%)', SQLERRM;
END $$;

-- ---------------------------------------------------------------- outputs
SELECT pg_temp.check('enriched: every matched line has a TID and tenant',
  (SELECT count(*)::int FROM v_bank_statement_enriched e JOIN lines l ON l.txn_id = e.bank_transaction_id
    WHERE e.status = 'matched' AND (e.tid IS NULL OR e.tenant_name IS NULL)), 0);
SELECT pg_temp.check('enriched: money out not listed',
  (SELECT count(*)::int FROM v_bank_statement_enriched e JOIN lines l ON l.txn_id = e.bank_transaction_id
    WHERE l.name = 'money_out'), 0);

INSERT INTO integration_settings (system, key, value) VALUES ('vico', 'sort_code', '00-00-00'), ('vico', 'account_number', '00000000');
SELECT pg_temp.check('vico: one row per receipt from these lines',
  (SELECT count(*)::int FROM v_vico_export v JOIN receipts r ON r.id = v.receipt_id
    JOIN lines l ON l.txn_id = r.bank_transaction_id), 9);
SELECT pg_temp.check('vico: constants filled',
  (SELECT bool_and(sort_code = '00-00-00' AND account_number = '00000000') FROM v_vico_export), true);
INSERT INTO external_refs (system, entity_type, entity_id, external_id, last_synced_at)
SELECT 'vico', 'receipt', r.id, 'vico-batch-1-' || row_number() OVER (), now()
  FROM receipts r JOIN lines l ON l.txn_id = r.bank_transaction_id WHERE l.name IN ('council_tid', 'ni_one');
SELECT pg_temp.check('vico: exported receipts drop off',
  (SELECT count(*)::int FROM v_vico_export v JOIN receipts r ON r.id = v.receipt_id
    JOIN lines l ON l.txn_id = r.bank_transaction_id), 7);

\echo '--- Filled-in bank statement (replaces the Google Sheet)'
SELECT e.date, e.amount, e.tid, e.tenant_name, e.status, e.resolved_via, e.payer_account, e.note
  FROM v_bank_statement_enriched e JOIN lines l ON l.txn_id = e.bank_transaction_id ORDER BY e.date, e.amount;
\echo 'ALL 002 MATCHING CHECKS PASSED'
