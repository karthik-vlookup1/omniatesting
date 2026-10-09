<!--hx-issue
{
  "id": "ISSUE-0011",
  "title": "Close test gaps flagged in recon-509/510/601/602/603 reviews",
  "status": "open",
  "severity": "low",
  "skill": "",
  "scope": [
    "server/test/unit/agentos-*",
    "server/test/int/agentos-*",
    "server/test/unit/ledger-*",
    "web/src/features/agentos/*.test.tsx",
    "e2e/agentos*.spec.ts"
  ],
  "verification": [
    "npm run test:unit -- agentos",
    "npm run test:int -- agentos",
    "npm run test:web -- agentos"
  ],
  "source": "manual",
  "attempts": 0,
  "createdAt": "2026-10-07T16:11:13.910Z",
  "updatedAt": "2026-10-07T16:11:13.910Z"
}
-->

Test-only: (1) replace-seed refused when journal entries reference seed rows; (2) api-client MAX_PAGES cap; (3) agentos:accounts alias add via accounts.service incl. duplicate/unknown code; (4) poundsToPence edge cases 0.1+0.2, 19.99, 3-decimal rejection; (5) retry reuses the same clientRequestId; server 403/409 rendered inline; (6) e2e signs in as an accounts user for payment/journal; (7) ledger_balances view. No production code changes.
