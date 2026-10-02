# Omnia Recon — Frontend Reference (build prompt)

> **What this is:** the complete brief for building the Omnia Recon web UI so it matches the backend
> exactly. Hand this file to whoever (human or AI) builds a screen. Sections marked **BUILT** describe
> endpoints that exist on `backend` today; sections marked **PLANNED** describe the agreed shape of
> endpoints not built yet. Re-check those against `server/src/api/**` before wiring them.

---

## 1. The product in one paragraph

Omnia Recon reconciles rent received into OHG bank accounts against tenancies. Tenancies (TID, tenant,
rent, property, branch, NI) come nightly from **Veco**. Staff upload bank statement CSVs from seven
banks; each line is matched to a tenancy automatically where confident (TID in the reference, NI
number, a remembered payer account, a reference rule), otherwise it goes to a **review queue** where a
person accepts a suggestion, picks another tenancy, or marks it yet-to-take / excluded. Confirmed
receipts are exported to **Vico** (file) and posted to **Xero** (the ledger) via Sam's Xero bridge.

Users are back-office accounts staff. The UI is dense and practical, not a marketing site: tables,
filters, keyboard-friendly forms, clear status badges, and exact amounts.

---

## 2. Stack and conventions (must follow)

| Concern | Rule |
| --- | --- |
| Framework | React 19 + TypeScript + Vite. Dev server on `:5173`; Vite proxies `/api` → `http://localhost:3001`. |
| UI kit | **Mantine 9** (`@mantine/core`, `@mantine/hooks`), icons from `@tabler/icons-react`. `MantineProvider defaultColorScheme="auto"`. No other component library, no Tailwind. |
| Data | **TanStack Query**. `QueryClient` with `refetchOnWindowFocus: false`. One `api.ts` per feature exporting typed hooks (`useXxx`), as in `web/src/features/upload/api.ts`. |
| Routing | `react-router-dom`, `BrowserRouter`. Signed-in routes are children of `<RequireAuth><Shell/></RequireAuth>` in `web/src/app/App.tsx`. |
| HTTP | Always call through `apiFetch<T>(path, init)` from `web/src/features/auth/api.ts`. It sends `credentials: 'same-origin'`, `Content-Type: application/json` and the CSRF header **`X-Requested-With: omnia-recon`** (the server rejects state-changing requests without it). Multipart uploads use raw `fetch` with the same CSRF header and **no** Content-Type. |
| Errors | Every error body is `{ "error": { "code": string, "message": string, "details"?: any } }`. `apiFetch` throws `ApiError(status, code, message)`. Show `message` to the user in a red `Alert` (`role="alert"`); branch on `code`, never on message text. |
| Auth state | `useCurrentUser()` (query key `['auth','me']`). On 401 anywhere → user is signed out; `RequireAuth` redirects to `/login`. Sign-out calls `qc.clear()` so no previous user's data stays on screen. |
| Roles | `hasRole(user.role, ...allowed)` — admin always passes. Hide or disable actions the role can't do, **and** handle a 403 gracefully anyway (server is the authority). |
| Money | The API sends money as **strings in pounds** with 2 decimals (`"325.00"`, negative = money out). Never do float maths for display; format with `Intl.NumberFormat('en-GB',{style:'currency',currency:'GBP'})` on `Number(x)` only for display. Send amounts back as strings matching `^\d{1,10}(\.\d{1,2})?$`. |
| Dates | API dates are `YYYY-MM-DD`; timestamps are ISO-8601. Display en-GB (`02/10/2026`, `toLocaleString('en-GB')`). |
| Personal data | NI numbers are **masked** (`niMasked`, e.g. `•••••• 12C`) for staff/readonly. The full `ni` field is only present for admin/accounts — render it only if present. Payer bank accounts are only ever shown as last 4 (`payerAccountLast4`). Never log personal data to the console. |
| Accessibility / tests | Every input has a visible `label`; icon-only buttons have `aria-label`; tables have `aria-label`. Playwright selects by role + accessible name (`getByRole('button',{name:'Confirm'})`), so keep names stable. Use `data-testid` only for summary text blocks. |
| Files | New screen = `web/src/features/<feature>/{api.ts,<Name>Page.tsx, components…}`. Register the route in `App.tsx` and a `NavLink` in `Shell.tsx`. |
| Tests | Vitest for pure helpers; Playwright e2e in `e2e/<feature>*.spec.ts` against the real API with synthetic data (create users via the CLI script as `e2e/auth.spec.ts` does). |
| Data | Synthetic data only. Never paste real tenant names, NI numbers or account numbers into fixtures, screenshots or docs. |

---

## 3. Roles

| Role | Can |
| --- | --- |
| `admin` | Everything: users, bank accounts, CSV profiles, Veco sync, matching, exports, Xero. |
| `accounts` | Everything operational: upload, review/confirm, edit CSV profiles, exports, Xero posting. Sees full NI. Not user admin, not bank-account creation, not Veco sync. |
| `staff` | Upload statements, review/confirm/exclude lines, search tenancies (masked NI). |
| `readonly` | View only: tenancies (masked NI), imports, queue, summaries. No buttons that change data. |

Server guards: `requireRole()` = admin only; `requireRole('accounts')` = admin + accounts;
`requireWriter` = admin + accounts + staff.

---

## 4. App shell and navigation

Layout (exists in `web/src/app/Shell.tsx`): Mantine `AppShell`, header 56px with title **Omnia Recon**,
the user's full name (`data-testid="current-user"`), a role `Badge`, and **Sign out**. Left navbar
220px, collapsible on mobile (burger `aria-label="Toggle navigation"`).

Final navigation order:

| Route | Label | Icon | Who sees it | Feature |
| --- | --- | --- | --- | --- |
| `/` | Home | IconHome | all | 401 (dashboard, later) |
| `/upload` | Upload statement | IconUpload | all (upload form writers only) | 201/202 BUILT |
| `/review` | Review queue | IconListCheck | all (actions writers only) | **203 next** |
| `/tenancies` | Tenancies | IconUsers | all | 102 BUILT |
| `/vico` | Vico export | IconFileExport | admin, accounts | 302 PLANNED |
| `/xero` | Xero | IconBuildingBank | admin, accounts | 303 PLANNED |
| `/csv-profiles` | CSV profiles | IconSettings | all (edit admin/accounts) | 201 BUILT |
| `/users` | Users | IconUserCog | admin | 004 API built, UI to build |

Show a count `Badge` next to **Review queue** = `total` from `GET /api/matching/lines?status=open&limit=1`.

---

## 5. API reference

All paths are under `/api`. All require a session unless stated. JSON in, JSON out.

### 5.1 Auth — BUILT

| Method & path | Body | Response | Notes |
| --- | --- | --- | --- |
| `POST /auth/login` | `{ email, password }` | `200 { user }` | No session needed. 401 `invalid_credentials` (also for locked accounts — don't reveal lockout). 429 `too_many_requests` (20 per 15 min per IP). |
| `POST /auth/logout` | — | `204` | |
| `GET /auth/me` | — | `200 { user }` / 401 | |
| `POST /auth/password` | `{ currentPassword, newPassword }` | `204` | New password ≥ 12 chars. |

`user = { id, email, fullName, role: 'admin'|'accounts'|'staff'|'readonly' }`

### 5.2 Users (admin only) — API BUILT, UI TO BUILD

| Method & path | Body | Response |
| --- | --- | --- |
| `GET /users` | — | `{ users: UserSummary[] }` |
| `POST /users` | `{ email, fullName, role, password }` (password ≥ 12) | `201 { user }`; 409 `conflict` if the email exists |
| `PATCH /users/:id` | any of `{ fullName, role, isActive, password }` | `{ user }` |

`UserSummary = { id, email, fullName, role, isActive, lastLoginAt|null, lockedUntil|null, createdAt }`

**Users page** (`/users`): table (Name, Email, Role badge, Active switch, Last sign-in, Locked until),
**Add user** modal (email, full name, role select, temporary password with a "≥ 12 characters" hint),
row **Edit** modal (name, role, active, reset password). Admin can't deactivate themself (disable that switch).

### 5.3 Tenancies — BUILT (recon-102)

| Method & path | Query / body | Response |
| --- | --- | --- |
| `GET /tenancies` | `?q=<TID, name or full NI>&status=active|ended|all` (q ≤ 100; default `active`) | `{ tenancies: Tenancy[] }` |
| `GET /tenancies/:tid` | — | `{ tenancy: Tenancy }` / 404 |
| `POST /tenancies/sync` (admin) | `{ dryRun?: bool, force?: bool }` | `{ summary: SyncSummary }`; 503 `veco_not_configured`; 409 `sync_refused` (empty feed or would end > 20% — offer **Force** after confirm); 502 `veco_unavailable` |

```ts
Tenancy = { tid, status: 'pending'|'active'|'ended', startDate, endDate|null,
  managementType: 'RG'|'MG'|'IRG', tenantName|null, niMasked|null, ni?: string /* admin+accounts only */,
  propertyRef, unitRef|null, postcode, address, branchCode,
  rent: { amount: string, frequency: string } | null }
SyncSummary = { dryRun, fetched, rejected: {tid|null, reason}[],
  tenancies: {inserted, updated, reactivated, ended}, tenants: {inserted, updated},
  rentChanges, ni: {missing, invalid, conflicts}, namesMissing,
  managementType: {IRG, RG, defaultedToRG} }
```

Existing page: search box + status segmented control, results table, detail drawer. Admin sees
**Sync from Veco** with *Dry run* first, then *Run sync*; show the summary in a card.

### 5.4 Bank accounts & CSV profiles — BUILT (recon-201)

| Method & path | Who | Body | Response |
| --- | --- | --- | --- |
| `GET /bank-accounts` | all | — | `{ bankAccounts: BankAccount[] }` |
| `POST /bank-accounts` | admin | `{ code, bankName, accountName, … }` | `201 { id }` |
| `POST /bank-accounts/defaults` | admin | — | `{ created: string[] }` (installs HSBC, LLOYDS, APOLLO_TW, REDSTONE, ARMY, ISL, OTHER) |
| `POST /bank-accounts/:id/profile` | admin, accounts | `ProfileInput` | `201 { id, version }`; 400 with `details` listing problems |

```ts
BankAccount = { id, code, bankName, accountName, isActive, profile: CsvProfile|null }
CsvProfile  = { id, version, headerAliases: Partial<Record<CanonicalField,string[]>>,
  requiredFields: CanonicalField[], amountMode: 'signed'|'split_in_out',
  dateFormat: 'DD/MM/YYYY'|'DD/MM/YY'|'DD-MM-YYYY'|'DD.MM.YYYY'|'YYYY-MM-DD'|'D MMM YYYY',
  skipRows: number, notes|null }
CanonicalField = 'txn_date'|'description'|'reference'|'amount'|'paid_in'|'paid_out'|'counterparty'
  |'payer_sort_code'|'payer_account_number'|'balance'|'bank_txn_id'|'tid'|'ni_number'
```

Profiles are versioned: saving creates a new version; show "v3" and never edit in place.

### 5.5 Imports — BUILT (recon-201 + 202)

| Method & path | Who | Body | Response |
| --- | --- | --- | --- |
| `GET /imports` | all | — | `{ imports: ImportBatch[] }` |
| `POST /imports` | writers | multipart: `bankAccountId`, `file` (CSV ≤ 10 MB) | `201 { import: ImportResult, matching: MatchSummary|null }` |

Upload errors: 409 `conflict` (same file already imported, or concurrent upload); 400 `bad_request` with
`details.missingFields: string[]` (layout doesn't match the profile → tell them to update the CSV
profile) or `details.rowErrors: {line, error}[]` (show each as "Line N: …"; the whole file is rejected).

```ts
ImportResult = { batchId, rowsTotal, rowsInserted, rowsDuplicate, rowsSkipped, periodFrom, periodTo,
  withTid, withNi, withPayerAccount, moneyIn, moneyOut }
ImportBatch  = { id, bankCode, fileName, periodFrom|null, periodTo|null, rowsTotal|null,
  rowsInserted|null, rowsDuplicate|null, uploadedAt, uploadedBy|null }
MatchSummary = { lines, autoMatched, matched, partiallyMatched, needsReview, yetToTake, excluded, unprocessed }
```

`matching: null` means the import succeeded but matching failed; say "lines will be matched when
matching is run again". After upload show (`data-testid="match-summary"`):
**"N matched automatically, N for review, N yet to take, N excluded"**, with a button
**Review these lines** → `/review?batchId=<batchId>`.

### 5.6 Matching / review queue — BUILT (recon-202), UI = recon-203

| Method & path | Who | Body / query | Response |
| --- | --- | --- | --- |
| `GET /matching/lines` | all | `?status=open|new|needs_review|yet_to_take|partially_matched|matched|excluded` (default `open` = needs_review + yet_to_take + partially_matched) `&bankAccountId&batchId&limit(1–200, def 50)&offset` | `{ lines: BankLine[], total }` |
| `GET /matching/lines/:id` | all | — | `{ line }` / 404 |
| `POST /matching/lines/:id/confirm` | writers | **exactly one of** `suggestionId` or `tid` (`T1234`), plus optional `payer`, `remember` (bool, default false), `amount` (string; default = whole `remaining`) | `{ line }` |
| `POST /matching/lines/:id/suggestions/:sid/reject` | writers | — | `{ line }` (no open suggestions left → line becomes `yet_to_take`) |
| `POST /matching/lines/:id/exclude` | writers | `{ reason }` 2–200 chars | `{ line }` |
| `POST /matching/lines/:id/include` | writers | — | `{ line }` (re-runs matching; may come back `matched` or `needs_review`) |
| `POST /matching/run` | writers | `{ batchId? }` | `{ processed, autoMatched, summary? }` (summary only when batchId given) |
| `GET /matching/imports/:batchId/summary` | all | — | `{ summary: MatchSummary }` |

Confirm errors: 400 `bad_request` (amount > remaining, line already matched/excluded, unknown TID,
both/neither of suggestionId/tid). Show the server message inline in the drawer.

```ts
LineStatus = 'new'|'excluded'|'needs_review'|'yet_to_take'|'partially_matched'|'matched'
Payer      = 'tenant'|'council_hb'|'dwp_uc'|'other_third_party'
BankLine = { id, bankCode, importBatchId, txnDate, amount, remaining, description,
  reference|null, counterparty|null, payerAccountLast4|null, extractedTid|null,
  status: LineStatus, exclusionReason|null, note|null,
  suggestions: Suggestion[],   // sorted best first
  receipts: ReceiptView[] }
Suggestion  = { id, tid, tenantName|null, payer, method, confidence: number /*0–1*/, reason|null,
  status: 'open'|'accepted'|'rejected' }
ReceiptView = { id, tid, payer, amount, ledgerCode|null, matchedVia, matchedBy|null /*null = automatic*/ }
```

Match methods / confidence (for the badge colour and tooltip): TID in reference 1.0; NI number 0.95
(0.6 when ambiguous); remembered payer account 0.95 / 0.7 / 0.4; reference rule 0.95; fuzzy name ≤ 0.6.
Auto-match threshold is **0.95**. Colour: ≥ 0.95 green, ≥ 0.6 yellow, else grey; show as a percentage.

---

## 6. Screens to build

### 6.1 Review queue — `/review` (recon-203, NEXT)

Purpose: clear every line that wasn't auto-matched.

- **Filters row:** status `SegmentedControl` (Open · Needs review · Yet to take · Part matched ·
  Matched · Excluded), bank `Select` (from `/bank-accounts`), and a batch chip when `?batchId=` is in the URL
  (with ✕ to clear). Keep filters in the URL query string so links can be shared.
- **Table** (`aria-label="Bank lines"`): Date · Bank · Description (with reference + counterparty in
  dimmed text below) · Amount (right-aligned, red if negative) · Remaining · Best suggestion
  (TID + tenant name + confidence badge) · Status badge. Pagination at 50 per page using `total`.
- **Row click → line drawer** (Mantine `Drawer`, right, title = description):
  - Line facts: date, amount, remaining, reference, counterparty, payer account `••••1234`, TID found in text.
  - **Suggestions list**, best first. Each: TID, tenant name, method, reason, confidence badge, and
    buttons **Accept** and **Reject** (aria-label `Accept T1234` / `Reject T1234`). Accept opens an inline form:
    payer `Select` (pre-filled from the suggestion), amount (pre-filled with `remaining`; editable
    for a part payment), checkbox **Remember this payer account for this tenancy** (only if
    `payerAccountLast4` exists), then **Confirm**.
  - **Pick another tenancy:** a search `Autocomplete` using `GET /tenancies?q=` (TID, name or NI), then
    the same payer / amount / remember form → confirm with `{ tid }`.
  - **Exclude** (with a required reason textarea: e.g. "Internal transfer", "Bank charge") and, for
    excluded lines, **Include again**.
  - Existing **receipts** on the line: TID, payer, amount, ledger code, "Automatic" or the person's name.
- After any action: replace the line in the cache with the returned `line`, invalidate
  `['matching','lines']` and the nav badge count, show a green `@mantine/notifications` toast, and move to the next line
  (keyboard: `j`/`k` next/previous, `a` accept the top suggestion, `x` exclude).
- **Yet to take** tab = same table; the drawer leads with "Pick another tenancy" because there are no suggestions.
- readonly users see the drawer without action buttons.
- **e2e (`e2e/review.spec.ts`):** upload a synthetic file → summary → Review these lines → accept a
  suggestion → line disappears from Open; manual match by TID; reject the last suggestion → it moves to Yet to take;
  exclude, then include.

### 6.2 Upload statement — `/upload` (BUILT; small additions)

Already: bank select (only banks with a profile are enabled), file input, upload, result summary, recent imports.
Add: **Review these lines** button in the summary; a "Matched / for review" column on the recent-imports
table using `GET /matching/imports/:batchId/summary` (lazy, per row).

### 6.3 Tenancies — `/tenancies` (BUILT)

No changes needed for 203. Later (103) the detail drawer gains a rent account tab.

### 6.4 CSV profiles — `/csv-profiles` (BUILT)

Per bank: current profile version, header aliases per canonical field (tags input), required fields,
amount mode, date format, skip rows, notes → **Save new version**. Admin: **Install default banks** when empty.

### 6.5 Vico export — `/vico` (recon-302, PLANNED)

Backend view `v_vico_export` lists confirmed receipts not yet exported (TID, amount, constant sort code
and account). Planned API — confirm when 302 lands:

- `GET /api/vico/pending` → `{ rows: { receiptId, tid, amount, txnDate, bankCode }[], total, totalAmount }`
- `POST /api/vico/exports` `{ receiptIds?: string[] }` → file download (`text/csv`, `Content-Disposition`), marks each receipt exported **once** (re-export of the same receipt is refused).
- `GET /api/vico/exports` → history `{ exports: { id, createdAt, createdBy, rows, totalAmount, fileName }[] }`, each re-downloadable.

Screen: pending table with total, **Download Vico file** (confirm modal showing count + total), history table below.

### 6.6 Xero — `/xero` (recon-303, PLANNED)

Posts one Xero invoice per confirmed receipt through Sam's Omnia Xero OHL bridge (contact upsert, ledger
code + property tracking from `dim_PropertyXeroMap`, `externalRef` idempotency). Target is **Demo
Company** until a person explicitly switches to live. Planned API — confirm when 303 lands:

- `GET /api/xero/status` → `{ configured: boolean, targetEnv: 'demo'|'live', bridgeReachable: boolean }`
- `GET /api/xero/outbox?status=pending|sent|failed` → `{ items: { id, receiptId, tid, amount, status, attempts, lastError|null, xeroInvoiceId|null, updatedAt }[], total }`
- `POST /api/xero/outbox/run` → `{ sent, failed }`; `POST /api/xero/outbox/:id/retry`
- Posting to a non-demo target is refused unless the body carries `confirm_live: true`.

Screen: a status card (environment badge **DEMO** yellow / **LIVE** red, bridge reachable), outbox tabs
(Pending · Sent · Failed), failed rows show `lastError` and attempts (max 5) with **Retry**. "Send now"
on live requires typing `LIVE` in a confirm modal. If not configured, show an info alert: "Xero bridge
not configured — set XERO_BRIDGE_URL and the key on the server".

### 6.7 Later (lower priority — don't build yet)

- **Dashboard `/` (401):** today's imports per bank, auto-match rate, review backlog, balances per payer, arrears ageing.
- **Rent terms (103), payer accounts (104), LetMC import (105), receipt operations (204: split council
  payment, reverse, write-off/refund), statement CSV download (301), branches/landlords/properties (101).**
  Until built, keep `/` as the current simple home page with links to Upload and Review.

---

## 7. Visual guidelines

- Mantine defaults, `primaryColor: 'blue'`, compact density (`size="sm"` inputs, `Table` `striped highlightOnHover`, `verticalSpacing="xs"`).
- Status badge colours: matched green · partially_matched teal · needs_review yellow · yet_to_take orange · excluded gray · new blue.
- Amounts: monospace digits (`ff="monospace"` or `fw={500}` with tabular nums), right-aligned, negative in red.
- Empty states: dimmed text explaining what to do next ("Nothing to review — upload a statement").
- Loading: `Skeleton` rows in tables, `loading` prop on buttons; never block the whole page.
- Must work at 1280px desktop first; navbar collapses below `sm`.

---

## 8. Definition of done for any screen

1. Uses only the endpoints above, typed in the feature's `api.ts`.
2. Role-gated actions hidden for roles that can't use them; 403 still handled.
3. Every server error code shown with its message; 401 sends the user to `/login`.
4. NI masked unless `ni` present; payer accounts last-4 only.
5. `npm run lint`, `npm run typecheck`, and the feature's Playwright spec pass.
