# recon-503 plan: match formatted lines to an agentOS TID (HARD)
Goal: inside the intake upload transaction, give every `agentos_intake_lines` row one of `matched | name_mismatch | deposit_mismatch | unmatched` from an exact TID plus a normalised name and deposit-to check. Never fuzzy. Return the counts with the upload.

## Schema check (no migration)
Migration 013 already has `match_status` CHECK (`pending`,`matched`,`name_mismatch`,`unmatched`,`deposit_mismatch`) and `agentos_tenant_id uuid NULL REFERENCES agentos_tenants ON DELETE SET NULL`. That is enough. There is no column for "which checks failed", so when both the name and the deposit fail, only `name_mismatch` is stored. This is accepted. If the reasons are needed later, add `014: match_reasons text[]` (not in this feature).

## Files
Create: `server/src/domain/agentos/match.ts`, `server/src/services/agentos/match.service.ts`, `server/test/int/agentos-match.test.ts`, `server/test/fixtures/agentos/match-tenants.csv`, `server/test/fixtures/agentos/match-lines.csv`.
Modify: `server/src/services/agentos/intake.service.ts`.

## Steps
1. `domain/agentos/match.ts` (pure, no DB):
   ```ts
   export type MatchStatus = 'matched' | 'name_mismatch' | 'deposit_mismatch' | 'unmatched';
   export interface MatchCandidate { id: string; tid: string; forename: string; surname: string; depositTo: string; agentosRef: string }
   export interface MatchLine { tid: string | null; payerName: string; depositTo: string }
   export interface MatchDecision { status: MatchStatus; tenantId: string | null }
   export type MatchCounts = Record<MatchStatus, number>;
   export function normaliseText(s: string): string        // s.trim().toLowerCase().replace(/\s+/g, ' ')
   export function expectedTenantName(t: Pick<MatchCandidate,'tid'|'forename'|'surname'>): string
   export function decideMatch(line: MatchLine, candidates: MatchCandidate[]): MatchDecision
   ```
   `expectedTenantName` strips the TID like this: if `forename.trimStart()` starts with `${t.tid}` followed by whitespace, drop that prefix. Return `normaliseText(rest + ' ' + surname)`. The payer name is NOT TID-stripped, because the rule names only the forename.
2. `decideMatch` uses this precedence (first rule that applies wins):
   a. `tid` is null, or `candidates` filtered to `c.tid === line.tid` is empty: `{unmatched, null}`.
   b. `hits` = the candidates where `expectedTenantName(c) === normaliseText(payerName)`. If `hits.length !== 1`: `name_mismatch`. `tenantId` = the only candidate's id when exactly one candidate exists, otherwise null (several rows and no hit, or an ambiguous double hit, are never auto-assigned).
   c. If `normaliseText(line.depositTo) !== normaliseText(hit.depositTo)`: `{deposit_mismatch, hit.id}`.
   d. Otherwise `{matched, hit.id}`.
   Precedence when both fail: `name_mismatch` wins, because the identity has to be confirmed before the account matters. Joint tenants (more than one row per TID): a name match on ANY one row counts and links that row. Today `agentos_tenants.tid` is UNIQUE, so this path is only reachable in the pure function. Keep it anyway for the future.
3. `services/agentos/match.service.ts`:
   `export async function matchIntakeBatch(c: PoolClient, batchId: string): Promise<MatchCounts>` (PoolClient from `../../db/pool.js`).
   (a) `SELECT id, tid_raw, payer_name, deposit_to FROM agentos_intake_lines WHERE batch_id=$1 ORDER BY line_no`.
   (b) `SELECT id, tid, forename, surname, deposit_to, agentos_ref FROM agentos_tenants WHERE tid = ANY($1::text[])` with the distinct non-null TIDs. Skip this query if there are none. Group the rows by tid in a Map, ordered by agentos_ref.
   (c) Run `decideMatch` for each line. Write everything with ONE statement:
   ```sql
   UPDATE agentos_intake_lines l
      SET match_status = v.status, agentos_tenant_id = v.tenant_id, updated_at = now()
     FROM unnest($1::uuid[], $2::text[], $3::uuid[]) AS v(id, status, tenant_id)
    WHERE l.id = v.id
   ```
   (d) Return the counts with all four keys present (0 when none).
   Do not touch `posting_status`. It stays `not_ready`, and recon-504 owns readiness and exports only `matched`.
4. `intake.service.ts`:
   - Replace the `// recon-503` comment with `const matchCounts = await matchIntakeBatch(c, batchId);`. It is in the same tx, so a matcher error rolls back the whole upload.
   - Add `matchCounts: MatchCounts` to `IntakeImportResult` and to the returned object.
   - Add `agentosTenantId: string | null` to `IntakeLineDto`, add `agentos_tenant_id` to the `getIntakeBatch` SELECT, and map it.
   - Do not touch `warnings` and `linesWithWarnings`. The routes are unchanged because the result object passes straight through.

## Fixtures (synthetic)
`match-tenants.csv` (seed format, header from seed.ts HEADERS), 3 rows:
`9201` `9201 Alex`/`Testperson`, deposit `Test Lettings - Client Account`. `9202` `9202 Mary  Jo` (double space)/`O'Testson`, same deposit. `9203` `9203 Sam`/`Sampleton`, deposit `Other Branch - Client Account`.
`match-lines.csv` (intake header, Sept 2026 dates, Type `Cash`). Lines 2-9:
2 `9201`,`  ALEX   testperson `, `100.00`, deposit `test lettings - client account` -> matched
3 `9202`,`Mary Jo O'Testson`, `50.00`, `Test Lettings - Client Account` -> matched
4 `9201`,`Alex Testpersen`, `10.00`, `Test Lettings - Client Account` -> name_mismatch (tenant = 9201)
5 `9203`,`Sam Sampleton`, `20.00`, `Test Lettings - Client Account` -> deposit_mismatch (tenant = 9203)
6 `9203`,`Sam Smith`, `30.00`, `Test Lettings - Client Account` -> name_mismatch (both fail, so the name wins)
7 `9299`,`Alex Testperson`, `40.00` -> unmatched (null). 8 blank TID, `Alex Testperson`, `5.00` -> unmatched (null)
9 `9201`,`9201 Alex Testperson`, `1.00` -> name_mismatch (the payer name is not TID-stripped)
Expected counts: matched 2, name_mismatch 3, deposit_mismatch 1, unmatched 2. Total 25600 pence.

## Tests: `server/test/int/agentos-match.test.ts`
Copy the signIn/upload helpers from `server/test/int/agentos-intake.test.ts`, using email `<role>-aom-<run>@example.test`. beforeAll: `TRUNCATE agentos_intake_batches CASCADE`, `DELETE FROM agentos_tenants`, `seedAgentosTenants(pool, match-tenants.csv)`. afterAll: the same deletes, plus `audit_log` rows for agentos_intake_lines, agentos_intake_batches and agentos_tenants. (Int files run sequentially: `fileParallelism: false`.)
- Pure: `normaliseText('  A \t B ')==='a b'`. `expectedTenantName` for `9202 Mary  Jo`. `decideMatch` covers all four statuses, the both-fail case giving name_mismatch, two candidates where one name hits (matched to that row), two candidates both hitting (name_mismatch with null), and two candidates with no hit (name_mismatch with null).
- Upload `match-lines.csv` as staff: 201, `batch.matchCounts` equals the counts above, and rowsTotal is 8.
- DB: match_status and agentos_tenant_id per line_no exactly as in the fixture table (the ids looked up by tid). No line is `pending`. All lines are `posting_status='not_ready'`.
- `GET /api/agentos/intake/:id`: lines carry `matchStatus` and `agentosTenantId` in line order.
- Delete all tenants, then upload the fixture bytes plus an extra `\n` (a new hash): 201, all 8 lines `unmatched`, and counts are `{0,0,0,8}`.

## Edge cases
Blank or unknown TID gives unmatched and never errors. An empty tenant table gives all unmatched. Case, outer and inner whitespace differences match. Punctuation, accents and middle names are NOT normalised (no fuzzy matching). A tenant deleted later sets the id to null through the FK, but the status stays (504 must re-check). A duplicate file gives 409 before matching runs.

## Risks and rollback
SCOPE: `server/test/int/agentos-intake.test.ts:75` asserts every line is `pending`. After this feature it fails because matching runs automatically. The file is outside Scope (only `agentos-match*` is allowed). The coordinator must allow a one-line change to `expect(rows.every((r) => r.match_status !== 'pending' && r.posting_status === 'not_ready')).toBe(true);`.
The contract's Exclusions list also lists `server/test/**`, `plans/**`, `services/agentos/intake*` and `server/test/fixtures/agentos/**`, the same Scope/Exclusions conflict as recon-502.
Rollback: revert the commit. There is no schema change, and existing rows keep their statuses (harmless).

## Out of scope
posting_status and the export (504), manual reassign and re-match (506), UI (505), storing mismatch reasons, payer-name TID stripping, and fuzzy or suggestion matching.

## Verify
`npm run test:int -- agentos-match` exits 0 with every case above green. Then `npm run test:int -- agentos-intake` (after the one-line fix), lint, typecheck, and full test:int with no regressions.
