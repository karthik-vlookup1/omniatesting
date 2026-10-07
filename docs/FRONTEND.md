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

## 1a. The contract

`Omnia_recon-backend/docs/FRONTEND_REFERENCE.md` (backend commit `6a8f415`) is the UI and API
contract: endpoints and shapes, roles, navigation order, screen specs and visual rules (blue
primary, light/dark/auto, en-GB `02/10/2026` dates, status colours). This repo keeps its own file
layout (`lib/api` client, `data/<domain>`, `features/<feature>`) and Vitest unit tests instead of
the backend repo's `web/src` files and Playwright, as recorded in `.claude/state/decisions.md`.

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

## 4. Real data only

Every screen now calls the real backend (`server/src/api/**/routes.ts`); the full route list with role
guards is in `plans/recon-601.md` ("API map"). The one exception is the dev-only sample-data mode
`npm run dev:preview` (`web/src/dev/preview*`), which is loaded only in that Vite mode, is stripped
from every build, and is never used by the running app.

`user` is `{ id, email, fullName, role }`, role ∈ `admin | accounts | staff | readonly`; what each
role may do is `web/src/data/auth/permissions.ts` (capabilities `write`, `finance`, `settings`,
`manageUsers`, `viewFullNi`). Errors are `{ error: { code, message, details? } }`; show `message`,
branch on `code`.

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

## 7. LetMC-style frame (recon-601)

Staff come from LetMC / agentOS, so the UI follows its structure. **Read `plans/recon-601.md` first**:
decisions, layout, module map, tenant-record mapping, how to run and screenshot, and the progress log.

- Frame: `app/layout/AppLayout.tsx` — navy top bar with module menus (`TopModules`), dark search strip
  with global tenancy search (`GlobalSearch`) and open-record tabs (`RecordTabs`, state in
  `lib/recordTabs.ts` + `lib/RecordTabsProvider.tsx`), left "Sections" menu grouped by module
  (`AppNavbar`). Modules and items: `app/navigation.ts` (`MODULES`).
- Tenant record: `features/tenancy-record/` at `/tenancies/:tid?view=&tab=` — record menu, count strip,
  overview cards, Tenant Details tabs, Actions menu with LetMC-style dialogs (`ActionModal`).
- Theme: navy primary + orange "ember" accent (`theme/theme.ts`), frame colours as CSS variables
  (`theme/global.css`).
- Every save asks first: `ConfirmDialog`, or `useConfirmAction` for validate-then-save forms.
