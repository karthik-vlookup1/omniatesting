<!--hx-issue
{
  "id": "ISSUE-0003",
  "title": "Bank CSV: accept real layouts (month-name dates, single signed Amount on HSBC)",
  "status": "resolved-pending-review",
  "severity": "high",
  "skill": "issue-solve",
  "scope": [
    "server/src/domain/ingest/**",
    "server/test/**/ingest*",
    "fixtures/banks/**"
  ],
  "verification": [
    "npm run test:unit -- ingest",
    "npm run test:int -- ingest"
  ],
  "source": "manual",
  "attempts": 1,
  "createdAt": "2026-10-02T13:30:54.054Z",
  "updatedAt": "2026-10-02T13:33:43.353Z",
  "contractHash": "028b2a06c4dcd651"
}
-->




Accounts procedure 'Data from the bank': Apollo HSBC export is Date, Type, Description, Amount (signed), Balance with dates like 02-Oct-26; G-sheet uses 01-Jan-25. Synthetic HSBC profile assumed Paid in/Paid out + DD/MM/YYYY.

## Debug Log

- What failed? 
- Which signal proves the failure? 
- Which layer owns the failure? 
- What changed after the fix? 
- Did the app restart cleanly? 
- Did the same workload pass after rerun?
