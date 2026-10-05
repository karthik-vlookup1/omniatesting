# Plan recon-103: Rent terms, benefit awards, payer splits, payment methods, nightly charges, rent account

## Goal
Page /rent/:tid: staff set rent + cycle, add HB/UC/DHP awards (landlord-direct awards become payer splits), payment methods; charges per period per payer
are generated (on every write + nightly) and shown as a per-period split and a running balance per payer. Xero stays the ledger of record: nothing here posts to Xero.

## Files
Create: db/migrations/006_rent_terms.sql; server/src/services/rent/{rent.service.ts,money.ts}; server/src/services/benefit/benefit.service.ts;
server/src/services/payer-split/payer-split.service.ts; server/src/services/payment-method/payment-method.service.ts; server/src/api/rent/routes.ts;
server/src/jobs/generate-charges.ts; web/src/features/rent-terms/{api.ts,money.ts,RentLookupPage.tsx,RentTermsPage.tsx,BenefitAwardModal.tsx,
PayerSplitModal.tsx,PaymentMethodModal.tsx}; server/test/int/rent-terms.test.ts; server/test/unit/rent-money.test.ts; e2e/rent.spec.ts.
Modify: server/src/api/app.ts; web/src/app/routes.tsx; web/src/app/navigation.ts. Tables 001 already has (rent_schedules, benefit_awards, payer_splits,
payment_methods, rent_charges, allocations, v_tenancy_balance) are reused; 001's generate_rent_charges(uuid,date) is NOT changed (db/tests call it).

## Steps
1. 006 (BEGIN/COMMIT): `ALTER TABLE tenancies ADD COLUMN charges_from date;` (NULL = no rent account; opt-in so Veco tenancies get no years of fake arrears).
   `CREATE TABLE rent_charge_dirty (tenancy_id uuid PRIMARY KEY REFERENCES tenancies(id) ON DELETE CASCADE, from_date date NOT NULL);`
2. 006: `generate_rent_charges(p_tenancy uuid, p_until date, p_from date)` = copy of 001's body plus, right after `eff_end` is computed:
   `IF eff_end < p_from THEN n := n + 1; CONTINUE; END IF;` Reason: overload leaves the 2-arg function and db:test untouched.
3. 006: trigger fn `mark_rent_dirty()` AFTER INSERT/UPDATE/DELETE on rent_schedules and payer_splits, AFTER UPDATE OF end_date, charges_from on tenancies.
   d = INSERT: NEW.effective_from; DELETE: OLD.effective_from; UPDATE: if amount/frequency/share_percent/fixed_amount/payer/effective_from differ ->
   least(OLD.effective_from, NEW.effective_from), elsif effective_to differs -> least(coalesce(OLD.effective_to,NEW.effective_to),
   coalesce(NEW.effective_to,OLD.effective_to)), else no-op (tenancies: same least() on end_date; charges_from change -> '-infinity'::date).
   `INSERT INTO rent_charge_dirty SELECT id, d FROM tenancies WHERE id = <tenancy> AND charges_from IS NOT NULL ON CONFLICT (tenancy_id) DO UPDATE
   SET from_date = least(rent_charge_dirty.from_date, EXCLUDED.from_date)`. The EXISTS-style SELECT skips cascaded deletes (parent already gone).
4. 006: `refresh_rent_charges(p_tenancy uuid) RETURNS integer`: `SELECT ... FROM tenancies WHERE id=p FOR UPDATE` (serialises job vs API); if charges_from
   IS NULL return 0. If a dirty row exists: DELETE allocations whose rent_charge_id is a source='schedule' charge with period_end >= from_date, DELETE those
   charges, DELETE the dirty row. Then n := generate_rent_charges(p, current_date, charges_from); PERFORM reallocate_tenancy(p); RETURN n.
5. services/rent/money.ts: `toPence(numericText)` (string split, no float), SQL reads use `(x*100)::int`, writes `($n::int)::numeric/100`.
   `PERIODS_PER_YEAR = {weekly:52, fortnightly:26, four_weekly:13, monthly:12, quarterly:4}`;
   `convertPence(p, from, to) = Math.floor((2*p*PPY[from] + PPY[to]) / (2*PPY[to]))` (half-up). E.g. 5000 weekly -> monthly = 21667.
6. Rounding (stated in the service doc comment): pro-rata of a part period = round(rent*days/periodDays, 2); percent share = round(rent*pct/100, 2);
   fixed share scales with pro-rata round(fixed*rent/full, 2); all Postgres round() = half away from zero; tenant gets rent - third-party shares, so
   the per-period sum always equals the rent; a share is capped at what is left. A split counts for a period only if in force on period_start.
7. rent.service `setRent(db, tid, {amountPence, frequency, effectiveFrom})` in db.tx: lock tenancy; effectiveFrom < start_date -> 400 'Before the
   tenancy started'. Open schedule (effective_to NULL): same from -> UPDATE amount/frequency, reason 'staff'; earlier from -> 400 'Before the current rent';
   later -> close at from-1 and INSERT reason 'staff'. 23P01 -> 409. If frequency changed, every award-linked split in force on `from` is closed at
   from-1 (or updated if it starts on/after from) and re-inserted with fixed_amount = convertPence(award, award_frequency, new frequency).
   If charges_from IS NULL set it to effectiveFrom. Finally `SELECT refresh_rent_charges($1)`.
8. benefit.service `addAward`: tenant_id = lead tenant (tenancy_tenants is_lead AND left_on IS NULL), none -> 400 'Tenancy has no lead tenant'.
   paidTo 'landlord_direct' -> also INSERT payer_splits (HB->council_hb, UC->dwp_uc, DHP->other_third_party), benefit_award_id, same dates,
   fixed_amount = convertPence(award, award_frequency, frequency of the schedule in force on effectiveFrom); no schedule -> 400 'Set the rent first'.
   `endAward(id, effectiveTo)`: effectiveTo >= effective_from else 400; sets effective_to on award and its open split. Both refresh at the end.
9. payer-split.service add/end for manual splits (payer <> tenant, exactly one of sharePercent 0.01-100 / fixedAmountPence). payment-method.service
   add/end (tenant_id = lead tenant when payer='tenant', else NULL). Exclusion 23P01 -> 409 'Overlaps an existing <x>'.
10. rent.service `getRentAccount(pool, tid)` -> {tenancy{id,tid,startDate,endDate,status,chargesFrom}, schedules, awards, splits, paymentMethods,
   periods:[{periodStart,periodEnd,dueDate,byPayer{payer:pence},totalPence}] (due_date <= today, newest first),
   payers:[{payer, chargedPence, receivedPence, adjustmentsPence, balancePence, lines:[{date,kind,description,amountPence,balancePence}]}]}.
   Lines: charges (due_date <= today), active receipts, adjustments; sort by date then charge, adjustment, receipt; balance = running sum
   (receipts negative). Unknown tid -> 404. All money fields integer pence.
11. api/rent/routes.ts `rentRouter({pool})`, `router.use(requireAuth)`: GET /:tid (any role); requireWriter on POST /:tid/schedules,
   /:tid/benefit-awards, /benefit-awards/:id/end, /:tid/payer-splits, /payer-splits/:id/end, /:tid/payment-methods, /payment-methods/:id/end;
   requireRole() on POST /generate (runs the job now, returns its summary). Zod `.strict()`: pence int 0-10_000_000 (award/rent), dates
   `^\d{4}-\d{2}-\d{2}$` + valid, enums from 001, payingBody 1-100, claimReference/referenceHint max 50, expectedDay 1-31. Writes -> 201 + getRentAccount.
12. jobs/generate-charges.ts: `runChargeGeneration(pool)` loops tenancies WHERE charges_from IS NOT NULL, each in its own tx with
   `set_config('app.user_email','job:generate-charges',true)` + refresh; returns {tenancies, created, failed}; one failure logs and continues.
   `scheduleChargeGeneration(pool, logger)` reuses msUntilNextRun from veco-sync/index.js at hour 5 (after Veco at 4); returns stop fn.
13. app.ts: import rentRouter, mount `/api/rent` after `/api/tenancies`; in main() start scheduleChargeGeneration and call its stop in shutdown.
14. web money.ts: parsePounds `^\d{1,7}(\.\d{1,2})?$` -> pence via string split; formatPence via Intl en-GB GBP. api.ts: react-query like recon-101.
15. RentLookupPage (/rent): TextInput "Tenancy ID" + button "Open" -> navigate(`/rent/${tid}`). RentTermsPage (/rent/:tid): Title "Rent terms <TID>";
   rent form (TextInput "Rent (£)", NativeSelect "Cycle", TextInput type=date "Effective from", button "Save rent") shown only if can(user,'write');
   note "Veco sync replaces rent that differs from Veco"; tables (aria-labels) "Rent history", "Benefit awards" (End button per open row),
   "Payer splits", "Payment methods", "Rent periods" (Period, Tenant, Council (HB), DWP (UC), Other, Total), "Balance by payer" (Payer, Charged,
   Received, Balance) and per payer a "Statement <payer label>" table with running balance. Modals use NativeSelect + type=date inputs (simple e2e).
16. routes.tsx: lazy children `rent` and `rent/:tid`. navigation.ts: after Tenancies add `{label:'Rent',to:'/rent',icon:IconReceipt2}`.

## Tests
unit rent-money: convertPence (5000 w->m 21667; same freq identity; 1 w->q), parsePounds/toPence ('650', '650.5', '0.01', reject '1.234').
int rent-terms (harness from tenancies-api.test; seed via vecoRow+syncTenancies; dates relative to today, D = today-27):
 1 weekly 10000 from D -> 4 periods tenant 10000 each; tenant balance 40000. 2 HB 6000 weekly landlord_direct from D -> split fixed 60.00; periods
 tenant 4000/council 6000; balances 16000/24000. 3 manual receipt tenant 40.00 -> tenant balance 12000, last line balance matches v_tenancy_balance.
 4 monthly rent + weekly award 5000 -> split 216.67. 5 tenancy end_date = 3rd day of last period -> refresh: rent 4286, council 2572, tenant 1714.
 6 change to fortnightly from today -> award split re-inserted with converted amount; old charges from that date regenerated, earlier untouched.
 7 refresh twice -> 0 new rows (idempotent). 8 runChargeGeneration skips charges_from NULL tenancies. 9 readonly POST -> 403; GET 200; bad tid 404;
 effectiveFrom before start -> 400; award with no rent -> 400. 10 overlapping manual split same payer -> 409. 11 audit_log rows carry staff e-mail.
e2e rent.spec (seed: create-user admin+readonly, veco-seed via runTs): A admin Rent -> TID -> Open -> rent 100 Weekly from D -> Save; add HB 60 Weekly
 Landlord direct from D -> "Rent periods" 4 rows with £40.00 and £60.00; "Balance by payer" Tenant £160.00, Council (HB) £240.00. B readonly sees tables, no Save rent.

## Edge cases
Backdated award (split from mid-period applies from next period); zero rent; award >= rent (tenant row omitted); ended tenancy pro-rata;
Veco rent change (trigger marks dirty, nightly regenerates); receipts reallocated after regeneration; NULL charges_from = no account.

## Risks / rollback
Regeneration deletes local allocations (local only; Xero untouched). Matching: expected_payment() now finds per-payer charges for opted-in tenancies.
Rollback: revert commit; DROP triggers, rent_charge_dirty, refresh_rent_charges, mark_rent_dirty, the 3-arg generate_rent_charges, tenancies.charges_from.

## Out of scope
Link from the tenancy drawer (features/tenancies excluded); bulk opt-in of Veco tenancies; adjustments UI; deletes; pushing charges to Xero.

## Verify
Kill 3001/5173 listeners; TEST_DATABASE_URL/E2E_DATABASE_URL on 5433; CI=1. `npm run test:int -- rent` (11 passed), `npm run test:e2e -- rent`
(2 passed), then full test:int, test:unit and `npm run db:test` (OMNIA_DB_PORT=5433) still green.
