<!--hx-issue
{
  "id": "ISSUE-0012",
  "title": "Journal grid Branch/Property show '-': GET /agentos/tenants returns no branch or property",
  "status": "open",
  "severity": "low",
  "skill": "",
  "scope": [
    "server/src/api/agentos/routes.ts",
    "server/src/services/agentos/*.service.ts",
    "web/src/features/agentos/**",
    "server/test/int/agentos-*"
  ],
  "verification": [
    "npm run test:int -- agentos",
    "npm run test:web -- agentos"
  ],
  "source": "manual",
  "attempts": 0,
  "createdAt": "2026-10-07T16:11:14.028Z",
  "updatedAt": "2026-10-07T16:11:14.028Z"
}
-->

recon-603 UI has optional branch/property on AgentosTenant but the server list omits them. Add them to the tenants list response from the linked core tenancy/property (null when unlinked) and show them in the journal grid.
