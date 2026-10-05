# Progress Log

## 2026-10-05: recon-101 (HARD) — passing

**Files changed:** 3 modified (app.ts, routes.tsx, navigation.ts); 17 new files (migration 005_reference_data_audit.sql, 4 API routers, 4 services, 2 property test files, 4 web feature sets).

**What changed:** Built 4 complete reference data CRUD features (branches, bank accounts, landlords, properties) with list/search/create/edit, role-based access control, and full audit logging. Migration 005 adds audit triggers on all four tables. Bank account admin router mounted before ingest to shadow only POST /. Tested: property.test.ts 18/18, property-edge.test.ts 51/51 (added by senior-tester), full integration 221/221, unit 83/83, e2e property 3/3, db:test 2/2, lint and typecheck clean.

**Next:** recon-103 rent terms

## 2026-10-05: recon-103 (HARD) — passing

**Files changed:** 3 modified (app.ts, routes.tsx, navigation.ts); 18 new files (migration 006_rent_terms.sql, 5 services {rent.ts/money.ts, benefit.ts, payer-split.ts, payment-method.ts}, 1 API router, 1 charge generation job, 7 web components, 3 test files).

**What changed:** Built complete rent terms feature with rent schedules, benefit awards (HB/UC/DHP), payer splits, payment methods, and nightly charge generation. Migration 006 adds charges_from opt-in column, rent_charge_dirty table, 3-arg generate_rent_charges, and dirty-tracking triggers. Rent account view shows periods/balances per payer with running statements. Tested: rent-terms int 22/22 (11 base + 11 tester-added), unit 89/89 (6 money), full int 243/243, e2e 2/2, db:test 2/2, lint/typecheck clean. Key decision: rent account expected-vs-received only (Xero remains ledger). Nightly job 05:00 after Veco sync. Open: Veco frequency change impact on splits (ISSUE-0004).

**Next:** recon-104 known payer accounts
