# recon-502 plan: formatted bank record intake (HARD)
Goal: accept the hand-formatted CSV `Date,TID,Payer Name,Amount,Type,Will deposit to,Description` (incoming only), reject the whole file with line numbers on any bad row, dedupe by SHA-256, and store batches and lines with `match_status='pending'`. Matching is recon-503.

## Files (all inside the contract scope)
Create: `db/migrations/013_agentos_intake.sql`, `server/src/domain/agentos/intake.ts` (pure parser plus types), `server/src/services/agentos/intake.service.ts`, `server/src/api/agentos/routes.ts`, `server/test/unit/agentos-intake.test.ts`, `server/test/int/agentos-intake.test.ts`, `server/test/fixtures/agentos/intake-{valid,outgoing,bad-rows,bad-header,empty}.csv`. Modify: `server/src/api/app.ts` (2 lines). Do NOT touch `server/src/domain/agentos/types.ts` (out of scope). Intake types live in `intake.ts`.

## Steps
1. `013_agentos_intake.sql`: `BEGIN;`/`COMMIT;` wrapped, header comment like 012.
   `agentos_intake_batches`: id uuid PK default gen_random_uuid(); file_name text NOT NULL; file_sha256 text NOT NULL UNIQUE CHECK (~ '^[0-9a-f]{64}$'); rows_total int NOT NULL CHECK (>0); amount_total_pence bigint NOT NULL CHECK (>0); period_from date NOT NULL; period_to date NOT NULL; CHECK (period_from <= period_to); uploaded_by uuid NOT NULL REFERENCES app_users(id); uploaded_at timestamptz NOT NULL DEFAULT now().
   `agentos_intake_lines`: id uuid PK; batch_id uuid NOT NULL REFERENCES agentos_intake_batches(id) ON DELETE CASCADE; line_no int NOT NULL CHECK (>=2); received_on date NOT NULL; tid_raw text NULL CHECK (tid_raw ~ '^\d{4}$'); payer_name text NOT NULL CHECK (length 1..200); amount_pence integer NOT NULL CHECK (amount_pence > 0); payment_type text NOT NULL; deposit_to text NOT NULL; description text NOT NULL DEFAULT ''; warnings text[] NOT NULL DEFAULT '{}'; match_status text NOT NULL DEFAULT 'pending' CHECK (IN 'pending','matched','name_mismatch','unmatched','deposit_mismatch'); agentos_tenant_id uuid NULL REFERENCES agentos_tenants(id) ON DELETE SET NULL; posting_status text NOT NULL DEFAULT 'not_ready' CHECK (IN 'not_ready','ready','exported','posted'); created_at/updated_at timestamptz NOT NULL DEFAULT now(); UNIQUE (batch_id, line_no).
   Indexes: lines(tid_raw), lines(match_status). `t_audit` audit_row() trigger on both tables (same as 012). Reason: SET NULL keeps agentos-seed's `DELETE FROM agentos_tenants` working.
2. `domain/agentos/intake.ts` exports:
   `INTAKE_HEADERS = ['Date','TID','Payer Name','Amount','Type','Will deposit to','Description'] as const`, `MAX_ROW_ERRORS = 200`, `MAX_ROWS = 5000`, `MAX_PENCE = 100_000_000`;
   `interface IntakeRowError { line: number; field: string; reason: string }`;
   `interface IntakeLineInput { lineNo; receivedOn /*YYYY-MM-DD*/; tid: string|null; payerName; amountPence: number; paymentType; depositTo; description; warnings: string[] }`;
   `type IntakeParseResult = { ok: true; lines: IntakeLineInput[] } | { ok: false; code: 'unreadable'|'bad_header'|'empty_file'|'too_many_rows'|'bad_rows'; message: string; rowErrors: IntakeRowError[]; errorCount: number }`;
   `parseUkDate(raw: string, today: string): {ok:true; iso:string}|{ok:false; reason:string}`; `parseAmountPence(raw: string): {ok:true; pence:number}|{ok:false; reason:string}`; `parseIntakeCsv(content: Buffer|string, today: string): IntakeParseResult`; `londonToday(now = new Date()): string` = `new Intl.DateTimeFormat('en-CA',{timeZone:'Europe/London'}).format(now)`.
3. `parseIntakeCsv`: csv-parse/sync `parse(content,{bom:true, relax_column_count:true, relax_quotes:true, skip_empty_lines:true, info:true})`. A thrown error gives code `unreadable` with one error `{line: err.lines ?? 0, field:'file', reason: err.message}`. Record 0 is the header: trimmed cells must equal INTAKE_HEADERS exactly (case, order, count 7). Otherwise `bad_header`, error `{line:1, field:'header', reason:'expected "Date,TID,Payer Name,Amount,Type,Will deposit to,Description"'}`. Skip data records whose cells are all blank after trim. lineNo = `info.lines`. 0 data rows gives `empty_file`; more than MAX_ROWS gives `too_many_rows`. Validate every row and collect all errors (count every one, keep the first 200). Any error gives `bad_rows`, message `` `${errorCount} row error(s); nothing was imported` ``.
4. Row rules (trim every cell; field = header name, or `row`):
   - row: exactly 7 cells, otherwise `expected 7 columns, got N` (skip the other checks for that row).
   - Date: `/^(\d{2})\/(\d{2})\/(\d{4})$/`, a real calendar day (check the Date.UTC round-trip), year >= 2000, iso <= today. Reasons: `must be dd/mm/yyyy`, `not a real date`, `before 2000`, `in the future`.
   - TID: blank is stored as null (503 makes it unmatched). Otherwise it must match `/^\d{4}$/`, else `must be 4 digits or blank`.
   - Payer Name: required, max 200. Will deposit to: required, max 200. Type: required, max 50. Description: optional, max 500 (`too long (max N)`).
   - Amount (`parseAmountPence`): if it starts with `-` or `(`, or ends with `)`, the reason is `outgoing payments are not accepted (incoming only)`. Strip one leading `£`. It must match `/^(\d{1,3}(,\d{3})+|\d+)(\.\d{1,2})?$/`, else `must look like 0.00`. Then remove commas and use integer string arithmetic (no floats): pence = whole*100 + frac padded to 2 digits. 0 gives `must be greater than 0.00 (incoming only)`; > MAX_PENCE gives `over 1,000,000.00`.
   - Warning (does not reject): Type !== `Cash` (exact) pushes `unverified_type`.
5. `services/agentos/intake.service.ts`: `importIntakeCsv(db: ActorDb, input: {fileName: string; content: Buffer; userId: string}, today = londonToday()): Promise<IntakeImportResult>` where `IntakeImportResult = {batchId; fileName; rowsTotal; amountTotalPence; periodFrom; periodTo; linesWithWarnings}`. Inside `db.tx(c => …)`, in this order:
   (a) sha256 hex of the bytes. If a batch with that hash exists, throw `AppError('conflict', 'This exact file was already uploaded (as "<name>" on <YYYY-MM-DD>)', {batchId})`.
   (b) Parse. If not ok, throw `AppError('bad_request', message, {reason: code, rowErrors, errorCount})`.
   (c) INSERT the batch (file_name sliced to 255, period = min/max receivedOn), then INSERT the lines with one multi-row INSERT per 500 lines.
   (d) Leave the comment `// recon-503: match lines here, inside this transaction`.
   Wrap the call so a 23505 with constraint `agentos_intake_batches_file_sha256_key` becomes the same 409 (copies ingest.service.ts:200-211).
   Also export `listIntakeBatches(pool: Pool, limit = 50)` (newest first, with uploader full_name) and `getIntakeBatch(pool: Pool, id: string): Promise<{batch; lines: IntakeLineDto[]}|null>`. Dates come via `to_char(...,'YYYY-MM-DD')`. Lines are ordered by line_no. IntakeLineDto = {id, lineNo, receivedOn, tid, payerName, amountPence, paymentType, depositTo, description, warnings, matchStatus, postingStatus}.
6. `api/agentos/routes.ts`: `export function agentosRouter({ pool }: { pool: Pool }): Router`. Copy multer (memory storage, 10 MB, field `file`, MulterError to 400) and `requireAuth/requireWriter` from `api/ingest/routes.ts:78-119`. Endpoints:
   - `POST /intake` (writers) returns 201 `{ batch: IntakeImportResult }`. No or empty file gives 400 `Choose a CSV file to upload`.
   - `GET /intake` (signed in) returns 200 `{ batches }`.
   - `GET /intake/:id` (signed in): a non-uuid or missing id gives 404 `not_found`. Otherwise 200 `{ batch, lines }`.
   Errors use the existing handler body `{error:{code,message,details}}`: 400 bad file, 409 duplicate, 401 not signed in, 403 readonly.
7. `api/app.ts`: add `import { agentosRouter } from './agentos/routes.js';` and, after the payer-accounts mount (line 139), `app.use('/api/agentos', agentosRouter({ pool }));`.

## Fixtures (`server/test/fixtures/agentos/`, synthetic, TIDs 9101-9112)
- `intake-valid.csv`: header plus 6 rows, with one blank line between rows 3 and 4. Amounts `873.22`, `1,045.00`, `£50.00`, `12.5`, `600`, `0.01`. One row has a blank TID, one has Type `BACS`, the rest `Cash`. Dates in 2026, none in the future.
- `intake-outgoing.csv`: 4 rows. Line 3 Amount `-120.00`, line 5 Amount `0.00`.
- `intake-bad-rows.csv`: line 2 `31/02/2026`, line 3 TID `91A1`, line 4 blank Payer Name, line 5 eight columns, line 6 Amount `12.345`.
- `intake-bad-header.csv`: `TID,Date,...` (order swapped). `intake-empty.csv`: header only.

## Tests
Unit `server/test/unit/agentos-intake.test.ts` (no DB): valid fixture gives 6 lines with pence [87322,104500,5000,1250,60000,1], a null TID and `unverified_type` on the BACS row, lineNo skips the blank line. BOM+CRLF copy of valid parses the same. Outgoing gives `bad_rows` with lines [3,5] and the incoming-only reasons. Bad-rows gives lines [2,3,4,5,6]. Bad header gives `bad_header` line 1. Empty gives `empty_file`. 5001 rows give `too_many_rows`. parseUkDate: `29/02/2024` ok, `29/02/2025` and `2026-01-01` fail, tomorrow is `in the future`. parseAmountPence: `(5.00)` outgoing, `1,000,000.01` over. 205 bad rows give errorCount 205 and rowErrors length 200.
Int `server/test/int/agentos-intake.test.ts` (copy signIn/post helpers from `ingest.test.ts:17-53`, email `<role>-aoi-<run>@example.test`; beforeAll and afterAll run `TRUNCATE agentos_intake_batches CASCADE` and delete `audit_log` rows for both tables): staff uploads valid and gets 201 with rowsTotal 6 and amountTotalPence 258073, and 6 DB rows all `pending`/`not_ready`. The same file again gives 409 with `details.batchId` equal to the first. Outgoing gives 400 with `details.reason='bad_rows'`, line numbers [3,5] and 0 batches/lines added. Bad header gives 400. Readonly gives 403. No cookie gives 401. No file gives 400. GET list includes the batch. GET `/intake/:id` returns 6 lines in order. GET `/intake/nope` gives 404.

## Edge cases
Byte-level dedupe: the same rows re-saved with CRLF/BOM count as a new file (accepted, documented). Duplicate rows inside one file are allowed (two real payments). Multi-line quoted Description: lineNo is the record's last physical line. Trailing all-blank rows are skipped.

## Risks and rollback
The contract's Exclusions list also names app.ts, api/agentos/routes.ts, services/agentos/intake*, server/test/** and migrations 0[1-9][0-9]_*, which conflicts with Scope. The coordinator resolves this before the coder starts. app.ts is a protected file, mounted under the 2026-10-02/05 precedent. Rollback: revert the commit and `DROP TABLE agentos_intake_lines, agentos_intake_batches`. No existing table references them.

## Out of scope
TID matching and status changes (503), export/posted (504), UI (505), configurable Type/deposit lists (decision 2026-10-06, deferred), Recon receipts/Xero/Vico.

## Verify
`npm run test:unit -- agentos-intake` and `npm run test:int -- agentos-intake` both exit 0 with every listed case green. Then lint, typecheck, db:test and full test:int (no regressions, especially agentos-seed and ingest).
