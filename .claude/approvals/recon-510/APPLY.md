# APPLY: reference-driven agentOS receipts matching (recon-510) (FINAL 2026-10-07)

Proposed by: planner, 2026-10-07, finalised after owner answers 1-5. Needs human approval, because `.claude/state/feature_list.json` and `package.json` are protected.
Plan: `plans/recon-510.md`.

How to apply:
1. Append the object below to the `features` array in `.claude/state/feature_list.json`, after recon-509.
2. Create the contract file shown further down in `.claude/state/contracts/`.
3. Add the root `package.json` script shown below (protected file).
4. Run `node .claude/bin/hx.cjs feature list`. hx fills `contractHash` itself, so it is left out here.

## JSON entry

```json
{
  "id": "recon-510", "priority": 1010, "area": "phase-5-agentos",
  "title": "agentOS receipts: reference-driven matching (optional 'NI Number' intake column = NI or sort code+account => tenant payer via core tenants.ni_hash / payer_bank_accounts; TID only => council/third-party payer -> lead tenant; NI Number takes precedence; payer name and deposit-to never checked; statuses matched/ambiguous/unmatched), deposit-to resolved to core bank_accounts with addable aliases (unknown = flag only), sync no longer needs AGENTOS_DEPOSIT_TO",
  "user_visible_behavior": "Receipts files may carry an extra 'NI Number' column (old 7-column files still work). A row with an NI number or sort code + account matches the tenant through Omnia core data and shows 'Tenant paid', with the identifier masked. A row with only a TID shows 'Council / third party'. Upload reports how many tenant references Omnia could not find. An unrecognised 'Will deposit to' shows 'Unknown account' but still exports with the raw bank text. `npm run agentos:accounts -- --add-alias <CODE> <text>` adds a deposit alias.",
  "scope": ["db/migrations/017_*", "server/src/domain/agentos/{intake,match,sync,types}.ts", "server/src/services/agentos/{intake,match,reassign,export,sync,accounts}.service.ts", "server/src/services/agentos/api-client.ts", "scripts/agentos-{sync,accounts}.ts", "web/src/features/agentos/**", "e2e/agentos.spec.ts", "server/test/unit/agentos-*", "server/test/int/agentos-*", "server/test/fixtures/agentos/**", "docs/agentos/**", "plans/**"],
  "verification": [{"level": "unit", "cmd": "npm run test:unit -- agentos"}, {"level": "integration", "cmd": "npm run test:int -- agentos"}, {"level": "unit", "cmd": "npm run test:web -- agentos"}, {"level": "e2e", "cmd": "npm run test:e2e -- agentos.spec"}],
  "status": "not_started", "evidence": [], "notes": "HARD", "dependsOn": ["recon-509"]
}
```

## package.json (protected) change

In the root `scripts` block, after `"agentos:sync"`, add:
```json
"agentos:accounts": "tsx scripts/agentos-accounts.ts",
```
Until this is applied, use `npx tsx scripts/agentos-accounts.ts`. Verification does not depend on the script.

## Contract file

### .claude/state/contracts/feature-recon-510.md
```
# Sprint Contract: <title of recon-510 above>

## Scope

<one "- glob" line per scope entry of recon-510>

## Verification Standards

- [unit] `npm run test:unit -- agentos`; [web] `npm run test:web -- agentos`
- [integration] `npm run test:int -- agentos`; [e2e] `npm run test:e2e -- agentos.spec`; plus `npm run db:test`, lint, typecheck
- Header: the existing 7 columns, or those 7 plus "NI Number". The NI Number cell is a valid UK NI -> ni, 14-16
  digits -> account, blank -> none, anything else -> a 400 on field "NI Number" (value not echoed). The TID rule is
  unchanged.
- Rule: NI Number set -> payer tenant. Candidate TIDs = core matches (tenants.ni_hash or payer_bank_accounts ->
  live tenancy) plus the TID column. No core match -> the TID column alone. A different core TID -> ambiguous.
  TID only -> payer third_party, lead tenant. Nothing resolved -> unmatched. Payer name and deposit-to never change
  the status.
- Counts: match-lines {matched 6, ambiguous 0, unmatched 2}; export-lines {5,0,1}, export 5 rows, 117501, golden
  bytes; demo {11,0,2}, export 12 rows, 487275; reassign suite exports 6. The upload returns unresolvedRefs (an
  unknown NI with a blank TID -> 1).
- GDPR (approved): NI and account values are stored only as secure_hash plus the last 3 or 4 characters. No
  plaintext appears in agentos_intake_lines, audit_log, API responses, logs or CLI output (asserted by test).
- Deposit text resolves case- and space-insensitively to an active bank_accounts code, or to an alias seeded in
  017 (HSBC, Apollo HSBC, Lloyds, TW, Apollo TW, ISL, Army, Redstone). Unknown -> NULL plus an "Unknown account"
  badge, export never blocked, and the export writes the raw bank text.
- Sync runs with no AGENTOS_DEPOSIT_TO set, and API tenant rows have deposit_to NULL.
- Synthetic data only. No network calls.

## Exclusions

package.json, package-lock.json, docker-compose.yml, .github/**, server/package.json, web/package.json,
*/tsconfig*.json, web/vite.config.ts, eslint.config.*, vitest.config.*, playwright.config.*,
server/src/db/migrate.ts, scripts/db-test.*, db/migrations/00[1-9]_*, db/migrations/01[0-6]_*, server/src/lib/crypto.ts,
server/src/{domain,services,api}/{ingest,matching,receipt,allocation,bank-account}*/**, server/src/{services,api,jobs}/{vico,xero}/**,
server/src/jobs/{letmc-import,veco-sync}/**, server/src/api/auth/**, server/src/services/agentos/{journal,seed}*,
server/src/config/env.ts.
```

## Settled by the owner (2026-10-07)
1. Bank texts are the six names, matched case- and space-insensitively. Aliases can be added later through the
   accounts script.
2. An unknown account is a flag only. The export writes the raw bank text.
3. A separate optional "NI Number" column holds an NI number or the payer's sort code + account number. A TID means
   a council or third party paid.
4. It is not known whether core holds NI or bank data for agentOS tenants. Build anyway: an unresolved tenant
   reference is unmatched, counted, and reassignable.
5. GDPR is approved: hash plus last 3-4 characters only, never plaintext.
6. The `agentos:accounts` script is included above.

## Open questions
None blocking the build. Follow-up, not in this feature: the recon-509 sync looks up core tenancies by "1234"
while core stores "T1234", so agentos_tenants.tenancy_id is always NULL.
