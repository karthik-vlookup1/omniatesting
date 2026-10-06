# recon-504 plan: Take a Payment CSV export, export-once, mark posted (HARD)
Goal: a writer exports one intake batch's eligible `matched` lines into an immutable Take a Payment CSV (BOM, CRLF, formula-safe). Each line is exported at most once (`not_ready|ready -> exported -> posted`), and staff then mark exported lines as posted.

## Files
Create: `db/migrations/014_agentos_exports.sql`, `server/src/services/agentos/export.service.ts`, `server/test/int/agentos-export.test.ts`, `server/test/fixtures/agentos/export-lines.csv`, `server/test/fixtures/agentos/take-payment.golden.csv`. Modify: `server/src/api/agentos/routes.ts`. Do NOT touch app.ts, match/intake services, or `services/export/statement-csv.ts`.

## Steps
1. `014_agentos_exports.sql` (`BEGIN;`/`COMMIT;` and a header comment like 013):
   `agentos_exports`: id uuid PK DEFAULT gen_random_uuid(); batch_id uuid NOT NULL REFERENCES agentos_intake_batches(id) ON DELETE CASCADE; rows_total int NOT NULL CHECK (rows_total >= 0); amount_total_pence bigint NOT NULL CHECK (amount_total_pence >= 0); csv text NOT NULL; created_by uuid NOT NULL REFERENCES app_users(id); created_at timestamptz NOT NULL DEFAULT now(). Index on (batch_id). Add a `t_audit` audit_row() trigger.
   `ALTER TABLE agentos_intake_lines ADD COLUMN export_id uuid REFERENCES agentos_exports(id), ADD COLUMN posted_at timestamptz, ADD COLUMN posted_by uuid REFERENCES app_users(id), ADD CONSTRAINT agentos_intake_lines_export_chk CHECK ((posting_status IN ('exported','posted')) = (export_id IS NOT NULL)), ADD CONSTRAINT agentos_intake_lines_posted_chk CHECK ((posting_status = 'posted') = (posted_at IS NOT NULL AND posted_by IS NOT NULL));` plus an index on (export_id). Reason: storing the CSV makes re-downloads byte-stable even if tenants change later. The CHECKs make an "exported" line without an export impossible.
2. `export.service.ts`. Import `BOM` and `pounds` from `../export/statement-csv.js` (import only). COPY the private `cell()` from statement-csv.ts:7-10 verbatim, because it is not exported (vico.service.ts precedent). Exports:
   ```ts
   export const TAKE_PAYMENT_HEADER = ['TID','Payment From','Will deposit to','Type','Amount','Description and Card Authorisation Code'] as const;
   export interface AgentosExportDto { id: string; batchId: string; rowsTotal: number; amountTotalPence: number; createdAt: string }
   export interface PostedLineDto { id: string; postingStatus: 'posted'; exportId: string; postedAt: string }
   export function paymentFrom(tid: string, forename: string, surname: string): string
   export function buildTakePaymentCsv(rows: string[][]): string   // BOM + [header,...rows].map(cells).join('\r\n') + '\r\n'
   export async function createAgentosExport(db: ActorDb, input: { batchId: string; userId: string }): Promise<AgentosExportDto>
   export async function getAgentosExportCsv(pool: Pool, id: string): Promise<{ csv: string; createdAt: string } | null>
   export async function markLinePosted(db: ActorDb, input: { lineId: string; userId: string }): Promise<PostedLineDto>
   ```
3. `paymentFrom`: if `forename.trimStart()` starts with `tid` followed by whitespace, drop that prefix. Return `` `${tid} ${rest} ${surname}` `` with `/\s+/g` collapsed to ' ' and trimmed. Row = [t.tid, paymentFrom(...), **t.deposit_to** (the tenant's canonical value, not the line's), l.payment_type (passed through), pounds(BigInt(l.amount_pence)), description]. description = `` `${l.description} | Recon ${l.id}` ``, or `` `Recon ${l.id}` `` when l.description is ''.
4. `createAgentosExport`, in `db.tx(c => ...)`: (a) `SELECT pg_advisory_xact_lock(hashtext('agentos-export'))`. (b) If the batch does not exist, throw `AppError('not_found','No such intake batch')`. (c) `SELECT l.id, l.payment_type, l.amount_pence, l.description, t.tid, t.forename, t.surname, t.deposit_to FROM agentos_intake_lines l JOIN agentos_tenants t ON t.id = l.agentos_tenant_id WHERE l.batch_id=$1 AND l.match_status='matched' AND l.posting_status IN ('not_ready','ready') ORDER BY l.line_no FOR UPDATE OF l`. (d) Build the csv and INSERT agentos_exports (rows_total, amount sum, csv, created_by) `RETURNING id, created_at`. (e) If there are any rows: `UPDATE agentos_intake_lines SET posting_status='exported', export_id=$1, updated_at=now() WHERE id = ANY($2::uuid[])`. Zero eligible lines still creates an export with a header-only CSV and returns rowsTotal 0.
5. `getAgentosExportCsv`: `SELECT csv, to_char(created_at,'YYYY-MM-DD') ... WHERE id=$1`, or null.
6. `markLinePosted`, in `db.tx`: `UPDATE agentos_intake_lines SET posting_status='posted', posted_at=now(), posted_by=$2, updated_at=now() WHERE id=$1 AND posting_status='exported' RETURNING id, export_id, posted_at`. With 0 rows: SELECT posting_status. Missing gives `not_found 'No such intake line'`. 'posted' gives `conflict 'This line is already marked posted'`. Anything else gives `conflict 'Only exported lines can be marked posted'`.
7. `routes.ts`: update the doc comment and add these (zod for ids and body):
   - `POST /exports` with requireWriter. Body `z.object({ batchId: z.uuid() })`, failing gives `bad_request 'batchId must be a uuid'`. Returns 201 `{ export: AgentosExportDto }` and logs `req.log.info({ agentosExport })`. Uses `req.db` and `req.user!.id`.
   - `GET /exports/:id.csv` (signed in). A non-uuid or missing id gives 404 `No such export`. Returns 200 with `Content-Type: text/csv; charset=utf-8`, `Content-Disposition: attachment; filename="agentos-take-payment-<created YYYY-MM-DD>-<id first 8>.csv"`, body `res.send(Buffer.from(csv,'utf8'))`.
   - `POST /lines/:id/posted` with requireWriter. A non-uuid id gives 404. Returns 200 `{ line: PostedLineDto }`.
   Errors use the existing `{error:{code,message,details}}`: 400, 401, 403, 404, 409.

## Fixtures (synthetic; tenants = existing `match-tenants.csv`)
`export-lines.csv` (intake header). Lines: 2 `01/09/2026,9201,Alex Testperson,100.00,Cash,Test Lettings - Client Account,Rent Sept` (matched). 3 `02/09/2026,9202,Mary Jo O'Testson,"1,045.00",BACS,Test Lettings - Client Account,"=HYPERLINK(""x""), ref 7"` (matched). 4 `03/09/2026,9201,Alex Testpersen,10.00,Cash,Test Lettings - Client Account,nm` (name_mismatch). 5 `04/09/2026,9203,Sam Sampleton,20.00,Cash,Test Lettings - Client Account,dm` (deposit_mismatch). 6 `05/09/2026,,Alex Testperson,5.00,Cash,Test Lettings - Client Account,blank` (unmatched). 7 `06/09/2026,9201,ALEX TESTPERSON,0.01,Cash,test lettings - client account,` (matched, empty description).
`take-payment.golden.csv` is these exact bytes: UTF-8 BOM (EF BB BF), CRLF after EVERY line including the last, and no other bytes. Write it with `node -e` using `'﻿'` and `'\r\n'`, never with an editor:
```
TID,Payment From,Will deposit to,Type,Amount,Description and Card Authorisation Code
9201,9201 Alex Testperson,Test Lettings - Client Account,Cash,100.00,Rent Sept | Recon 00000000-0000-4000-8000-000000000002
9202,9202 Mary Jo O'Testson,Test Lettings - Client Account,BACS,1045.00,"'=HYPERLINK(""x""), ref 7 | Recon 00000000-0000-4000-8000-000000000003"
9201,9201 Alex Testperson,Test Lettings - Client Account,Cash,0.01,Recon 00000000-0000-4000-8000-000000000007
```

## Tests: `server/test/int/agentos-export.test.ts` (supertest; helpers copied from agentos-match.test.ts; email `<role>-aoe-<run>@example.test`)
beforeAll and afterAll: `TRUNCATE agentos_intake_batches CASCADE`, `DELETE FROM agentos_tenants`, and delete audit_log rows for agentos_exports, agentos_intake_lines, agentos_intake_batches and agentos_tenants. beforeAll also seeds match-tenants.csv. After uploading, pin the ids: `UPDATE agentos_intake_lines SET id=$1 WHERE batch_id=$2 AND line_no=$3` for lines 2, 3 and 7 using `...000000000002/3/7`. Read CSV bytes with `.buffer(true).parse((res,cb)=>{const b:Buffer[]=[];res.on('data',(c)=>b.push(c));res.on('end',()=>cb(null,Buffer.concat(b)));})`.
- Upload gives matchCounts {matched 3, name_mismatch 1, deposit_mismatch 1, unmatched 1}.
- POST /exports as readonly gives 403. With no cookie, 401. `{batchId:'x'}` gives 400. An unknown uuid gives 404.
- Staff export gives 201 with rowsTotal 3 and amountTotalPence 114501. GET csv gives 200, `text/csv`, and `Buffer.equals(readFileSync(golden))` is true.
- DB: lines 2, 3 and 7 are `exported` with that export_id. Lines 4, 5 and 6 are `not_ready` with export_id null.
- A second export gives 201 with rowsTotal 0, and its CSV equals `BOM + header + '\r\n'`. An unknown or `nope` csv id gives 404.
- Mark posted on line 2 gives 200 `posted` and the DB has posted_at and posted_by set. Doing it again gives 409. Line 4 gives 409 and the row is unchanged. An unknown uuid or `nope` gives 404. Readonly gives 403.
- Concurrency: upload the fixture plus `\n` (a new hash), then run two exports with Promise.all. The rowsTotal values are {3, 0}.
- Pure: paymentFrom('9202','9202 Mary  Jo',"O'Testson") gives `9202 Mary Jo O'Testson`. paymentFrom('9201','Alex','Testperson') gives `9201 Alex Testperson`. buildTakePaymentCsv escapes `+44`, but `-5.00` stays as is.

## Edge cases
A matched line whose tenant was deleted (FK SET NULL) is excluded by the inner JOIN and stays unexported. Re-downloading returns the stored bytes. Re-matching after export (506) is not handled here.

## Risks, scope problems, rollback
SCOPE 1: The repo has no `.gitattributes`. With `core.autocrlf`, the golden CRLF bytes can be rewritten on checkout or CI. This needs root `.gitattributes` `server/test/fixtures/agentos/*.golden.csv -text` (outside scope, so the coordinator must approve). SCOPE 2: Exclusions also list routes.ts, server/test/**, plans/** and migrations 0[1-9][0-9]_* (the same conflict as 502/503). SCOPE 3: Reusing `cell()` would mean exporting it from the excluded statement-csv.ts, so this plan copies it instead. Risk: db:test may list the expected tables. Rollback: revert, then `ALTER TABLE agentos_intake_lines DROP COLUMN export_id, DROP COLUMN posted_at, DROP COLUMN posted_by; DROP TABLE agentos_exports;`.

## Out of scope
UI (505), journal export (506), un-export or un-post, the `ready` transition, list-exports endpoint, receipts/Xero/Vico.

## Verify
`npm run test:int -- agentos-export` exits 0 with every case above green (the golden byte-equal, second export 0 rows, posting guarded). Then lint, typecheck, test:unit, db:test and full test:int with no regressions (agentos-intake and agentos-match).
