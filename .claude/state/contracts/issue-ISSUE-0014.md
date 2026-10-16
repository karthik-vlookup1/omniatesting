# Sprint Contract: Vico export: read-only VECO landed check per export in Earlier exports

## Scope

- server/src/services/vico/**
- server/src/api/vico/**
- server/src/api/app.ts
- db/migrations/021_*
- web/src/features/vico/**
- server/test/unit/vico*
- server/test/int/vico*
- plans/**

## Verification Standards

- [unit] `npm run typecheck`
- [unit] `npx vitest run --project unit server/test/unit/vico-landed.test.ts server/test/unit/vico.test.ts`
- [unit] `npx vitest run --project int server/test/int/vico.test.ts server/test/int/vico-edges.test.ts server/test/int/vico-landed.test.ts`
- [unit] `npx eslint server/src/services/vico server/src/api/vico web/src/features/vico server/test/unit/vico-landed.test.ts server/test/int/vico-landed.test.ts`

## Exclusions

- (none)
