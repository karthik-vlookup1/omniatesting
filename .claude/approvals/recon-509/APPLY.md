# APPLY: agentOS v4 API tenant sync (recon-509)

Proposed by: planner, 2026-10-07. Needs human approval, because `.claude/state/feature_list.json` and `package.json` are protected.
Plan: `plans/recon-509.md`. API map: `docs/agentos/api-v4-schema.json` (recommended_sources).

How to apply:
1. Append the object below to the `features` array in `.claude/state/feature_list.json`, after recon-508.
2. Create the contract file shown further down in `.claude/state/contracts/`.
3. Add the root `package.json` script shown below (protected file).
4. Run `node .claude/bin/hx.cjs feature list`. hx fills `contractHash` itself, so it is left out here.

These fields follow `hx feature schema`: `id` and `title` are required, and `priority`, `area`,
`scope`, `verification`, `status`, `evidence`, `notes` and `dependsOn` are optional.

## JSON entry

```json
{
  "id": "recon-509", "priority": 1009, "area": "phase-5-agentos",
  "title": "Read-only agentOS v4 sync: maintenance tenants + reporting tenancies + deposit lead flags -> agentos_tenants (source api, agentos_oid key, joint tenants share TID, no-TID rows flagged not dropped, GDPR no-null-overwrite), CLI agentos:sync with --dry-run",
  "user_visible_behavior": "An operator runs `npm run agentos:sync -- --dry-run` to see counts and flags, then `npm run agentos:sync -- --replace-seed` once to swap the demo seed for live agentOS tenants that the receipts matcher uses.",
  "scope": ["db/migrations/016_*", "server/src/domain/agentos/{sync*,types.ts}", "server/src/services/agentos/{api-client*,sync*,seed.ts}", "scripts/agentos-sync.ts", "server/test/unit/agentos-sync*", "server/test/int/agentos-sync*", "server/test/fixtures/agentos/api/**", "docs/agentos/**", "plans/**"],
  "verification": [{"level": "unit", "cmd": "npm run test:unit -- agentos-sync"}, {"level": "integration", "cmd": "npm run test:int -- agentos-sync"}, {"level": "integration", "cmd": "npm run test:int -- agentos"}],
  "status": "not_started", "evidence": [], "notes": "HARD", "dependsOn": ["recon-508"]
}
```

## package.json (protected) change

In the root `scripts` block, after `"db:test"`, add:
```json
"agentos:sync": "tsx scripts/agentos-sync.ts",
```
Until this is applied, the coder and tests use `npx tsx scripts/agentos-sync.ts`. Verification does not depend on the script.

## Contract file

### .claude/state/contracts/feature-recon-509.md
```
# Sprint Contract: <title of recon-509 above>

## Scope

<one "- glob" line per scope entry of recon-509>

## Verification Standards

- [unit] `npm run test:unit -- agentos-sync`
- [integration] `npm run test:int -- agentos-sync`; regression `npm run test:int -- agentos`
- The client sends only GET requests with an X-API-KEY header and pages /{offset}/{count} until Count is reached
  (pageSize 3 over 10 fixture records = 4 calls per list). It waits at least 1300 ms between calls and retries
  once after 60 s on 429. Errors never contain the key.
- Fixture of 10 synthetic tenants: a dry run reports created 10 and leaves 0 rows. A real sync creates 10.
  A re-sync gives created 0 / updated 0 / unchanged 10. TID 9701 has 3 rows (joint + another tenancy, flagged
  tid_shared_across_tenancies). The 2 rows without a TID are stored with tid NULL and flag no_tid.
  A 5-digit TID is stored with flag tid_5_digit.
- A null Forename or email from the API never overwrites a stored value.
- Sync refuses while seed rows exist unless replaceSeed is set. replaceSeed refuses when intake lines or journal
  entries reference a seed row.
- No test makes a network call or uses real data. CLI output contains counts only, never names, emails or OIDs.

## Exclusions

package.json, package-lock.json, docker-compose.yml, .github/**, server/package.json, web/package.json,
*/tsconfig*.json, web/vite.config.ts, eslint.config.*, vitest.config.*, playwright.config.*,
server/src/db/migrate.ts, scripts/db-test.*, db/migrations/001_*, db/migrations/002_*, db/migrations/00[3-9]_*,
db/migrations/01[0-5]_*, server/src/{domain,services,api}/{ingest,matching,receipt,allocation}*/**,
server/src/{services,api,jobs}/{vico,xero}/**, server/src/jobs/letmc-import/**, server/src/api/auth/**,
server/src/{domain,services}/agentos/{match,intake,export,reassign,journal}*, server/src/config/env.ts.
```

## Open decisions (block the first live non-dry run, not the build)
1. Value of AGENTOS_DEPOSIT_TO. The API has no deposit-to field, and it must equal the bank file's "Will deposit to" text.
2. Approve the package.json script above.
3. Replace-seed policy: delete seed rows, and refuse if any are referenced.
4. Confirm whether joint tenants share a TID (handled either way).
5. 5-digit TIDs are stored but intake accepts only 4 digits. Decide whether to widen intake in a follow-up feature.
6. GDPR sign-off before real tenant personal data is stored.
7. The tenancy flag-to-status wording in tenancy_descriptor.
8. Where AGENTOS_API_KEY lives (.env only, never committed). A key that was pasted into chat should be rotated.
