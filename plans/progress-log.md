# Progress Log

## 2026-10-05: recon-101 (HARD) — passing

**Files changed:** 3 modified (app.ts, routes.tsx, navigation.ts); 17 new files (migration 005_reference_data_audit.sql, 4 API routers, 4 services, 2 property test files, 4 web feature sets).

**What changed:** Built 4 complete reference data CRUD features (branches, bank accounts, landlords, properties) with list/search/create/edit, role-based access control, and full audit logging. Migration 005 adds audit triggers on all four tables. Bank account admin router mounted before ingest to shadow only POST /. Tested: property.test.ts 18/18, property-edge.test.ts 51/51 (added by senior-tester), full integration 221/221, unit 83/83, e2e property 3/3, db:test 2/2, lint and typecheck clean.

**Next:** recon-103 rent terms

## 2026-10-05: recon-103 (HARD) — passing

**Files changed:** 3 modified (app.ts, routes.tsx, navigation.ts); 18 new files (migration 006_rent_terms.sql, 5 services {rent.ts/money.ts, benefit.ts, payer-split.ts, payment-method.ts}, 1 API router, 1 charge generation job, 7 web components, 3 test files).

**What changed:** Built complete rent terms feature with rent schedules, benefit awards (HB/UC/DHP), payer splits, payment methods, and nightly charge generation. Migration 006 adds charges_from opt-in column, rent_charge_dirty table, 3-arg generate_rent_charges, and dirty-tracking triggers. Rent account view shows periods/balances per payer with running statements. Tested: rent-terms int 22/22 (11 base + 11 tester-added), unit 89/89 (6 money), full int 243/243, e2e 2/2, db:test 2/2, lint/typecheck clean. Key decision: rent account expected-vs-received only (Xero remains ledger). Nightly job 05:00 after Veco sync. Open: Veco frequency change impact on splits (ISSUE-0004).

**Next:** recon-104 known payer accounts

## 2026-10-05: recon-104 (HARD) — passing

**Files changed:** 3 modified (app.ts, routes.tsx, navigation.ts); 9 new files (migration 007_payer_accounts.sql, 2 API/service routers, 1 web feature set, 3 test files).

**What changed:** Built payer account feature: staff record known bank accounts (tenant, relative, or landlord) against tenancies and landlords for payment matching. Sort codes are hashed using secure_hash (identical to ingest) and full sort codes are never stored; UI shows last 4 digits only. Trigger always nulls sort_code column. Writers can POST new accounts, PATCH to reactivate on duplicate (409), and GET the list. Tested: payer-account 20/20 (11 base + 9 senior-tester), full int 263/263, unit 89/89, db:test 2/2, lint/typecheck clean. Follow-up: ISSUE-0005 (bank_transactions still stores full sort codes).

**Next:** recon-105 LetMC import + master-record CSV upload

## 2026-10-05: recon-105 (HARD) — passing

**Files changed:** 3 modified (app.ts, routes.tsx, navigation.ts); 18 new files (migration 008_letmc_import.sql, 4 job files {layout,parse,apply,index}.ts, 2 API/service files, 7 web feature files, 3 test files, fixtures/letmc with README).

**What changed:** Built LetMC import feature with CSV upload, preview (create/update/unchanged/duplicate/rejected counts), error report download, all-or-nothing commit. Synthetic layout with header aliases supports landlords, properties, tenants, tenancies + opening balances. Opening balances at cutover: arrears → opening_balance charges, credits → negative adjustments in exact pence. Existing Veco data never overwritten (blanks filled, conflicts warned). Migration 008 adds letmc_import_runs, letmc_opening_balances, adjustment_kind 'opening_balance'. File checksum + advisory lock prevent re-run. Tested: letmc-import 12/12 + edge 17/17, full int 292/292, unit 96/96, web 2/2, e2e 4/4, db:test 2/2, lint/typecheck clean. Follow-up: ISSUE-0006 (test:web flaky).

**Next:** recon-204 receipt operations

## 2026-10-05: recon-204 (HARD) — passing

**Files changed:** 3 modified (app.ts, routes.tsx, navigation.ts); 21 new files (migration 009_receipt_operations.sql, 3 domain models, 3 services, 3 API routers, 1 web feature set, 5 test files, 2 function files).

**What changed:** Built receipt operations feature: staff split bulk council payments across tenancies, upload remittance CSV with preview and error reporting (total validated against bank line), allocate manually or automatically, reverse receipts (blocked if sent to Xero/Vico without manual correction), and record write-offs/refunds. Migration 009 adds allocation_mode, reversed_by/at, external_correction on receipts; reverses_adjustment_id on adjustments; superseded_at on remittance_advices. DB functions: recompute_line_status, allocate_oldest_first (skips manual receipts), refresh_rent_charges (pins capped at outstanding). Tested: receipt int 29/29 (8 coder + 21 senior-tester), full int 321/321 (20 files), unit 96/96, e2e 3/3, db:test 2/2, lint/typecheck clean. Overrides and adjustments stay inside Recon (Xero remains ledger).

**Next:** recon-301 bank statement CSV download
