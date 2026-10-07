<!--hx-issue
{
  "id": "ISSUE-0009",
  "title": "Full e2e suite trips the sign-in rate limit (20 logins / 15 min per IP)",
  "status": "resolved-pending-review",
  "severity": "medium",
  "skill": "issue-solve",
  "scope": [
    "server/src/api/auth/routes.ts",
    "server/src/api/auth/rate-limit.ts",
    "playwright.config.ts",
    "e2e/**"
  ],
  "verification": [
    "npm run test:e2e"
  ],
  "source": "manual",
  "attempts": 1,
  "createdAt": "2026-10-07T15:47:45.279Z",
  "updatedAt": "2026-10-07T16:40:55.782Z",
  "contractHash": "52c066d13bbbc611"
}
-->




server/src/api/auth/routes.ts:39 hard-codes ipRateLimit({max:20, windowMs:15min}). The full e2e run (30 tests, workers 1, one IP) now logs in more than 20 times, so 9 later specs (property, receipts, rent, review, tenancies) fail at the post-login toHaveURL('/') step. They pass when run alone (tenancies+property 6/6). Proposed fix (needs owner approval: auth/security + protected playwright.config.ts): make max configurable via an env var with the current default, set it high only in the e2e serverEnv; or reuse a signed-in storageState in e2e.

## Debug Log

- What failed? 
- Which signal proves the failure? 
- Which layer owns the failure? 
- What changed after the fix? 
- Did the app restart cleanly? 
- Did the same workload pass after rerun?
