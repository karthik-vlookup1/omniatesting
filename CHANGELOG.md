# Changelog

## Phase 1

### recon-101

**What changed:** Built 4 complete reference data CRUD features (branches, bank accounts, landlords, properties) with list/search, create, and edit. Every write is audited with the signed-in user's email. Role-based access control on sensitive operations (branches and bank accounts require admin; properties and landlords require writer role or higher).

**Technical:**
- Migration 005 adds audit triggers to branches, bank_accounts, landlords, and properties tables
- New API routers: GET/POST for create, GET/PATCH for edit; bankAccountAdminRouter shadows ingest's POST before the ingest router
- Services: list() with ILIKE search and 200-row limit; create() and update() run in db.tx with ActorDb for audit trail
- Web: properties and landlords pages (readonly staff can view, writers can add/edit); branches and bank-accounts admin pages
- Tests: property.test.ts 18/18, property-edge.test.ts 51/51, full int 221/221, unit 83/83, e2e property 3/3
- Commit: b6c527d

### recon-103

**What changed:** Built complete rent terms feature: staff set rent schedules with cycles (weekly/fortnightly/monthly/quarterly), add benefits (HB/UC/DHP) with landlord or council direct payment, define manual payer splits, and set payment methods. Charges are generated per period per payer and displayed in a per-payer running statement. Xero remains the ledger of record.

**Technical:**
- Migration 006 adds charges_from opt-in column on tenancies, rent_charge_dirty table for change tracking, and 3-arg generate_rent_charges(tenancy, until_date, from_date) overload
- Services: rent.service (setRent, getRentAccount), benefit.service (addAward, endAward), payer-split.service, payment-method.service
- Nightly charge generation job at 05:00 (after Veco sync) via scheduleChargeGeneration
- Rent account view: periods grouped by payer, running statements per payer with receipts and balance
- Money utilities: toPence (string-safe), convertPence (half-up rounding per frequency), formatPence via Intl
- Tests: rent-terms int 22/22, unit money 6/6, full int 243/243, e2e rent 2/2
- Commit: 33c6dc1

### recon-104

**What changed:** Staff can record known payer bank accounts (tenant, relative, or landlord) against a tenancy or landlord so the payment matcher recognizes their deposits. Only the last 4 digits are shown in the UI, and full sort codes are never stored—all accounts are hashed identically to the ingest pipeline for matching.

**Technical:**
- Migration 007 adds holder_type 'relative', landlord-link unique index, trigger that always nulls payer_bank_accounts.sort_code (clears existing values)
- Endpoints: GET/POST /api/payer-accounts (writers); PATCH /:id to reactivate (409 on duplicate, 200 on reactivate)
- Hash = secure_hash(sort digits + account digits), identical to ingest
- Page /payer-accounts with list/add/reactivate UI
- Tests: payer-account 20/20 (11 base + 9 senior-tester), full int 263/263, unit 89/89, db:test 2/2
- Commit: 240a191

### recon-105

**What changed:** Staff can import LetMC data: choose record type (landlords, properties, tenants, tenancies + opening balances), upload CSV, see a preview with counts (create/update/unchanged/duplicate/rejected), see and download an error report of bad rows, and commit only when nothing is rejected. Commits are all-or-nothing; re-uploading the same file adds nothing. Existing Veco data is never overwritten (blanks filled, conflicts warned). Opening balances at a cutover date: arrears become opening_balance charges, credits become negative adjustments, in exact pence.

**Technical:**
- Migration 008 adds letmc_import_runs, letmc_opening_balances tables, and adjustment_kind 'opening_balance'
- Server job: /jobs/letmc-import/{layout,parse,apply,index}.ts with synthetic layout supporting header aliases
- Endpoints: POST /api/imports/letmc with preview/commit, file checksum + advisory lock prevents re-run
- Fixtures: synthetic LetMC layout with header aliases documented in fixtures/letmc/README
- Tests: letmc-import 12/12, edge 17/17, full int 292/292 (18 files), unit 96/96, web 2/2, e2e 4/4, db:test 2/2
- Commit: this commit

---

**Open:** ISSUE-0005 tracks removing full sort codes from bank_transactions table for consistency.
