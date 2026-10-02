# Sprint Contract: User administration (admin only): list users, create, change role, deactivate/reactivate, reset password, via /api/users

## Scope

- web/src/features/users/**
- web/src/data/users/**
- web/src/app/routes.tsx
- web/src/app/navigation.ts

## Verification Standards

- [static] `npm run lint`
- [static] `npm run typecheck`
- [unit] `npm run test:unit -- src/features/users src/data/users`

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
- web/src/features/imports/**
- web/src/data/imports/**
- web/src/app/routes.tsx
- web/src/app/navigation.ts
- web/src/features/transactions/**
- web/src/data/transactions/**
- web/src/features/review/**
- web/src/data/review/**
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
