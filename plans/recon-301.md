# Plan recon-301: filled-in bank statement CSV download (replaces the Google Sheet)

## Goal
Page /export/statement lets admin/accounts/staff download every bank line for a bank (or all banks), date range and status set, filled in with its
outcome (TID, tenant, property, payer, receipts incl. splits and reversals, Xero/Vico state, notes). Read-only on business data; every download audited.

## Files
Create: db/migrations/010_statement_exports.sql; server/src/services/export/statement-csv.ts, statement.service.ts; server/src/api/export/statement.routes.ts;
web/src/features/export/{api.ts,StatementExportPage.tsx}; server/test/int/export-statement.test.ts. Modify: server/src/api/app.ts, web/src/app/routes.tsx, navigation.ts.
Reuse without editing: externalState (services/receipt/external-state.ts), useBankAccounts (web/src/data/imports/queries.ts), CSRF consts + buildUrl
(web/src/lib/api/client.ts). Never edit vico/receipt/matching code (copy vico's `cell` rule instead of importing; it is not exported). No new packages.

## Fixed rules (doc comment at top of statement.service.ts)
- Row grain: one CSV row per receipt (active AND reversed) on a line; a line with no receipts gets one row. Receipts ordered active first, then received_on, id.
  "Bank amount" and "Left on line" are filled on part 1 only (blank on later parts) so SUM(Bank amount) = statement total.
- Outcome = 'outgoing' when bt.amount < 0, else bt.status (new|needs_review|yet_to_take|partially_matched|matched|excluded). Status filter works on Outcome.
- Roles: router.use(requireAuth, requireWriter) = admin, accounts, staff; readonly 403 (bulk personal-data export + it writes an audit row). Web capability 'write'.
- Limits: from and to required, from <= to, span <= 366 days; MAX_ROWS = 50000 (exported const). Count first; over the cap -> 400 "This download has N rows
  (max 50000); narrow the dates or pick one bank". Build in memory, no streaming (lets row_count be audited and X-Statement-Rows set).
- Privacy: never select bt.payer_sort_code, payer_account_hash, extracted_ni_hash, raw_row, tenant NI. Payer account = '****'||payer_account_last4 only.

## Columns (stable order, exported const STATEMENT_HEADER; do not reorder - document in statement-csv.ts)
1 Bank (ba.code) 2 Account (ba.account_name) 3 Date (ISO YYYY-MM-DD) 4 Description 5 Reference 6 Counterparty 7 Payer account (****1234)
8 Bank amount (signed, 2dp, part 1 only) 9 Status (Outcome) 10 Exclusion reason 11 Matched via (bt.resolved_via) 12 TID in text (bt.extracted_tid)
13 Part ("1 of 3"; "1 of 1"; blank when no receipt) 14 TID 15 Tenant (lead tenant full_name) 16 Property (property_ref) 17 Branch (branches.code) 18 MG/RG
(tenancies.management_type) 19 Payer (receipts.payer) 20 Receipt amount (2dp) 21 Receipt status (active|reversed) 22 Reversed reason 23 Received on (ISO)
24 Xero (none|queued|sending|stuck|sent; blank when no receipt) 25 Vico (yes|no; blank when no receipt) 26 Left on line (amount - active receipts, part 1 only)
27 Note (bt.note and receipts.notes joined ' | ') 28 Line ID (bt.id). TID/Tenant/Property/Branch/MG-RG come from the receipt's tenancy, else bt.resolved_tenancy_id.

## Steps
1. 010 (BEGIN/COMMIT): `CREATE TABLE statement_exports (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), requested_by text NOT NULL, bank_account_id uuid,
   date_from date NOT NULL, date_to date NOT NULL, statuses text[] NOT NULL DEFAULT '{}', row_count int NOT NULL, created_at timestamptz NOT NULL DEFAULT now());`
   + `CREATE TRIGGER t_audit AFTER INSERT OR UPDATE OR DELETE ON statement_exports FOR EACH ROW EXECUTE FUNCTION audit_row();` No FK on bank_account_id
   (other suites TRUNCATE bank_accounts without CASCADE). Reason: audit_log.action only allows row actions; this table is the download log.
2. statement-csv.ts: `cell(v)` = vico.service.ts:131-134 rule verbatim; `pounds(pence: bigint)` -> '-12.50' (vico sumPounds formatting); `BOM = String.fromCharCode(0xfeff)`
   (lesson: never a literal BOM); `buildStatementCsv(rows: StatementRow[]): string` = BOM + header + rows, cells via `cell`, joined ',' lines '\r\n' + trailing '\r\n'.
3. statement.service.ts: Zod `StatementFilter` {bankAccountId?: uuid, from: ISO date, to: ISO date, status?: comma list of the 7 outcomes -> string[]} with the
   rules above ('bad_request'). Unknown bankAccountId -> AppError 'bad_request' "Unknown bank account". SQL (pool): lines = bank_transactions bt JOIN bank_accounts ba
   WHERE txn_date BETWEEN, optional bank, optional `(CASE WHEN bt.amount<0 THEN 'outgoing' ELSE bt.status::text END) = ANY($n)`; LEFT JOIN LATERAL receipts r
   (LEFT JOIN, never inner - lesson) with `row_number()/count(*) OVER (PARTITION BY bt.id)`; LEFT JOIN tenancies/properties/branches/tenancy_tenants(is_lead, left_on
   IS NULL)/tenants on coalesce(r.tenancy_id, bt.resolved_tenancy_id). Money read as `(x*100)::bigint`, dates via `to_char(..,'YYYY-MM-DD')` (no JS Date).
   ORDER BY ba.code, bt.txn_date, bt.created_at, bt.id, receipt order. Then `externalState(pool, receiptIds)` for cols 24-25.
   Export `countStatement(pool, f)` -> {lines, rows, byStatus: Record<outcome, number>} and `buildStatement(db, f, {maxRows=MAX_ROWS})` -> {csv, rows, fileName}:
   count, enforce cap, query, build, then in `db.tx` INSERT statement_exports (requested_by = current_setting('app.user_email'), filters, row_count).
   fileName = `statement_<bank code or 'all'>_<from>_<to>.csv` (code sanitised to [A-Za-z0-9_-]).
4. statement.routes.ts `statementExportRouter({pool})`: GET /statement/summary -> json countStatement; GET /statement.csv -> headers Content-Type
   'text/csv; charset=utf-8', Content-Disposition attachment filename, X-Statement-Rows, Access-Control-Expose-Headers; res.send(csv).
   app.ts: import + `app.use('/api/export', statementExportRouter({ pool }))` next to /api/vico.
5. web api.ts: `useStatementSummary(filter)` (react-query key ['statement-summary', filter], enabled when from/to set) via apiRequest; `downloadStatement(filter)`
   = copy of vico api.ts:67-95 fetch/blob/anchor pattern (CSRF header, filename regex), GET with buildUrl query.
6. StatementExportPage "Bank statement download": if !can(user,'write') show "You do not have access" Alert. Filters: Select "Bank account" (useBankAccounts,
   option "All banks"), two `<TextInput type="date">` "From"/"To" (default first of current month .. today; no DateInput in repo), MultiSelect "Status" (7 outcomes,
   empty = all). Shows "N bank lines, M rows" + per-status counts from summary; Button "Download CSV" disabled when 0 rows or rows > 50000 (shows the cap message).
7. routes.tsx `{ path: 'export/statement', lazy: guarded('write', async () => (await import('../features/export/StatementExportPage')).StatementExportPage) }`;
   navigation.ts after Vico export: `{ label: 'Statement download', to: '/export/statement', icon: IconFileSpreadsheet, capability: 'write' }`.

## Tests (server/test/int/export-statement.test.ts; harness/signIn/TRUNCATE copied from vico.test.ts + statement_exports; syncTenancies(vecoRows(6));
seed lines by direct INSERT import_batches + bank_transactions on two bank accounts; receipts via confirm_match / direct INSERT; external_refs rows for Xero/Vico)
1 BOM first char, header equals STATEMENT_HEADER, CRLF. 2 bank A + range: matched line 1 row; split line 2 active + 1 reversed -> parts "1 of 3".."3 of 3", bank amount only on
part 1, reversed row status 'reversed' + reason; needs_review/excluded(reason)/outgoing(-50.00) rows; bank B and out-of-range lines absent. 3 status=matched,outgoing filter.
4 description '=HYPERLINK("x")' -> cell starts "'=", comma/quote cell quoted; 123.45 and -50.00 money. 5 seeded payer_sort_code '401234' and NI-like raw_row never
appear; '****1234' does. 6 Xero 'sent' and Vico 'yes' from external_refs/sync_outbox. 7 unauth 401, readonly 403, staff 200. 8 missing from, from>to, 367-day span,
bad status, unknown bank -> 400. 9 buildStatement with maxRows 2 -> 400, no statement_exports row. 10 download writes statement_exports (row_count, requested_by)
and audit_log table_name 'statement_exports' changed_by = staff e-mail. 11 summary counts equal the CSV rows.

## Edge cases
Line with receipts whose tenancy ended -> still shown; zero-amount line -> its status; receipt with NULL bank line not in the statement (bank lines only);
lead tenant missing -> blank; descriptions with newlines quoted; empty result -> BOM + header only, still audited.

## Risks / rollback
50k-row in-memory build (~20 MB) acceptable; cap revisited if real volumes exceed it. externalState on many ids: one ANY($1) query - coder confirms, else chunk 5000.
Rollback: drop route/nav lines, `DROP TABLE statement_exports`. Contract Exclusions repeat in-scope paths (app.ts, routes.tsx, migrations, test dirs): allowed.

## Out of scope
Matching Google Sheet column names exactly (layout above is a default pending Accounts' sheet); XLSX; scheduled/emailed exports; changing permissions.ts; editing vico.

## Verify
TEST_DATABASE_URL on 5433. `npm run test:int -- export-statement` -> 1 file, all 11 tests pass = pass; then full test:int, test:unit, lint, typecheck, db:test (OMNIA_DB_PORT=5433).
