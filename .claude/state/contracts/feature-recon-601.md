# Sprint Contract: Omnia ledger (append-only double-entry: ledger_transactions + ledger_postings, zero-sum, idempotency key, balance = sum of postings) + single Take a Payment API for one agentOS tenant (deposit-to = active bank account, type from extendable list seeded Card, amount, description, optional card auth code), posted to the ledger and pushed out via the existing Take a Payment CSV export

## Scope

- db/migrations/018_*
- server/src/domain/ledger/**
- server/src/services/ledger/**
- server/src/services/agentos/payment.service.ts
- server/src/api/agentos/routes.ts
- server/test/unit/ledger-*
- server/test/int/agentos-payment*
- server/test/fixtures/agentos/**
- docs/agentos/**
- plans/**

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
