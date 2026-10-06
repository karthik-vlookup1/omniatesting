# Sprint Contract: Match formatted lines to agentOS TID: exact TID + normalised name + deposit-to check -> matched / name_mismatch / deposit_mismatch / unmatched; no fuzzy auto-match

## Scope

- server/src/{domain,services}/agentos/match*
- server/src/services/agentos/intake*
- server/test/**/agentos-match*
- server/test/fixtures/agentos/**
- plans/**

## Verification Standards

- [integration] `npm run test:int -- agentos-match`
- Fixture hits all 4 statuses. Names compared after trim, lowercase, whitespace collapse, with the leading TID removed from the forename. Never auto-assigned without an exact TID match.

## Exclusions

- package.json
- package-lock.json
- docker-compose.yml
- .github/**
- server/package.json
- web/package.json
- */tsconfig*.json
- web/vite.config.ts
- eslint.config.*
- vitest.config.*
- playwright.config.*
- server/src/db/migrate.ts
- scripts/db-test.*
- db/migrations/001_*
- db/migrations/002_*
- db/migrations/00[3-9]_*
- db/migrations/01[01]_*
- server/src/{domain,services,api}/{ingest,matching,receipt,allocation}*/**
- server/src/{services,api,jobs}/{vico,xero}/**
- server/src/jobs/letmc-import/**
- server/src/api/auth/**
