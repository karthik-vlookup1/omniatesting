# Sprint Contract: Synthetic agentOS tenant seed: agentos_tenants table (TID, ten-/crm- refs, forename '<TID> <First>', surname, managed by, residence, tenancy descriptor, deposit-to client account) + fixture CSV + seed function

## Scope

- db/migrations/012_*
- server/src/{domain,services}/agentos/seed*
- server/src/domain/agentos/types.ts
- fixtures/agentos/**
- server/test/**/agentos-seed*
- plans/**
- docs/agentos/**

## Verification Standards

- [integration] `npm run test:int -- agentos-seed`
- fixture loads 12 rows; TID not matching ^d{4}$ or ref not ^ten-d+$ is rejected; reseed is idempotent (row count unchanged); tenancy_id links when tenancies.tid exists, else null.

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
