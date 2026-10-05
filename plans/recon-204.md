# Plan recon-204: receipt operations (split / remittance, allocation override, reversal, write-off + refund)

## Goal
Page /receipts lets accounts staff split a bank line into exact-sum receipts (by hand or from a council remittance CSV), pin allocations by hand,
reverse a receipt, and record write-offs/refunds. Every change is audited; nothing is changed after Xero/Vico has the money without a recorded correction.

## Files
Create: db/migrations/009_receipt_operations.sql; server/src/domain/remittance/{layout.ts,parse.ts}; server/src/services/receipt/{receipt.service.ts,
external-state.ts}; server/src/services/remittance/remittance.service.ts; server/src/services/adjustment/adjustment.service.ts; server/src/api/receipt/routes.ts;
server/src/api/remittance/routes.ts; server/src/api/adjustment/routes.ts; web/src/features/receipts/{api.ts,ReceiptsPage.tsx,ReceiptDrawer.tsx,SplitLineModal.tsx,
RemittanceUpload.tsx,AllocationEditor.tsx,AdjustmentsPanel.tsx}; server/test/fixtures/remittance/{README.md,remittance.csv,remittance-bad.csv};
server/test/int/{receipt-operations.test.ts,receipt-remittance.test.ts}; e2e/receipts.spec.ts. Modify: server/src/api/app.ts, web/src/app/routes.tsx, navigation.ts.
Reuse without editing: toPence (services/rent/money), normaliseHeader (domain/ingest/profiles), parseMoney/parseDate (domain/ingest/parse), csv-parse, multer,
CsvFilePicker + toErrorCsv/downloadErrorCsv (import from features/letmc-import). No new packages. Never edit matching, xero, vico, rent, letmc code.

## Fixed rules (doc comment at top of receipt.service.ts)
- Pence integers in TS; SQL writes `($n::bigint)::numeric/100`, reads `(amount*100)::bigint`. Roles: GET = any signed-in user; every write = requireRole('accounts') (+admin) + CSRF.
- Xero state of a receipt (external-state.ts `externalState(c, receiptIds)`): xr = external_refs(system 'xero', entity_type 'receipt'); outbox row =
  sync_outbox(system 'xero', idempotency_key 'recon-inv:'||xr.external_key2) - coder confirms this key in xero.service stageInvoices before writing SQL.
  none (no xr) | queued (pending/failed) | sending (in_flight) | stuck (dead) | sent (done). vicoExported = external_refs(system 'vico', entity_type 'receipt') exists.
- Reverse: none/queued -> allowed (xero send-time re-check drops reversed lines and deletes the claim). sending/stuck -> 409 "This receipt is being sent to Xero /
  its Xero batch failed; sort it out on the Xero page first". sent -> 409 unless body.xeroCreditRef (1-50 chars: number of the credit note staff raised in Xero;
  the bridge has no credit-note call). vicoExported -> 409 unless body.vicoNote (1-200 chars: how it was corrected in Vico). Both stored in receipts.external_correction.
- Allocation override and adjustments are Recon-only (Xero never gets allocations/adjustments) -> allowed in every Xero/Vico state.
- Split / remittance only CREATE receipts on a bank line (never edit sent ones); to re-split a confirmed line, reverse its receipts first (same rules).

## Steps
1. 009 (BEGIN/COMMIT): receipts ADD allocation_mode text NOT NULL DEFAULT 'auto' CHECK IN ('auto','manual'), reversed_by uuid REFERENCES app_users,
   reversed_at timestamptz, external_correction text (no status/reversed_at CHECK: xero tests set status directly). adjustments ADD reverses_adjustment_id uuid
   UNIQUE REFERENCES adjustments, CHECK (reverses_adjustment_id IS NULL OR kind = 'correction'). UNIQUE INDEX remittance_advices(bank_transaction_id) WHERE NOT NULL;
   remittance_advices ADD import_batch_id NOT NULL is NOT added (column exists, nullable; service always sets it). t_audit (audit_row) on remittance_advices, remittance_lines.
2. 009: CREATE OR REPLACE allocate_oldest_first = 001 body (lines 715-744) + after the status check:
   `IF r.allocation_mode = 'manual' THEN RETURN r.amount - coalesce((SELECT sum(amount) FROM allocations WHERE receipt_id = p_receipt), 0); END IF;`
3. 009: CREATE OR REPLACE refresh_rent_charges = 006 body, but before the DELETEs collect pins: `v_pins := (SELECT jsonb_agg(jsonb_build_object('r',a.receipt_id,
   'p',rc.payer,'s',rc.period_start,'a',a.amount,'by',a.allocated_by)) FROM allocations a JOIN rent_charges rc ON rc.id=a.rent_charge_id JOIN receipts r ON r.id=a.receipt_id
   WHERE rc.tenancy_id=p_tenancy AND rc.source='schedule' AND rc.period_end>=fd AND r.allocation_mode='manual')`. After generate_rent_charges, for each pin INSERT
   allocations(receipt_id, rent_charge_id, amount, allocated_by) using the new schedule charge with same tenancy/payer/period_start, amount = least(pin, charge outstanding),
   skip if no charge or <= 0; then reallocate_tenancy. Reason: rent refresh must not silently drop manual overrides.
4. 009: `recompute_line_status(p_txn uuid)`: s = sum active receipts; s=0 -> status 'needs_review', resolved_tenancy_id NULL, resolved_via NULL, note 'Receipt reversed';
   s<amount -> 'partially_matched'; else 'matched'. Used by reversal.
5. receipt.service.ts: `listReceipts(pool, {tid?, status?, bankTransactionId?, page})` (LEFT JOIN bank_transactions - lesson; 50/page) and `getReceipt(pool,id)` ->
   {id, tid, tenancyId, payer, amountPence, receivedOn, status, matchedVia, allocationMode, allocatedPence, reversedReason, externalCorrection, xeroState, vicoExported,
   bankLine{id, txnDate, description, amountPence, remainingPence}|null, allocations[{id, rentChargeId, periodStart, dueDate, amountPence, allocatedBy}],
   openCharges[{id, periodStart, dueDate, amountPence, outstandingPence}] (same tenancy+payer, from v_charge_status, plus charges this receipt already holds)}.
   `getBankLine(pool,id)` -> {id, txnDate, description, amountPence, remainingPence, status, receipts, remittance|null}.
6. `splitLine(db, userId, {bankTransactionId, parts[{tid,payer,amountPence}]})`: tx; lock line FOR UPDATE; 404 unknown; 409 if excluded or amount <= 0; parts 2-200,
   amountPence int >= 1, no repeated tid+payer (400); unknown tid -> 400 "Unknown TID T..."; sum must equal remainingPence exactly else 400 "Parts add up to £a but £b
   is left on this bank line". Per part `SELECT confirm_match(line, tenancy, payer, 'manual', false, user, pence::numeric/100)`; returns getBankLine.
7. `overrideAllocations(db, user, receiptId, [{rentChargeId, amountPence}])` (0-100 items; empty = pin "no allocation"): lock receipt; 409 if reversed; every charge
   same tenancy AND payer else 400; sum <= receipt (400 "Allocations £a exceed the receipt £b"); each <= outstanding excluding this receipt's own allocations (400).
   DELETE this receipt's allocations, INSERT new ones allocated_by = user email, SET allocation_mode 'manual'. `resetAllocations(db, receiptId)`: mode 'auto',
   DELETE allocations, `allocate_oldest_first`. Map trigger messages 'Allocation exceeds ...' -> 400.
8. `reverseReceipt(db, user, receiptId, {reason 3-500, xeroCreditRef?, vicoNote?})`: lock receipt; 409 if already reversed; apply Fixed rules; DELETE its allocations;
   UPDATE status 'reversed', reversed_reason, reversed_by, reversed_at now(), external_correction; `reallocate_tenancy`; `recompute_line_status` if bank line set.
9. domain/remittance/layout.ts: REMITTANCE_FIELDS {field,label,aliases}: tid 'TID' [Tenancy Ref, Tenancy ID]; claim_ref 'Claim Ref' [Claim Reference, Claim No, HB Ref];
   tenant_name 'Tenant Name' [Name, Claimant]; period_from 'Period From' [From, Start Date]; period_to 'Period To' [To, End Date]; amount 'Amount' (required)
   [Amount Paid, Payment, Paid]. File must have Amount and at least one of TID/Claim Ref columns. No NI column (privacy). parse.ts copies the letmc parse rules:
   csv-parse info.lines, BOM, max 2000 rows, errors 'bad_request'; amount via parseMoney > 0; dates ISO or DD/MM/YYYY, to >= from; row needs TID or Claim Ref;
   identical repeated row -> reject "Same as row N".
10. remittance.service.ts `runRemittance(db, user, {bankTransactionId, payer (council_hb|dwp_uc|other_third_party, default council_hb), payingBody 1-100,
   remittanceRef?, remittanceDate, fileName, content, dryRun, previewSha256?})`. Resolve each row: TID -> tenancies.tid; else upper(trim(claim ref)) =
   benefit_awards.claim_reference effective on remittanceDate -> its tenancy (0 -> reject "No tenancy for claim ref", >1 tenancies -> reject "Claim ref matches several
   tenancies"); TID and claim ref pointing at different tenancies -> reject. Line must have no active receipts (409 "This line already has receipts; reverse them
   first") and total == line amount (report.totalMismatch; commit -> 409 "Remittance total £a does not equal the bank line £b"). Same tx/advisory-lock/DryRunRollback/
   previewSha256 pattern as recon-105 (lock hashtext('remittance:'||lineId)). Idempotency: import_batches(source 'remittance', bank_account_id = line's,
   file_sha256, status 'parsed'): same sha already imported for THIS line -> return {alreadyImported:true, remittanceId} 200, no writes; same sha elsewhere -> 409;
   23505 on file_sha256 or the 009 unique index -> re-read and same answer (lesson). Commit inserts remittance_advices, remittance_lines (matched_tenancy_id, raw_row),
   then per line confirm_match(..., 'remittance_line', ..., amount) and `UPDATE receipts SET remittance_line_id`. Report {counts{rows,matched,rejected}, totalPence,
   linePence, rows[{line,tid,claimRef,amountPence,tenancyTid}], errors[{line,key,field,reason}]}.
11. adjustment.service.ts: `listAdjustments(pool, tid)` + balances from v_tenancy_balance in pence. `createAdjustment(db, user, {tid, payer, kind 'write_off'|'refund',
   amountPence >= 1, reason 3-500, effectiveOn? (default today, not future)})`: lock tenancy FOR UPDATE; balance = v_tenancy_balance row (0 if none); write_off needs
   amountPence <= balance -> INSERT kind write_off amount -pence; refund needs amountPence <= -balance -> kind refund_paid amount +pence; else 400 "Write-off is more
   than the arrears (£x)" / "Refund is more than the credit (£x)"; approved_by user. `reverseAdjustment(db,user,id,{reason})`: only write_off/refund_paid without a
   reversal (UNIQUE) -> INSERT kind correction, amount = -original, reverses_adjustment_id, effective_on today, reason 'Reverses <kind>: '||reason; else 409.
12. Routes (Zod .strict(), uuidOrNil like matching): receiptRouter({pool}): GET /, GET /:id, GET /bank-lines/:id, POST /split, PUT /:id/allocations,
   DELETE /:id/allocations, POST /:id/reverse. remittanceRouter({pool}): POST /preview, POST /commit (multer as letmc.routes, 10 MB, 1 file), GET /:id.
   adjustmentRouter({pool}): GET /?tid=, POST /, POST /:id/reverse. app.ts: mount /api/receipts, /api/remittances, /api/adjustments next to /api/matching.
13. Web: api.ts react-query hooks (keys ['receipts'], ['receipt',id], ['bank-line',id], ['adjustments',tid]). ReceiptsPage "Receipts": filters TID/Status, table
   (TID, Payer, Amount, Received, Status, Xero, Vico, Allocation) with a row button aria-label "Open receipt <TID>" (lesson); "Split a bank line" button opens
   SplitLineModal (bank line id from ?line= or input; rows TID/Payer/Amount, live "Left to split £x", Save disabled unless 0 left) with tab "Upload remittance"
   (RemittanceUpload: payer, paying body, date, CsvFilePicker, Preview -> table + "Rejected rows" + Download error report, Commit disabled unless 0 rejected and totals equal).
   ReceiptDrawer: allocations + AllocationEditor ("Save allocations", "Back to automatic"), "Reverse receipt" form with reason and, only when needed, "Xero credit
   note number" / "Vico correction note". AdjustmentsPanel (TID search): balances per payer, "Write off" / "Record refund" forms, history with "Reverse".
   routes.tsx `{ path: 'receipts', lazy: guarded('finance', ...ReceiptsPage) }`; navigation.ts after Review: `{ label: 'Receipts', to: '/receipts', icon: IconReceipt, capability: 'finance' }`.
14. Fixtures: remittance.csv = 3 synthetic rows (2 by TID, 1 by Claim Ref only) totalling 450.00; remittance-bad.csv adds unknown TID, Amount '1,23', no TID/Claim Ref; README documents layout + aliases.

## Tests (harness/signIn/TRUNCATE copied from letmc-import.test + remittance_lines, remittance_advices, sync_outbox; syncTenancies(vecoRows(4)); helper seedLine(pence, desc) inserts import_batches+bank_transactions; charges via INSERT rent_charges source 'manual')
receipt-operations: 1 split 3 parts sum ok -> 3 receipts, line matched; sum off by 1p -> 400, nothing written; repeat tid+payer 400. 2 override pins 2 charges, mode manual;
over receipt / over charge / other payer -> 400; refresh_rent_charges after charges_from change keeps the pin; reset -> oldest-first. 3 reverse queued receipt -> ok, line back to
needs_review, allocations gone, other receipt picks up freed charge; reverse twice 409. 4 Xero states via direct external_refs+sync_outbox rows: sent w/o xeroCreditRef 409, with ->
200 and stored; in_flight 409; vico exported w/o note 409. 5 write-off > arrears 400, ok -> balance drops; refund > credit 400; reverse adjustment -> balance restored, twice 409.
6 staff/readonly 403 on writes, no CSRF 403; audit_log rows for receipts UPDATE, allocations, adjustments, remittance_advices with changed_by = accounts e-mail.
receipt-remittance: 7 preview remittance.csv -> 3 matched, 0 writes; bad file -> 3 errors with line numbers; 8 commit -> 3 receipts method remittance_line with remittance_line_id,
line matched; re-commit same file -> 200 alreadyImported, still 3; same file other line -> 409; total mismatch -> 409; line with receipts -> 409; wrong previewSha256 -> 409.
e2e/receipts.spec: A split a seeded line into 2 parts -> "Left to split £0.00" -> saved; B reverse receipt with reason -> status Reversed; C staff has no Receipts nav link.

## Edge cases
Receipt with NULL bank line (legacy/manual) - reversal skips line recompute; ended tenancy part -> confirm_match makes ended_overpayment; council remittance with
negative/zero rows rejected; concurrent split/remittance on one line serialised by row lock + advisory lock; pin to a charge later deleted by refresh with no successor -> money stays unallocated (credit).

## Risks / rollback
Replacing allocate_oldest_first/refresh_rent_charges touches rent logic: rollback = migration re-creating the 001/006 bodies, drop 009 columns/index/function. Reversal
racing the Xero worker between our check and its send: worker re-checks status at send (recon-303), residual window accepted. Contract Exclusions repeat in-scope paths (app.ts, routes.tsx, migrations): allowed.

## Out of scope
Automatic Xero credit notes (bridge has none); posting refunds/write-offs to Xero; arrears ageing changes for write-offs; NI on remittances; editing review/xero/vico code.

## Verify
CI=1, TEST_DATABASE_URL/E2E_DATABASE_URL on 5433, kill 3001/5173. `npm run test:int -- receipt` (both files, all ~16 tests pass = pass), `npm run test:e2e -- receipts` (3 passed),
then full test:int (xero/vico/matching/letmc/rent still green), test:unit, lint, typecheck, `npm run db:test` (OMNIA_DB_PORT=5433).
