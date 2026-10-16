<!--hx-issue
{
  "id": "ISSUE-0014",
  "title": "Vico export: read-only VECO landed check per export in Earlier exports",
  "status": "resolved-pending-review",
  "severity": "medium",
  "skill": "issue-solve",
  "scope": [
    "server/src/services/vico/**",
    "server/src/api/vico/**",
    "server/src/api/app.ts",
    "db/migrations/021_*",
    "web/src/features/vico/**",
    "server/test/unit/vico*",
    "server/test/int/vico*",
    "plans/**"
  ],
  "verification": [
    "npm run typecheck",
    "npx vitest run --project unit server/test/unit/vico-landed.test.ts server/test/unit/vico.test.ts",
    "npx vitest run --project int server/test/int/vico.test.ts server/test/int/vico-edges.test.ts server/test/int/vico-landed.test.ts",
    "npx eslint server/src/services/vico server/src/api/vico web/src/features/vico server/test/unit/vico-landed.test.ts server/test/int/vico-landed.test.ts"
  ],
  "source": "manual",
  "attempts": 1,
  "createdAt": "2026-10-16T08:18:15.959Z",
  "updatedAt": "2026-10-16T08:26:43.288Z",
  "contractHash": "bcfcd7d18d4a7bf3"
}
-->




## Goal
After staff import a Vico file into VECO (Import Receipts -> Import -> Process), Recon checks VECO read-only and shows, per export in "Earlier exports": landed X of Y receipts, landed total vs export total, and per-bank rows/totals. Never write to VECO.

## Source
- VECO warehouse table `snap_TenancyTransactions_24M`, read through the existing read-only client `server/src/jobs/veco-sync/mcp-client.ts` (`SqlSource.queryRows`, SELECT only; the client appends FOR JSON). The app already injects `vecoSource: SqlSource | null` into `createApp` (used by /api/xero); reuse it for /api/vico.
- Observed columns: TenancyRef (varchar, 'T7536' = Recon TID), TxDate (datetime), TxType ('SLP' = rent receipt; 29,299 rows), GrossAmount (decimal, positive), TransactionPK (uniqueidentifier), last_refreshed (datetime, snapshot refresh ~03:30 nightly).
- VECO rows carry no bank. Per-bank totals come from Recon's own bank lines: receipts.bank_transaction_id -> bank_transactions.bank_account_id -> bank_accounts.code; receipts with no bank line group as bank null ("No bank line").

## Matching rule
An exported receipt has landed when an SLP row exists with TenancyRef = tid, CAST(TxDate AS date) = receipts.received_on, GrossAmount = amount (exact pence). Count-based: within one (tid, date, amount) key, k VECO rows satisfy at most k receipts (two identical receipts need two rows). A VECO row is not shared across exports' checks? It is checked per export independently (note this limitation in a code comment).

## Query safety
MCP takes raw SQL, no params. Only TIDs matching /^T\d{3,6}$/ (uppercased) and ISO dates /^\d{4}-\d{2}-\d{2}$/ go into the SQL; anything else is skipped (counts as not landed). Query: SELECT TenancyRef, CONVERT(varchar(10), TxDate, 23), GrossAmount FROM snap_TenancyTransactions_24M WHERE TxType = 'SLP' AND TenancyRef IN (...) AND TxDate >= minDate AND TxDate < maxDate+1 day; chunk TIDs by 500. A second SELECT MAX(last_refreshed) gives the snapshot time. Unit test asserts every SQL built is a single SELECT with no INSERT/UPDATE/DELETE/MERGE/EXEC/DROP/;.

## API (admin + accounts, like the rest of /api/vico)
- POST /api/vico/exports/:id/landed-check -> runs the check now, saves it, returns it. 409 reason `veco_not_configured` when no vecoSource; 404 unknown export; VecoSourceError -> 502 with its (key-free) message.
- GET /api/vico/exports includes `landedCheck` (last saved check or null) on each export.
- Result shape: { checkedAt, snapshotRefreshedAt|null, rows, landed, totalAmount, landedAmount, banks: [{ bankCode|null, rows, landed, totalAmount, landedAmount }] } (amounts as 2-dp strings, summed in pence via sumPounds).

## Storage
New migration `db/migrations/021_vico_landed_checks.sql`: table vico_landed_checks (export_id text PK, checked_at timestamptz, snapshot_refreshed_at timestamptz null, rows int, landed int, total_amount numeric(12,2), landed_amount numeric(12,2), banks jsonb). Latest check overwrites (upsert). Follow existing migration conventions (grants/RLS if other tables have them).

## UI (web/src/features/vico)
Earlier exports table gets an "In VECO" column: a "Check VECO" button per export; once checked shows "Landed X of Y" (green when all, orange otherwise) and "£landed of £total", plus a per-bank breakdown (small table or lines) under it. A note under the card title: "VECO data is a nightly snapshot (last refreshed <time>). Receipts processed in VECO today show after tonight's refresh." Errors show as an Alert.

## Out of scope
Any write to VECO; direct push; automatic scheduled checks.

## Tests
Unit: matcher (count-based dupes, amount/date/tid mismatch, invalid tid skipped, per-bank grouping, pence totals) and SQL builder safety. Int: fake SqlSource in createApp, POST check then GET exports shows saved result; 409 without source; 404 unknown export; existing vico tests stay green.

## Debug Log

- What failed? 
- Which signal proves the failure? 
- Which layer owns the failure? 
- What changed after the fix? 
- Did the app restart cleanly? 
- Did the same workload pass after rerun?
