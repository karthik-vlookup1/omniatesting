# Sprint Contract: agentOS receipts: reference-driven matching (optional 'NI Number' intake column = NI or sort code+account => tenant payer via core tenants.ni_hash / payer_bank_accounts; TID only => council/third-party payer -> lead tenant; NI Number takes precedence; payer name and deposit-to never checked; statuses matched/ambiguous/unmatched), deposit-to resolved to core bank_accounts with addable aliases (unknown = flag only), sync no longer needs AGENTOS_DEPOSIT_TO

## Scope

- db/migrations/017_*
- server/src/domain/agentos/{intake,match,sync,types}.ts
- server/src/services/agentos/{intake,match,reassign,export,sync,accounts}.service.ts
- server/src/services/agentos/api-client.ts
- scripts/agentos-{sync,accounts}.ts
- web/src/features/agentos/**
- e2e/agentos.spec.ts
- server/test/unit/agentos-*
- server/test/int/agentos-*
- server/test/fixtures/agentos/**
- docs/agentos/**
- plans/**

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
