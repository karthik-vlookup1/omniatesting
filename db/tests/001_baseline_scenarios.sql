-- Worked scenarios for omnia_recon_schema.sql. Run on an empty database after the schema.
\set ON_ERROR_STOP 1
SET app.user_email = 'test@omnia';

INSERT INTO branches (code, name) VALUES ('BHM', 'Birmingham');
INSERT INTO bank_accounts (code, bank_name, account_name) VALUES ('HSBC','HSBC','Omnia Rent'), ('LLOYDS','Lloyds','Omnia Rent 2');
INSERT INTO properties (property_ref, branch_id, address_line1, postcode)
SELECT x.ref, b.id, x.addr, 'B1 1AA' FROM branches b,
 (VALUES ('P001','1 High St'),('P002','2 High St'),('P003','3 High St'),('P004','4 High St')) x(ref, addr);
INSERT INTO tenants (first_name, last_name) VALUES ('Suha','Khan'),('Amy','Jones'),('Ben','Smith'),('Carl','Brown');

INSERT INTO tenancies (tid, property_id, management_type, start_date, end_date, status)
SELECT x.tid, p.id, x.mt::management_type, x.sd::date, x.ed::date, x.st::tenancy_status
  FROM (VALUES ('T1001','P001','RG','2026-03-01',NULL,'active'),
               ('T1002','P002','MG','2026-06-01',NULL,'active'),
               ('T1003','P003','IRG','2026-06-01',NULL,'active'),
               ('T1004','P004','RG','2026-04-01','2026-06-15','ended')) x(tid, pref, mt, sd, ed, st)
  JOIN properties p ON p.property_ref = x.pref;
INSERT INTO tenancy_tenants (tenancy_id, tenant_id)
SELECT t.id, tn.id FROM tenancies t JOIN tenants tn ON
  (t.tid, tn.first_name) IN (('T1001','Suha'),('T1002','Amy'),('T1003','Ben'),('T1004','Carl'));

INSERT INTO rent_schedules (tenancy_id, amount, frequency, effective_from)
SELECT id, x.amt, 'monthly', start_date FROM tenancies t
  JOIN (VALUES ('T1001',500),('T1002',800),('T1003',800),('T1004',600)) x(tid, amt) USING (tid);

-- Scenario B: Amy works, UC pays half.
INSERT INTO payer_splits (tenancy_id, payer, share_percent, effective_from)
SELECT id, 'dwp_uc', 50, start_date FROM tenancies WHERE tid = 'T1002';
-- Scenario C: Ben's HB covers LHA of £650 per month, he pays the £150 shortfall.
INSERT INTO benefit_awards (tenant_id, tenancy_id, benefit, paying_body, claim_reference, lha_rate, lha_frequency,
                            award_amount, award_frequency, paid_to, effective_from)
SELECT tt.tenant_id, t.id, 'HB', 'Birmingham City Council', 'HB-778899', 650, 'monthly', 650, 'monthly', 'landlord_direct', t.start_date
  FROM tenancies t JOIN tenancy_tenants tt ON tt.tenancy_id = t.id WHERE tid = 'T1003';
INSERT INTO payer_splits (tenancy_id, payer, fixed_amount, benefit_award_id, effective_from)
SELECT t.id, 'council_hb', 650, ba.id, t.start_date FROM tenancies t JOIN benefit_awards ba ON ba.tenancy_id = t.id WHERE tid = 'T1003';
INSERT INTO payment_methods (tenancy_id, tenant_id, payer, method, expected_amount, expected_frequency, effective_from)
SELECT t.id, tt.tenant_id, 'tenant', 'standing_order', 150, 'monthly', t.start_date
  FROM tenancies t JOIN tenancy_tenants tt ON tt.tenancy_id = t.id WHERE tid = 'T1003';
INSERT INTO payment_methods (tenancy_id, payer, method, expected_amount, expected_frequency, effective_from)
SELECT t.id, 'council_hb', 'hb_direct', 650, 'monthly', t.start_date FROM tenancies t WHERE tid = 'T1003';

SELECT tid, generate_rent_charges(id, '2026-08-31') AS charges_created FROM tenancies ORDER BY tid;

\echo '--- B/C: charges split per payer (Jun)'
SELECT t.tid, rc.payer, rc.period_start, rc.period_end, rc.amount FROM rent_charges rc JOIN tenancies t ON t.id = rc.tenancy_id
 WHERE t.tid IN ('T1002','T1003') AND rc.period_start = '2026-06-01' ORDER BY 1,2;
\echo '--- E: ended tenancy, last period pro-rated'
SELECT rc.period_start, rc.period_end, rc.amount FROM rent_charges rc JOIN tenancies t ON t.id = rc.tenancy_id
 WHERE t.tid = 'T1004' ORDER BY 1;

-- Bank import
INSERT INTO import_batches (source, bank_account_id, file_name, file_sha256)
SELECT 'bank_csv', id, 'hsbc_2026.csv', 'abc123' FROM bank_accounts WHERE code = 'HSBC';
INSERT INTO bank_transactions (bank_account_id, import_batch_id, txn_date, amount, description, raw_row, dedupe_key)
SELECT ba.id, ib.id, x.d::date, x.amt, x.descr, '{}'::jsonb, x.k
  FROM bank_accounts ba, import_batches ib,
  (VALUES ('2026-03-02', 500, 'S KHAN T1001', 'k1'), ('2026-04-02', 500, 'S KHAN T1001', 'k2'),
          ('2026-05-02', 500, 'S KHAN T1001', 'k3'), ('2026-08-10', 2000, 'S KHAN T1001 ARREARS', 'k4'),
          ('2026-06-05', 1050, 'BIRMINGHAM CC HB/UC RUN', 'k5'),
          ('2026-06-02', 1600, 'C BROWN RENT', 'k6'), ('2026-07-01', 200, 'C BROWN', 'k7'),
          ('2026-06-03', -45.00, 'PLUMBER LTD', 'k8')) x(d, amt, descr, k)
 WHERE ba.code = 'HSBC';
UPDATE bank_transactions SET status = 'excluded', exclusion_reason = 'expense' WHERE amount < 0;

-- Scenario A: Suha. Mar/Apr/May paid on time, Jun+Jul missed, pays £2,000 in Aug.
INSERT INTO receipts (bank_transaction_id, tenancy_id, payer, amount, received_on, matched_via)
SELECT bt.id, t.id, 'tenant', bt.amount, bt.txn_date, 'tid_in_reference'
  FROM bank_transactions bt, tenancies t WHERE bt.description LIKE '%T1001%' AND t.tid = 'T1001';
SELECT allocate_oldest_first(id) AS leftover_credit FROM receipts ORDER BY received_on;

\echo '--- A: Suha rent periods after the £2,000 payment'
SELECT period_start, amount, paid, pay_state FROM v_charge_status cs JOIN tenancies t ON t.id = cs.tenancy_id
 WHERE t.tid = 'T1001' ORDER BY period_start;
\echo '--- A: September charge is generated, credit applies automatically'
SELECT generate_rent_charges(id, '2026-09-30') FROM tenancies WHERE tid = 'T1001';
SELECT reallocate_tenancy(id) FROM tenancies WHERE tid = 'T1001';
SELECT period_start, amount, paid, pay_state FROM v_charge_status cs JOIN tenancies t ON t.id = cs.tenancy_id
 WHERE t.tid = 'T1001' AND period_start >= '2026-08-01' ORDER BY period_start;

-- Scenario D: council bulk payment of £1,050 split into two receipts.
INSERT INTO receipts (bank_transaction_id, tenancy_id, payer, amount, received_on, matched_via)
SELECT bt.id, t.id, x.payer::payer_type, x.amt, bt.txn_date, 'remittance_line'
  FROM bank_transactions bt, tenancies t,
       (VALUES ('T1002','dwp_uc',400),('T1003','council_hb',650)) x(tid, payer, amt)
 WHERE bt.dedupe_key = 'k5' AND t.tid = x.tid;
UPDATE bank_transactions SET status = 'matched' WHERE dedupe_key = 'k5';
SELECT allocate_oldest_first(r.id) FROM receipts r JOIN bank_transactions bt ON bt.id = r.bank_transaction_id WHERE bt.dedupe_key = 'k5';

\echo '--- D: trying to receipt £1 more than the bank line (must fail)'
DO $$ BEGIN
  INSERT INTO receipts (bank_transaction_id, tenancy_id, payer, amount, received_on, matched_via)
  SELECT bt.id, t.id, 'tenant', 1, bt.txn_date, 'manual' FROM bank_transactions bt, tenancies t
   WHERE bt.dedupe_key = 'k5' AND t.tid = 'T1002';
  RAISE NOTICE 'NOT BLOCKED - BUG';
EXCEPTION WHEN others THEN RAISE NOTICE 'Blocked as expected: %', SQLERRM;
END $$;

-- Scenario E: Carl's tenancy ended 15 Jun. Owes 600+600+300 = 1500. Pays 1600, then 200 after ending.
INSERT INTO receipts (bank_transaction_id, tenancy_id, payer, amount, received_on, matched_via, category)
SELECT bt.id, t.id, 'tenant', bt.amount, bt.txn_date, 'name_fuzzy',
       CASE WHEN bt.txn_date > t.end_date THEN 'ended_overpayment' ELSE 'regular' END::receipt_category
  FROM bank_transactions bt, tenancies t WHERE bt.dedupe_key IN ('k6','k7') AND t.tid = 'T1004';
SELECT r.amount, allocate_oldest_first(r.id) AS leftover FROM receipts r JOIN tenancies t ON t.id = r.tenancy_id
 WHERE t.tid = 'T1004' ORDER BY r.received_on;

\echo '--- Balances (positive = arrears, negative = credit)'
SELECT tid, payer, charged_to_date, received, balance FROM v_tenancy_balance ORDER BY tid, payer;
\echo '--- Arrears ageing'
SELECT tid, payer, days_0_30, days_31_60, days_61_90, days_90_plus, total_arrears FROM v_arrears_aging ORDER BY tid, payer;
\echo '--- Xero rental income (replaces the Google Sheet)'
SELECT tid, bank, rent_amount, date, tenant_name, mg_rg_status, property_id, bd, end_op, uc_hb, branch, ledger_code
  FROM v_xero_rental_income ORDER BY date, tid;
\echo '--- Audit rows written'
SELECT table_name, count(*) FROM audit_log GROUP BY 1 ORDER BY 1;

-- ---------------------------------------------------------------- assertions (RAISE on failure)
DO $$
DECLARE v numeric; s text;
BEGIN
  SELECT balance INTO v FROM v_tenancy_balance WHERE tid = 'T1001' AND payer = 'tenant';
  IF v <> 0 THEN RAISE EXCEPTION 'FAIL A: Suha balance %, expected 0', v; END IF;
  SELECT string_agg(pay_state, ',' ORDER BY period_start) INTO s FROM v_charge_status cs
    JOIN tenancies t ON t.id = cs.tenancy_id WHERE t.tid = 'T1001';
  IF s <> 'paid,paid,paid,paid,paid,paid,paid' THEN RAISE EXCEPTION 'FAIL A: periods %', s; END IF;

  SELECT string_agg(payer || '=' || amount, ',' ORDER BY payer) INTO s FROM rent_charges rc
    JOIN tenancies t ON t.id = rc.tenancy_id WHERE t.tid = 'T1002' AND period_start = '2026-06-01';
  IF s <> 'tenant=400.00,dwp_uc=400.00' THEN RAISE EXCEPTION 'FAIL B: split %', s; END IF;

  SELECT string_agg(payer || '=' || amount, ',' ORDER BY payer) INTO s FROM rent_charges rc
    JOIN tenancies t ON t.id = rc.tenancy_id WHERE t.tid = 'T1003' AND period_start = '2026-06-01';
  IF s <> 'tenant=150.00,council_hb=650.00' THEN RAISE EXCEPTION 'FAIL C: LHA split %', s; END IF;

  SELECT amount INTO v FROM rent_charges rc JOIN tenancies t ON t.id = rc.tenancy_id
   WHERE t.tid = 'T1004' AND period_start = '2026-06-01';
  IF v <> 300 THEN RAISE EXCEPTION 'FAIL E: pro-rated June %, expected 300', v; END IF;
  SELECT balance INTO v FROM v_tenancy_balance WHERE tid = 'T1004' AND payer = 'tenant';
  IF v <> -300 THEN RAISE EXCEPTION 'FAIL E: Carl balance %, expected -300', v; END IF;
  SELECT string_agg(ledger_code, ',' ORDER BY received_on) INTO s FROM receipts r
    JOIN tenancies t ON t.id = r.tenancy_id WHERE t.tid = 'T1004';
  IF s <> '001,001C' THEN RAISE EXCEPTION 'FAIL E: ledger codes %', s; END IF;

  SELECT string_agg(DISTINCT t.tid || ':' || r.ledger_code, ',') INTO s FROM receipts r
    JOIN tenancies t ON t.id = r.tenancy_id WHERE t.tid IN ('T1002','T1003');
  IF s <> 'T1002:001B,T1003:001G' THEN RAISE EXCEPTION 'FAIL B/C: ledger codes %', s; END IF;
  RAISE NOTICE 'ALL 001 BASELINE CHECKS PASSED';
END $$;
