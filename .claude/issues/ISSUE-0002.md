<!--hx-issue
{
  "id": "ISSUE-0002",
  "title": "Align foundation with FRONTEND_REFERENCE.md",
  "status": "resolved-pending-review",
  "severity": "medium",
  "skill": "issue-solve",
  "scope": [
    "web/src/theme/**",
    "web/src/components/**",
    "web/src/lib/format*",
    "web/src/app/**",
    "web/src/features/auth/**",
    "web/src/main.tsx",
    "web/src/dev/**",
    "docs/FRONTEND.md",
    "README.md"
  ],
  "verification": [
    "npm run lint",
    "npm run typecheck",
    "npm run test:unit",
    "npm run build"
  ],
  "source": "manual",
  "attempts": 1,
  "createdAt": "2026-10-02T12:27:16.421Z",
  "updatedAt": "2026-10-02T12:33:00.619Z",
  "contractHash": "e6d2a47e8d129315"
}
-->




The backend now ships docs/FRONTEND_REFERENCE.md (6a8f415). Existing passing code differs: primary colour must be blue; MantineProvider defaultColorScheme auto (dark mode must stay legible: no hard-coded dark text/light surfaces); dates en-GB numeric 02/10/2026; a locked account answers 401 invalid_credentials (auth.service.ts:145) so the separate 'account locked' message is dead and must go; navbar 220px, nav labels/order per reference section 4, Home links to built screens; header shows current user name (data-testid current-user) and role badge.

## Debug Log

- What failed? 
- Which signal proves the failure? 
- Which layer owns the failure? 
- What changed after the fix? 
- Did the app restart cleanly? 
- Did the same workload pass after rerun?
