# money-flow-audit: rent money audit and fix plan
Goal: every incoming-rent figure (rent account, statement, ageing, dashboard, Omnia ledger) comes from one book, is append-only where it is money, and is right for real letting cases.
Sound already: numeric(12,2) + bigint pence, UNIQUE(tenancy,payer,period_start,source) + idempotent nightly backfill, oldest-first order (001:734), check_allocation caps (001:594), exact bulk splits (remittance.service.ts:186), shares sum to rent.

## Decisions approved 2026-10-09 (user, all at recommended default)
D1 rent account is the book; Omnia ledger mirrors into it; unlinked TIDs refused. D2 receipts dated before charges_from excluded. D3 keep the rent day on rent changes, pro-rate the change period, effective = date seen. D4 pro-rata by actual days in the period. D5 benefit awards pro-rated from their start. D6 no payer netting. D7 remittances pay oldest first. D8 ageing is balance-based (ignores pins).

## Approach re-check
Options: (a) rent account is the book, ledger mirrored into it; (b) the double-entry ledger is the only book and every view is derived from postings; (c) option (a) plus hardening: money rows append-only, one DB event function for all readers, mirroring done by a DB trigger. Chosen: (c).
Why not (b): ledger_postings have no payer and no charge link, and account types are free text. Schedule charges are regenerated, so they would need contra postings each time. The owner chose to keep bank receipts out of the ledger (decisions.md:455). It would mean rewriting every balance reader and backfilling all existing money: highest risk and size.
(c) gives one book (rent account), one formula (rent_events), and an audit trail (immutability triggers; ledger already append-only). Reversals: receipts = reversal event dated reversed_at; adjustments = correction rows; ledger = future contra posting, which the trigger mirrors automatically. It needs 5 migrations and no reader rewrites beyond 3 services.
Mirror as adjustments, not receipts: then Xero (xero.service.ts:136 picks every active receipt), Vico and bank-line status stay untouched, and adjustments are already the "non-bank money" table.
Simplifications: F2, F4, F9 and F13 all rewrite generate_rent_charges, so they are one WP. One allocation function (reallocate_tenancy) is used by every path. Write-off/refund caps and the payer match become DB triggers. Fixed lock order: bank_transactions, tenancies, receipts, rent_charges. In this pass: F12 (in WP4) and F15 (WP5). Out: F10/F11 (D6/D7) and F14 (ledger contra UI, needs owner workflow).

## A. Findings (detail in git history of this file; examples kept short)
F1 crit (8) ledger and rent account are separate books: a £600 card payment leaves £600 arrears (018:28-82, 001:775). F2 crit (1,7) the period straddling cutover is charged again: £600 phantom arrears (006:46). F3 high (7,8) pre-cutover receipts count: £600 credit hides £600 arrears (001:778, dashboard:91, statement:143). F4 high (1) a rent change moves the rent day to the 15th (sync.ts:383, 001:640). F5 high (5) write-offs and credits skip allocations (001:763). F6 med (5) no re-FIFO after reversal (receipt.service.ts:477). F7 med (4) a manual receipt's leftover is stranded (009:45). F8 med (8) dashboard and statement disagree as-at D after a later reversal (dashboard:93). F9 med (6) awards start only at the next period (006:56). F10 med (6) no payer netting. F11 med (3) remittance periods ignored. F12 low (9) no tenancy lock: deadlock risk (001:723). F13 low (1) no separate rent day. F14 low (5) no ledger reversal. F15 low (9) Veco rent passes through a JS float (source.ts:144).

## B. Work packages (execution order). Run int tests with TEST_DATABASE_URL on Docker 5433. After each WP the loop's lint/typecheck/full suites still apply.
**WP1 charge generator v2 (critical; F2 F4 F9 F13) mig 020_charge_generator_v2.sql**
1. rent_schedules ADD anchor_date date, CHECK (anchor_date <= effective_from). BEFORE INSERT OR UPDATE OF frequency, effective_from trigger: anchor = previous schedule's anchor_date if it has the same frequency, else NEW.effective_from. Backfill in effective_from order with the same rule; then SET NOT NULL.
2. CREATE OR REPLACE generate_rent_charges(uuid,date,date). Anchor periods: aps = period_start_n(s.anchor_date, freq, n), ape = next - 1. Skip while ape < s.effective_from. Exit when aps > p_until, effective_to or end_date. Skip the whole anchor period if aps < p_from: it belongs to the old system (this is the F2 fix).
3. Segment = [greatest(aps, s.effective_from), least(ape, s.effective_to, t.end_date)]. seg_rent = s.amount if the segment is the full period, else round(s.amount*seg_days/period_days, 2).
4. Cut the segment at every payer_splits effective_from / effective_to+1 inside it. Piece rent = round(seg_rent*piece_days/seg_days, 2); the last piece = seg_rent - sum(earlier pieces). Shares as in 006:59-62, using splits in force at the piece start; tenant gets the remainder. Insert with period_start/period_end = piece bounds and due_date = aps.
5. The 2-arg generate_rent_charges calls the 3-arg one with '-infinity'. Mark every charges_from tenancy dirty from '-infinity'.
6. New test money-wp1-charges.test.ts:
   - straddle: anchor 15 Sep, £600, cutover 1 Oct: no 15 Sep charge; 15 Oct £600.
   - rent change: £600 due 1st, £650 from 15 Mar: £270.97 + £356.45, both due 1 Mar; 1 Apr £650.
   - HB £400 from 15 Mar on £600: council £219.35, tenant £380.65.
   - a frequency change re-anchors; rerunning twice creates 0.
   Update rent-terms tests 12 and 16 to these rules. Any other failing test is a re-plan, not a scope widening.
Issue: "WP1 charge generator v2", critical, scope `db/migrations/020_*.sql, server/test/int/money-wp1-charges.test.ts, server/test/int/rent-terms.test.ts`. Verify: `npm run test:int -- money-wp1-charges && npm run test:int -- rent-terms letmc-import veco-sync receipt-operations`

**WP1 Re-plan 1 (2026-10-09), REVISED**

Diagnosis: the WP1 rule is right; the receipt-operations test relied on the old straddle charge.
- In "allocation override > 2", T9004's Veco schedule is monthly from 2025-04-01 (rent due on the 1st). The staff weekly schedule starts at D, so the Veco schedule closes at D-1.
- Moving charges_from to D-7 used to bring in the Veco period starting on the 1st, which was due before D-7. Under D2 and WP1, everything dated before the cutover belongs to the old system's opening balance: charges by due_date, receipts by received_on. That one rule also makes LetMC correct, so this is not a flaw.
- If Accounts moves charges_from earlier to a day that is not a rent day, charges start at the first rent day on or after it. No API moves charges_from today (only first rent save and LetMC).
- The test's intent still holds: moving the cutover earlier surfaces charges due in the newly included window, and oldest-first takes them.

Exact change, receipt-operations.test.ts:266. Replace the UPDATE with:
`await pool.query("UPDATE tenancies SET charges_from = date_trunc('month', $2::date - 7)::date WHERE tid = $1", [tid, D]);`
Above it, add the comment: `// Move the cutover back to a rent day (the Veco schedule is due on the 1st) so that charge is generated.`
Line 280 needs no change: the Veco piece from the 1st to D-1 has period_start < c1.periodStart.

Coder deviations checked: both are correct under steps 2-4.
- rent-terms test 20 (weekly £100, £60 fixed split, award ends D+10): piece D+7..D+10 = round(10000*4/7) = 5714p. Council = round(6000*5714/10000) = 3428p; tenant 2286p. Piece D+11..D+13 = 10000 - 5714 = 4286p, tenant only.
- Test 16's `min(period_start) >= charges_from` holds, because pieces start at or after aps, which is at or after p_from.

Scope to add to ISSUE-0013: `server/test/int/receipt-operations.test.ts`. Verify is unchanged.

**WP1 Re-plan 2 (2026-10-09), REVISED**

Cause: agentos-journal-backfill.test.ts:63 applies the whole of MIGRATIONS_DIR to an 018 scratch database. Every new migration (020, and 021-024 later) lands in `res.applied`, and those migrations also run against that test's partial seed data.

Fix: stop the run at 019 by copying 019 into the test's own temp dir. runMigrations (migrate.ts:90) only needs every already-applied file present in `dir`, and 001-018 are already there. `copyFile` and `path` are already imported.

Exact edit, replacing line 63:
```
await copyFile(path.join(MIGRATIONS_DIR, '019_agentos_journal_multirow.sql'), path.join(dir, '019_agentos_journal_multirow.sql'));
const res = await runMigrations(scratchUrl, { dir });
```
Line 64's assertion stays exact. Update the header comment to "then apply only 019".

Scope to add to ISSUE-0013: `server/test/int/agentos-journal-backfill.test.ts`.

Other tests pinning migration names: none. Grepping server/test for `applied`, `runMigrations`, `MIGRATIONS_DIR` and `0NN_*.sql` finds only this file, plus a comment in crypto.test.ts:3.

**WP2 ledger mirror and immutable money rows (critical; F1) mig 021_ledger_payment_kind.sql (only `ALTER TYPE adjustment_kind ADD VALUE IF NOT EXISTS 'ledger_payment'`), 022_ledger_mirror.sql**
1. adjustments ADD ledger_posting_id uuid UNIQUE REFERENCES ledger_postings.
2. ledger_tenancy_for_tid(text) RETURNS uuid: agentos_tenants.tenancy_id for that tid, else the single tenancies row with tid IN ($1, 'T'||$1), else NULL.
3. AFTER INSERT ON ledger_postings trigger, WHEN account_kind='tenant'. NULL tenancy: RAISE ... USING ERRCODE='OM001'. Otherwise INSERT an adjustment: payer tenant; kind ledger_payment (take_payment), else transfer_in if pence > 0, else transfer_out; amount = (-pence)::numeric/100; effective_on/reason/approved_by from the transaction; ledger_posting_id. Then PERFORM reallocate_tenancy. All tenant postings count, whatever account_type (D9).
4. Immutability:
   - adjustments: BEFORE UPDATE OR DELETE raises.
   - receipts: BEFORE UPDATE raises if amount, tenancy_id, payer, received_on or bank_transaction_id change; BEFORE DELETE raises.
   - rent_charges: BEFORE UPDATE raises on money/period/source columns; BEFORE DELETE raises unless source='schedule'.
5. Backfill adjustments for existing resolvable tenant postings; RAISE NOTICE with the count of unresolvable ones.
6. payment.service.ts and journal.service.ts map SQLSTATE OM001 to AppError('conflict', 'TID not linked to a core tenancy').
7. The agentos-payment, -journal and -pipeline tests get a linked core tenancy 'T<tid>' per TID used (as in agentos-sync.test.ts:158).
8. New money-wp2-ledger-mirror.test.ts:
   - a £600 card payment moves v_tenancy_balance by -600.00; a £200 journal A->B gives A +200 and B -200.
   - unlinked TID: 409 and no ledger rows; a repeat clientRequestId adds nothing.
   - immutability triggers raise.
   - invariant: per linked TID, sum(ledger tenant postings) = -100 * sum(mirrored adjustments).
Issue: "WP2 ledger mirror", critical, scope `db/migrations/02[12]_*.sql, server/src/services/agentos/{payment,journal}.service.ts, server/test/int/money-wp2-ledger-mirror.test.ts, server/test/int/agentos-{payment,journal,pipeline}.test.ts`. Verify: `npm run test:int -- money-wp2-ledger-mirror && npm run test:int -- agentos- receipt-operations letmc-import`
**WP3 one rent event source (high; F3 F8) mig 023_rent_events.sql**
1. rent_events(p_as_of date) RETURNS TABLE(tenancy_id, payer, kind smallint, d date, amount numeric(12,2), description, created_at, id), STABLE, only tenancies with charges_from set:
   - 0 = charges with due_date <= as_of
   - 1 = adjustments with effective_on <= as_of
   - 2 = receipts of any status with charges_from <= received_on <= as_of, amount = -amount
   - 3 = reversed receipts (same cutover rule), dated by the Europe/London date of reversed_at, <= as_of, amount = +amount
   Descriptions are copied verbatim from statement.service.ts:131-156.
2. rent_balances(p_as_of) gives charged, received, adjustments and balance per (tenancy, payer). rent_ageing(p_as_of) ports dashboard.service.ts:159-172 verbatim; debits = kind 0 plus kind 1 with amount > 0.
3. CREATE OR REPLACE VIEW v_tenancy_balance and v_arrears_aging (same columns) over rent_balances(current_date) and rent_ageing(current_date).
4. dashboard.service.ts: balances from rent_balances($1), ageing from rent_ageing($1); delete BALANCE_CTE. statement.service.ts:126-157 reads rent_events($2) for the tenancy. rent.service.ts:245-248: add `AND received_on >= charges_from`.
5. New money-wp3-events.test.ts:
   - a receipt dated the day before charges_from is absent everywhere.
   - a reversal after D: dashboard(D) = statement(D).
   - for every payer, dashboard net = sum of statement closings = sum of v_tenancy_balance = sum of getRentAccount balances.
   - v_arrears_aging total = dashboard ageing.
Issue: "WP3 one rent event source", high, scope `db/migrations/023_*.sql, server/src/services/reports/{dashboard,statement}.service.ts, server/src/services/rent/rent.service.ts, server/test/int/money-wp3-events.test.ts, server/test/int/reports-*.test.ts`. Verify: `npm run test:int -- money-wp3-events && npm run test:int -- reports- rent-terms export-statement`
**WP4 single allocation rebuild, DB caps, lock order (medium; F5 F6 F7 F12) mig 024_allocation_rebuild.sql**
1. allocations: receipt_id DROP NOT NULL; ADD adjustment_id REFERENCES adjustments; CHECK num_nonnulls(receipt_id, adjustment_id) = 1; UNIQUE (adjustment_id, rent_charge_id). check_allocation also requires the same payer and handles adjustments (negative only; sum <= -amount).
2. reallocate_tenancy (full rebuild): lock the tenancy FOR UPDATE and delete its 'auto_oldest_first' rows.
   Per payer, budget = post-cutover active receipts + abs(negative adjustments) - positive adjustments - manual allocations.
   Credits (receipt leftovers including manual receipts, negative adjustments) in (date, created_at, id) order fill charges in (due_date, period_start, id) order until the budget is spent.
   allocate_oldest_first(p) = PERFORM reallocate_tenancy, then return p's unallocated amount.
3. Adjustments AFTER INSERT trigger: reallocate_tenancy. BEFORE INSERT for write_off/refund_paid: lock the tenancy and enforce the cap against v_tenancy_balance (ERRCODE OM002).
4. receipt.service.ts: reverse, override and reset read the receipt unlocked, then lock bank_transactions (if any), then the tenancy, then the receipt, and re-check status.
5. New money-wp4-allocation.test.ts:
   - £1,200 vs 2x£600 pays Jan then Feb.
   - an R1 bounce moves R2 to Jan; a backdated receipt re-orders.
   - a write-off then a receipt pays the new month; a £700 receipt pinned £600 sends £100 to April; a refund removes leftover credit.
   - sum(outstanding due) = balance for every non-negative key.
   - 20 parallel confirm+reverse pairs: no deadlock and no over-allocation.
   - a raw over-cap write-off raises OM002.
   Update receipt-operations test 10 (a manual leftover is now auto-applied).
Issue: "WP4 allocation rebuild", medium, scope `db/migrations/024_*.sql, server/src/services/receipt/receipt.service.ts, server/test/int/money-wp4-allocation.test.ts, server/test/int/receipt-operations.test.ts`. Verify: `npm run test:int -- money-wp4-allocation && npm run test:int -- receipt-operations reports- rent-terms`
**WP5 Veco rent in integer pence (low; F15) no migration**
1. source.ts: VecoTenancy.rent becomes rentPence (integer) = Math.round(Number(`${value}e2`)); delete roundPence.
2. sync.ts:350-400: compare against `(amount*100)::bigint` and insert `($n::bigint)::numeric/100`.
3. New unit test money-wp5-veco-pence.test.ts: 10.075 -> 1008, 1199.995 -> 120000, 650 -> 65000.
Issue: "WP5 Veco pence", low, scope `server/src/jobs/veco-sync/{source,sync}.ts, server/test/unit/money-wp5-veco-pence.test.ts, server/test/unit/veco-sync.test.ts, server/test/int/veco-sync.test.ts`. Verify: `npm run test:unit -- money-wp5-veco-pence veco-sync && npm run test:int -- veco-sync`

## Edge cases
Tenancy without charges_from: no balance, so write-off/refund are refused (statement already refuses). Ledger mirrors are not cutover-filtered (all are post-recon-601). Pins on periods whose start moved in WP1 leave money unallocated until reset (current 009 behaviour). Zero rent; ended tenancy; a journal with two account types for one TID gives two adjustments.
## Risks and rollback
WP1/WP4 rebuild charges and allocations. Before merge, run on a db:test copy and diff per-(tenancy, payer) balances: WP4/WP5 must change none; WP1/WP3 change only straddle, rent-change and award tenancies (list them). Rollback = revert the commit plus a forward migration that restores the old function bodies from 006/009 and drops the new triggers.
## Out of scope
Outgoing money, F10, F11, F14 ledger contra/reversal, a rent-day API for first-period pro-rata (the generator supports anchor < effective_from; no UI).

## C. Needs the user
D9 (new): journal Account Types are free text. Default: every tenant posting counts as rent until real types are supplied.
D10 (new): unresolvable existing ledger postings are reported, not refused. Default: list them for Accounts to link.
F14: with no ledger reversal, a mistaken Take a Payment cannot be undone in Omnia. Confirm it is deferred.
