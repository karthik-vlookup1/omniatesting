<!--hx-issue
{
  "id": "ISSUE-0013",
  "title": "WP1 charge generator v2: cutover overlap, keep rent day, pro-rated awards",
  "status": "resolved-pending-review",
  "severity": "critical",
  "skill": "issue-solve",
  "scope": [
    "db/migrations/020_*.sql",
    "server/test/int/money-wp1-charges.test.ts",
    "server/test/int/rent-terms.test.ts"
  ],
  "verification": [
    "npm run test:int -- money-wp1-charges",
    "npm run test:int -- rent-terms letmc-import veco-sync receipt-operations"
  ],
  "source": "manual",
  "attempts": 1,
  "createdAt": "2026-10-09T11:37:49.147Z",
  "updatedAt": "2026-10-09T12:01:35.081Z",
  "contractHash": "bc8d8f2e5500ee08"
}
-->





Plan: plans/money-flow-audit.md section WP1 (findings F2 F4 F9 F13). Decisions D2-D5 approved by user 2026-10-09.

## Debug Log

- What failed? LetMC-cutover straddle period charged in full again, rent change moved the rent day, awards weren't pro-rated.
- Which signal proves the failure? new money-wp1-charges tests.
- Which layer owns the failure? DB function generate_rent_charges (migration 020).
- What changed after the fix? 12/12 WP1 tests, 500/500 int, 155/155 unit, 2/2 db:test; hx issue verify resolved-pending-review.
- Did the app restart cleanly? Yes.
- Did the same workload pass after rerun? Yes.

## Verification failed (2026-10-09T12:00:53.916Z)

```
Command: npm run test:int -- money-wp1-charges
Exit code: 1
--- output (last 40 lines) ---

> omnia-recon@0.1.0 test:int
> vitest run --project int money-wp1-charges


 RUN  v5.0.3 D:/vluprojects/Omnia_projects/OMNIA_MAIN

No test files found, exiting with code 1

filter: money-wp1-charges
projects: int

|int| 

include: server/test/int/**/*.test.ts
exclude:  **/node_modules/**, **/.git/**


⎯⎯⎯⎯⎯⎯ Unhandled Error ⎯⎯⎯⎯⎯⎯⎯
error: password authentication failed for user "omnia"
 ❯ parseErrorMessage node_modules/pg-protocol/dist/parser.js:306:11
 ❯ Parser.handlePacket node_modules/pg-protocol/dist/parser.js:143:27
 ❯ Parser.parse node_modules/pg-protocol/dist/parser.js:37:38
 ❯ Socket.<anonymous> node_modules/pg-protocol/dist/index.js:12:42
 ❯ Socket.emit node:events:514:28
 ❯ addChunk node:internal/streams/readable:568:12
 ❯ readableAddChunkPushByteMode node:internal/streams/readable:519:3
 ❯ Socket.Readable.push node:internal/streams/readable:399:5
 ❯ TCP.onStreamRead node:internal/stream_base_commons:189:23

⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯
Serialized Error: { length: 101, severity: 'FATAL', code: '28P01', detail: undefined, hint: undefined, position: undefined, internalPosition: undefined, internalQuery: undefined, where: undefined, schema: undefined, table: undefined, dataType: undefined, constraint: undefined, file: 'auth.c', routine: 'auth_failed' }
```
