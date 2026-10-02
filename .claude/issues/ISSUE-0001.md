<!--hx-issue
{
  "id": "ISSUE-0001",
  "title": "Veco sync: management type from Xero property suffix (adds MG)",
  "status": "resolved-pending-review",
  "severity": "high",
  "skill": "issue-solve",
  "scope": [
    "server/src/jobs/veco-sync/**",
    "server/test/**/veco*",
    "server/test/fixtures/veco-*",
    "web/src/features/tenancies/**",
    "server/test/int/tenancies-api.test.ts"
  ],
  "verification": [
    "npm run test:unit -- veco",
    "npm run test:int -- veco"
  ],
  "source": "manual",
  "attempts": 1,
  "createdAt": "2026-10-02T13:24:00.253Z",
  "updatedAt": "2026-10-02T13:25:59.191Z",
  "contractHash": "91e5552c937e9344"
}
-->




Accounts procedure + live Veco check: ohg_owned mislabels ~115 active tenancies and MG never appears. Use dim_PropertyXeroMap name_suffix: IRG->IRG, MN->MG, branch->RG; fallback to ohg_owned.

## Debug Log

- What failed? 
- Which signal proves the failure? 
- Which layer owns the failure? 
- What changed after the fix? 
- Did the app restart cleanly? 
- Did the same workload pass after rerun?
