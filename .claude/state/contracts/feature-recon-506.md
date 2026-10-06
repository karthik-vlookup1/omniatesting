# Sprint Contract: Journal Transfer export (Description, Nominal Code, entries Branch/Person/Property/Account Type/Account Balance/Amount) - blocked on field-spec Q6

## Scope

- server/src/{services,api}/agentos/journal*
- server/test/**/agentos-journal*
- web/src/features/agentos/**
- plans/**

## Verification Standards

- [integration] `npm run test:int -- agentos-journal`
- Defined after field-spec Q6 is answered; stays blocked until then.

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
