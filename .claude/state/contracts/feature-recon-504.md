# Sprint Contract: Post to agentOS: Take a Payment CSV export (TID, Payment From, Will deposit to, Type, Amount, Description and Card Authorisation Code), export-once, mark posted

## Scope

- db/migrations/014_*
- server/src/{services,api}/agentos/export*
- server/src/api/agentos/routes.ts
- server/test/**/agentos-export*
- server/test/fixtures/agentos/**
- plans/**

## Verification Standards

- [integration] `npm run test:int -- agentos-export`
- Output byte-equal to server/test/fixtures/agentos/take-payment.golden.csv (BOM, CRLF, formula-escaped). Only matched lines. A second export holds 0 rows. Mark-posted works only on exported lines.

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
