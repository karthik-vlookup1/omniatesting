# APPLY: Omnia ledger + single Take a Payment (recon-601)

Proposed by: planner, 2026-10-07, after owner answers (own ledger; 601/602 first; Card only; scope exclusions).
Needs human approval because `.claude/state/feature_list.json` is protected. No other protected file changes.
Plan: `plans/recon-601.md`. The UI is split out to recon-603.

How to apply:
1. Append the object below to the `features` array in `.claude/state/feature_list.json`, after recon-510.
2. Create the contract file shown further down in `.claude/state/contracts/`.
3. Run `node .claude/bin/hx.cjs feature list`. hx fills `contractHash` itself.

## JSON entry

```json
{
  "id": "recon-601", "priority": 1101, "area": "phase-6-letmc-parity",
  "title": "Omnia ledger (append-only double-entry: ledger_transactions + ledger_postings, zero-sum, idempotency key, balance = sum of postings) + single Take a Payment API for one agentOS tenant (deposit-to = active bank account, type from extendable list seeded Card, amount, description, optional card auth code), posted to the ledger and pushed out via the existing Take a Payment CSV export",
  "user_visible_behavior": "POST /api/agentos/payments takes one payment for an agentOS tenant and returns it with the tenant's Omnia ledger balance; repeating the same clientRequestId returns the same payment. GET /api/agentos/ledger/<tid> shows balance and postings. POST /api/agentos/payments/exports makes a Take a Payment CSV (same columns as recon-504) downloadable at /api/agentos/exports/<id>.csv; payments can then be marked posted.",
  "scope": ["db/migrations/018_*", "server/src/domain/ledger/**", "server/src/services/ledger/**", "server/src/services/agentos/payment.service.ts", "server/src/api/agentos/routes.ts", "server/test/unit/ledger-*", "server/test/int/agentos-payment*", "server/test/fixtures/agentos/**", "docs/agentos/**", "plans/**"],
  "verification": [{"level": "unit", "cmd": "npm run test:unit -- ledger"}, {"level": "integration", "cmd": "npm run test:int -- agentos"}],
  "status": "not_started", "evidence": [], "notes": "HARD", "dependsOn": ["recon-510"]
}
```

## Contract file

### .claude/state/contracts/feature-recon-601.md
```
# Sprint Contract: <title of recon-601 above>

## Scope

<one "- glob" line per scope entry of recon-601>

## Verification Standards

- [unit] `npm run test:unit -- ledger`; [integration] `npm run test:int -- agentos`; plus `npm run db:test`, lint, typecheck
- Ledger: every ledger_transactions row has >= 2 postings summing to 0 (deferred trigger), idempotency_key =
  kind:source_id is UNIQUE, UPDATE/DELETE on ledger rows raises 'append-only'. Tenant balance = sum of postings, + = paid in.
- Take a Payment: tenant posting +amount and bank posting -amount on the chosen bank_accounts code; same clientRequestId
  -> 200 and still one payment and one ledger tx; same id with different details -> 409; invalid input -> 400 and no rows;
  readonly -> 403; signed out -> 401.
- Export: CSV header and cell rules identical to recon-504 (TID, Payment From, Will deposit to, Type, Amount,
  Description and Card Authorisation Code); description cell = non-empty parts of [description, 'Auth <code>',
  'Recon <id>'] joined ' | '; each payment exported once; second export header-only; intake batch exports never include
  manual payments. Existing agentos int tests (export golden bytes, journal, pipeline, reference) pass unchanged.
- Audit rows exist for agentos_payments and ledger_transactions inserts. Synthetic data only. No network calls.

## Exclusions

package.json, package-lock.json, docker-compose.yml, .github/**, server/package.json, web/package.json,
*/tsconfig*.json, web/vite.config.ts, eslint.config.*, vitest.config.*, playwright.config.*,
server/src/db/migrate.ts, scripts/db-test.*, db/migrations/00[1-9]_*, db/migrations/01[0-7]_*, server/src/lib/crypto.ts,
server/src/{domain,services,api}/{ingest,matching,receipt,allocation,bank-account,adjustment,rent}*/**,
server/src/{services,api,jobs}/{vico,xero}/**, server/src/jobs/**, server/src/api/auth/**, server/src/api/app.ts,
server/src/services/agentos/{journal,seed,intake,match,reassign,sync,accounts,export}*, server/src/config/env.ts, web/**.
```

## Settled by the owner (2026-10-07)
1. Omnia keeps its own ledger and pushes out to agentOS/Xero. This supersedes "Xero is the only ledger".
2. Payment types: Card only, list extendable.
3. Out of scope: Request a Payment with App, Import from Online Applicant, referencing/AML/R2R, personal details.

## Open questions (not blocking)
1. Card authorisation code is optional here (not marked required in the screenshot). Should it be required for Card?
2. Who may take payments: writers (accounts + staff + admin, as recon-504/506) or accounts only?
3. Bank-file receipts (recon-504 intake) are not yet posted to the ledger, so balances count only manual payments and
   journals. Proposed follow-up: recon-617. Xero push of ledger transactions is also a later feature.
