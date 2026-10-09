# recon-603: agentOS accounting UI (Take a Payment dialog, multi-row Journal Transfer grid, ledger balance)
Goal: the web half of recon-601/602, split out so each stays to one coder pass. Depends on recon-601 and recon-602.

## Files
Create: web/src/features/agentos/TakePaymentSection.tsx, e2e/agentos-payment.spec.ts,
server/test/fixtures/agentos-payment-seed.ts. Modify: web/src/features/agentos/{api.ts, JournalSection.tsx, AgentosPage.tsx,
agentos.test.tsx}, e2e/agentos-journal.spec.ts.

## Steps
1. api.ts: add types and calls for GET `/api/agentos/payments/options`, GET/POST `/api/agentos/payments`, POST `/payments/exports`,
   POST `/payments/:id/posted` and GET `/api/agentos/ledger/:tid`. The journal POST sends the multi body. JournalTransfer fromTid/toTid/accountType
   become nullable, and entries gain lineNo/accountType.
2. TakePaymentSection.tsx mirrors JournalSection's layout. It has a tenant picker (GET /api/agentos/tenants, label = name), and after a pick it shows
   "Payment From" (read-only) and "Omnia ledger balance". It also has Will deposit to (select from options.depositAccounts), Type (select,
   defaulting to the first type), Amount (required, > 0, 2 dp, converted to pence with the existing format helpers), and Description plus an optional
   "Card authorisation code". One `crypto.randomUUID()` clientRequestId is made per dialog open, so a double submit is idempotent. Below that is a recent
   payments table with Export (download via the existing `/api/agentos/exports/:id.csv`) and Mark posted. Writers only; readonly users see the table.
3. JournalSection.tsx: Description, Nominal Code (free text), and an entries grid with columns Person (tenant picker), Branch and Property (read
   from the tenant), Account Type (free text), Account Balance (from the ledger endpoint), and Amount (signed). It has Add row and Remove row buttons and a
   running total. Submit is disabled until there are 2 or more rows and the total is £0.00. The list shows every entry.
4. AgentosPage.tsx renders `<TakePaymentSection writer={writer} />` above `<JournalSection .../>`.
5. agentos-payment-seed.ts upserts one active bank account (code `E2E_CLIENT`, synthetic names) and runs the existing reassign seed.

## Edge cases
The balance is unavailable for a tenant with no TID (the picker already hides those). Amounts must not hit floating-point rounding (use integer pence).
A server 409 or 400 message shows inline.

## Verify
`npm run test:web -- agentos`, `npm run test:e2e -- agentos-payment.spec`, `npm run test:e2e -- agentos-journal.spec`, lint,
typecheck all exit 0. The e2e test takes a £12.34 Card payment, sees the balance rise by 12.34, exports a 2-line CSV and marks it posted.
A 3-row journal is posted, and readonly users see no forms.
