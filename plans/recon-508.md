# recon-508 plan: synthetic 5 Aug 2026 agentOS demo + pipeline int test
Goal: a fully fake 5 Aug 2026 dataset (13 incoming + 1 outgoing, Apollo HSBC shape), a dev tenant seed script, and one int test driving upload -> match -> reassign -> export -> posted -> journal transfer.
HARD RULE: nothing from `omnia_test_Data/` is read, copied or paraphrased. Only the 13+1 shape is used. Every name, amount and reference below is invented.

## Files (all new except the doc)
- fixtures/agentos/demo-2026-08-05/tenants.csv, bank-formatted.csv, bank-with-outgoing.csv
- server/scripts/seed-agentos-demo.ts
- server/test/int/agentos-pipeline.test.ts
- docs/agentos/field-spec.md (append section 10)

## Steps
1. **tenants.csv**: use the recon-501 header exactly, then add two trailing columns: `TID,Tenant ID,CRM ID,Forename,Surname,Managed by,Residence,Tenancy,Is Head Tenant,Will deposit to,EMail,Mobile Phone`. `parseAgentosTenants` uses `columns:true` and only checks for missing columns, so the extras are allowed and are NOT stored, because `agentos_tenants` (migration 012) has no email or phone column. No migration (out of scope). Write 10 rows, TIDs 9301-9310, `Tenant ID` ten-9301..9310, `CRM ID` crm-9801..9810, Managed by `Demo Lettings`, Will deposit to `Demo Lettings - Client Account`, Is Head Tenant YES. Residence `"Room <n>, Flat 1, Demo House, Fake Street, London, ZZ9 9ZZ"`. Tenancy `Signed Periodic Tenancy (First Let) 01/0<n>/2026 - No End Date` (n=1..9; use 01/10/2025 for 9310). EMail `<first>.<surname>@example.test` (lowercase). Mobile `07700 900<3-digit n>` (Ofcom drama range). Forename/Surname pairs: 9301 Ava Demoford, 9302 Ben Samplewood, 9303 Cara Fakesmith, 9304 Dev Mockridge, 9305 Eli Testbourne, 9306 Fay Placeworth, 9307 Gus Dummond, 9308 Hal Exampleton, 9309 Ivy Fixturely, 9310 Jon Stubbings. Each Forename is written `"<TID> <First>"`.
2. **bank-formatted.csv**: header `Date,TID,Payer Name,Amount,Type,Will deposit to,Description`, UTF-8, no BOM, LF line endings. 13 rows, all dated `05/08/2026`, Type `Cash`, deposit `Demo Lettings - Client Account` unless stated otherwise. Description is `FPI DEMO REF 08<nn>` (nn = row 01..13).

| row | TID | Payer Name | Amount | expected |
|---|---|---|---|---|
| 1 | T9301 | Ava Demoford | 450.00 | matched |
| 2 | 9302 | Ben Samplewood | 512.50 | matched |
| 3 | T9303 | Cara Fakesmith | 395.00 | matched |
| 4 | 9304 | Dev Mockridge | 620.00 | matched |
| 5 | T9305 | Eli Testbourne | 480.00 | matched |
| 6 | 9306 | Fay Placeworth | 555.25 | matched |
| 7 | T9307 | Gus Dummond | 410.00 | matched |
| 8 | 9308 | Hal Exampleton | 700.00 | matched |
| 9 | T9309 | I Fixturely Ltd | 300.00 | name_mismatch |
| 10 | 9310 | Someone Else | 275.00 | name_mismatch |
| 11 | T9301 | Ava Demoford | 50.00, deposit `Other Lettings - Client Account` | deposit_mismatch |
| 12 | (blank) | Ivy Fixturely | 125.00 | unmatched (reassigned later) |
| 13 | T9399 | Zed Nobody | 90.00 | unmatched (unknown TID) |
   Expected counts: 8/2/1/2. Batch total is 496275 pence. Matched after the reassign: 9 lines, 424775 pence.
3. **bank-with-outgoing.csv**: the same header and the same 13 rows. Then add row 14: `05/08/2026,,Demo Supplies Ltd,-1200.00,Cash,Demo Lettings - Client Account,DD DEMO SUPPLIER 0814` (file line 15). Intake must reject the whole file with 400, because `parseAmountPence` refuses a leading `-`.
4. **server/scripts/seed-agentos-demo.ts**: a top-level async main. It uses `loadConfig()` (`../src/config/env.js`), `createPool({databaseUrl, hashKey, max:2}, createLogger({level:'info'}))`, `readFileSync(new URL('../../fixtures/agentos/demo-2026-08-05/tenants.csv', import.meta.url),'utf8')` and `seedAgentosTenants(pool, csv)`. It prints `Seeded agentOS demo tenants: rows=…, created=…, updated=…, linked=…`, then prints the absolute path of bank-formatted.csv with the hint "upload it at /agentos". It calls `pool.end()` in a finally block and sets `process.exitCode = 1` on error after printing the message. Guard: if `process.env.NODE_ENV === 'production'`, it throws `Refusing to seed demo data in production`. It seeds tenants only. It does not upload, because upload is the staff step being demonstrated.
   Run it from the repo root with the same env vars as `npm run dev:server` (DATABASE_URL, HASH_KEY, ENCRYPTION_KEY, SESSION_SECRET): `npx tsx server/scripts/seed-agentos-demo.ts`. Pattern source: the root `db:migrate` script is `tsx server/src/db/migrate.ts`. No package.json script will be added (protected).
5. **agentos-pipeline.test.ts**: copy the harness from agentos-export.test.ts lines 1-60 (`loadConfig`, `createPool`, `signIn`, `post`/`get`/`getCsv` helpers, `run` suffix `aop`). Add `fx = (n) => readFileSync(new URL(\`../../../fixtures/agentos/demo-2026-08-05/${n}\`, import.meta.url))`. `clean()` must run `TRUNCATE agentos_journal_exports, agentos_journal_transfers CASCADE`, then `TRUNCATE agentos_intake_batches CASCADE`, `DELETE FROM agentos_tenants`, and the audit_log delete (add the journal table names). Call it in beforeAll and afterAll, then `pool.end()`. Use one `describe` with sequential `it`s:
   a. Seed `seedAgentosTenants(pool, fx('tenants.csv').toString())` and expect `{rows:10, created:10}`. Seed again and expect `created:0, updated:0`.
   b. Upload bank-with-outgoing.csv as staff and expect 400, with `JSON.stringify(body)` containing `outgoing payments are not accepted`. Expect `SELECT count(*) FROM agentos_intake_batches` = 0.
   c. Upload bank-formatted.csv and expect 201, `batch.rowsTotal` 13, `batch.amountTotalPence` 496275, `batch.periodFrom`/`periodTo` `2026-08-05`, `batch.matchCounts` `{matched:8,name_mismatch:2,deposit_mismatch:1,unmatched:2}`. Load line ids by line_no (`SELECT id, line_no FROM agentos_intake_lines WHERE batch_id=$1`). File row r has line_no r+1.
   d. Re-upload the same bytes and expect 409.
   e. Reassign row 12 (line_no 13) via `POST /api/agentos/lines/:id/reassign` `{tid:'T9309'}` and expect 200, `line.matchStatus` 'matched', `line.tid` '9309', `previous.matchStatus` 'unmatched'.
   f. `POST /api/agentos/exports {batchId}` and expect 201, `export.rowsTotal` 9, `amountTotalPence` 424775. Download `/api/agentos/exports/:id.csv` and strip the BOM. Split on `\r\n` and drop empties, then expect 10 lines (header + 9). Expect one line to start with `9301,9301 Ava Demoford` (exact Payment From). Expect no line to contain `9399` or `Someone Else`.
   g. Mark row 1 (line_no 2) posted, expect 200 and `postingStatus` 'posted'. Mark row 13 (line_no 14, unmatched, never exported) posted and expect 409.
   h. Journal: `POST /api/agentos/journal/transfers {fromTid:'9301', toTid:'9302', amountPence:5000, description:'Demo: row 11 paid to wrong account', nominalCode:'DEMO', accountType:'Rent'}` and expect 201. `POST /journal/exports` and expect 201 with `transfersTotal` 1. Mark it posted via `/journal/transfers/:id/posted` and expect 200.
6. **docs/agentos/field-spec.md**: append `## 10. Try it yourself (5 Aug 2026 demo)` with at most 12 lines. Cover: the data is synthetic; the seed command from step 4; upload bank-formatted.csv at /agentos and expect 8/2/1/2; fix row 12 with TID T9309; export 9 rows; mark posted; optionally create the journal from step 5h; bank-with-outgoing.csv shows the outgoing rejection; EMail/Mobile Phone in tenants.csv are not stored yet (no columns).

## Edge cases
- The T-prefix and bare forms are mixed on purpose (recon-507). Reassign also strips the `T`.
- 05/08/2026 is in the past compared with londonToday(), so the future-date check passes.
- The batch amount total check includes non-matched lines. The export total covers matched lines only.
- The outgoing file and the formatted file have different SHA-256 hashes, so the 409 dedupe does not interfere.

## Risks and rollback
- `server/scripts/**` is not in server/tsconfig.json `include` (protected), so `npm run typecheck` does not see the script. tsx still runs it. If `npm run lint` fails with "not found in project", STOP and report it as a scope problem. Do not edit the tsconfig or eslint config.
- If the 409 status for posting an unexported line differs, use the status the export test asserts. Do not change the service.
- Rollback: delete the 5 new files and the doc section. No schema or runtime code changes.

## Out of scope
Migrations (email/phone columns), package.json scripts, UI changes, any change under server/src, and any use of the real Apollo HSBC file.

## Verify
`npm run test:int -- agentos-pipeline`. Passing means 1 file and all 8 `it`s green, with the counts above. Also run `npm run lint`, then `npm run test:int` in full, and expect it to stay green, because the test cleans the shared tables.
