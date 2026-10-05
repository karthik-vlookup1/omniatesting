<!--hx-issue
{
  "id": "ISSUE-0005",
  "title": "bank_transactions.payer_sort_code stores full 6-digit sort codes",
  "status": "open",
  "severity": "medium",
  "skill": "",
  "scope": [
    "server/src/services/ingest/**",
    "server/src/api/ingest/**",
    "db/migrations/0[0-9][0-9]_*",
    "server/test/int/ingest*"
  ],
  "verification": [
    "npm run test:int -- ingest"
  ],
  "source": "manual",
  "attempts": 0,
  "createdAt": "2026-10-05T10:44:58.616Z",
  "updatedAt": "2026-10-05T10:44:58.616Z"
}
-->

Found while planning recon-104. Ingest writes full sort codes to bank_transactions.payer_sort_code. Decide whether to mask (keep last2) or drop, consistent with payer_bank_accounts.sort_code now always NULL.
