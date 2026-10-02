<!--hx-issue
{
  "id": "ISSUE-0001",
  "title": "Dev preview mode: run the UI without the backend",
  "status": "resolved-pending-review",
  "severity": "medium",
  "skill": "issue-solve",
  "scope": [
    "web/src/dev/**",
    "web/src/main.tsx",
    "web/src/lib/api/**",
    "web/package.json",
    "package.json",
    "README.md"
  ],
  "verification": [
    "npm run lint",
    "npm run typecheck",
    "npm run test:unit -- src/dev src/lib",
    "npm run build"
  ],
  "source": "manual",
  "attempts": 2,
  "createdAt": "2026-10-02T11:22:40.970Z",
  "updatedAt": "2026-10-02T11:31:02.626Z",
  "contractHash": "ac7809e78e8244c7"
}
-->







User wants to see the frontend before the backend is running (2026-10-02). Add npm run dev:preview: a dev-server-only fake of the existing /api/auth endpoints (login, logout, me, password) with synthetic preview accounts per role, plus an always-visible Preview mode banner. Must be excluded from production builds (verified by grepping dist). No invented endpoints. Also map proxy 502/503/504 non-JSON answers to a 'cannot reach server' message (sign-in currently says 'Something went wrong on our side' when the backend is down).

## Debug Log

- What failed? 
- Which signal proves the failure? 
- Which layer owns the failure? 
- What changed after the fix? 
- Did the app restart cleanly? 
- Did the same workload pass after rerun?


## Review Rejected (2026-10-02T11:28:05.344Z)

Preview fake diverges from backend contract it claims to match exactly: (1) unknown /api routes (e.g. GET /api/imports, POST /api/auth/me) return 401 unauthenticated when signed out, but app.ts answers 404 not_found after authenticate+csrfGuard regardless of session (previewApi.ts unknown-route branch; previewApi.test.ts:53 asserts the wrong 401). (2) POST /api/auth/password checks currentPassword before newPassword length; backend runs Zod (ChangePasswordBody + PasswordSchema min12/max256) first, so wrong-current+short-new is 400 not 401, missing currentPassword is 400 not 401, 300-char newPassword is 400 not 204. (3) POST /api/auth/login with empty/missing password returns 401 invalid_credentials; backend LoginBody Zod gives 400 bad_request. (4) malformed/null JSON body makes handle() throw (SyntaxError/TypeError) -> client shows network error instead of 400 'Malformed JSON body'. README claim 'every other /api path answers 404' is also false for /api/users (real 200/403).
