# Sprint Contract: Veco tenancy sync: nightly job reads active tenancies (TID, rent, frequency, property, branch, NI) from omnia_analytics via the Veco read-only MCP into Postgres; NI stored encrypted+hashed+last3; tenancy search by TID/name/NI

## Scope

- server/src/{domain,services,api}/{tenant,tenancy}*/**
- server/src/jobs/veco-sync/**
- web/src/features/{tenants,tenancies}/**
- server/test/**/tenan*
- server/test/**/veco*
- e2e/tenan*
- server/src/api/app.ts
- .env.example
- web/src/app/App.tsx
- web/src/app/Shell.tsx

## Verification Standards

- [integration] `npm run test:int -- tenan veco`
- [e2e] `npm run test:e2e -- tenan`

## Exclusions

- package.json
- package-lock.json
- docker-compose.yml
- .github/**
- server/package.json
- server/tsconfig*.json
- web/package.json
- web/tsconfig*.json
- web/vite.config.ts
- README.md
- docs/ARCHITECTURE.md
- .env.example
- eslint.config.*
- vitest.config.*
- playwright.config.*
- server/src/db/migrate.ts
- scripts/db-test.*
- server/src/lib/crypto*
- server/src/config/**
- server/test/unit/crypto*
- server/test/unit/config*
- server/test/int/crypto*
- server/src/api/auth/**
- server/src/services/auth*
- server/src/db/context*
- server/src/api/app.ts
- web/src/app/**
- web/src/features/auth/**
- server/test/**/auth*
- e2e/auth*
- server/src/{domain,services,api}/{branch,bank-account,landlord,property}*/**
- web/src/features/{branches,bank-accounts,landlords,properties}/**
- server/test/**/property*
- e2e/property*
- server/src/{domain,services,api}/{rent,benefit,payer-split,payment-method}*/**
- server/src/jobs/generate-charges*
- web/src/features/rent-terms/**
- server/test/**/rent*
- e2e/rent*
- server/src/{domain,services,api}/payer-account*/**
- web/src/features/payer-accounts/**
- server/test/**/payer-account*
- server/src/jobs/letmc-import/**
- server/src/api/imports/letmc*
- web/src/features/letmc-import/**
- fixtures/letmc/**
- server/test/**/letmc*
- server/src/{domain,services,api}/ingest/**
- web/src/features/{upload,csv-profiles}/**
- fixtures/banks/**
- server/test/**/ingest*
- web/src/app/App.tsx
- web/src/app/Shell.tsx
- server/src/{services,api}/matching/**
- server/test/**/matching*
- web/src/features/review/**
- e2e/review*
- server/src/{domain,services,api}/{receipt,allocation,remittance,adjustment}*/**
- web/src/features/receipts/**
- server/test/**/receipt*
- server/src/{services,api}/export/statement*
- web/src/features/export/**
- server/test/**/export-statement*
- server/src/{services,api,jobs}/vico/**
- web/src/features/vico/**
- server/test/**/vico*
- server/src/{services,api,jobs}/xero/**
- web/src/features/xero/**
- server/test/**/xero*
- server/src/{services,api}/reports/**
- web/src/features/dashboard/**
- e2e/dashboard*
