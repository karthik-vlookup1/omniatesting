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
- Commit: c11dbd6

### recon-204

**What changed:** Staff can manage bulk council payments: split across multiple tenancies, upload the council's remittance CSV with preview and error reporting (total must match bank line), set allocations manually or reset to automatic, reverse a receipt, and record write-offs and refunds. Receipts sent to Xero or exported to Vico can only be reversed after staff record the manual correction there (Xero credit-note number / Vico note); in-flight sends are blocked. All overrides and adjustments stay inside Recon.

**Technical:**
- Migration 009 adds receipts table (allocation_mode, reversed_by/at, external_correction), adjustments (reverses_adjustment_id), remittance_advices (superseded_at + partial unique index)
- DB functions: recompute_line_status, allocate_oldest_first (skips manual receipts), refresh_rent_charges (re-applies manual pins capped at outstanding)
- APIs: POST/PATCH /api/receipts (split, allocations, reverse), POST /api/remittances (preview/commit), POST /api/adjustments
- Shared util: isCalendarDate
- Tests: receipt int 29/29 (8 coder + 21 senior-tester), full int 321/321 (20 files), unit 96/96, e2e receipts 3/3, db:test 2/2, lint/typecheck clean
- Commit: 96b0d19

### recon-301

**What changed:** Admin, accounts, and staff can download a filled-in bank statement CSV to replace the Google Sheet. Downloads are filtered by bank, date range (maximum 366 days), and status. Each bank line shows its matched outcome (tenancy, tenant, or property), payer (masked as ****last4), receipt parts, reversals, Xero/Vico state, and notes. The Bank amount column sums correctly to the statement total. Files open cleanly in Excel with formula escaping enabled to prevent code injection; full account numbers, sort codes, and NI are never exposed. Every download is logged for audit.

**Technical:**
- Endpoints: GET /api/export/statement/summary and /api/export/statement.csv (both require writer role)
- 28 fixed columns from STATEMENT_HEADER constant (default until Accounts share revised sheet headers)
- UTF-8 BOM, CRLF line endings, formula escaping for safety; supports up to 50,000 rows per CSV
- Migration 010 adds statement_exports table with audit trigger
- Tests: export-statement int 20/20 (11 coder + 9 senior-tester), statement-csv unit 3/3, full int 341/341 (21 files), unit 99/99, db:test 2/2, lint/typecheck clean
- Commit: cef1e82

### recon-401

**What changed:** Dashboard page (/dashboard, all roles) shows today's imports per bank, auto-match rate, review backlog and its oldest item, balances per payer type, and arrears ageing (0–30/31–60/61–90/91+ days, always summing to total arrears), in UK time. Staff (admin, accounts, staff) can download tenant rent statements as CSV or PDF with opening balance, charges, payments incl. reversals, adjustments, running and closing balance per payer. All downloads are logged for audit. Home remains the landing page.

**Technical:**
- Endpoints: GET /api/reports/dashboard (JSON), /api/reports/statement/:tid (JSON/CSV/PDF)
- New services: dates (UK timezone utils), dashboard.service, statement.service, statement-csv, statement-pdf
- Migration 011 creates report_downloads table with audit trigger and downloaded_at timestamp
- pdfkit added to server package.json for PDF generation
- Tests: reports int 37/37 (22 coder + 15 senior-tester), dashboard e2e 3/3, full int 378/378 (24 files), unit 99/99, db:test 2/2, lint/typecheck clean
- Commit: this commit

---

**Open:** ISSUE-0005 tracks removing full sort codes from bank_transactions table for consistency.
