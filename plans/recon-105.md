# Plan recon-105: LetMC import (landlords, properties, tenants, tenancies + opening balances), dry-run preview, all-or-nothing commit

## Goal
Page /letmc-import: pick a record type, upload one LetMC CSV, see per-row create/update/unchanged/duplicate/reject plus an error report (row, field,
reason, downloadable), then commit atomically. Re-committing a file changes nothing. Opening arrears -> rent_charges source 'opening_balance'; credits -> negative adjustments.

## Files
Create: db/migrations/008_letmc_import.sql; server/src/jobs/letmc-import/{layout.ts,parse.ts,apply.ts,index.ts}; server/src/api/imports/letmc.routes.ts;
web/src/features/letmc-import/{api.ts,LetmcImportPage.tsx,CsvFilePicker.tsx,errorReport.ts}; fixtures/letmc/{README.md,landlords.csv,landlords-clean.csv,
properties.csv,properties-clean.csv,tenants.csv,tenants-clean.csv,tenancies.csv,tenancies-clean.csv}; server/test/int/letmc-import.test.ts; e2e/letmc-import.spec.ts.
Modify: server/src/api/app.ts; web/src/app/routes.tsx; web/src/app/navigation.ts. Reuse without editing: csv-parse + multer (already deps), normaliseHeader
(domain/ingest/profiles), parseMoney/parseDate (domain/ingest/parse), protectNi/isValidNi (lib/crypto). No new packages. Never edit veco-sync, ingest, rent.

## Precedence (Veco vs LetMC) - fixed, put in index.ts doc comment
Veco owns active tenancies, their property/unit/start/status/lead tenant/rent, and properties' branch/address_line1/postcode/management type.
LetMC import NEVER overwrites a non-empty Recon value: on an existing record it only fills empty fields (action 'update', changes = filled fields);
a differing non-empty value is kept and reported as a warning. Unknown TID with no End Date (or End Date >= today) is REJECTED ("Active tenancy not in
Recon; Veco owns active tenancies - run the Veco sync first"), so imports never create active tenancies the nightly sync would end (or trip its 20% guard).
Unknown TID with a past End Date is created status 'ended'. Assumption: LetMC Property Ref = Veco property_ref (base portfolio ref); LetMC tenants keyed
'letmc:<ref>' (own namespace) and linked to an existing tenant when the NI hash matches.

## Steps
1. 008 (BEGIN/COMMIT): `ALTER TYPE adjustment_kind ADD VALUE IF NOT EXISTS 'opening_balance';` (not used inside 008). Table `letmc_import_runs` (id uuid PK,
   entity_type text CHECK IN ('landlords','properties','tenants','tenancies'), file_name, file_sha256 text NOT NULL (not unique), cutover_date date,
   counts jsonb NOT NULL, created_by uuid REFERENCES app_users, created_at; CHECK ((entity_type='tenancies') = (cutover_date IS NOT NULL))).
   Table `letmc_opening_balances` (id uuid PK, tenancy_id uuid NOT NULL REFERENCES tenancies ON DELETE CASCADE, payer payer_type NOT NULL, cutover_date date
   NOT NULL, amount_pence bigint NOT NULL CHECK (<> 0), rent_charge_id uuid REFERENCES rent_charges, adjustment_id uuid REFERENCES adjustments,
   import_run_id uuid NOT NULL REFERENCES letmc_import_runs, UNIQUE (tenancy_id, payer), CHECK ((rent_charge_id IS NULL) <> (adjustment_id IS NULL))).
   `t_audit` triggers (audit_row) on both tables, as in 005.
2. layout.ts: `ENTITY_TYPES`; `LAYOUTS: Record<EntityType, FieldSpec[]>` where FieldSpec = {field, label, aliases[], required:'always'|'create'|false}.
   landlords: landlord_ref 'Landlord Ref'(always) [LandlordID, Landlord Code], name 'Landlord Name'(always) [Name], email 'Email', phone 'Phone' [Telephone, Mobile].
   properties: property_ref 'Property Ref'(always) [Property ID, PropertyID], branch 'Branch'(create) [Branch Code, Office], landlord_ref 'Landlord Ref',
   address_line1 'Address 1'(create) [Address Line 1], address_line2 'Address 2', town 'Town' [City], postcode 'Postcode'(create) [Post Code],
   bedrooms 'Bedrooms', management_type 'Management Type' [Mgmt Type].
   tenants: tenant_ref 'Tenant Ref'(always) [Tenant ID, TenantID], title 'Title', first_name 'First Name'(always) [Forename], last_name 'Surname'(always)
   [Last Name], email 'Email', phone 'Mobile' [Phone, Telephone], ni 'NI Number' [National Insurance, NINO].
   tenancies: tid 'Tenancy Ref'(always) [TID, Tenancy ID], property_ref 'Property Ref'(create), unit_ref 'Unit Ref' [Room], tenant_ref 'Tenant Ref'(create),
   management_type 'Management Type', start_date 'Start Date'(create), end_date 'End Date', balance 'Balance' [Arrears, Opening Balance], balance_payer 'Balance Payer'.
   `resolveHeaders(headers, type)` matches normaliseHeader(label|alias) -> {columns, missing (required 'always' labels), unknown}. Real LetMC headers = add aliases here.
3. parse.ts `parseLetmcCsv(buf, type)`: csv-parse sync {bom, info:true, skip_empty_lines, relax_column_count, trim}; row line = info.lines (lesson);
   file errors -> AppError('bad_request'): unparseable, no data rows, > 5000 rows, missing columns ("Missing columns: Tenancy Ref, ..."). Per-row validators
   return {data, errors:[{field: label, reason}]}; reasons never echo NI/email values. Refs: trim, upper-case, `^[A-Z0-9/_-]{1,30}$`; TID `^T\d{3,6}$`;
   name/address <= 200; email simple regex; phone `^[0-9 +()-]{6,30}$`; postcode `^[A-Z]{1,2}\d[A-Z\d]? ?\d[A-Z]{2}$`i; bedrooms int 0-50; management RG|MG|IRG;
   dates ISO YYYY-MM-DD else parseDate(v,'DD/MM/YYYY'); end >= start; balance via parseMoney (pounds -> signed pence, '' = 0); balance_payer map
   tenant|''->tenant, hb|council_hb->council_hb, uc|dwp_uc->dwp_uc, other|other_third_party->other_third_party, else error.
   In-file duplicates by key: identical normalised values -> action 'duplicate' (skipped); different values -> reject "Same <key label> as row N with different values".
   Tenants: same valid NI on two refs in one file -> reject the later row (field 'NI Number').
4. apply.ts (one fn per type, `(client, rows, ctx)` -> RowResult[] {line, key, action:'create'|'update'|'unchanged'|'duplicate'|'reject', changes[],
   warnings[], errors[]}; preload existing rows into Maps first). landlords: key landlord_ref. properties: key property_ref; branch code must exist
   (no auto-create); landlord_ref must exist in DB; existing -> fill-blank address_line2, town, bedrooms, landlord_id, default_management_type only.
   tenants: resolve ref via external_refs(system 'letmc', entity_type 'tenant', external_id=ref); else NI hash held by a tenant -> action 'duplicate',
   warning "Same NI as existing tenant", link that tenant via external_refs (reject if it is already linked to another LetMC ref); else INSERT
   tenant_ref 'letmc:'||ref with protectNi(ni, keys) + external_refs. Existing -> fill-blank title/email/phone/NI (NI only if hash unused).
   tenancies: existing TID -> leave tenancy as is (warn if file property/tenant differ); new TID -> needs property, tenant (via external_refs), start, past
   end date; management_type default = property's default_management_type, none -> reject; unit_ref -> upsert property_units; INSERT status 'ended';
   tenancy_tenants(is_lead true, joined_on start, left_on end). Opening balance per row (ctx.cutover, d = cutover - 1 day):
   - charges_from NULL -> SET cutover (change 'rent account from <cutover>'); = cutover ok; other date -> reject if balance <> 0 ("Rent account already
     starts <date>") else warning.
   - letmc_opening_balances(tenancy,payer) exists: same amount+cutover -> unchanged; else reject "Opening balance already imported (<£x> at <date>)".
   - balance > 0: INSERT rent_charges(payer, period_start=period_end=due_date=d, amount=pence/100, source 'opening_balance', notes 'LetMC opening balance').
     balance < 0: INSERT adjustments(payer, kind 'opening_balance', amount, effective_on d, reason 'LetMC opening credit at <cutover>', approved_by userId).
     Then INSERT letmc_opening_balances. Every touched tenancy: `SELECT refresh_rent_charges(id)` (schedule charges from cutover; opening rows survive it).
   Money stays integer pence in TS; SQL writes `($n::bigint)::numeric/100`.
5. index.ts `runLetmcImport(db: ActorDb, keys, {entityType, fileName, content, cutoverDate?, dryRun, userId, previewSha256?})`: sha256 of content; commit with
   previewSha256 <> sha -> AppError('conflict','The file changed since the preview; preview it again'). Tenancies: cutover required, YYYY-MM-DD, <= today,
   >= 2000-01-01, and must equal cutover_date of any earlier committed tenancies run ("Cutover date already set to <d>") -> bad_request.
   Inside db.tx: `pg_advisory_xact_lock(hashtext('letmc-import'))`; INSERT run row; apply; build report {entityType, fileName, fileSha256, cutoverDate, dryRun,
   counts{rows,create,update,unchanged,duplicate,rejected}, rows (non-reject), errors[{line,key,field,reason}], openingBalances{charges{count,totalPence},
   credits{count,totalPence}}}. dryRun -> throw local DryRunRollback(report) (veco-sync pattern), caught outside -> return report. Commit with rejected > 0
   -> AppError('conflict', 'N rows were rejected; nothing was imported. Fix them and preview again') (tx rolls back). Else UPDATE run counts; return {runId, report}.
   `listRuns(pool)` last 50 runs.
6. letmc.routes.ts `letmcImportRouter({pool, keys})`: requireAuth; GET /layout (any role) -> {layouts}; GET /runs requireRole('accounts') -> {runs};
   POST /preview and POST /commit requireRole('accounts') with multer memory (10 MB, 1 file, same error mapping as ingest routes); fields Zod
   {entityType enum, cutoverDate?, previewSha256? (commit: required hex 64)}; preview 200 {report}; commit 201 {runId, report}.
7. app.ts: `app.use('/api/imports/letmc', letmcImportRouter({ pool, keys }));` placed BEFORE the `/api/imports` line (uses existing `keys` const).
8. web api.ts: fetchLayout, previewImport, commitImport (FormData, like data/imports/api.ts), useLetmcRuns (react-query key ['letmc-runs']).
   errorReport.ts: `toErrorCsv(errors)` -> 'Row,Key,Field,Reason' CSV (quote fields with , or "); download via Blob as `letmc-<type>-errors.csv`.
9. CsvFilePicker.tsx: copy of features/imports/StatementDropzone with label "LetMC CSV file", text "Drag a LetMC CSV here, or", testid "letmc-dropzone".
10. LetmcImportPage: Title "Import from LetMC"; note "Import in order: Landlords, Properties, Tenants, then Tenancies and opening balances. Recon never
   overwrites values it already has; Veco owns active tenancies." NativeSelect "Record type" (Landlords, Properties, Tenants, Tenancies and opening balances);
   TextInput type=date "Cutover date" only for tenancies; "Expected columns" table from /layout; buttons "Preview", "Commit import" (disabled unless a preview
   exists for the current file/type/cutover with 0 rejected). Summary values labelled Rows, Will create, Will update, Unchanged, Duplicates, Rejected, plus
   "Opening arrears" / "Opening credits" (count + formatted £). Tables aria-label "Rejected rows" (Row, Key, Field, Reason) with button "Download error
   report", and "Preview rows" (Row, Key, Action, Changes, Notes). After commit Alert "Import committed: X created, Y updated, Z unchanged" and table
   "Recent LetMC imports". Changing type/file/cutover clears the preview.
11. routes.tsx: `{ path: 'letmc-import', lazy: guarded('finance', async () => (await import('../features/letmc-import/LetmcImportPage')).LetmcImportPage) }`.
   navigation.ts: after CSV profiles `{ label: 'LetMC import', to: '/letmc-import', icon: IconFileImport, capability: 'finance' }`.
12. fixtures/letmc (synthetic; README documents layout, aliases, precedence, dates DD/MM/YYYY or ISO, Balance signed pounds). Mixed files = clean rows +
   one identical duplicate + bad rows: landlords L8001-3 (+L8002 dup; L8004 bad Email; blank Landlord Name); properties P8001(TSA,L8001), P8002(TSB,L8002),
   P9000 (Veco ref: Town 'Testville', Landlord L8003) (+ bad Branch NOPE, Postcode XYZ, Landlord Ref L9999); tenants LT8001-3 (NI AB200001C..), LT8004 with
   NI AB100001C (= Veco tenant 1) (+LT8001 dup; bad NI 'XX12'; blank Surname); tenancies T8001 (P8001, LT8001, IRG, 01/04/2024-31/03/2025, 120.50),
   T8002 (P8002, LT8002, ended, -45.00), T9001 (Veco, 300.00), T9002 (Veco, 0) (+ bad: T8003 no End Date, T8004 Property Ref P7777, T8005 Balance '1,23',
   T9003 Balance Payer 'landlord'). *-clean.csv = the clean rows only.

## Tests: server/test/int/letmc-import.test.ts (harness/signIn copied from payer-account.test; TRUNCATE incl. letmc tables; syncTenancies(vecoRows(3)))
1 landlords.csv preview -> counts {rows 6, create 3, duplicate 1, rejected 2}, error fields Email / Landlord Name with file line numbers; no L80xx rows, 0 runs.
2 commit landlords.csv -> 409, nothing written; commit clean -> 201 create 3; re-commit clean -> create 0, unchanged 3, still 3 landlords. 3 commit with wrong sha -> 409.
4 properties clean commit: P9000 action update, changes town+landlord, address_line1 unchanged; syncTenancies again -> town/landlord_id kept. Mixed preview: 3 rejects.
5 tenants clean commit: 3 created + LT8004 duplicate linked (external_refs -> Veco tenant 1); response JSON contains no 'AB2000'/'AB1000'; mixed: NI reject w/o value.
6 tenancies: missing cutover -> 400; future cutover -> 400; mixed preview -> 4 rejects with fields End Date, Property Ref, Balance, Balance Payer.
7 clean commit cutover 2026-04-01: T8001 ended + opening charge 120.50 due 2026-03-31; T8002 adjustment opening_balance -45.00; v_tenancy_balance 120.50 / -45.00;
  T9001 charges_from = cutover, opening charge 300.00, start/property unchanged, no schedule charge with period_end < cutover; T9002 charges_from set, no opening rows.
8 re-commit -> 0 new rent_charges/adjustments, 3 letmc_opening_balances. 9 T8001 balance changed -> reject 'Opening balance already imported'; other cutover -> 400.
10 syncTenancies again after 7 -> not refused, T8001 still ended, T9001 opening charge + charges_from kept. 11 readonly/staff 403, accounts 200, no CSRF 403,
  missing 'Tenancy Ref' header -> 400 naming it, 11 MB -> 400. 12 audit_log has letmc_opening_balances INSERT with changed_by = accounts e-mail.
e2e letmc-import.spec (seed admin + veco-seed 3; setInputFiles from fixtures): A Landlords + landlords.csv -> Preview -> "Rejected" 2, "Rejected rows" shows Email,
Commit disabled; B landlords-clean.csv -> Preview -> Commit -> "Import committed: 3 created"; C staff user has no "LetMC import" nav link.

## Edge cases
BOM, CRLF, blank lines, quoted commas, headers in any case/spacing; '(45.00)'/'£1,234.50'; zero balance; ended-before-cutover tenancy; Veco later
reactivates an ended LetMC TID (Veco wins, opening balance kept); NI already on another tenant; concurrent commits serialised by advisory lock.

## Risks / rollback
Enum value 'opening_balance' cannot be dropped: rollback = revert commit, DROP TABLE letmc_opening_balances, letmc_import_runs (and delete their rent_charges/
adjustments first); enum value stays harmless. Real LetMC headers unknown -> aliases in layout.ts. Contract "Exclusions" list repeats in-scope paths (app.ts,
routes.tsx, migrations): coordinator confirmed they are allowed; run `hx drift` before verify.

## Out of scope
Active tenancies not in Veco; rent schedules from LetMC; bulk undo of a run; editing veco-sync/ingest/rent code; branch creation; payer bank accounts.

## Verify
Kill 3001/5173; TEST_DATABASE_URL/E2E_DATABASE_URL on 5433; CI=1. `npm run test:int -- letmc` (12 passed = pass), `npm run test:e2e -- letmc` (3 passed),
then full test:int, test:unit, lint, typecheck, `npm run db:test` (OMNIA_DB_PORT=5433) still green.
