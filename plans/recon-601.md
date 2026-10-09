# recon-601: Omnia ledger + single Take a Payment (server)
Goal: Omnia gets its own append-only double-entry ledger (owner decision 2026-10-07, replaces "Xero is the only ledger")
and an API to take one payment for one agentOS tenant. It posts to the ledger and is pushed out through the existing
Take a Payment CSV. Split: this feature is server only. The UI is recon-603.

## Files
Create: db/migrations/018_ledger_take_payment.sql, server/src/domain/ledger/posting.ts,
server/src/services/ledger/ledger.service.ts, server/src/services/agentos/payment.service.ts,
server/test/unit/ledger-posting.test.ts, server/test/int/agentos-payment.test.ts. Modify: server/src/api/agentos/routes.ts.

## Steps
1. 018 (`BEGIN; SET LOCAL app.user_email = 'migration:018'; ... COMMIT;`). Create:
   - `ledger_transactions(id uuid pk, kind text CHECK IN ('take_payment','journal_transfer'), source_id uuid NOT NULL,
     idempotency_key text NOT NULL UNIQUE CHECK (idempotency_key = kind||':'||source_id::text), effective_on date NOT NULL
     DEFAULT current_date, description text NOT NULL 1..300, created_by uuid NOT NULL -> app_users, created_at)`, UNIQUE(kind, source_id).
   - `ledger_postings(id, transaction_id uuid NOT NULL -> ledger_transactions, account_kind text CHECK IN ('tenant','bank'),
     account_ref text NOT NULL, account_type text NULL 1..50, amount_pence bigint NOT NULL CHECK (<>0 AND abs<=9999999999),
     created_at)`, `CHECK (account_kind <> 'tenant' OR account_ref ~ '^\d{4,5}$')`. Index (account_kind, account_ref) and (transaction_id).
   - A deferred constraint trigger, copied from 015, that raises `'ledger transaction % must have at least 2 postings summing to 0'`.
   - `ledger_append_only()` BEFORE UPDATE OR DELETE row trigger on both tables that raises `'ledger rows are append-only'`.
     Reason: history can't be rewritten. TRUNCATE in tests still works.
   - `audit_row()` triggers on all new tables. Add `VIEW ledger_balances(account_kind, account_ref, balance_pence, postings, last_posted_at)`, which is the sum grouped by account.
   - `agentos_payment_types(code text pk CHECK ~'^[A-Z_]{2,20}$', label text NOT NULL, is_active bool DEFAULT true, created_at)`.
     Seed only `('CARD','Card')`. The list is extendable by INSERT (owner: Card only for now).
   - `agentos_payments`: id, client_request_id uuid NOT NULL UNIQUE, agentos_tenant_id -> agentos_tenants ON DELETE SET NULL,
     tid text NOT NULL ~'^\d{4,5}$', payment_from text NOT NULL 1..300, receiving_account_code text NOT NULL -> bank_accounts(code),
     deposit_to text NOT NULL, payment_type text NOT NULL -> agentos_payment_types(code), amount_pence bigint >0 <=9999999999,
     description text NOT NULL DEFAULT '' <=500, card_auth_code text NULL ~'^[A-Za-z0-9]{1,20}$', posting_status
     ('not_exported','exported','posted') DEFAULT 'not_exported', export_id -> agentos_exports, posted_at, posted_by, created_by,
     created_at, updated_at. Add the same export_chk/posted_chk pair as 015, plus an index on export_id.
   - `ALTER TABLE agentos_exports ALTER batch_id DROP NOT NULL, ADD source text NOT NULL DEFAULT 'intake' CHECK IN
     ('intake','manual'), ADD CONSTRAINT agentos_exports_source_batch_chk CHECK ((source='intake') = (batch_id IS NOT NULL))`.
     Reason: one export table, so the existing GET /exports/:id.csv serves manual exports unchanged.
2. domain/ledger/posting.ts (pure): `type Posting = {accountKind:'tenant'|'bank'; accountRef; accountType?: string|null; amountPence:number}`;
   `validatePostings(p)` throws `AppError('bad_request', ...)` if there are fewer than 2 postings, any amount is 0 or not an integer, the sum is not 0,
   or a tenant ref fails `^\d{4,5}$`. `takePaymentPostings(tid, bankCode, amount)` returns `[{tenant,tid,+amount},{bank,bankCode,-amount}]`.
   Sign rule: + means the account is credited. A tenant's balance is the sum of its postings, where + means the tenant has paid in.
3. services/ledger/ledger.service.ts: `postTransaction(c: Queryable, {kind, sourceId, description, createdBy, postings})`
   calls validatePostings, then `INSERT ... ON CONFLICT (idempotency_key) DO NOTHING RETURNING id`. If a row comes back, insert the postings
   and return `{transactionId, created:true}`. Otherwise return the existing id with `created:false`. `getTenantLedger(pool, tid)` returns
   `{tid, balancePence, postings:[{transactionId, kind, effectiveOn, description, accountType, amountPence, createdAt}]}`, newest first, limit 100.
4. services/agentos/payment.service.ts (copy the `cell` helper pattern; import `buildTakePaymentCsv` and `paymentFrom` from export.service):
   - `listPaymentOptions(pool)` returns `{depositAccounts:[{code,label:account_name}] (active, by code), paymentTypes:[{code,label}] (active)}`.
   - `createPayment(db, input)` runs in one tx. Look the tenant up by id; if it is missing, return 400 'No such agentOS tenant'; if tid is null, return 400 'This agentOS tenant has no TID'.
     If the bank code is missing or inactive, return 400 'Unknown or inactive deposit account'. If the type is missing or inactive, return 400 'Unknown payment type'. Then
     `INSERT ... ON CONFLICT (client_request_id) DO NOTHING`. On conflict, load the existing row. If tenant, code, type, amount, description and card code are
     all equal, return `{payment, created:false}`; otherwise return 409 'clientRequestId was already used for a different payment'. If the row is new, call postTransaction
     (kind take_payment, sourceId payment.id, description `Take a Payment (<type label>)` plus ` - <description>` when non-empty, cut to 300 characters).
   - `createPaymentExport(db,{userId})` takes `pg_advisory_xact_lock(hashtext('agentos-payment-export'))`, then selects not_exported rows
     ORDER BY created_at, id FOR UPDATE. Each CSV row is `[tid, payment_from, deposit_to, type label, pounds(amount), desc]`, where desc is the non-empty parts of
     `[description, cardAuthCode ? 'Auth '+code : '', 'Recon '+id]` joined with ' | '. Insert agentos_exports with source 'manual' and batch_id NULL, then mark the rows exported.
   - `listPayments(pool)` (limit 200, newest first) and `markPaymentPosted(db,{paymentId,userId})`, mirroring markLinePosted (404/409 texts say "payment").
5. routes.ts: add these routes and doc-comment lines. Body errors use the journal-style `Invalid <field>: <rule>`.
   GET `/payments/options`, GET `/payments`, GET `/ledger/:tid` (404 unless `^\d{4,5}$`) are open to any signed-in user.
   POST `/payments` (requireWriter) takes body `{clientRequestId: uuid, agentosTenantId: uuid, depositAccountCode: 1..30, paymentType: 1..20,
   amountPence: int 1..9999999999, description?: trim <=500 default '', cardAuthCode?: trim, ''->undefined, ^[A-Za-z0-9]{1,20}$}`. It returns 201 when created and
   200 on replay, as `{payment, balancePence}`. POST `/payments/exports` and POST `/payments/:id/posted` both need requireWriter. Register these routes
   before any `/:id`-style routes.

## Edge cases
Double-click or retry sends the same clientRequestId: one payment and one ledger tx come back with 200. A tenant without a TID gets 400. Joint tenants share a TID,
so the ledger account is the TID and Payment From is the picked person. An empty export is header only. Exporting an intake batch must not pick up manual rows.

## Risks / rollback
Moving ledger authority to Omnia changes a recorded decision; that is owner-approved. 018 is additive except for agentos_exports.batch_id.
Down migration (written by hand): drop the new tables, view and functions, and restore batch_id NOT NULL (only possible while no manual exports exist).

## Out of scope (later features)
Posting bank-file intake receipts to the ledger (needed for true balances; propose recon-617). Xero push of ledger
transactions: the Xero path only invoices core receipts via the outbox, which is not cheap here, so it is a later feature. Refunds, reversals, UI (603).

## Verify
`npm run test:unit -- ledger`, `npm run test:int -- agentos`, `npm run db:test`, lint, typecheck all exit 0. That means the
new int tests pass (create, replay, 409 on mismatch, 400s leave no rows, 401/403, ledger 2 postings summing to 0, balance,
DB refuses UPDATE/DELETE of postings and an unbalanced tx, exact export bytes, header-only second export,
posted once then 409, concurrent exports split once, audit rows), and every existing agentos int test still passes.
