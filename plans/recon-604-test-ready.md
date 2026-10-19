# recon-604-test-ready: VECO push safe for the real RW MCP, local dev on a SQL-text fake VECO, demo receipts
**Goal:** write batches with no BEGIN TRAN/COMMIT/plain ROLLBACK (MCP owns the transaction), reads that start with `SELECT`, a fake VECO that enforces both at SQL-text level, local dev wired to the fake, and a seed/remove script for 3 demo receipts. HARD RULE: no code or test may reach the real VECO or MCP. The only gateway any test or local run builds is the fake.
**Create:** `server/src/services/veco-push/fake-veco-sql.ts`, `demo-data.ts`, `demo-seed.ts` (same folder); `server/test/unit/veco-push-fake.test.ts`; `server/test/int/veco-push-demo.test.ts`.
**Modify:** `server/src/services/veco-push/{sql-batches,gateway,config}.ts`, `server/src/jobs/veco-sync/mcp-client.ts`, `server/src/api/app.ts`, `.env.example`, `server/test/unit/veco-push-gateway.test.ts`. memory-gateway.ts and `web/**` are unchanged.

## Steps
1. **sql-batches.ts reads.** Move each tag after the leading SELECT so every read starts with `SELECT`, e.g. `SELECT /* omnia:db */ DB_NAME() AS db`. Apply this to db, staff, staff-exists, lookup, readback and remaining. Reason: the RW MCP returns rows only when the SQL starts with SELECT.
2. **sql-batches.ts writes.** Replace GUARD/HEAD/TAIL with the code below. `insertBatchSql` = `[...writeHead('insert'), <50002/50003/50004 checks>, <INSERTs>, <50005 checks>, WRITE_TAIL].join('\n')`. `deleteBatchSql` = `[...writeHead('delete'), <50006 check>, <DELETE Allocation>, <DELETE Transaction>, WRITE_TAIL]`. Remove both `SELECT N'OMNIA_..._OK'` lines and `SET NOCOUNT ON`. Update the header comment. Reason: avoids error 3902, and a write returns no rows.
   ```ts
   const GUARD = `IF DB_NAME() <> ${nstr(TARGET_DB)} THROW 50001, N'Omnia Recon refuses to write outside ${TARGET_DB}', 1;`;
   const writeHead = (tag: string) => [GUARD, `/* omnia:${tag} */`, 'SET XACT_ABORT ON;', 'SAVE TRANSACTION recon_push;', 'BEGIN TRY'];
   const WRITE_TAIL = 'END TRY BEGIN CATCH IF XACT_STATE() = 1 ROLLBACK TRANSACTION recon_push; THROW; END CATCH;';
   ```
   I added `IF XACT_STATE() = 1` on purpose. Under XACT_ABORT the transaction is doomed (-1) in CATCH, and a savepoint rollback would raise 3931 and hide the original error. THROW re-raises the real error, and the MCP's own transaction rolls everything back.
3. **gateway.ts.** Add `export function assertSelect(sql: string): string`. It throws `Error('VECO read must start with SELECT')` unless `/^SELECT\s/i.test(sql)`, otherwise it returns the SQL. Wrap every `sql.queryRows(x)` as `sql.queryRows(assertSelect(x))`. `insertReceipts`/`deleteReceipts` keep ignoring the batch's return value; add a comment that success is proved only by readBack/countRemaining.
4. **mcp-client.ts.** Change `toolText(result, allowEmpty = false)`: if `allowEmpty` and there is no text and no `isError`, return `''`. `execute(sql, allowEmpty = false)` passes it through, and `executeBatch` calls `execute(batchSql.trim(), true)`. queryRows and the read-only sync are unchanged. Reason: a write that returns no text must not count as a failure.
5. **demo-data.ts** (pure constants, no imports with side effects): `DEMO_MARKER = 'omnia-demo:veco-push'`, `DEMO_TIDS = ['T5755','T6008','T2822'] as const`, `DEMO_AMOUNT = '1.00'`, `DEMO_DATE = '2026-10-14'`, `DEMO_STAFF_PK = '0D0D0D0D-0000-4000-8000-000000000001'`. `DEMO_FAKE_SEED: FakeSeed` = `{ staff: [{ staffPk: DEMO_STAFF_PK, email: 'demo-staff@example.test' }], lookups }`. Each TID has one TenantLookupRow with these values (n = TID digits zero-padded to 12): tenancyFk `D0000000-0000-4000-8000-<n>`, contactFk `D1000000-…`, propertyFk `D2000000-…`, ownerFk `D3000000-…`, officeFk `D4000000-…`, officeName 'MY', ownerCount 1, officeCount 1, delayPayment false, addressTitle `Demo Tenant <tid>`, lastDescription `Rent Received  From Demo Tenant <tid>  `, lastDepartment 'Tenancy'. All checks in classify.ts pass, so all 3 show as ready.
6. **fake-veco-sql.ts.** `FakeSeed = { dbName?: string; staff; lookups }` (same shape as MemorySeed). `createFakeVecoSql(seed): FakeVecoSql` returns `SqlSource & SqlBatchRunner & { dbName; transactions: Map<string, Record<string, unknown>>; allocations: Map<...>; calls: string[]; batches: string[]; failNextWrite?: Error }`. Also export `forbiddenTransactionSql(sql)`: strip `/N?'(?:[^']|'')*'/g` and `/\/\*[\s\S]*?\*\//g` first, then return true on `/\bBEGIN\s+TRAN(SACTION)?\b/i`, `/\bCOMMIT\b/i` or `/\bROLLBACK\b(?!\s+TRAN(?:SACTION)?\s+\w)/i`.
   - `queryRows(sql)`: if `!/^SELECT\b/i.test(sql.trimStart())`, return `[]`. Otherwise dispatch on the tag `/\/\* omnia:([a-z-]+) \*\//`. db → `[{db}]`. staff → match `strEmailAddress1 = N'…'`. staff-exists → `[{n}]`. lookup → the `N'…'` list after `strStandingOrderReference IN (` (unescape `''`), case-insensitive. readback → the GUID lists after `t.TransactionPK IN (` and `a.AllocationPK IN (`; rows have the same shape as memory-gateway readBack. remaining → `{transactions, allocations, total: number}`. An unknown tag throws `Error('fake VECO: unsupported query')`. Push the tag onto `calls`.
   - `executeBatch(sql)`: push to `batches`. If `forbiddenTransactionSql` → throw `VecoSourceError('Veco query failed: (3902) The COMMIT TRANSACTION request has no corresponding BEGIN TRANSACTION.')`. If the SQL does not start with GUARD → throw `Error('fake VECO: write batch must start with the DB_NAME() guard')`. If `dbName !== TARGET_DB` → throw VecoSourceError `(50001) …`. Then throw `failNextWrite` if set (clear it first). Then handle the tag:
     - insert: parse every `/INSERT INTO (dbo\.\[Transaction\]|dbo\.Allocation) \(([^)]*)\) VALUES /g`. A tokenizer (`parseValues(text, from)`) reads tuples until a top-level `;`: `NULL`→null, `N'..'`/`'..'`→string with `''` unescaped, numbers→Number, and it tracks `(`, `)` and `,`. Build each row keyed by column name. Check every row before writing anything; on a clash throw VecoSourceError `(50002)` (TransactionPK), `(50003)` (AllocationPK) or `(50004)` (strReference). Then write all rows.
     - delete: extract GUIDs from `DELETE FROM dbo.Allocation WHERE AllocationPK IN (…)` and `DELETE FROM dbo.[Transaction] WHERE TransactionPK IN (…)`. If any other allocation references these transactions → `(50006)`. Otherwise delete them.
     - Return `''`.
7. **config.ts.** Add `VECO_PUSH_MODE: z.enum(['fake','mcp','off']).optional()` (empty → undefined) and `NODE_ENV` (default 'development'). Return the union `{mode:'mcp'; rwMcpUrl:string} | {mode:'fake'|'off'; rwMcpUrl:string|null}`. If no mode is set: production → `mcp` when the URL is set, else `off`; anything else → `fake`. Throw `Invalid VECO push configuration: VECO_PUSH_MODE=mcp needs VECO_RW_MCP_URL` and `…: VECO_PUSH_MODE=fake is not allowed in production`. Never echo the URL.
8. **app.ts main().** `mode==='mcp'` → the current `createSqlGateway(createMcpSqlClient(...))`. `'fake'` → `createSqlGateway(createFakeVecoSql(DEMO_FAKE_SEED))`. `'off'` → null. Log `{ mode, configured }`. Change nothing else. Reason: the local default never contacts VECO.
9. **.env.example.** Under VECO_RW_MCP_URL add a comment plus `VECO_PUSH_MODE=fake`: "fake = in-memory VECO, default outside production; mcp = real RW MCP; off".
10. **demo-seed.ts.** Export `assertLocalDatabase(url)`: it throws unless the host is in {localhost, 127.0.0.1, ::1} and the port is '5433'. Export `seedVecoPushDemo(pool, { userEmail })` and `removeVecoPushDemo(pool)`, each in one pg transaction (`pool.connect()`, BEGIN/COMMIT/ROLLBACK, release in finally). The CLI runs under `isMainModule(import.meta.url)`: `seed --user <email>` | `remove`. It loads `loadConfig()`, runs `assertLocalDatabase(config.databaseUrl)` and refuses production. It prints a JSON summary and exits 2 on usage errors.
    - **Seed:**
      - Vico settings: missing → insert `('vico','sort_code','20-79-06')` and `('vico','account_number','43789276')`. If they hold different values, throw `Vico settings are <x>/<y>; set 20-79-06 / 43789276 first` and never overwrite.
      - Each TID: if no tenancy exists, create branch code 'DEMO-VECO' (reuse it if present), property `property_ref='DEMO-VECO-<tid>'` (address 'Demo property <tid>', postcode 'ZZ1 1ZZ'), tenant `tenant_ref='DEMO-VECO-<tid>'` ('Demo', 'Tenant <tid>'), tenancy (tid, 'RG', start '2026-01-01') and a lead tenancy_tenants row.
      - Receipts: skip a TID that already has a receipt with `notes=DEMO_MARKER` in v_vico_export. Otherwise insert `receipts (tenancy_id,payer,amount,received_on,matched_via,notes)` = `($1,'tenant',1.00,'2026-10-14','manual',DEMO_MARKER)`. Because the receipt is 'active' and has no vico external_ref, it shows as waiting.
      - User link: the user must exist and be admin or accounts. Upsert `veco_staff_link (user_id, DEMO_STAFF_PK, 'admin', can_push=true, updated_by=DEMO_MARKER)`.
    - **Remove**, in this order, keyed only on markers:
      - Collect the ids of receipts with `notes=DEMO_MARKER`.
      - Note their veco_push_item batch ids, then delete those items.
      - Delete those batches only if they now have no items.
      - Delete the `external_refs` (system 'vico', entity_type 'receipt') for those ids, then the receipts.
      - Delete tenancy_tenants, tenancies and tenants/properties with the `DEMO-VECO-` refs, only where no receipts remain on the tenancy. Delete branch 'DEMO-VECO' only if it has no properties.
      - Delete `veco_staff_link WHERE updated_by=DEMO_MARKER`. Vico settings are kept.
11. **Unit tests, veco-push-gateway.test.ts.**
    - Replace 'puts the database guard first, inside one TRY/TRAN with rollback' with: 'insert batch starts with the DB_NAME() guard, then SET XACT_ABORT ON and SAVE TRANSACTION recon_push'. It asserts `startsWith("IF DB_NAME() <> N'Test Database Read Write' THROW 50001")`, the order guard < `SET XACT_ABORT ON;` < `SAVE TRANSACTION recon_push;` < `BEGIN TRY` < first INSERT, and that it contains the WRITE_TAIL text.
    - Add 'write batches contain no BEGIN TRAN, COMMIT or plain ROLLBACK and select nothing'. For insert and delete: `forbiddenTransactionSql` is false, there is no `OMNIA_PUSH_OK`/`OMNIA_DELETE_OK`, and there is no `/\bBEGIN\s+TRAN|\bCOMMIT\b/i`.
    - Add 'delete batch starts with the same guard and savepoint'.
    - Add 'every read starts with SELECT', covering all 6 read builders.
    - Change the lookup regex to `/^SELECT \/\* omnia:lookup \*\/ /`.
    - Add 'assertSelect refuses SQL that does not start with SELECT'.
    - Add 'executeBatch returns an empty string when the tool sends no text', using fakeFetch `{content: []}`.
    - Replace the config test with: 'defaults to fake outside production', 'production defaults to mcp with a URL, off without', 'mcp without a URL is refused', 'fake in production is refused', 'a bad URL is never echoed'. All use example.invalid only.
12. **Unit tests, veco-push-fake.test.ts.**
    - 'rejects BEGIN TRAN, COMMIT, ROLLBACK and ROLLBACK TRAN with 3902 and writes nothing'
    - 'allows ROLLBACK TRANSACTION recon_push and ignores those words inside string literals'
    - 'returns rows only for SQL that starts with SELECT' (a `/* x */ SELECT` call → [])
    - 'refuses a write batch without the leading guard'
    - 'fails with 50001 on another database'
    - 'insert, read back, duplicate (50002), delete and count through createSqlGateway'. Use the makeRows pattern with addressTitle `Mr O'Test (a), b`, and check the memDescription in the read-back.
    - 'DEMO_FAKE_SEED resolves T5755, T6008, T2822 and classify marks all three ready'
    - 'assertLocalDatabase refuses anything but localhost:5433'
13. **Int tests, veco-push-demo.test.ts.**
    - beforeAll: delete the vico integration_settings, run `removeVecoPushDemo`, sign in an accounts user, and take snapshot counts of receipts, tenancies, tenants, properties, external_refs, veco_push_batch and veco_staff_link. The app uses `createSqlGateway(createFakeVecoSql(DEMO_FAKE_SEED))`.
    - 'seed creates three £1.00 receipts dated 2026-10-14 that wait in /api/vico/pending'
    - 'seeding twice still leaves exactly three waiting demo receipts'
    - 'preview marks all three ready, none held'
    - 'push, verify and delete the three through the real gateway over the fake' (batch status verified, 3 rows in the fake, then remaining 0)
    - 'seed refuses different Vico bank settings' (set and then restore)
    - 'remove deletes only demo rows' (counts equal the snapshot and no marker rows remain)

## Edge cases
- Demo TIDs that already exist as tenancies are reused, and remove never deletes them.
- A demo receipt pushed to the fake VECO is removed together with its push rows.
- If the API restarts, the fake VECO's memory is wiped. Earlier fake pushes then fail Verify; run remove and seed again.
- A value containing `COMMIT` or `)` inside N'..' must not trip the fake.
- 501 rows still split across 2 VALUES chunks, and the fake parses both.

## Risks / rollback
- If the real MCP does not actually open a transaction, SAVE TRANSACTION fails with error 628. Nothing is written, and the push lands as `failed` with that message.
- In development, a URL in `.env.local` is now ignored unless `VECO_PUSH_MODE=mcp` is set. This is intended.
- No migration is involved. To roll back, revert the commit and run `… demo-seed.ts remove`.

## Out of scope
- A package.json script for the seed: the file is outside scope, so the command is run with npx.
- UI changes, including a "fake" banner.
- Vercel `server/api/index.ts` (no gateway, unchanged).
- Any real VECO or MCP call.

## Local use (do not edit .env.local; the user adds these lines)
`.env.local`: `NODE_ENV=development`, `VECO_PUSH_MODE=fake`, `VECO_RW_MCP_URL=` (empty), and `DATABASE_URL=postgres://…@localhost:5433/…`.
Seed: `npx tsx --env-file=.env.local server/src/services/veco-push/demo-seed.ts seed --user <your-login-email>`
Remove: `npx tsx --env-file=.env.local server/src/services/veco-push/demo-seed.ts remove`

## Verify
`npm run test:unit -- veco-push`, `npm run test:int -- veco-push` (Docker PG on 5433), `npm run test:web -- vico`, then `npm run lint` and `npm run typecheck`. Passing means all exit 0, every new test name above is listed, and the existing veco-push int tests are unchanged and green.

## Result

**Classification:** HARD. Routed planner → coder → summarizer, no re-plans.

**Build artifacts:** SQL write batches enforce DB_NAME() guard first, SET XACT_ABORT ON, SAVE TRANSACTION recon_push, BEGIN TRY…END TRY BEGIN CATCH IF XACT_STATE()=1 ROLLBACK TRANSACTION recon_push; THROW; END CATCH — no BEGIN TRAN/COMMIT/plain ROLLBACK. All reads start with SELECT. Reads use `SELECT /* omnia:<tag> */` format. New fake-veco-sql.ts (sql-text based): forbids 3902 violations at parse time, returns rows only for SELECT statements, enforces GUARD, validates inserts/deletes via parseValues tokenizer. Demo seed (demo-seed.ts) created 3 demo receipts T5755/T6008/T2822, £1.00 each dated 2026-10-14, marker notes='omnia-demo:veco-push', bank 20-79-06/43789276, seeded in local dev on 5433 under you@example.com. VECO_PUSH_MODE env added (fake|mcp|off, default fake outside production).

**Verification:** hx verify recon-604 all levels passed: unit veco-push 50/50, int veco-push 18/18, web vico 6/6. Full suites: lint 0 errors, typecheck 0 errors, test:unit 205/205 passed, test:int 517/518 (1 pre-existing failure in rent-terms.test.ts test 16 unrelated), test:web 12 pre-existing timeout failures in unrelated files (no veco-push web changes). Local Docker container omnia-recon-db, Postgres 18 on 5433, migrations 017-021 applied via db:migrate. No calls to real VECO RW DB or live MCP.
