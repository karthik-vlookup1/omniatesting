# Plan recon-401: Dashboard + tenant rent statement (CSV/PDF)

## Goal
New page /dashboard shows four things: today's imports per bank with the auto-match rate, the review backlog, balances per payer type and arrears ageing (rent accounts only).
On the same page, writers can download a rent statement for one tenancy and a date range, as CSV or PDF. Every download is logged.

## Files
Create: db/migrations/011_report_downloads.sql; server/src/services/reports/{dates.ts,dashboard.service.ts,statement.service.ts,statement-csv.ts,statement-pdf.ts};
server/src/api/reports/routes.ts; web/src/features/dashboard/{api.ts,DashboardPage.tsx,StatementCard.tsx}; server/test/int/{reports-dashboard.test.ts,reports-statement.test.ts};
e2e/dashboard.spec.ts. Modify: server/src/api/app.ts, web/src/app/routes.tsx, web/src/app/navigation.ts, server/package.json + package-lock.json (`npm install pdfkit -w server`,
`npm install -D @types/pdfkit -w server`). Reuse without editing: `pounds`, `BOM` (services/export/statement-csv.ts); copy its private `cell` rule verbatim; requireAuth/requireWriter
(api/auth/middleware.ts); the fetch/blob/anchor download pattern from web/src/features/export/api.ts:45-70. Do NOT change HomePage, v_tenancy_balance, v_arrears_aging, or rent/receipt code.

## Fixed rules (doc comment at top of dashboard.service.ts / statement.service.ts)
- Day D: `?date=YYYY-MM-DD`. The default is today in Europe/London, from SQL `(now() AT TIME ZONE 'Europe/London')::date`. D later than today gives 400. Upload day = `(ib.uploaded_at AT TIME ZONE 'Europe/London')::date`.
- Rent accounts: only tenancies with `charges_from IS NOT NULL` (ended ones are included). Balance(t,payer,D) = charges with due_date<=D, plus adjustments with effective_on<=D,
  minus active receipts with received_on<=D. This is the same rule as rent.service getRentAccount and v_tenancy_balance, with dates applied. Reversed receipts never count.
- Imports per bank: one row per bank account that is active OR had a batch on D, ordered by code. Batches counted: source 'bank_csv', status NOT IN ('failed','rolled_back'), upload day = D.
  files = distinct batches; lines = their bank_transactions; incoming = lines with amount>0; autoMatched = incoming lines with a receipt where `matched_by IS NULL AND matched_via <> 'manual'`
  (receipts made by auto_match, either status); ratePct = round(1000*auto/incoming)/10, or null when incoming = 0; lastUpload = London 'HH24:MI'. A total row adds the counts up.
- Review backlog is the current state, not tied to D. It counts lines with amount>0 per status: new, needs_review, partially_matched, yet_to_take. backlog = new + needs_review + partially_matched
  (yet_to_take is shown on its own). oldestDays = D - min(txn_date) of the backlog lines (null when there are none). Totals are also split per bank.
- Balances per payer type (the 4 payer_type values, always listed): accounts = (tenancy,payer) keys that have any event <= D; arrearsPence = sum of positive balances;
  creditPence = -(sum of negative balances); netPence = arrears - credit; plus a total row.
- Ageing works balance-forward, so its total equals arrears. For each key with balance B>0, the debits (charges by due_date, and positive adjustments by effective_on, both <= D)
  are walked newest first: `cum = sum(amt) OVER (PARTITION BY tenancy_id,payer ORDER BY d DESC, id DESC)`, `aged = least(amt, greatest(0, B-(cum-amt)))`.
  Buckets by D-d: 0-30, 31-60, 61-90, 91+. Each payer type also gets `accountsInArrears`. Allocations are ignored, because manual pins and write-offs would make the ageing disagree with the balance.
- Statement: by TID, `from`/`to` are required ISO dates, from<=to, to<=London today, span<=1827 days. Unknown TID gives 404 "Unknown TID X". A tenancy with no charges_from gives 409 "X has no rent account yet; set its rent first".
  Events per payer: charges with due_date<=to, signed +amt. The description is `Rent <period_start> to <period_end>`, or 'Opening balance from LetMC' when source is opening_balance.
  Adjustments, signed: `<kind with spaces>: <reason>` ('Opening credit from LetMC' when kind is opening_balance). Receipts of BOTH statuses: -amt on received_on, described 'Payment received'
  plus ` (<bank code> <txn_date>)` when the receipt has a bank line (LEFT JOIN, per lesson). A reversed receipt also gets a +amt event 'Payment reversed: <reversed_reason>' dated
  `coalesce((reversed_at AT TIME ZONE 'Europe/London')::date, received_on)`, but only when that date <= to. Sort order: date, then kind (charge 0, adjustment 1, receipt 2, reversal 3), then created_at, id.
  opening = sum of events before `from`; lines are the events from `from` to `to` with a running balance; closing = opening + the lines. Payer order is tenant, council_hb, dwp_uc, other_third_party,
  and a payer is listed only if it has an event <= to. When to = today, closing equals the Rent page balance.
- Roles: GET /dashboard is open to any signed-in user (aggregates only, no names). All statement routes use requireWriter (admin/accounts/staff), so readonly gets 403. This is the same rule as recon-301.
  Only the CSV and PDF downloads are logged (one report_downloads row each, audited by trigger). JSON preview calls are not logged.
- Privacy: no NI, no sort codes, no payer account numbers anywhere. The statement header shows TID, lead tenant full_name, property_ref and branch code.

## Steps
1. 011 (BEGIN/COMMIT): `CREATE TABLE report_downloads (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), report text NOT NULL CHECK (report IN ('tenant_statement')),
   format text NOT NULL CHECK (format IN ('csv','pdf')), tenancy_id uuid, tid text NOT NULL, date_from date NOT NULL, date_to date NOT NULL, row_count int NOT NULL,
   requested_by text NOT NULL, created_at timestamptz NOT NULL DEFAULT now());` plus a t_audit trigger, the same as 010. There is no FK on tenancy_id because other suites TRUNCATE tenancies.
2. dates.ts: `ISO_DATE` is a Zod regex+refine for a real calendar date. `londonToday(q): Promise<string>` uses to_char(...,'YYYY-MM-DD'). `resolveDay(q, date?)` returns D, or AppError 'bad_request' "Date cannot be in the future".
3. dashboard.service.ts: `getDashboard(q, date?)` returns `{date, imports:{banks[{bankAccountId,code,accountName,files,lines,incoming,autoMatched,ratePct,lastUpload}], total},
   backlog:{new,needsReview,partiallyMatched,yetToTake,backlog,oldestDays, banks[{code,...same}]}, balances[{payer,accounts,arrearsPence,creditPence,netPence}]+total,
   ageing[{payer,d0_30,d31_60,d61_90,d91Plus,totalPence,accountsInArrears}]+total}`. It runs 4 SQL queries in parallel. Pence is read as `(x*100)::bigint` and returned as Number. The balance CTE is an `ev`
   UNION ALL of charges, adjustments and active receipts (with id, d, amt, isDebit = charge OR adj>0) for accounts tenancies, filtered `d <= $1`.
4. statement.service.ts: `StatementQuery` (Zod .strict: from, to). `getTenantStatement(q, tid, query)` returns `{tenancy{id,tid,tenant,propertyRef,branch,chargesFrom}, from, to,
   generatedAt, payers[{payer, label, openingPence, chargesPence, paymentsPence, reversalsPence, adjustmentsPence, closingPence, lines[{date,type,description,debitPence|null,
   creditPence|null,balancePence}]}]}`. type is one of 'Rent charge'|'Adjustment'|'Payment'|'Reversal'. Labels: Tenant, Council (HB), DWP (UC), Other third party. The money logic is pure TS over the rows.
   `logDownload(db: ActorDb, s, format, rowCount)` runs in `db.tx`: INSERT report_downloads with requested_by = current_setting('app.user_email'), as recon-301 does.
5. statement-csv.ts: `TENANT_STATEMENT_HEADER = ['TID','Tenant','Property','Payer','Date','Type','Description','Debit','Credit','Balance']`. For each payer: an 'Opening balance' row
   (Date = from, Balance only), then the lines, then a 'Closing balance' row (Date = to). Amounts are `pounds(BigInt(p))`, with blank Debit/Credit where null. Output is BOM + CRLF with a trailing CRLF.
   `buildTenantStatementCsv(s): {csv, rows}` (rows = data rows). fileName = `rent_statement_<TID>_<from>_<to>.csv`, with the TID sanitised to [A-Za-z0-9_-].
6. statement-pdf.ts: `buildTenantStatementPdf(s, {compress = true} = {}): Promise<Buffer>` uses `import PDFDocument from 'pdfkit'` with A4, margin 40, Helvetica, and
   `info: {Title: 'Rent statement <TID> <from> to <to>', Author: 'Omnia Recon'}`. It prints a header block (TID, tenant, property, branch, period, generated). For each payer: a bold label, then a
   table Date | Description | Debit | Credit | Balance at fixed x positions, with Opening/Closing rows. Money is shown as '£1,234.56', and credit balances as '£12.00 CR'. A new page starts when y > page.height-60,
   and the column header repeats on it. Each page footer reads 'Generated <generatedAt> by Omnia Recon'. Chunks are collected from 'data' events and resolved on 'end'. rows = number of line rows.
7. routes.ts `reportsRouter({pool})`: `router.use(requireAuth)`. Routes: GET /dashboard -> getDashboard(pool, Zod {date?}). GET /statement/:tid (requireWriter) -> JSON.
   GET /statement/:tid/csv and /statement/:tid/pdf (requireWriter): build the file, call logDownload(req.db, ...), set Content-Type ('text/csv; charset=utf-8' | 'application/pdf'),
   Content-Disposition attachment with the fileName, X-Statement-Rows, and Access-Control-Expose-Headers. In app.ts, import it and add `app.use('/api/reports', reportsRouter({ pool }))` after /api/export.
8. Web api.ts: `useDashboard()` uses react-query key ['dashboard'] with refetchInterval 60000. `useTenantStatement(tid, from, to, enabled)` has key ['tenant-statement', tid, from, to].
   `downloadTenantStatement(tid, from, to, format)` is a copy of the export download pattern. `gbp(p)` = Intl.NumberFormat('en-GB',{style:'currency',currency:'GBP'}).format(p/100).
9. DashboardPage: title 'Dashboard', subtitle 'Figures for <D>'. It has 4 Cards with Title order 2: "Today's imports" (Bank, Files, Lines, Incoming, Auto-matched, Auto-match rate shown as
   `x.x%` or '—', Last upload; total row), "Review backlog" (counts + 'Oldest: N days' + Anchor to /review?status=needs_review), "Balances by payer" and "Arrears ageing" (tables, total row),
   then StatementCard. StatementCard "Tenant rent statement": if !can(user,'write') it shows the Text 'Statements can be downloaded by staff, accounts and admin users.' Otherwise it shows TextInput 'TID',
   `<TextInput type="date">` 'From' (default: the first day of the month 2 months back) and 'To' (default today), a "Show" button that fetches JSON and shows opening/closing per payer, and the buttons
   'Download CSV' and 'Download PDF'. Server errors show in a red Alert with the server message.
10. routes.tsx: `{ path: 'dashboard', lazy: async () => ({ Component: (await import('../features/dashboard/DashboardPage')).DashboardPage }) }`. navigation.ts, right after Home:
   `{ label: 'Dashboard', to: '/dashboard', icon: IconLayoutDashboard }`. The index route stays HomePage, because auth.spec asserts heading 'Home' and HomePage is outside scope.

## Tests
reports-dashboard (harness/signIn/TRUNCATE copied from export-statement.test plus report_downloads; syncTenancies(vecoRows(6)); direct INSERTs; D='2026-06-10'):
Bank A batches: (a) uploaded '2026-06-10 08:00+01' with lines +100 (receipt tid_in_reference, matched_by NULL), +50 (manual receipt, matched_by user), +70 needs_review txn 2026-06-01, -20;
(b) '2026-06-09 23:30+00' (00:30 London on 10 June, so it counts), line +40 auto; (c) '2026-06-10 23:30+00' (next London day, so it does not count); (d) rolled_back on D (does not count).
Expected for A: files 2, lines 5, incoming 4, auto 2, rate 50.0. Bank B (active, no batch): zeros, rate null. Backlog: plus B partially_matched txn 2026-05-01 and B yet_to_take
gives needs_review 1, partially 1, yetToTake 1, backlog 2, oldestDays 40. Rent: X (charges_from set) has tenant charges due 02-15/04-20/05-20 of £100 each, plus 06-20 (future, excluded),
an active receipt of £150 on 05-25 and a reversed receipt of £500. Council: a £200 charge on 01-10 and a write_off of -£50. Y has a tenant receipt of £80 and no charges. Z has charges_from NULL and a £999 charge.
Expected: tenant accounts 2, arrears 15000, credit 8000, net 7000. Tenant ageing: 0-30 = 10000, 31-60 = 5000, 91+ = 0. Council: 91+ = 15000. Z appears nowhere. No date: date equals the SQL London today.
date=2999-01-01 or 'x' gives 400. Unauth gets 401; readonly gets 200.
reports-statement (same seed): X from 2026-04-01 to 2026-06-10. Tenant: opening 10000. Lines: 04-20 +100 (bal 200), 05-01 Payment -500, 05-03 Reversal +500 ('Payment reversed: <reason>'),
05-20 +100, 05-25 -150. Closing 15000 equals the dashboard figure. Council opening 15000, no lines, closing 15000. An opening_balance-source charge shows 'Opening balance from LetMC'.
CSV: BOM, header = TENANT_STATEMENT_HEADER, CRLF, Opening/Closing rows; an adjustment reason '=1+1' becomes "'=1+1"; money '-150.00'. PDF: '%PDF-' start, '%%EOF' end,
the buffer includes the Title text. Each download writes one report_downloads row (format, row_count, requested_by = staff email) plus an audit_log row; JSON writes nothing.
Error cases: unknown TID 404, Z 409, from>to 400, to in future 400, a 1828-day span 400, readonly 403 on all 3 routes, unauth 401.
e2e/dashboard.spec (runTs create-user admin + readonly, veco-seed 4; signIn copied from receipts.spec):
A: admin uploads a 1-line CSV whose description holds a run id and 'T9001' (copy receipts.spec seedLine, keep the bank code). Under nav 'Dashboard' the heading is 'Dashboard', and the four card titles are visible.
The row for that bank contains '%'. B: page.request POST /api/rent/T9001/schedules {amountPence:50000, frequency:'monthly', effectiveFrom:'2026-09-01'} with the CSRF header (201 or 409 both OK).
The card is filled with TID T9001, From 2026-09-01. Download CSV: the file name matches /^rent_statement_T9001_2026-09-01_\d{4}-\d{2}-\d{2}\.csv$/ and the text has 'Opening balance' and 'T9001'.
Download PDF: the name ends .pdf and the bytes start '%PDF-'. TID T0000 shows the alert 'Unknown TID T0000'. C: readonly sees the Dashboard with the access text and no 'Download CSV' button.

## Edge cases
No rent accounts: 4 payer rows of zeros. A bank deactivated after uploading today still appears. A receipt with no bank line counts in balances but not in imports. A statement where `from` is before charges_from
starts with opening = 0. A tenancy where a payer has events only after `to` leaves that payer out. Negative adjustments count as credits and are never aged. A statement for an ended tenancy is still allowed.

## Risks / rollback
Balance-forward ageing differs from the 001 view v_arrears_aging (allocation-based), which is left unused. pdfkit is pure JS (fontkit, linebreak, etc.) with no native build, and it handles £ in WinAnsi.
Dashboard SQL scans active-backlog and day rows using the existing indexes. Rollback: remove the route, nav entry and app.ts mount, run `DROP TABLE report_downloads`, and `npm uninstall pdfkit @types/pdfkit -w server`.
The contract's Exclusions repeat in-scope paths (app.ts, routes.tsx, package files, migrations, tests); these are allowed, as in 301.

## Out of scope
Making /dashboard the home page; date picker on the dashboard; bulk/all-tenancy statements; emailing statements; Xero-side balances; charts; changing the Rent page balance.

## Verify
Set CI=1, TEST_DATABASE_URL/E2E_DATABASE_URL on 5433, and kill 3001/5173 first. `npm run test:int -- reports` must pass both files, about 18 tests. `npm run test:e2e -- dashboard` must report 3 passed. Then run the full test:int, test:unit,
lint, typecheck, test:e2e, and db:test with OMNIA_DB_PORT=5433. All must exit 0.
