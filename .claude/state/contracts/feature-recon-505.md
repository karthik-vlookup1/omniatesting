# Sprint Contract: agentOS review UI at /agentos: upload, status filter, reassign TID (audited), export, mark posted

## Scope

- web/src/features/agentos/**
- web/src/app/routes.tsx
- web/src/app/navigation.ts
- server/src/{services,api}/agentos/reassign*
- server/src/api/agentos/routes.ts
- server/test/**/agentos-reassign*
- e2e/agentos*
- plans/**

## Verification Standards

- [integration] `npm run test:int -- agentos-reassign`
- [e2e] `npm run test:e2e -- agentos`
- A reassigned TID re-runs the 503 rules and writes an audit row. Non-matched lines cannot be exported from the UI.

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
