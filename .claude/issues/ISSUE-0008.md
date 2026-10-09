<!--hx-issue
{
  "id": "ISSUE-0008",
  "title": "reassign.service: handle agentos_tenants rows with NULL tid (from recon-509 api sync)",
  "status": "resolved-pending-review",
  "severity": "high",
  "skill": "issue-solve",
  "scope": [
    "server/src/services/agentos/reassign*",
    "server/test/unit/agentos-reassign*",
    "server/test/int/agentos-reassign*"
  ],
  "verification": [
    "npm run test:int -- agentos",
    "npm run test:unit -- agentos"
  ],
  "source": "manual",
  "attempts": 1,
  "createdAt": "2026-10-07T11:56:34.468Z",
  "updatedAt": "2026-10-07T11:59:01.399Z",
  "contractHash": "ce41633cc9b83ddc"
}
-->




recon-509 migration 016 makes agentos_tenants.tid nullable (api rows flagged no_tid). reassign.service.ts:26 selects all agentos_tenants rows and types tid as string. Fix types and logic so NULL-tid rows never crash reassign and are excluded or handled per existing matching rules; add a regression test with a NULL-tid row.

## Debug Log

- What failed? 
- Which signal proves the failure? 
- Which layer owns the failure? 
- What changed after the fix? 
- Did the app restart cleanly? 
- Did the same workload pass after rerun?
