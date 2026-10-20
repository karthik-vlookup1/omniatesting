# recon-606: VECO push demo seed can target the cloud database

## Goal
Add `--cloud`, `--staff` and `--receipts` to demo-seed.ts, plus a `users` command. With no flags it behaves exactly as today. Main path: a PowerShell wrapper the user runs in their own terminal, which prompts for the secrets (`vercel env pull` gives only [SENSITIVE] values). `.env.cloud` still works, but only as an alternative.

## Files
- M `server/src/services/veco-push/demo-seed.ts`
- A `scripts/cloud-demo-seed.ps1`
- A `server/test/unit/veco-push-demo-seed.test.ts`
- M `server/test/int/veco-push-demo.test.ts` (new `describe` only; existing tests byte-identical)
- Unchanged: demo-data.ts (DEMO_FAKE_SEED), config/env.ts, db/pool.ts, api/index.ts.

## What remove does today
Deletes receipts with `notes = DEMO_MARKER`, plus their items, any batch left empty, and their vico external_refs. Deletes DEMO-VECO-% tenancies/tenants/properties and the branch only when nothing else uses them; a pre-existing tenancy is only reused, so it is never deleted. Staff link: deletes `WHERE updated_by = DEMO_MARKER`. App edits rewrite updated_by, so this already means "still the seeded staff". The gap is in seed: its ON CONFLICT overwrites a pre-existing link, which remove then deletes. Step 5c fixes this.

## Steps (demo-seed.ts unless named)
1. Export `TID_RE=/^T\d{3,6}$/` (same as letmc-import/parse.ts), `UUID_RE=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i`, `AMOUNT_RE=/^\d{1,10}\.\d{2}$/` and `DemoReceipt {tid; amount}`.
2. `export parseReceipts(text)`: split on `,`, trim, split on the first `=`. Uppercase the TID and test it with TID_RE; the amount must match AMOUNT_RE and be > 0. Reject an empty list, more than 50 items and duplicate TIDs. Errors name the item: `Bad --receipts item "T12=1"`.
3. `export class UsageError`; `export parseArgs(argv): DemoArgs`, a union of `seed {userEmail, cloud, staffPk, receipts}`, `remove {cloud}` and `users {cloud}`. Flags come after the command, in any order: `--cloud`, `--user v`, `--staff v`, `--receipts v`. Unknown, repeated or value-less flags throw UsageError. seed needs `--user`; remove and users take only `--cloud`. The staff value must match UUID_RE and is returned `.toUpperCase()`. Defaults: DEMO_STAFF_PK, and `DEMO_TIDS.map(tid=>({tid, amount: DEMO_AMOUNT}))`.
4. `export resolveDatabaseTarget(env, cloud): {databaseUrl, label:'localhost:5433'|'cloud database'}`.
   - Not cloud: `assertLocalDatabase(env.DATABASE_URL ?? '')`, unchanged.
   - Cloud: `env.DATABASE_URL_UNPOOLED || env.NEON_DATABASE_URL_UNPOOLED || env.DATABASE_URL`. Errors: none set -> `'--cloud needs DATABASE_URL_UNPOOLED, NEON_DATABASE_URL_UNPOOLED or DATABASE_URL'`; unparsable -> `'Demo seed refuses an unreadable cloud database URL'`; localhost/127.0.0.1/::1 -> `'--cloud refuses a local database; drop --cloud'`.
   - No message ever contains the URL or the host.
5. `seedVecoPushDemo(pool, {userEmail, staffPk=DEMO_STAFF_PK, receipts=default})`:
   a. Preflight first: `SELECT to_regclass('veco_staff_link') IS NOT NULL AND to_regclass('veco_push_item') IS NOT NULL AND to_regclass('v_vico_export') IS NOT NULL AS ok`. If false, throw `'The database has no VECO push tables (migration 021); apply migrations first'`.
   b. Loop over `receipts`, inserting `r.amount`. If the waiting demo receipt for that tenancy has another amount, throw `Demo receipt for ${tid} is already waiting at ${amt}; run remove first`. Same amount: skip, as today.
   c. Staff link. Read `upper(staff_fk::text), source, can_push, updated_by`.
      - No row, `updated_by=DEMO_MARKER`, or `source='email' AND NOT can_push` (the app recreates auto-links): upsert as today with `staffPk`. Result `'created'` or `'updated'`.
      - Non-demo row with the same staff and can_push: leave it. Result `'kept'`.
      - Anything else: throw `${userEmail} already has a VECO staff link set in the app; change or unlink it on the Settings page first`.
   d. SeedSummary adds `staffLink`. `linkedUser` is the email as stored in app_users (the login).
6. `removeVecoPushDemo`: run preflight 5a. Before any delete, count the demo receipts' items with `status IN ('pushing','pushed')`. If n > 0, throw `${n} demo receipts are still pushed to VECO; delete that batch on the Vico export page first`, so VECO rows are never orphaned. RemoveSummary adds `staffLinksRemoved` (rowCount of the existing DELETE).
7. `export listDemoUsers(pool)`: `SELECT email FROM app_users WHERE is_active AND role IN ('admin','accounts') ORDER BY email`, returns `string[]`.
8. `export redact(msg, url)`: replace the full URL, its hostname and its decoded password (when non-empty) with `cloud database`. pg errors such as ENOTFOUND include the host.
9. `cli`:
   - UsageError: write the message, then `Usage: demo-seed.ts seed --user <email> [--staff <StaffPK>] [--receipts "T1234=1.00,..."] [--cloud] | remove [--cloud] | users [--cloud]` to stderr, and exit 2.
   - Get `target`, then `loadConfig({...process.env, DATABASE_URL: target.databaseUrl})`, so the same createPool sets app.hash_key from HASH_KEY.
   - The production refusal (same message) applies only when `!cloud`.
   - stdout gets one JSON line: `{command, database: target.label, ...summary}`; users gives `{command, database, emails}`.
   - In cloud mode, errors go to stderr through `redact`.
   - Update the header comment.
10. `scripts/cloud-demo-seed.ps1`, copying setup-cloud-db.ps1 (Read-Secret, `$ErrorActionPreference="Stop"`, Set-Location root).
    - Params: `[ValidateSet('seed','remove')] $Action`, `-User`, `-Staff`, `-Receipts`. The Receipts default is `T5755=997.27,T6008=890.00,T2822=950.00,T5126=1045.00,T7074=1045.00,T7684=1045.00,T7703=1045.00`.
    - Prompt as setup-cloud-db does: masked DIRECT connection string, with the same postgres:// check, -pooler warning and sslmode append. Then masked HASH_KEY, ENCRYPTION_KEY and SESSION_SECRET.
    - Set only `$env:` vars. Remove `Env:DATABASE_URL_UNPOOLED` and `Env:NEON_DATABASE_URL_UNPOOLED` first, so the typed URL wins. Set NODE_ENV=production and LOG_LEVEL=warn.
    - `Invoke-Demo` runs `npx tsx server/src/services/veco-push/demo-seed.ts @args --cloud`, keeps stdout's last line through ConvertFrom-Json, and throws on a non-zero exit. stderr passes through, already redacted.
    - Seed with no -User: run `users`, print a numbered email list, Read-Host the number. With no -Staff: Read-Host "VECO StaffPK"; empty input aborts.
    - Output is counts and emails only: `Seeded: X created, Y waiting, Z new tenancies. Login to use: <linkedUser> (staff link <staffLink>)`, and `Removed: X receipts, Y tenancies, Z staff links`.
    - A `finally` block clears DATABASE_URL, HASH_KEY, ENCRYPTION_KEY, SESSION_SECRET, NODE_ENV and LOG_LEVEL. Nothing touches disk.

## Tests
- Unit (new file):
  - parseArgs: defaults; flags in any order; lowercase staff comes back uppercase; unknown, repeated and missing values; remove with --staff; users.
  - parseReceipts: `t5755` comes back uppercase; `1`, `1.5`, `0.00`, `-1.00`, duplicate, empty and 51 items are rejected.
  - resolveDatabaseTarget with fake env objects: local behaves as today; cloud order UNPOOLED > NEON_ > plain; cloud refuses localhost, missing and garbage URLs; no message contains `ep-x.example.neon.tech` or its password.
  - redact.
  - Static check of the .ps1 text: has `-AsSecureString` and `--cloud`; no `Set-Content|Out-File|Add-Content|>`; the finally block clears the 4 secrets; no `Write-Host` of `$databaseUrl` or the keys.
- Int (new describe after the existing one):
  - Custom staff plus `T5755=997.27,T9901=12.34`: 2 waiting with those amounts; link has that staff and can_push. remove brings counts() back to the snapshot.
  - Re-seeding at another amount is rejected.
  - An admin link to another staff is rejected. The same staff with can_push gives 'kept' and survives remove (the test deletes it in its own finally).
  - An email auto-link gives 'updated' and remove deletes it.
  - Push the defaults over `fake`: remove is rejected 'still pushed'; delete the batch; remove succeeds and counts() equals the snapshot.
  - listDemoUsers includes the test email.

## Edge cases
- Unknown TIDs get DEMO-VECO tenancies. A real push needs the TID in the VECO test database.
- The uuid column is case-insensitive, so compare with upper().
- With the `.env.cloud` route, a shell-exported DATABASE_URL beats --env-file.

## Risks / rollback
- Risk: writes to the shared cloud DB. Mitigations: an explicit flag, the 021 preflight, one transaction per run, marker-only deletes, and the live-push refusal. Data rollback: run remove. Code rollback: revert the commit.

## Out of scope
Changes to the app or Vercel, cloud migrations, DEMO_FAKE_SEED, and settings UI changes.

## Commands (user's own PowerShell, repo root)
- `powershell -ExecutionPolicy Bypass -File scripts\cloud-demo-seed.ps1 seed -Staff <StaffPK>` (prompts for the email; default receipts)
- `powershell -ExecutionPolicy Bypass -File scripts\cloud-demo-seed.ps1 remove`
- Alternative: `npx tsx --env-file=.env.cloud server/src/services/veco-push/demo-seed.ts seed --cloud --user <email> --staff <StaffPK> --receipts "..."`

## Verify
`npm run test:unit -- veco-push` and `npm run test:int -- veco-push` exit 0, plus lint and typecheck. The 6 existing demo int tests pass unchanged.

## Result
**Status: passing.** hx verify recon-606 on 2026-10-20: unit PASS 81/81, integration PASS 23/23 (includes 6 existing demo tests); lint and typecheck clean; scripts/cloud-demo-seed.ps1 parse check ok (script not executed by agent).
**Files:** server/src/services/veco-push/demo-seed.ts, scripts/cloud-demo-seed.ps1 (new), server/test/unit/veco-push-demo-seed.test.ts (new), server/test/int/veco-push-demo.test.ts (new describe block).
**Deviations:** .ps1 header shows `-Staff StaffPK` without angle brackets (static test forbids `>`); email auto-link int test sets updated_by to test email (NOT NULL column).
**Cloud preview (default 7 receipts):** 5 Ready = £4,927.27; 2 Held back (T7684, T7703 not in VECO) = £2,090.00.
