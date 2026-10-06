# Sprint Contract: Formatted bank record intake: fixed CSV Date,TID,Payer Name,Amount,Type,Will deposit to,Description; incoming only; whole-file reject with line numbers; file-hash dedupe; batches + lines tables

## Scope

- db/migrations/013_*
- server/src/{domain,services,api}/agentos/intake*
- server/src/api/agentos/routes.ts
- server/src/api/app.ts
- server/test/**/agentos-intake*
- server/test/fixtures/agentos/**
- plans/**

## Verification Standards

- [unit] `npm run test:unit -- agentos-intake`
- [integration] `npm run test:int -- agentos-intake`
- Header must match exactly, in order. Dates dd/mm/yyyy. Amounts 2dp and > 0. Any bad row (incl. outgoing or zero) rejects the whole file with line numbers. Re-uploading the same file returns 409. Amounts stored as integer pence.

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
