# Sprint Contract: Dev preview mode: run the UI without the backend

## Scope

- web/src/dev/**
- web/src/main.tsx
- web/src/lib/api/**
- web/package.json
- package.json
- README.md

## Verification Standards

- [unit] `npm run lint`
- [unit] `npm run typecheck`
- [unit] `npm run test:unit -- src/dev src/lib`
- [unit] `npm run build`

## Exclusions

- (none)
