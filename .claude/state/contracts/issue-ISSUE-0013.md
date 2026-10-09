# Sprint Contract: WP1 charge generator v2: cutover overlap, keep rent day, pro-rated awards

## Scope

- db/migrations/020_*.sql
- server/test/int/money-wp1-charges.test.ts
- server/test/int/rent-terms.test.ts

## Verification Standards

- [unit] `npm run test:int -- money-wp1-charges`
- [unit] `npm run test:int -- rent-terms letmc-import veco-sync receipt-operations`

## Exclusions

- (none)
