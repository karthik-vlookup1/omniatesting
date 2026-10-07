# recon-601 — LetMC-style frontend (plan + progress log)

> **Start here if you are continuing this work.** This file is the single source of truth for the
> frontend rebuild: what was decided, what is done, what is next, and where everything lives.
> Read this, then open only the files the next step names. Update the progress log as you go.

## Goal

Omnia Recon replaces LetMC / agentOS for rent reconciliation. Staff know LetMC, so the UI copies
LetMC's structure (top-bar modules, dark search strip with open-record tabs, tenant record with a
dark left menu, overview cards, Tenant Details tabs, Actions menu, modal dialogs) but looks cleaner.

- Reference screenshots: `C:\Users\Karthik\Downloads\letmc guide\letmc guide\` (12 PNGs, not in the
  repo; they show real-looking tenant data, so they are deliberately not committed).
- API contract: `docs/FRONTEND_REFERENCE.md` (roles, endpoints) — but the real route list is the
  truth: `server/src/api/**/routes.ts` (see "API map" below). `docs/FRONTEND.md` §4 is out of date
  (it says only auth exists; everything is built now).

## Rules (from the user, 2026-10-07)

1. Never change backend code (`server/`, `db/`, migrations, backend tests).
2. Every screen uses the real API. No fake data. (`web/src/dev/preview*` is a dev-only sample-data
   mode loaded only by `npm run dev:preview`; it is stripped from builds and never used by the app.)
3. Respect roles: admin, accounts, staff, readonly (`web/src/data/auth/permissions.ts`).
4. Prefer the existing stack: React 19, Vite 8, Mantine 9, TanStack Query 5, React Router 7, Tabler icons.
   No new npm dependencies (`web/package.json` is a protected file).

## Decisions (approved by the user)

| # | Decision | Why |
|---|---|---|
| D1 | Palette: **navy** primary (top bar, primary buttons) with an **orange accent** (active module, active tab, focus highlights). | Familiar to LetMC users (orange), more professional and AA-contrast safe (white on navy). Orange is never used for small text on white. |
| D2 | Commit locally on branch `update/agentos-receipts`; **do not push** until the user says so. | User instruction; repo rules normally push to `backend`. |
| D3 | Tracked as hx feature **recon-601** (HARD), scope `web/**` + this file + frontend docs. Verify = `npm run lint`, `npm run typecheck`, `npm run test:web`. Feature entry is applied by the user: `node .claude/approvals/recon-601/apply.cjs`. | Feature list is a protected file. |
| D4 | Keep accessible names that tests use stable (e.g. link "Home", "Account menu for <name>", "Sign in", "Toggle navigation"). | `web/src/**/*.test.tsx` and `e2e/*.spec.ts` select by role + name. |
| D5 | LetMC modules with no backend (Diary, Inbox, Leads, Sales, Maintenance, Calls/Emails/SMS, AML/R2R/credit checks, Right to Rent, CRM, Notes, rent-chasing workflow fields, manual Take a Payment) are **not built and not faked**. Where LetMC users would look for them, the UI says where Recon does it instead. | Rule 2. |
| D7 | The left **Sections** menu lists every module group (current module's heading in orange), instead of only the current module like LetMC. Top-bar modules are dropdown **buttons**, not links. | `e2e/*.spec.ts` click links inside `navigation "Sections"` across modules (e.g. Upload statement then LetMC import); buttons keep link names unique. |
| D8 | Test data for browser checks: `node --env-file=.env --import tsx server/test/fixtures/veco-seed.ts 25` (project's synthetic Veco rows T9001…T9025, via the real sync code) and logins `ui-admin@example.test` / `ui-readonly@example.test` created with `OMNIA_NEW_USER_PASSWORD=… npx tsx --env-file=.env server/src/jobs/create-user.ts`. Local dev DB only. | Local DB had no tenancies; synthetic data only. |
| D6 | Browser checks use Playwright with the installed **Edge** (`channel: 'msedge'`); Playwright's own Chromium is not installed. Screenshot script: `scripts` is backend scope, so the helper lives in the session scratchpad — see "How to check a screen". | No downloads needed. |

## Layout (LetMC structure → Recon)

```
┌ top bar (navy) ── ▣ Omnia Recon │ Dashboard  Lettings  Accounts  Office │ role · user menu ┐
├ search strip (dark) ── 🔍 Search TID, name or NI … │ [6568 Jason M ×] [4926 … ×] (open records) ┤
├ module sub-menu (left, light) ─┬─ page ──────────────────────────────────────────────────────┤
```
- Tenant record pages (`/tenancies/:tid`) replace the module sub-menu with the record's own dark
  left menu (LetMC "Overview / Tenant Details / …" panel).

### Modules (top bar) and their sub-menus — `web/src/app/navigation.ts`

| Module | Items (route · capability) |
|---|---|
| Dashboard | Home `/` · Dashboard `/dashboard` |
| Lettings | Tenancies `/tenancies` (+ record `/tenancies/:tid`) · Rent `/rent` (+ `/rent/:tid`) · Properties `/properties` · Landlords `/landlords` · Payer accounts `/payer-accounts` |
| Accounts | Upload statement `/upload` · Review queue `/review` · Receipts `/receipts` (finance) · agentOS receipts `/agentos` · Vico export `/vico` (finance) · Xero `/xero` (finance) · Statement download `/export/statement` (write) |
| Office | Users `/users` (manageUsers) · Branches `/branches` · Bank accounts `/bank-accounts` · CSV profiles `/csv-profiles` · LetMC import `/letmc-import` (finance) |

### Tenant record — `/tenancies/:tid` (new: `web/src/features/tenancy-record/`)

| LetMC element | Recon equivalent | API |
|---|---|---|
| Search dropdown "Tenant 6568 Jason Morgan …" | Global search results (TID, name, address, tenancy line) | `GET /tenancies?q=&status=all` |
| Open-record tab "Tenant 6568 Jason Mo ×" | Record tabs in the search strip (sessionStorage, per viewer) | — |
| Header "6568 Jason Morgan" + address line, Actions ▾ / Edit / Refresh | Same; Edit is not offered (tenancies come from Veco, read-only) | `GET /tenancies/:tid` |
| Calls / Emails / SMS / Actions strip | Receipts · Adjustments · Payer accounts · Rent periods counts | receipts, adjustments, payer-accounts, rent |
| Left menu: Overview, Tenant Details, … with counts | Overview · Tenant details · Rent account · Receipts · Adjustments · Payer accounts · Rent terms · Statement | — |
| Overview cards: Balances (big £), Rent Chase, Deposit Held | Balances per payer, Rent chase (outstanding, managed by, last paid, management type), Rent terms, agentOS (deposit to) | `GET /rent/:tid`, `/receipts?tid`, `/agentos/tenants` |
| Tenant Details tabs: Personal, Bank, Tenancy, Rent Chasing, Admin, Notes, Right to Rent, CRM | Personal details · Bank details (payer accounts, last 4) · Tenancy · Rent chasing (server figures only). Admin/Notes/R2R/CRM: no backend (D5) | as above |
| Actions ▾ → Accounting: Apply Refund, Journal Transfer, Make Rent Due, Print Receipts … | Refund, Write-off (`POST /adjustments`), Journal transfer (`POST /agentos/journal/transfers`), Set rent / benefit award / payer split / payment method (`POST /rent/:tid/...`), Link payer account (`POST /payer-accounts`), Download statement (`GET /reports/statement/:tid/{csv,pdf}`) | role-gated |
| Take a Payment modal | Not possible: Recon has no manual-payment endpoint; payments come from bank lines. Action shown disabled with that explanation + link to agentOS Take a Payment export. | — |

## API map (real routes, all under `/api`; guards: writer = admin/accounts/staff, accounts = admin/accounts, admin)

auth `/auth/*` · users `/users` (admin) · tenancies `GET /tenancies?q&status`, `GET /tenancies/:tid`, `POST /tenancies/sync` (admin) ·
rent `GET /rent/:tid`, `POST /rent/:tid/{schedules,benefit-awards,payer-splits,payment-methods}`, `POST /rent/{benefit-awards,payer-splits,payment-methods}/:id/end` ·
receipts `GET /receipts?tid&status&page`, `GET /receipts/:id`, split/allocations/reverse · adjustments `GET /adjustments?tid`, `POST /adjustments` {tid,payer,kind:write_off|refund,amountPence,reason} (accounts), `POST /adjustments/:id/reverse` ·
payer-accounts `GET/POST/PATCH` · matching `/matching/lines…` · imports `/imports` · bank-accounts + CSV profiles · branches · landlords · properties ·
vico (accounts) · xero (accounts) · export `/export/statement*` (writer) · reports `/reports/dashboard`, `/reports/statement/:tid[/csv|/pdf]` ·
agentos `/agentos/intake…`, `/agentos/exports…`, `/agentos/tenants`, `/agentos/journal/transfers` {fromTid,toTid (4 digits),amountPence,description,nominalCode,accountType} ·
LetMC import `/imports/letmc/{layout,runs,preview,commit}`.

Existing typed hooks to reuse (don't write new fetch code): `data/tenancies` (useTenancySearch, useTenancy),
`features/rent-terms/api.ts` (useRentAccount, useSetRent, useAddAward, useAddSplit, useAddMethod),
`features/receipts/api.ts` (useReceipts, useAdjustments, useCreateAdjustment), `features/payer-accounts/api.ts`,
`features/dashboard/api.ts` (useDashboard, downloadTenantStatement), `features/agentos/api.ts`
(useAgentosTenants, useCreateJournalTransfer). Reusable modals: `features/rent-terms/{BenefitAwardModal,PayerSplitModal,PaymentMethodModal}.tsx`,
`features/payer-accounts/AddPayerAccountModal.tsx`.

## Frontend standards checklist (every screen)

Loading skeleton/spinner · empty state with next step · error state with Retry · ConfirmDialog before
any write · success/failure notification · field-level validation · labels/aria on every control,
keyboard reachable · paginated tables (server paging where the API has it: matching lines, receipts).
Shared building blocks: `web/src/components/*` (PageHeader, DataTable, EmptyState, ErrorState,
LoadingState, ConfirmDialog, StatCard, StatusBadge, Money, MaskedValue, TablePagination).

## How to run and check a screen

```
docker compose up -d --wait db                       # Postgres on 5433 (already running normally)
cd server && npx tsx watch --env-file=../.env src/api/app.ts   # API :3001 (npm scripts don't load .env)
npm run dev:web                                      # UI :5173
npx tsx --env-file=.env server/src/jobs/create-user.ts --email … --name … --role admin   # a login
```
Screenshot: a small Node script using `@playwright/test`'s `chromium.launch({ channel: 'msedge' })`,
sign in at `/login`, `page.goto(url)`, `page.screenshot()`; compare with the guide PNG.

Final gate: `npm run lint`, `npm run typecheck`, `npm run test:web` (baseline before this work:
24 test files / 175 tests passing, lint + typecheck clean).

## Progress log

| Step | Status | Notes |
|---|---|---|
| 0. Plan, decisions, hx approval file | done | `.claude/approvals/recon-601/apply.cjs` (user runs it) |
| 1. Theme + app frame (top bar modules, search strip, record tabs, module sub-menu) + login | done | theme/theme.ts (navy+ember), theme/global.css (frame vars), app/navigation.ts (MODULES), app/layout/{AppLayout,TopModules,GlobalSearch,RecordTabs,AppNavbar,UserMenu}.tsx, lib/recordTabs.tsx, data/tenancies/describe.ts. 175/175 tests pass. Checked at 1440×900. |
| 2. Tenant record (overview, tenant details tabs, actions + modals) | todo | |
| 3. Tenancies list | todo | |
| 4. Dashboard / Home | todo | |
| 5. Accounts pages restyle | todo | |
| 6. Lettings pages restyle | todo | |
| 7. Office pages restyle | todo | |
| 8. Error pages, docs update, lint/typecheck/tests, hx verify | todo | |
