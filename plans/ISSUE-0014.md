# Plan ISSUE-0014: read-only VECO landed check per Vico export

## Goal
POST /api/vico/exports/:id/landed-check matches an export's receipts against VECO SLP rows (read-only), saves the result in `vico_landed_checks`, and GET /api/vico/exports returns it as `landedCheck`. The UI gets an "In VECO" column.

## Files
Create: `server/src/services/vico/landed.ts`, `db/migrations/021_vico_landed_checks.sql`, `server/test/unit/vico-landed.test.ts`, `server/test/int/vico-landed.test.ts`.
Modify: `server/src/api/vico/routes.ts`, `server/src/api/app.ts` (line 123 only), `web/src/features/vico/api.ts`, `web/src/features/vico/VicoPage.tsx`. Do not touch `vico.service.ts` (this avoids an import cycle) or `lib/errors.ts` (out of scope).

## Steps
1. **REVISED (re-plan 1). 021 migration.** `BEGIN;` then:
   `CREATE TABLE vico_landed_checks (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), export_id text NOT NULL UNIQUE, checked_at timestamptz NOT NULL, snapshot_refreshed_at text CHECK (snapshot_refreshed_at ~ '^\d{4}-\d{2}-\d{2} \d{2}:\d{2}$'), rows int NOT NULL CHECK (rows >= 0), landed int NOT NULL CHECK (landed BETWEEN 0 AND rows), total_amount numeric(12,2) NOT NULL, landed_amount numeric(12,2) NOT NULL, banks jsonb NOT NULL DEFAULT '[]')`.
   - Why `id`: `audit_row()` reads `NEW.id`/`OLD.id`, so every audited table needs an `id` column. `export_id UNIQUE` is the upsert target.
   - `snapshot_refreshed_at` is nullable and holds VECO's UK local wall-clock time as 'YYYY-MM-DD HH:MM', not a UTC instant; say so in a column comment.
   - Keep the `t_audit` trigger (`audit_row()`) as 011 does, then `COMMIT;`.
   - Add no FK to external_refs, because other suites TRUNCATE it. Put that reason in the header comment, styled like 011. No grants (011 has none).
2. **landed.ts types.** `LandedReceipt {tid; receivedOn; amount; bankCode: string|null}`, `VecoSlpRow {tid; date; amount: string}`, `BankLanded {bankCode: string|null; rows; landed; totalAmount; landedAmount}`, `LandedCheck {checkedAt: string; snapshotRefreshedAt: string|null /* 'YYYY-MM-DD HH:MM' UK local */; rows; landed; totalAmount; landedAmount; banks: BankLanded[]}`, `VicoExportWithLanded = VicoExport & { landedCheck: LandedCheck|null }`. Import `sumPounds` and `VicoExport`/`listExports` from `./vico.service.js`.
3. **landed.ts guards.** `const TID = /^T\d{3,6}$/; const ISO = /^\d{4}-\d{2}-\d{2}$/;` and `normTid = (t) => t.trim().toUpperCase()`. `isQueryable(r)` is true when TID.test(normTid(r.tid)) && ISO.test(r.receivedOn). Reason: the MCP takes raw SQL, so only these shapes may be interpolated.
4. **`buildSlpQueries(receipts): string[]`.** Keep only queryable receipts; if there are none, return `[]`. Take distinct normalised TIDs in sorted order and chunk them by 500 (`export const TID_CHUNK = 500`). Set minDate = min receivedOn and maxNext = maxDate + 1 day, computed with `Date.UTC` and formatted `toISOString().slice(0,10)`. Build one string per chunk, on a single line with no trailing `;`:
   `SELECT TenancyRef AS tid, CONVERT(varchar(10), TxDate, 23) AS txDate, GrossAmount AS amount FROM snap_TenancyTransactions_24M WHERE TxType = 'SLP' AND TenancyRef IN ('T1','T2') AND TxDate >= '<min>' AND TxDate < '<maxNext>'`
5. **REVISED.** `export const SNAPSHOT_SQL = 'SELECT CONVERT(varchar(16), MAX(last_refreshed), 120) AS refreshedAt FROM snap_TenancyTransactions_24M'`. Style 120 gives 'YYYY-MM-DD HH:MM' in UK local time; do not convert it to UTC.
6. **REVISED. `toVecoRow(raw)`.** tid = normTid(String(raw.tid ?? '')), date = String(raw.txDate ?? ''). amount = `typeof raw.amount === 'number' ? raw.amount.toFixed(2) : String(raw.amount ?? '0')`, then `sumPounds([amount])`. If the date is not ISO or the amount is not `/^-?\d+(\.\d+)?$/`, return null; the caller drops nulls. `parseRefreshed(v)` returns `v` unchanged when `typeof v === 'string' && /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}$/.test(v)`, otherwise null. It must not use `new Date` and must not shift time zones.
7. **`matchLanded(receipts, vecoRows, checkedAt, snapshotRefreshedAt): LandedCheck` (pure).** Build a Map from `${tid}|${date}|${amount2dp}` to a count of VECO rows. Walk the receipts in their given order. A receipt lands only if it is queryable and its key count is > 0; when it lands, decrement the count. Totals: rows = receipts.length. totalAmount and landedAmount come from `sumPounds` (`'0.00'` when empty). Group banks by bankCode and sort codes A–Z with null last. Above the matcher, add a comment that each export is checked independently, so a VECO row can satisfy receipts in two different exports' checks (a known limitation).
8. **REVISED (re-plan 1). `runLandedCheck(db: ActorDb, pool: Pool, source: SqlSource, exportId): Promise<LandedCheck>`.**
   - Load the receipts with: `SELECT t.tid, r.amount::text AS amount, to_char(r.received_on,'YYYY-MM-DD') AS "receivedOn", b.code AS "bankCode" FROM external_refs e JOIN receipts r ON r.id = e.entity_id JOIN tenancies t ON t.id = r.tenancy_id LEFT JOIN bank_transactions bt ON bt.id = r.bank_transaction_id LEFT JOIN bank_accounts b ON b.id = bt.bank_account_id WHERE e.system='vico' AND e.entity_type='receipt' AND e.external_key2=$1 ORDER BY r.received_on, t.tid, r.id`. Keep reversed receipts in, so Y matches the export's rows.
   - With 0 rows, throw `AppError('not_found','No such Vico export')`.
   - Run each SLP query in sequence through `source.queryRows`, then run `SNAPSHOT_SQL` and pass `rows[0]?.refreshedAt` through `parseRefreshed`, then call `matchLanded` with `new Date().toISOString()`.
   - Upsert in `db.tx`: `INSERT INTO vico_landed_checks (export_id, checked_at, snapshot_refreshed_at, rows, landed, total_amount, landed_amount, banks) VALUES ($1,$2,$3,$4,$5,$6,$7,$8::jsonb) ON CONFLICT (export_id) DO UPDATE SET` every column except `id` and `export_id` `= EXCLUDED.<col>`. Never insert or update `id`; the default fills it, and it stays stable across overwrites. Pass banks as `JSON.stringify(check.banks)`. Return the check.
   - A `VecoSourceError` propagates before the upsert, so nothing is saved.
9. **REVISED. `listExportsWithLanded(pool)`.** Call `listExports(pool)`, then `SELECT export_id, checked_at, snapshot_refreshed_at, rows, landed, total_amount::text, landed_amount::text, banks FROM vico_landed_checks WHERE export_id = ANY($1::text[])`. Map `checked_at` with `toISOString()`. Return `snapshot_refreshed_at` as the stored text, or null. Map amounts with `sumPounds([x])`. Attach `landedCheck` (null when there is none). `id` is not exposed.
10. **routes.ts.**
    - Change the signature to `vicoRouter({ pool, vecoSource = null }: { pool: Pool; vecoSource?: SqlSource | null })` and import `VecoSourceError`/`SqlSource` from `../../jobs/veco-sync/mcp-client.js`.
    - GET `/exports` now returns `{ exports: await listExportsWithLanded(pool) }`.
    - New `router.post('/exports/:id/landed-check', ...)`:
      - Run `Id.safeParse`; on failure, throw not_found 'No such Vico export'.
      - If `!vecoSource`, throw `new AppError('conflict','VECO is not configured on this server',{ reason: 'veco_not_configured' })`, which gives 409.
      - Otherwise `try { res.json({ landedCheck: await runLandedCheck(req.db, pool, vecoSource, id) }) } catch (err) { if (err instanceof VecoSourceError) { res.status(502).json({ error: { code: 'veco_unavailable', message: err.message } }); return; } throw err; }`. This copies the 502 pattern in tenancy/xero routes; no AppError code exists for 502.
    - Add the new route to the header comment.
11. **app.ts:123.** `app.use('/api/vico', vicoRouter({ pool, vecoSource: vecoSource ?? null }));`
12. **web api.ts.**
    - Add the `BankLanded` and `LandedCheck` interfaces (same shape as the server, `snapshotRefreshedAt: string | null`) and `landedCheck: LandedCheck | null` on `VicoExport`.
    - Add `useRunLandedCheck()`: a useMutation with `mutationFn: (exportId: string) => apiRequest<{ landedCheck: LandedCheck }>(`/vico/exports/${exportId}/landed-check`, { method: 'POST' }).then((r) => r.landedCheck)` and `onSuccess: () => void qc.invalidateQueries({ queryKey: [...KEY, 'exports'] })`.
13. **REVISED. VicoPage.tsx, Earlier exports card.**
    - Under the existing dimmed text, add `<Text size="xs" c="dimmed">VECO data is a nightly snapshot (last refreshed {refreshed}). Receipts processed in VECO today show after tonight's refresh.</Text>`.
    - `refreshed` is the `snapshotRefreshedAt` of the landedCheck with the latest `checkedAt`. Format it with a local helper and no Date parsing: `const ukStamp = (s: string) => `${s.slice(8,10)}/${s.slice(5,7)}/${s.slice(0,4)} ${s.slice(11,16)}``, giving DD/MM/YYYY HH:MM in UK time. If there is no value, show `'not yet checked'`.
    - Add `{landed.isError && <Alert color="red" role="alert">{errorMessage(landed.error)}</Alert>}`.
    - Add `<Table.Th>In VECO</Table.Th>` before the empty Th, and a matching Td that renders a new `LandedCell({ check, busy, onCheck })`:
      - No check: `<Button size="xs" variant="light" aria-label={`Check ${e.fileName} in VECO`}>Check VECO</Button>`.
      - With a check: `<Text size="sm" fw={600} c={landed===rows?'green':'orange'}>Landed {landed} of {rows}</Text>`, then `<Text size="xs">{money(landedAmount)} of {money(totalAmount)}</Text>`, then one `<Text size="xs" c="dimmed">` per bank: `{bankCode ?? 'No bank line'}: {landed} of {rows}, {money(landedAmount)} of {money(totalAmount)}`, then a subtle xs "Check again" button.
      - `busy` = `landed.isPending && landed.variables === e.exportId`.
14. **REVISED. Unit tests (`vico-landed.test.ts`).**
    - matchLanded cases:
      - 2 identical receipts with 1 VECO row gives 1 landed, and 2 rows gives 2.
      - Amount off by 1p, date +1 day, or a different tid gives not landed.
      - The tid `'t1234'` lands (it is normalised to upper case).
      - `"T12'; DROP"` and a bad date are not landed and still count in rows.
      - Banks group HSBC/null with null last.
      - Totals come out exact (`'0.10'+'0.20'` gives `'0.30'`).
      - A numeric VECO amount `450` matches `'450.00'`.
    - parseRefreshed: `'2026-10-16 03:30'` comes back unchanged; `'2026-10-16T03:30:25Z'`, `null` and `42` give null.
    - Builder cases:
      - 501 TIDs give 2 queries.
      - An invalid TID is absent from the SQL.
      - With no valid receipts the result is `[]`.
      - The date bounds are `>= min` and `< max+1` across a month end.
    - Safety: for every built SQL plus SNAPSHOT_SQL, `match(/\bSELECT\b/gi).length===1`, `!/;/`, `!/\b(INSERT|UPDATE|DELETE|MERGE|EXEC|DROP)\b/i`, and `/^SELECT /`.
15. **REVISED (re-plan 1). Int test (`vico-landed.test.ts`).**
    - Copy the vico-edges setup (signIn, `bankReceipt`, `manualReceipt`, TRUNCATE list) with emails `-vico-landed-${run}`, and add `vico_landed_checks` to the TRUNCATE.
    - Create a fake `SqlSource` that records SQL. It returns `[{ refreshedAt: '2026-10-16 03:30' }]` for SNAPSHOT_SQL; for anything else it returns one SLP row matching the bank receipt (`tid`, `'2026-09-11'`, `50`).
    - Export the bank receipt plus a manual receipt, so there are 2 rows.
    - Expected with `createApp({config,pool,logger,vecoSource: fake})`:
      - POST gives 200 with landed 1, rows 2, and banks `[{bankCode:'HSBC',landed:1}, {bankCode:null,landed:0}]`.
      - `snapshotRefreshedAt` is exactly `'2026-10-16 03:30'`.
      - GET /exports shows a deep-equal `landedCheck`.
      - A second POST overwrites: `SELECT id FROM vico_landed_checks WHERE export_id=$1` returns 1 row, and the `id` is the same as after the first POST.
      - Every recorded SQL starts with SELECT.
    - With no source, the app returns 409 with `details.reason==='veco_not_configured'`.
    - A random uuid gives 404, and `not-a-uuid` gives 404.
    - A source throwing `new VecoSourceError('Veco query failed: x')` gives 502 with code `veco_unavailable`, and nothing new is saved.
    - The staff role gets 403.

## Edge cases
- An export with no valid TIDs runs no SLP query, still runs the snapshot query, and gets landed 0.
- Receipts with no bank line group as `bankCode: null`.
- Reversed receipts stay in Y.
- A VECO row with an invalid date or amount is dropped.
- An unexpected `refreshedAt` format is stored as null.

## Risks / rollback
- REVISED: The snapshot time is stored as text, not timestamptz (it departs from the spec on purpose, because the value is UK wall-clock time). The table also gains a surrogate `id` that the spec did not list; the audit trigger needs it.
- A snapshot-shaped JSON is assumed for the aliased columns.
- Rollback: revert the commit and `DROP TABLE vico_landed_checks` (no other table depends on it). If 021 was already applied to the test DB in its earlier form, the int globalSetup recreates `omnia_test`, so nothing manual is needed.

## Out of scope
Any VECO write, pushing to VECO, scheduled checks, and changes to `errors.ts` or `vico.service.ts`.

## Verify
`npm run typecheck`; `npx vitest run --project unit server/test/unit/vico-landed.test.ts server/test/unit/vico.test.ts`; `npx vitest run --project int server/test/int/vico.test.ts server/test/int/vico-edges.test.ts server/test/int/vico-landed.test.ts` (TEST_DATABASE_URL on 5433); `npx eslint server/src/services/vico server/src/api/vico web/src/features/vico server/test/unit/vico-landed.test.ts server/test/int/vico-landed.test.ts`. Passing means all four exit 0 and the existing vico tests stay green.
