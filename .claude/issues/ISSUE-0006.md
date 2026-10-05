<!--hx-issue
{
  "id": "ISSUE-0006",
  "title": "npm run test:web has 6-12 random timeouts under load",
  "status": "open",
  "severity": "low",
  "skill": "",
  "scope": [
    "web/src/**/*.test.*",
    "web/vite.config.ts",
    "vitest.config.*"
  ],
  "verification": [
    "npm run test:web"
  ],
  "source": "manual",
  "attempts": 0,
  "createdAt": "2026-10-05T11:39:03.447Z",
  "updatedAt": "2026-10-05T11:39:03.447Z"
}
-->

Seen in recon-101, recon-105 runs: App, LoginPage, UsersPage, TenanciesPage, BankLinesPage, Review tests time out at 5s when the full suite runs; individual files pass alone. Not in any verify ladder. Likely testTimeout/worker count. Also letmc-import.test.ts test 12 counts audit_log rows globally (fragile if other files commit opening balances).
