<!--hx-issue
{
  "id": "ISSUE-0002",
  "title": "Vico file: use the real 6-column upload layout",
  "status": "resolved-pending-review",
  "severity": "high",
  "skill": "issue-solve",
  "scope": [
    "server/src/services/vico/**",
    "server/test/**/vico*",
    "web/src/features/vico/**"
  ],
  "verification": [
    "npm run test:unit -- vico",
    "npm run test:int -- vico"
  ],
  "source": "manual",
  "attempts": 1,
  "createdAt": "2026-10-02T13:26:20.547Z",
  "updatedAt": "2026-10-02T13:28:28.005Z",
  "contractHash": "7aa5d3342444dd8d"
}
-->




Accounts procedure 'G-Sheet VECO': Sort code, Account number, Date, Amount, Standing order reference (TID), MG/RG. recon-302 guessed 4 columns.

## Debug Log

- What failed? 
- Which signal proves the failure? 
- Which layer owns the failure? 
- What changed after the fix? 
- Did the app restart cleanly? 
- Did the same workload pass after rerun?
