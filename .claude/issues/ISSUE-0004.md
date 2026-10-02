<!--hx-issue
{
  "id": "ISSUE-0004",
  "title": "Preview mode: imitate the built endpoints with sample data",
  "status": "resolved-pending-review",
  "severity": "medium",
  "skill": "issue-solve",
  "scope": [
    "web/src/dev/**",
    "README.md"
  ],
  "verification": [
    "npm run lint",
    "npm run typecheck",
    "npm run test:unit -- src/dev",
    "npm run build"
  ],
  "source": "manual",
  "attempts": 1,
  "createdAt": "2026-10-02T13:54:10.262Z",
  "updatedAt": "2026-10-02T13:59:33.384Z",
  "contractHash": "05c5f7a8e0a21ed1"
}
-->




User wants to see the frontend without the backend. Preview mode (dev server only) imitates just /api/auth, so Upload, Review queue, Tenancies and Users show 404 errors. Extend the preview stand-in to the endpoints built in the backend (FRONTEND_REFERENCE.md 5.2-5.6): users, bank-accounts, imports list, matching lines/detail/actions/summary, tenancies search/detail, with synthetic sample data. Do not invent backend rules: POST /imports answers that uploads are unavailable in preview; POST /tenancies/sync answers 503 veco_not_configured like a server without Veco. Still excluded from every production build.

## Debug Log

- What failed? 
- Which signal proves the failure? 
- Which layer owns the failure? 
- What changed after the fix? 
- Did the app restart cleanly? 
- Did the same workload pass after rerun?
