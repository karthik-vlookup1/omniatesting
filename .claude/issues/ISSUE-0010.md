<!--hx-issue
{
  "id": "ISSUE-0010",
  "title": "agentOS sync never links tenancies: looks up core tenancy by '1234' but core stores 'T1234'",
  "status": "in_progress",
  "severity": "high",
  "skill": "issue-solve",
  "scope": [
    "server/src/services/agentos/sync*",
    "server/src/domain/agentos/sync*",
    "server/test/int/agentos-sync*",
    "server/test/unit/agentos-sync*"
  ],
  "verification": [
    "npm run test:int -- agentos-sync",
    "npm run test:unit -- agentos-sync"
  ],
  "source": "manual",
  "attempts": 1,
  "createdAt": "2026-10-07T16:11:13.792Z",
  "updatedAt": "2026-10-07T16:41:08.924Z",
  "contractHash": "c4ea543d924d1e01"
}
-->



Found by the recon-510 planner: the recon-509 sync's core tenancy lookup uses the bare 4-digit TID while core tenancies store 'T1234', so agentos_tenants.tenancy_id is always NULL. Match core's stored format (accept both, per recon-507), add a regression test where a core tenancy 'T9701' links to the synced tenant.

## Debug Log

- What failed? 
- Which signal proves the failure? 
- Which layer owns the failure? 
- What changed after the fix? 
- Did the app restart cleanly? 
- Did the same workload pass after rerun?
