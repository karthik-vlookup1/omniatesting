<!--hx-issue
{
  "id": "ISSUE-0004",
  "title": "Veco frequency change does not restate award-linked payer splits",
  "status": "open",
  "severity": "medium",
  "skill": "",
  "scope": [
    "server/src/jobs/veco-sync/**",
    "server/src/services/rent/**",
    "server/test/int/rent*"
  ],
  "verification": [
    "npm run test:int -- rent"
  ],
  "source": "manual",
  "attempts": 0,
  "createdAt": "2026-10-05T10:39:45.541Z",
  "updatedAt": "2026-10-05T10:39:45.541Z"
}
-->

Found in recon-103 review. sync.ts:384 (in-place frequency UPDATE) and :391 (new schedule) don't call reconvertAwardSplits (only setRent does), so a landlord-direct award split keeps an amount in the old cycle against the new cycle's rent on opted-in tenancies. Fix: restate award splits in the nightly refresh or after sync. Also: mark_rent_dirty (006:116-120) regenerates the period ending exactly on a new effective_to needlessly (totals unchanged).
