# Sprint Contract: Multi-row Journal Transfer: 2-20 entries (agentOS tenant, account type, signed amount) netting to zero, posted to the Omnia ledger (existing transfers backfilled), idempotent by clientRequestId; recon-506 two-tenant body and CSV bytes unchanged

## Scope

- db/migrations/019_*
- server/src/domain/agentos/journal.ts
- server/src/services/agentos/journal.service.ts
- server/src/services/ledger/**
- server/src/api/agentos/routes.ts
- server/test/unit/agentos-journal*
- server/test/int/agentos-journal*
- docs/agentos/**
- plans/**

## Verification Standards

- [unit] `npm run test:unit -- agentos-journal`; [integration] `npm run test:int -- agentos`; plus `npm run db:test`, lint, typecheck
- Entries: 2-20, integer non-zero pence, sum 0, no repeated (TID, account type) pair, every tenant exists and has a TID;
  otherwise 400 naming the entry, and no rows written. The DB also refuses < 2 entries or a non-zero sum at COMMIT.
- Every transfer (new, legacy body, or pre-existing via 019 backfill) has exactly one ledger_transactions row whose
  tenant postings equal its entries.
- Same clientRequestId -> 200, same transfer, one ledger tx; different details -> 409.
- Legacy body and CSV: all existing agentos-journal int tests pass unchanged; a legacy transfer's CSV bytes are identical.
  A 3-entry transfer exports 3 rows in line order with each entry's Account Type.
- Nominal Code and Account Type stay free text (decision 2026-10-06). Synthetic data only. No network calls.

## Exclusions

package.json, package-lock.json, docker-compose.yml, .github/**, server/package.json, web/package.json,
*/tsconfig*.json, web/vite.config.ts, eslint.config.*, vitest.config.*, playwright.config.*,
server/src/db/migrate.ts, scripts/db-test.*, db/migrations/00[1-9]_*, db/migrations/01[0-8]_*, server/src/lib/crypto.ts,
server/src/{domain,services,api}/{ingest,matching,receipt,allocation,bank-account,adjustment,rent}*/**,
server/src/{services,api,jobs}/{vico,xero}/**, server/src/jobs/**, server/src/api/auth/**, server/src/api/app.ts,
server/src/services/agentos/{seed,intake,match,reassign,sync,accounts,export,payment}*, server/src/config/env.ts, web/**.
