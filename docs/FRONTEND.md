# Omnia Recon — frontend architecture

## 1. What the UI is for

The workflow it presents, in order (from the backend's `docs/ARCHITECTURE.md`):

```
bank CSV → import batch → parse / normalise → bank transactions → auto_match
        → matched | needs_review | yet_to_take | excluded
        → receipt → allocation to rent periods (oldest arrears first, per payer)
        → (a) bank statement CSV   (b) Vico upload   (c) Xero draft invoices
```

**The database is the rules engine.** The frontend never calculates rent, arrears, allocations,
match decisions or ledger codes. It displays what the server returns (including confidence and
reason for each suggestion), collects input, sends actions and shows the server's response.

## 2. Stack

React 19, TypeScript (strict), Vite 8, Mantine 9, TanStack Query 5, React Router 7,
`@tabler/icons-react`, dayjs. Tests: Vitest + Testing Library on jsdom. Recorded in
`.claude/state/decisions.md`.

## 3. Structure and dependency direction

```
lib, theme  →  components  →  data/<domain>  →  features/<feature>  →  app
```

A folder may import only from folders to its left. `features` never call `fetch` directly; they use
the hooks/functions exported by `data/<domain>`.

| Folder | Holds |
|---|---|
| `lib/` | `apiClient` (fetch wrapper), `ApiError`, formatters (GBP, en-GB dates), helpers |
| `theme/` | Mantine theme: palette, type scale, spacing, radius, shadows, component defaults |
| `components/` | PageHeader, StatusBadge, DataTable, EmptyState, LoadingState, ErrorState, ConfirmDialog, StatCard, MaskedValue |
| `data/<domain>/` | `types.ts` (server shapes), `api.ts` (real or mock source), `queries.ts` (TanStack Query hooks + keys) |
| `features/<feature>/` | Pages and feature-only components |
| `app/` | Router (lazy routes), AppShell layout, navigation, auth guards, not-found / forbidden |

## 4. Real vs mock data

Only these endpoints exist in the backend today (`server/src/api/auth/routes.ts`):

| Method | Path | Notes |
|---|---|---|
| POST | `/api/auth/login` | body `{ email, password }` → `{ user }`; sets HttpOnly `omnia_sid` cookie. 20 attempts / 15 min / IP |
| POST | `/api/auth/logout` | 204; clears the cookie |
| GET | `/api/auth/me` | `{ user }` or 401 |
| POST | `/api/auth/password` | body `{ currentPassword, newPassword }` → 204; other sessions end |
| GET | `/api/users` | admin only → `{ users: UserSummary[] }` |
| POST | `/api/users` | admin only, body `{ email, fullName, role, password }` → 201 `{ user }` |
| PATCH | `/api/users/:id` | admin only, body any of `{ fullName, role, isActive, password }` → `{ user }` |
| GET | `/api/health` | `{ status: 'ok' }` / 503 |

`user` is `{ id, email, fullName, role }`, role ∈ `admin | accounts | staff | readonly`.
`UserSummary` adds `isActive, lastLoginAt, lockedUntil, createdAt` (ISO strings).

Errors are `{ error: { code, message, details? } }`. Codes: `bad_request` 400 (details =
`[{ path, message }]`), `unauthenticated` 401, `invalid_credentials` 401, `forbidden` 403,
`not_found` 404, `conflict` 409, `account_locked` 423, `too_many_requests` 429 (`Retry-After`),
`internal` 500.

**Everything else (imports, transactions, review, receipts, tenancies, exports, Xero, dashboard)
has no endpoint yet.** Those domains' `data/<domain>/api.ts` return typed, synthetic mock data
shaped after the database tables and views (`import_batches`, `bank_transactions`,
`match_suggestions`, `receipts`, `allocations`, `v_bank_statement_enriched`, `v_vico_export`, ...).
Rules for mocks:

- one module per domain; swapping mock → real changes only that module;
- no invented URLs: mock modules are plain async functions, not fake HTTP routes;
- screens backed by mocks show a visible **Preview data** marker;
- mocks never compute money rules; fixtures carry the values the server would return.

## 5. Security

- Session is an HttpOnly, SameSite=Strict cookie; the app never reads or stores a token.
- Every non-GET request sends `x-requested-with: omnia-recon` (the backend's CSRF guard). This is
  done once, in `lib/apiClient`; nothing else calls `fetch`.
- `credentials: 'same-origin'`; the dev/preview servers proxy `/api` so the cookie stays first-party.
- A 401 from any request clears cached data and sends the user to `/login?next=<path>`.
- Role-aware UI hides actions a role cannot take (readonly cannot write; only admin manages users;
  full NI only for admin/accounts). The server remains the enforcement point.
- NI numbers and payer accounts are displayed masked as the server provides them
  (`•••••123`, `****1234`). No `console` logging in app code (lint-enforced).

## 6. Performance

- Route-level code splitting with `React.lazy`; vendor chunks for React, Mantine, router/query, icons.
- TanStack Query: `staleTime` 30 s, no refetch on window focus for lists, no retry on 4xx.
- Search inputs are debounced; list filters live in the URL so views are shareable and cached per key.
- Large tables render only what is needed (pagination / windowing decided per feature).
