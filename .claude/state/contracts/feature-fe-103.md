# Sprint Contract: Review queue: suggestions with confidence + reason, accept / pick another tenancy / remember payer / reject, yet-to-take list with manual match (mirrors backend recon-203); typed mock data until recon-202 API ships

## Scope

- web/src/features/review/**
- web/src/data/review/**
- web/src/app/routes.tsx
- web/src/app/navigation.ts

## Verification Standards

- [static] `npm run lint`
- [static] `npm run typecheck`
- [unit] `npm run test:unit -- src/features/review src/data/review`

## Exclusions

- package.json
- package-lock.json
- .gitignore
- README.md
- docs/FRONTEND.md
- eslint.config.js
- web/package.json
- web/tsconfig*.json
- web/vite.config.ts
- web/index.html
- web/public/**
- web/src/main.tsx
- web/src/vite-env.d.ts
- web/src/test/**
- web/src/theme/**
- web/src/components/**
- web/src/lib/**
- web/src/app/**
- web/src/features/auth/**
- web/src/data/auth/**
- web/src/features/users/**
- web/src/data/users/**
- web/src/app/routes.tsx
- web/src/app/navigation.ts
- web/src/features/imports/**
- web/src/data/imports/**
- web/src/features/transactions/**
- web/src/data/transactions/**
- web/src/features/receipts/**
- web/src/data/receipts/**
- web/src/features/tenancies/**
- web/src/data/tenancies/**
- web/src/features/exports/**
- web/src/data/exports/**
- web/src/features/xero/**
- web/src/data/xero/**
- web/src/features/dashboard/**
- web/src/data/dashboard/**
