# APPLY: agentOS receipts features (recon-501..506)

Proposed by: planner, 2026-10-06. Needs human approval, because `.claude/state/feature_list.json` is protected.
Plan: `docs/exec-plans/active/2026-10-06-agentos-receipts.md`. Field source: `docs/agentos/field-spec.md`.

How to apply:
1. Append the 6 objects below to the `features` array in `.claude/state/feature_list.json`, after recon-401.
2. Create the 6 contract files shown further down in `.claude/state/contracts/`.
3. Run `node .claude/bin/hx.cjs feature list`. hx fills `contractHash` itself, so it is left out here.

These fields follow `hx feature schema`: `id` and `title` are required, and `priority`, `area`,
`scope`, `verification`, `status`, `evidence`, `notes` and `dependsOn` are optional.

## JSON entries

```json
{
  "id": "recon-501", "priority": 1001, "area": "phase-5-agentos",
  "title": "Synthetic agentOS tenant seed: agentos_tenants table (TID, ten-/crm- refs, forename '<TID> <First>', surname, managed by, residence, tenancy descriptor, deposit-to client account) + fixture CSV + seed function",
  "user_visible_behavior": "",
  "scope": ["db/migrations/012_*", "server/src/{domain,services}/agentos/seed*", "server/src/domain/agentos/types.ts", "fixtures/agentos/**", "server/test/**/agentos-seed*", "plans/**", "docs/agentos/**"],
  "verification": [{"level": "integration", "cmd": "npm run test:int -- agentos-seed"}],
  "status": "not_started", "evidence": [], "notes": "MEDIUM", "dependsOn": ["recon-102"]
},
{
  "id": "recon-502", "priority": 1002, "area": "phase-5-agentos",
  "title": "Formatted bank record intake: fixed CSV Date,TID,Payer Name,Amount,Type,Will deposit to,Description; incoming only; whole-file reject with line numbers; file-hash dedupe; batches + lines tables",
  "user_visible_behavior": "",
  "scope": ["db/migrations/013_*", "server/src/{domain,services,api}/agentos/intake*", "server/src/api/agentos/routes.ts", "server/src/api/app.ts", "server/test/**/agentos-intake*", "server/test/fixtures/agentos/**", "plans/**"],
  "verification": [{"level": "unit", "cmd": "npm run test:unit -- agentos-intake"}, {"level": "integration", "cmd": "npm run test:int -- agentos-intake"}],
  "status": "not_started", "evidence": [], "notes": "HARD", "dependsOn": ["recon-501"]
},
{
  "id": "recon-503", "priority": 1003, "area": "phase-5-agentos",
  "title": "Match formatted lines to agentOS TID: exact TID + normalised name + deposit-to check -> matched / name_mismatch / deposit_mismatch / unmatched; no fuzzy auto-match",
  "user_visible_behavior": "",
  "scope": ["server/src/{domain,services}/agentos/match*", "server/src/services/agentos/intake*", "server/test/**/agentos-match*", "server/test/fixtures/agentos/**", "plans/**"],
  "verification": [{"level": "integration", "cmd": "npm run test:int -- agentos-match"}],
  "status": "not_started", "evidence": [], "notes": "HARD", "dependsOn": ["recon-502"]
},
{
  "id": "recon-504", "priority": 1004, "area": "phase-5-agentos",
  "title": "Post to agentOS: Take a Payment CSV export (TID, Payment From, Will deposit to, Type, Amount, Description and Card Authorisation Code), export-once, mark posted",
  "user_visible_behavior": "",
  "scope": ["db/migrations/014_*", "server/src/{services,api}/agentos/export*", "server/src/api/agentos/routes.ts", "server/test/**/agentos-export*", "server/test/fixtures/agentos/**", "plans/**"],
  "verification": [{"level": "integration", "cmd": "npm run test:int -- agentos-export"}],
  "status": "not_started", "evidence": [], "notes": "HARD", "dependsOn": ["recon-503"]
},
{
  "id": "recon-505", "priority": 1005, "area": "phase-5-agentos",
  "title": "agentOS review UI at /agentos: upload, status filter, reassign TID (audited), export, mark posted",
  "user_visible_behavior": "Accounts staff upload the formatted bank record, fix non-matched lines, download the Take a Payment sheet and tick lines as posted.",
  "scope": ["web/src/features/agentos/**", "web/src/app/routes.tsx", "web/src/app/navigation.ts", "server/src/{services,api}/agentos/reassign*", "server/src/api/agentos/routes.ts", "server/test/**/agentos-reassign*", "e2e/agentos*", "plans/**"],
  "verification": [{"level": "integration", "cmd": "npm run test:int -- agentos-reassign"}, {"level": "e2e", "cmd": "npm run test:e2e -- agentos"}],
  "status": "not_started", "evidence": [], "notes": "HARD", "dependsOn": ["recon-504"]
},
{
  "id": "recon-506", "priority": 1006, "area": "phase-5-agentos",
  "title": "Journal Transfer export (Description, Nominal Code, entries Branch/Person/Property/Account Type/Account Balance/Amount) - blocked on field-spec Q6",
  "user_visible_behavior": "",
  "scope": ["server/src/{services,api}/agentos/journal*", "server/test/**/agentos-journal*", "web/src/features/agentos/**", "plans/**"],
  "verification": [{"level": "integration", "cmd": "npm run test:int -- agentos-journal"}],
  "status": "blocked", "blockedBy": "human", "blockedReason": "Needs field-spec Q6: when Journal Transfer is used, Nominal Code and Account Type values, zero-sum rule",
  "evidence": [], "notes": "HARD", "dependsOn": ["recon-505"]
}
```

## Contract files

Every contract shares this Exclusions list. It covers protected files and other features' code:
`package.json`, `package-lock.json`, `docker-compose.yml`, `.github/**`, `server/package.json`, `web/package.json`,
`*/tsconfig*.json`, `web/vite.config.ts`, `eslint.config.*`, `vitest.config.*`, `playwright.config.*`,
`server/src/db/migrate.ts`, `scripts/db-test.*`, `db/migrations/001_*`, `db/migrations/002_*`, `db/migrations/00[3-9]_*`,
`db/migrations/01[01]_*`, `server/src/{domain,services,api}/{ingest,matching,receipt,allocation}*/**`,
`server/src/{services,api,jobs}/{vico,xero}/**`, `server/src/jobs/letmc-import/**`, `server/src/api/auth/**`.

### .claude/state/contracts/feature-recon-501.md
```
# Sprint Contract: <title of recon-501 above>

## Scope

<one "- glob" line per scope entry of recon-501>

## Verification Standards

- [integration] `npm run test:int -- agentos-seed`
- fixture loads 12 rows; TID not matching ^\d{4}$ or ref not ^ten-\d+$ is rejected; reseed is idempotent (row count unchanged); tenancy_id links when tenancies.tid exists, else null.

## Exclusions

<shared list>
```

### feature-recon-502.md
Same layout, with recon-502 scope. Verification Standards:
- [unit] `npm run test:unit -- agentos-intake`; [integration] `npm run test:int -- agentos-intake`
- The header must match exactly, in order. Dates are dd/mm/yyyy. Amounts are 2dp and > 0.
  Any bad row (including outgoing or zero rows) rejects the whole file, and the error lists the line
  numbers. Re-uploading the same file returns 409. Amounts are stored as integer pence.

### feature-recon-503.md
Same layout, with recon-503 scope. Verification Standards:
- [integration] `npm run test:int -- agentos-match`
- The fixture hits all 4 statuses. Names are compared after trimming, lowercasing and collapsing
  whitespace, with the leading TID removed from the forename. A line is never auto-assigned
  without an exact TID match.

### feature-recon-504.md
Same layout, with recon-504 scope. Verification Standards:
- [integration] `npm run test:int -- agentos-export`
- The output is byte-equal to `server/test/fixtures/agentos/take-payment.golden.csv`
  (BOM, CRLF, formula-escaped). It contains only `matched` lines. A second export holds 0 rows.
  Mark-posted works only on exported lines.

### feature-recon-505.md
Same layout, with recon-505 scope. Verification Standards:
- [integration] `npm run test:int -- agentos-reassign`; [e2e] `npm run test:e2e -- agentos`
- A reassigned TID re-runs the 503 rules and writes an audit row. Lines that are not `matched`
  cannot be exported from the UI.

### feature-recon-506.md
Same layout, with recon-506 scope. Verification Standards:
- [integration] `npm run test:int -- agentos-journal`. This is defined after Q6 is answered,
  and the feature stays blocked until then.

Note for the coordinator: two scope edits outside the agentos area are needed.
`server/src/api/app.ts` (502) is listed in other contracts' Exclusions, and
`web/src/app/routes.tsx` and `web/src/app/navigation.ts` (505) are in the same position.
Both follow the precedent of earlier features that added a route mount.
