# Lessons

A running log of reasons things didn't work out — why a feature got blocked, why a fix was
rejected, why an issue was marked won't-fix. Regenerated automatically (`hx feature block`,
`hx issue reject`, `hx issue wontfix`, or `hx lesson add`) — read this before repeating the same
dead end a future session might otherwise walk into again.

## 2026-10-02: git commit -- <path> on a case-insensitive repo committed file content instead of a deletion

- Source: manual (fe-001)
- With core.ignorecase=true, git commit -- readme.md matched README.md on disk and committed its content as readme.md. Fix: stage exact index changes with git update-index (--force-remove / --cacheinfo), check git diff --cached --name-status, then commit without a pathspec

## 2026-10-02: Mantine menus intermittently display:none in jsdom unless MantineProvider env="test"

- Source: manual (fe-003)
- Popover hideDetached reads floating-ui referenceHidden; jsdom zero-size rects made it flip, so menu items were randomly unfindable. transitionProps duration 0 made it worse (menus never opened). Fix: render with <MantineProvider env="test">, which disables hideDetached, transitions and portals. Also: vitest exits 1 on an uncaught error even when every test passes, so check the exit code, not just the pass count

## 2026-10-02: Dev preview mode: run the UI without the backend

- Source: issue.reject (ISSUE-0001)
- Preview fake diverges from backend contract it claims to match exactly: (1) unknown /api routes (e.g. GET /api/imports, POST /api/auth/me) return 401 unauthenticated when signed out, but app.ts answers 404 not_found after authenticate+csrfGuard regardless of session (previewApi.ts unknown-route branch; previewApi.test.ts:53 asserts the wrong 401). (2) POST /api/auth/password checks currentPassword before newPassword length; backend runs Zod (ChangePasswordBody + PasswordSchema min12/max256) first, so wrong-current+short-new is 400 not 401, missing currentPassword is 400 not 401, 300-char newPassword is 400 not 204. (3) POST /api/auth/login with empty/missing password returns 401 invalid_credentials; backend LoginBody Zod gives 400 bad_request. (4) malformed/null JSON body makes handle() throw (SyntaxError/TypeError) -> client shows network error instead of 400 'Malformed JSON body'. README claim 'every other /api path answers 404' is also false for /api/users (real 200/403).
