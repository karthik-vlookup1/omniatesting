<!--hx-issue
{
  "id": "ISSUE-0003",
  "title": "fe-102 drawer test assumes /review has no actions",
  "status": "resolved-pending-review",
  "severity": "low",
  "skill": "issue-solve",
  "scope": [
    "web/src/features/transactions/BankLinesPage.test.tsx"
  ],
  "verification": [
    "npm run lint",
    "npm run typecheck",
    "npm run test:unit"
  ],
  "source": "manual",
  "attempts": 1,
  "createdAt": "2026-10-02T13:50:41.335Z",
  "updatedAt": "2026-10-02T13:53:32.315Z",
  "contractHash": "0db2d6c041e7f132"
}
-->




After fe-103 the /review route renders ReviewActions, so a staff user now sees Accept buttons in the drawer. BankLinesPage.test.tsx 'opens a line with its facts and suggestions, without actions' still asserts none for STAFF_USER and fails in the full suite (1 failed / 160 passed). Intended behaviour: read-only drawer for readonly users. Update the test to use a readonly user.

## Debug Log

- What failed? 
- Which signal proves the failure? 
- Which layer owns the failure? 
- What changed after the fix? 
- Did the app restart cleanly? 
- Did the same workload pass after rerun?
