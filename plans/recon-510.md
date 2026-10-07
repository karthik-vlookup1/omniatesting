# recon-510 plan (FINAL, revised 2026-10-07 after owner answers 1-5): reference-driven receipts matching
Goal: who paid decides how a line matches. A TID means a council or third party paid. An optional new "NI Number" column, holding a UK NI number or a sort code + account number, means the tenant paid. Payer name and deposit-to are never compared with the tenant. "Will deposit to" resolves to an Omnia bank account and is only flagged when unknown. The sync no longer needs AGENTOS_DEPOSIT_TO. GDPR is approved: only the hash and the last 3-4 characters are stored.
Facts: the agentOS v4 API has no NI number and no payer account (api-v4-schema.json `not_available_anywhere`). Omnia core has `tenants.ni_hash` and `payer_bank_accounts.account_hash`, both via `secure_hash`, and every pool connection sets `app.hash_key`. Core `tenancies.tid` is `'T1234'`, while agentOS tid is `'1234'`. The receiving accounts already exist as core `bank_accounts` codes (HSBC, LLOYDS, APOLLO_TW, REDSTONE, ARMY, ISL), and the existing POST /api/bank-accounts adds more.

## Files
New: db/migrations/017_agentos_reference_matching.sql; server/src/services/agentos/accounts.service.ts; scripts/agentos-accounts.ts; server/test/int/agentos-reference.test.ts.
Modify: server/src/domain/agentos/{intake,match,sync,types}.ts; server/src/services/agentos/{intake,match,reassign,export,sync}.service.ts, api-client.ts; scripts/agentos-sync.ts; web/src/features/agentos/{api.ts,LinesTable.tsx,ReassignModal.tsx,IntakeUploadCard.tsx,agentos.test.tsx}; e2e/agentos.spec.ts; server/test/int/agentos-{match,pipeline,reassign,export,sync,intake}*.test.ts; server/test/unit/agentos-{sync,intake}*.test.ts; docs/agentos/field-spec.md. Protected (APPLY only): package.json `agentos:accounts`.

## Intake format (REVISED)
- Two headers are accepted: the existing 7 (`INTAKE_HEADERS`), or those 7 followed by `NI Number` (`INTAKE_HEADERS_V2`). Any other header is bad_header, and the message lists both.
- The row column count must equal the header length. The TID column is unchanged: `^[Tt]?\d{4}$` or blank.
- The NI Number cell is trimmed:
  - blank: no reference;
  - `isValidNi(cell)` (lib/crypto): kind `ni`, key `normaliseIdentifier(cell)`, last 3;
  - otherwise, if the cell without spaces and hyphens is 14-16 digits: kind `account`, key `payerAccountKey(first 6, rest)`, last 4;
  - anything else is a row error on field `NI Number`, reason `must be a UK NI number, a sort code + account number, or blank`. The reason never echoes the value.
- The key lives in memory only. It is never logged or returned.

## Matching rule and precedence (REVISED; decideMatch)
- Line kind: `ni`/`account` when NI Number is set, otherwise `tid` when the TID is set, otherwise null.
- payerType: `tenant` for ni/account, `third_party` for tid.
- Precedence when both are set: the NI Number decides the payer (tenant). The candidate TIDs are the union of the TIDs the reference resolves to in core and the TID column. If core resolves nothing, the TID column is used and the payer stays tenant. If core resolves a different TID, the result is `ambiguous`.
Input `{kind, tids: string[] (distinct), preferredNames: string[]}`:
1. kind null, or tids empty: `unmatched`.
2. tids length greater than 1: `ambiguous`.
3. No agentos_tenants row for the TID: `unmatched`.
4. kind ni or account, and exactly one candidate whose `expectedTenantName` is in the normalised preferredNames: `matched` with that tenant.
5. One candidate, or all candidates on one non-null tenancyOid: `matched` with the lead (`find(isHeadTenant) ?? [0]`). Otherwise `ambiguous`.
Statuses: `matched | ambiguous | unmatched`.

## Steps
1. **017** (BEGIN/COMMIT; `SET LOCAL app.user_email='migration:017'`):
   a. `agentos_norm(text)`: IMMUTABLE sql, `lower(regexp_replace(btrim(t),'\s+',' ','g'))`.
   b. `agentos_deposit_aliases (alias_norm text PK CHECK (alias_norm <> '' AND alias_norm = agentos_norm(alias_norm)), bank_account_code text NOT NULL, created_at timestamptz NOT NULL DEFAULT now())`. No FK, so a TRUNCATE of bank_accounts cannot cascade. Seed `hsbc, apollo hsbc -> HSBC; lloyds -> LLOYDS; tw, apollo tw -> APOLLO_TW; isl -> ISL; army -> ARMY; redstone -> REDSTONE`.
   c. `agentos_deposit_account(t text) RETURNS text STABLE`: the code of the single active bank_accounts row where `agentos_norm(code)` or `agentos_norm(replace(code,'_',' '))` equals `agentos_norm(t)`, or whose code is the alias target. If 0 or more than 1 match, return NULL.
   d. On agentos_intake_lines add `ref_kind text CHECK (ref_kind IN ('ni','account'))`, `ref_hash text`, `ref_last text`, `payer_type text CHECK (payer_type IN ('tenant','third_party'))`, `receiving_account_code text`. Add CHECK `(ref_kind IS NULL) = (ref_hash IS NULL)` and an index on (ref_hash).
   e. Data fix: rows that are matched, deposit_mismatch, or name_mismatch with a tenant become `matched, payer_type='third_party'`. Remaining name_mismatch becomes `ambiguous`. Set `receiving_account_code = agentos_deposit_account(deposit_to)`.
   f. Drop `agentos_intake_lines_match_status_check` (exact name, no IF EXISTS) and re-add it as `IN ('pending','matched','ambiguous','unmatched')`. Add CHECK `(match_status='matched') = (payer_type IS NOT NULL)`.
   g. `agentos_tenants.deposit_to DROP NOT NULL`, then `UPDATE ... SET deposit_to=NULL WHERE source='api'`.
2. **intake.ts**: parse as above. IntakeLineInput adds `ref: {kind:'ni'|'account'; key: string; last: string} | null`. Update the header comment.
3. **intake.service.ts**: the INSERT goes to 13 params per row and adds `ref_kind`, `ref_hash = secure_hash($k)` and `ref_last`. The create result adds `unresolvedRefs: number` next to matchCounts. IntakeLineDto adds `payerType`, `reference` (SQL `CASE ref_kind WHEN 'ni' THEN '•••••'||ref_last WHEN 'account' THEN '****'||ref_last END`) and `receivingAccount` (the code).
4. **match.ts**: types and rule as above. MatchCandidate is `{id, tid, forename, surname, agentosRef, tenancyOid, isHeadTenant}`. MatchCounts is `{matched, ambiguous, unmatched}`.
5. **match.service.ts**: `matchIntakeBatch` returns `{counts, unresolvedRefs}`, where unresolvedRefs counts ni/account lines that core resolved to no TID. Run two lookups per batch.
   NI: `FROM agentos_intake_lines l JOIN tenants tn ON tn.ni_hash=l.ref_hash JOIN tenancy_tenants tt ON tt.tenant_id=tn.id AND tt.left_on IS NULL JOIN tenancies t ON t.id=tt.tenancy_id AND tenancy_live_on(t,l.received_on) WHERE l.batch_id=$1 AND l.ref_kind='ni'`, returning `l.id, substr(t.tid,2) AS tid, tn.full_name`.
   Account: `JOIN payer_bank_accounts p ON p.account_hash=l.ref_hash AND p.is_active AND p.tenancy_id IS NOT NULL JOIN tenancies t ON t.id=p.tenancy_id AND tenancy_live_on(t,l.received_on) LEFT JOIN tenants tn ON tn.id=p.tenant_id`.
   Then build the tids per the precedence rule, load candidates with `ORDER BY is_head_tenant DESC, agentos_ref NULLS LAST, id`, decide, and UPDATE status, tenant and payer_type via unnest. Finally `SET receiving_account_code = agentos_deposit_account(deposit_to) WHERE batch_id=$1`.
6. **reassign.service.ts**: call decideMatch with `kind = cur.ref_kind ?? 'tid'`, `tids=[input.tid]`, `preferredNames=[]`, and SET payer_type. RETURNING adds payer_type, reference and receiving_account_code. ReassignTenantDto drops depositTo.
7. **export.service.ts:67**: `t.deposit_to` becomes `l.deposit_to` (the raw bank text). Payment From stays as the agentOS tenant name.
8. **accounts.service.ts + scripts/agentos-accounts.ts**: `listDepositAccounts(pool)` returns active bank_accounts `{code, bankName, aliases[]}`. `addDepositAlias(db, code, text)`: an unknown or inactive code gives bad_request, and a duplicate alias, or one equal to another code's norm, gives conflict. CLI (pattern: scripts/agentos-sync.ts): `--list` | `--add-alias <CODE> <text>`, and unknown args exit 1 with usage.
9. **sync**: remove depositTo from sync.ts:82,151, types.ts:113, sync.service.ts:13,51-52 and UPSERT (drop the column and `$15`, renumber), from api-client.ts:14,25,32, and from scripts/agentos-sync.ts:3,33.
10. **web**: MatchStatus becomes `matched|ambiguous|unmatched` (label "Ambiguous", orange). Badges: teal "Tenant paid" for payer tenant, grape "Council / third party" for third_party, and "Unknown account" when receivingAccount is null. The TID cell shows `l.tid ?? l.reference ?? ''`. IntakeUploadCard shows matched / ambiguous / unmatched, plus `{n} tenant references not found in Omnia` when unresolvedRefs > 0. ReassignModal label is `t.name`.
11. **Tests**:
   - 7-column fixtures still parse (backward compatible). Counts: match-lines {matched 6, ambiguous 0, unmatched 2}, export-lines {5,0,1}, demo {11,0,2}, all third_party.
   - Export golden: lines 2,3,4,5,7, 117501, the payment deposit text, with ids pinned for 2,3,4,5,7. Pipeline exports 12 rows / 487275, and the reassign suite exports 6.
   - agentos-reference (new, 8-column CSVs): copy the beforeAll/clean pattern of server/test/int/payer-account.test.ts (syncTenancies + vecoRows). Set `tenants.ni_hash = secure_hash('QQ123456C')` on T9001's lead. Insert payer_bank_accounts `secure_hash('12345612345678')`, last4 '5678', holder_type and payer 'tenant', for T9002. Insert api agentos_tenants for 9001 and 9002. Use a received date where `tenancy_live_on` holds, and assert that first.
     NI and account cases: `QQ 12 34 56 C` matches 9001 as tenant with reference '•••••56C'. `12-34-56 12345678` matches 9002 as tenant. NI QQ… plus TID 9001 is matched; NI QQ… plus TID 9002 is ambiguous. An unknown NI with a blank TID is unmatched and gives unresolvedRefs 1. An unknown NI plus TID 9002 is matched as tenant. `12345` is a 400 on field NI Number. GDPR: no agentos_intake_lines row, audit_log row or response body contains 'QQ123456' or '12345678'.
     Deposit and aliases: 'hsbc ' resolves to HSBC (after inserting that bank code ON CONFLICT DO NOTHING) and 'Nowhere' to null. Also cover the alias service paths.
   - Pure decideMatch: rules 1-5 plus precedence. Intake unit: both headers, a bad 8th header, and the NI/account/invalid cells.
   - e2e (7-column CSV): line 4 becomes `9203,Testshire Council HB,…`, and a new line 5 is TID 9299. Expect line-4 Council / third party, line-2 Unknown account, export count 2 then 3, and no Mark posted on line-5.
12. **docs**: field-spec §5 (both headers, NI Number cell, GDPR handling), §6 (rule and precedence), §8, §10 (11/0/2, export 12), §11 (drop AGENTOS_DEPOSIT_TO), and a deposit-accounts note.

## Edge cases
A council payment on a joint tenancy goes to the lead. An NI on two live tenancies is ambiguous. Core has no NI or account data: the line is unmatched (counted in unresolvedRefs, reassignable by TID, payer stays tenant). Banks not installed means "Unknown account" (soft). 5-digit TIDs are still a row error.

## Risks and rollback
Step 1f needs the exact constraint name; STOP if it fails. The plaintext travels only as a SQL parameter into `secure_hash`, as the core ingest does. Never log query params or parse results. Renaming the status changes the API shape, and the web changes with it. Rollback: revert the code. The down migration drops the new columns, tables and functions and maps ambiguous back to name_mismatch. The 1e data fix is one-way (it is audited).

## Out of scope
NI or accounts from agentOS (not in the API), editing core NI, per-tenant reassign, an accounts UI, a canonical deposit label, and the recon-509 tenancy_id join ('1234' against 'T1234'; follow-up).

## Verify
`npm run test:unit -- agentos`, `npm run test:int -- agentos`, `npm run test:web -- agentos`, `npm run test:e2e -- agentos.spec`, `npm run db:test`, lint and typecheck all exit 0 with the counts above. `grep -rE "deposit_mismatch|name_mismatch|AGENTOS_DEPOSIT_TO" server/src web/src scripts` returns 0 hits.
