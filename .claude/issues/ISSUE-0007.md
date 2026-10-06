<!--hx-issue
{
  "id": "ISSUE-0007",
  "title": "agentos-intake unit test doubles CR when fixture is checked out with CRLF",
  "status": "resolved-pending-review",
  "severity": "low",
  "skill": "issue-solve",
  "scope": [
    "server/test/unit/agentos-intake.test.ts"
  ],
  "verification": [
    "npm run test:unit -- agentos-intake"
  ],
  "source": "manual",
  "attempts": 1,
  "createdAt": "2026-10-06T14:57:30.443Z",
  "updatedAt": "2026-10-06T14:58:04.197Z",
  "contractHash": "8ca217cb77ea2884"
}
-->




With core.autocrlf=true, intake-valid.csv is checked out CRLF; the 'BOM + CRLF copy' test does replace(/\n/g,'\r\n') giving \r\r\n. Fix: normalise with replace(/\r?\n/g,'\r\n'). Found during recon-506.

## Debug Log

- What failed? 
- Which signal proves the failure? 
- Which layer owns the failure? 
- What changed after the fix? 
- Did the app restart cleanly? 
- Did the same workload pass after rerun?
