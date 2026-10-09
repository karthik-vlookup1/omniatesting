# Sprint Contract: Full e2e suite trips the sign-in rate limit (20 logins / 15 min per IP)

## Scope

- server/src/api/auth/routes.ts
- server/src/api/auth/rate-limit.ts
- playwright.config.ts
- e2e/**

## Verification Standards

- [unit] `npm run test:e2e`

## Exclusions

- (none)
