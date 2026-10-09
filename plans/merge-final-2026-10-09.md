# Plan: finish merge of origin/final into update/agentos-receipts (2026-10-09)

## Goal
Make the staged merge pass typecheck and e2e without changing either side's behaviour: the tenancy-record
Journal Transfer uses the recon-602 `entries` API (2 entries, -x / +x), and e2e locators are scoped.

## Files to modify
web/src/features/tenancy-record/JournalTransferModal.tsx, OverviewSection.tsx, tenancyRecord.test.tsx;
e2e/tenancies.spec.ts, e2e/property.spec.ts, e2e/rent.spec.ts, e2e/dashboard.spec.ts. Nothing in server/ or agentos/api.ts.

## Facts (checked, no need to re-check)
- GET /api/agentos/tenants returns only `{ id, tid, name }` (server/src/services/agentos/reassign.service.ts:12-33). It never sent depositTo, so the type is NOT restored; the UI that read it showed blanks on final.
- test-results/*/error-context.md: `getByLabel('Search')` hits the GlobalSearch textbox, the page `searchbox "Search"` and `listbox "Search results"`; rent `getByRole('dialog')` hits "Add benefit award" + "Add this benefit award?".
- Dashboard B "timeout" comes from final's GlobalSearch, not our branch: `getByLabel('TID')` resolved to the GlobalSearch box (its aria-label contains "TID") before StatementCard rendered, so T9004 went into global search, "Download CSV" stayed disabled and waitForEvent('download') hit 30 s. It fails on origin/final alone too (plans/recon-601-frontend.md step 8: final's e2e was never run). Dashboard C was skipped (serial mode), so it is unverified.

## Steps
1. JournalTransferModal.tsx, component body: keep the local `const fromTid = agentosTid(tid)` (a local, not an API field). After the `pending` state add `const [requestId, setRequestId] = useState(() => globalThis.crypto.randomUUID());`. Reason: entries API needs clientRequestId; same pattern as agentos/JournalSection.tsx:99.
2. JournalTransferModal.tsx, `confirm()`: replace the guard and the first `create.mutate` argument with:
   ```ts
   const toTenant = tenants.data?.find((t) => t.tid === pending?.toTid) ?? null;
   if (!pending || !from || !toTenant) return;
   const pence = parsePounds(pending.amount)!;
   const accountType = pending.accountType.trim();
   create.mutate(
     { clientRequestId: requestId, description: pending.description.trim(), nominalCode: pending.nominalCode.trim(),
       entries: [{ agentosTenantId: from.id, accountType, amountPence: -pence }, { agentosTenantId: toTenant.id, accountType, amountPence: pence }] },
   ```
   Keep the existing `{ onSuccess, onError }` object; in onSuccess add `setRequestId(globalThis.crypto.randomUUID());` before `close()`. Reason: 2-entry zero-sum body equals the legacy fromTid/toTid transfer.
3. JournalTransferModal.tsx, `close()`: add `setRequestId(globalThis.crypto.randomUUID());`. Reason: reopening is a new transfer; a retry after onError keeps the same id (idempotent replay, as JournalSection).
4. JournalTransferModal.tsx, entries table: delete `<Table.Th>Deposit to</Table.Th>` and both `depositTo` cells (`{from?.depositTo ?? '—'}`, `{to?.depositTo ?? '—'}`); Tfoot `colSpan={3}` -> `colSpan={2}`. Reason: field does not exist on the server.
5. JournalTransferModal.tsx, doc comment (lines 29-30): replace "the server builds the zero-sum entries and the export file" with "it sends two entries (-amount from this tenant, +amount to the other) that net to zero (recon-602 entries API); the server builds the export file".
6. OverviewSection.tsx line 173: delete `<Fact label="Will deposit to">{agent.depositTo}</Fact>`. Reason: same as 4.
7. tenancyRecord.test.tsx line 90: tenants mock becomes `[{ id: 'a1', tid: '1234', name: 'Jordan Smith' }, { id: 'a2', tid: '5678', name: 'Sam Lee' }]`; before line 91 add `if (url.pathname === '/api/agentos/journal/transfers' && method === 'POST') return json(201, { transfer: { id: 'j1', entries: [] } });`
8. tenancyRecord.test.tsx line 144: assert `findByText('1234 Jordan Smith')` instead of 'ISL Client Account'.
9. tenancyRecord.test.tsx: add test "posts a journal transfer as two entries netting to zero" (role accounts), modelled on the refund test: Actions -> menuitem 'Journal transfer' -> dialog `/^Journal Transfer/`; type Description 'Move overpayment', Nominal Code '1200', Account Type 'Rent'; open "To tenant" select, click option '5678 Sam Lee'; Amount '120.50'; click button 'Journal Transfer'; in dialog 'Create this journal transfer?' click 'Create transfer'. Assert `posts[0]` toEqual `{ path: '/api/agentos/journal/transfers', body: { clientRequestId: expect.any(String), description: 'Move overpayment', nominalCode: '1200', entries: [{ agentosTenantId: 'a1', accountType: 'Rent', amountPence: -12050 }, { agentosTenantId: 'a2', accountType: 'Rent', amountPence: 12050 }] } }`. If the Mantine Select needs a different click sequence in jsdom, change only the interaction, never the assertion.
10. e2e/tenancies.spec.ts lines 47, 64, 73 and e2e/property.spec.ts line 74: `page.getByLabel('Search')` -> `page.getByRole('searchbox', { name: 'Search', exact: true })`. Reason: labels are distinct (no a11y defect), so app labels stay.
11. e2e/rent.spec.ts line 65: `page.getByRole('dialog')` -> `page.getByRole('dialog', { name: 'Add benefit award', exact: true })`.
12. e2e/dashboard.spec.ts lines 78 and 95: `page.getByLabel('TID')` -> `page.getByRole('main').getByLabel('TID', { exact: true })`; line 79 `page.getByLabel('From')` -> `page.getByRole('main').getByLabel('From', { exact: true })`.

## Edge cases
- Two agentOS rows share a TID: `find` takes the first, same as JournalSection and the server order (tid, agentos_ref).
- Tenant not in agentOS: submit already disabled (`notInAgentos`); confirm() returns early when `from` is null.
- Amount never negative (parsePounds rejects '-') and zero fails validation, so no 0 entries.

## Risks and rollback
- Server still accepts the legacy body; no web code uses it after this. Rollback = `git checkout -- <file>` per file; merge stays staged.
- Tenancies specs never ran past the Search line on this tree and final changed TenancyDrawer: a new failure after step 10 is possible. Report it with its error-context.md; do not patch blindly.

## Out of scope
Adding depositTo to the tenants endpoint (server/API change, user decision); editing plans/recon-601-frontend.md line 81; any GlobalSearch label change.

## Verify (PowerShell, Docker PG on 5433, nothing listening on 3001/5173)
1. `npm run typecheck` -> exit 0 (was 4 errors). `npm run lint` -> exit 0.
2. `npm run test:web` -> all pass; tenancyRecord.test.tsx has 8 tests (was 7).
3. `$env:CI='1'; $env:E2E_DATABASE_URL='postgres://omnia:omnia_local_dev@localhost:5433/omnia_e2e'; npx playwright test e2e/tenancies.spec.ts e2e/property.spec.ts e2e/rent.spec.ts e2e/dashboard.spec.ts` -> 0 failed; dashboard A, B, C all run.
4. Same env: `npm run test:e2e` -> 0 failed, 0 skipped (was 6 failed / 36 passed; dashboard C now runs too).
5. Only then the main session commits the merge.
