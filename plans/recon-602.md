# recon-602: multi-row Journal Transfer on the Omnia ledger (server)
Goal: a Journal Transfer becomes 2-20 entries (person, account type, signed amount) that net to zero, as on the LetMC grid. Every
transfer, both new and existing, posts to the recon-601 ledger. The recon-506 two-tenant body and CSV keep working byte for byte.
UI comes in recon-603. Depends on recon-601.

## Files
Create: db/migrations/019_agentos_journal_multirow.sql, server/src/domain/agentos/journal.ts,
server/test/unit/agentos-journal.test.ts. Modify: server/src/services/agentos/journal.service.ts,
server/src/api/agentos/routes.ts, server/test/int/agentos-journal.test.ts (add cases, keep existing ones unchanged).

## Steps
1. 019 (`BEGIN; SET LOCAL app.user_email = 'migration:019'; ... COMMIT;`). Use the default Postgres constraint names below. Don't use IF EXISTS, so a wrong
   name fails loudly.
   - `agentos_journal_entries`: `DROP CONSTRAINT agentos_journal_entries_transfer_id_side_key`, then `ADD COLUMN line_no int NOT NULL DEFAULT 1
     CHECK (line_no BETWEEN 1 AND 20)`, then `ADD COLUMN account_type text`. Run `UPDATE ... SET line_no = 2 WHERE side='to'` and
     backfill account_type from the parent transfer. Then `SET NOT NULL`, add `CHECK (char_length(account_type) BETWEEN 1 AND 50)` and
     `CONSTRAINT agentos_journal_entries_line_key UNIQUE (transfer_id, line_no)`. Keep `side` and its check, so side means the sign (from = negative).
   - `agentos_journal_transfers`: `ALTER from_tid, to_tid, account_type DROP NOT NULL`, `DROP CONSTRAINT agentos_journal_transfers_check`,
     `ADD COLUMN client_request_id uuid UNIQUE`, and `ADD CONSTRAINT agentos_journal_transfers_pair_chk CHECK (from_tid IS NULL OR to_tid IS NULL OR from_tid <> to_tid)`.
   - `CREATE OR REPLACE FUNCTION agentos_journal_zero_sum()` should fail when `count(*) < 2 OR sum <> 0` with the message
     `'journal transfer % must have at least 2 entries summing to 0'`. The existing int test matches /summing to 0/.
   - Ledger backfill: `INSERT INTO ledger_transactions (kind, source_id, idempotency_key, effective_on, description, created_by, created_at)
     SELECT 'journal_transfer', id, 'journal_transfer:'||id, created_at::date, left('Journal Transfer - '||description,300), created_by, created_at
     FROM agentos_journal_transfers`, then one tenant posting per entry (`account_ref = tid`, account_type, amount_pence) joined on source_id.
2. domain/agentos/journal.ts (pure): `validateJournalEntries(entries: {tid:string; accountType:string; amountPence:number}[])`
   throws 400 when there are fewer than 2 or more than 20 entries, an amount is 0 or not an integer, an abs amount exceeds 9999999999, the sum is not 0
   ('Entries must add up to £0.00'), or a (tid, lower(trim(accountType))) pair repeats. Messages name the entry as `Entry <n>`.
3. journal.service.ts:
   - `createJournalTransfer(db, {clientRequestId?, description, nominalCode, entries:[{agentosTenantId, accountType, amountPence}], userId})`
     runs in one tx. Load tenants by id; if one is missing, return 400 `Entry <n>: no such agentOS tenant`, and if tid is null, return 400 `Entry <n>: tenant has no TID`. Then run validateJournalEntries.
     The transfer row gets amount_pence = sum of the positive amounts. from_tid/to_tid are set only when there are exactly 2 entries, and are NULL otherwise.
     account_type is the shared value if every entry has the same one, and NULL otherwise. clientRequestId is used when provided, with
     `ON CONFLICT (client_request_id) DO NOTHING`. On a replay, return the existing transfer with `created:false` if description, nominal code and the
     ordered (tenantId, accountType, amount) list match; otherwise return 409 'clientRequestId was already used for a different journal'.
     Entries get line_no = i+1, side = amount<0 ? 'from' : 'to', person = paymentFrom(...), branch = managed_by, property = residence, and account_type.
     Then call `postTransaction(c, {kind:'journal_transfer', sourceId, description:'Journal Transfer - '+description (300 max),
     postings: entries.map(tenant, tid, accountType, amount)})`.
   - `createLegacyJournalTransfer(db, {fromTid,toTid,amountPence,description,nominalCode,accountType,userId})`: if fromTid equals toTid, return 400 (same text as now).
     Pick one representative tenant per TID with `SELECT DISTINCT ON (tid) id, tid FROM agentos_tenants WHERE tid = ANY($1) ORDER BY tid,
     (source='seed') DESC, agentos_ref NULLS LAST, id`. A missing TID gives 400 `No agentOS tenant has TID <tid>` (same as now). Then call createJournalTransfer with
     entries `[{from,-amt},{to,+amt}]`, both using accountType.
   - DTO: fromTid/toTid become `string|null`, accountType becomes `string|null`, and each entry gains `lineNo`, `accountType`. Load entries ORDER BY transfer_id, line_no.
   - Export: build one row per entry in line_no order, with Account Type = entry.account_type and Account Balance left as '' (unchanged). A legacy transfer's bytes stay identical.
4. routes.ts POST `/journal/transfers` accepts `z.union([multiBody, journalBody])`. multiBody is `{clientRequestId: uuid, description 1..200,
   nominalCode 1..50, entries: array(2..20) of {agentosTenantId: uuid, accountType: trim 1..50, amountPence: int, non-zero}}`.
   Route multiBody to createJournalTransfer and the legacy shape to createLegacyJournalTransfer. Return 201 when created and 200 on replay. A field error message names
   the path joined with '.' (e.g. `entries.1.amountPence`). Nominal Code and Account Type stay free text (decision 2026-10-06).

## Edge cases
Three-way splits, e.g. -100/+60/+40. Two account types on one TID, e.g. -50 Rent / +50 Deposit, are allowed. A duplicate pair gets 400. A retry with the same id gets 200
with one ledger tx. Joint tenants (shared TID) post to the same ledger account. Tests that `DELETE FROM agentos_journal_transfers` still
work because the ledger has no FK to sources.

## Risks / rollback
019 changes recon-506 constraints. Down migration (by hand): delete multi-row transfers, restore NOT NULLs, the `side` unique key and the old trigger
text, and drop line_no, account_type and client_request_id. Ledger rows are append-only and stay; that is accepted, because they are history.

## Out of scope
Journal Transfer Closed (ended tenancies), configurable nominal code/account type lists, Account Balance in the CSV, UI (recon-603),
pushing journals to Xero.

## Verify
`npm run test:unit -- agentos-journal`, `npm run test:int -- agentos`, `npm run db:test`, lint, typecheck all exit 0. Passing means:
the old journal int tests are unchanged and green; the new cases pass (3-entry transfer gives 3 ledger postings summing to 0 and
balances via GET /api/agentos/ledger/:tid; unbalanced, duplicate pair, no-TID and 21 entries each give 400 with no rows; replay gives 200 and mismatch gives 409; legacy
body CSV bytes are unchanged; a 3-entry export writes 3 rows in line order; every transfer has exactly one ledger_transactions row).
