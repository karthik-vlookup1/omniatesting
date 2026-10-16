# recon-604 spec (from the user, 2026-10-16): add "Push to VECO (test database)" to Omnia Recon

Build a second option on the **Accounts → Vico export** page that writes matched rent receipts straight
into VECO's **test** database, exactly the way VECO's own Import Receipts screen would, then reads them
back so staff can cross-check. The rules below were measured on live VECO (read-only) by comparing 3,793
real VECO-imported receipts (last 90 days) column by column: these rules reproduce **3,789 of them
exactly (99.9%)**.

---

## 0. HARD RULES: read first, never break

1. **Do not change or delete anything in the test database while building.** No INSERT, UPDATE,
   DELETE, CREATE, ALTER or DROP from the agent or its tests against `Test Database Read Write`.
   SELECT only for lookups. The ONLY writes allowed are the ones the finished feature makes **when a
   user clicks Push / Delete in the app**; the first real push is done by the user. All tests use fakes.
2. **Never touch live VECO (`Veco-onesystem`).** The read/write connection can only reach
   `Test Database Read Write` (live refuses it with SQL error 916). Lock the feature to that database
   name in code and refuse anything else.
3. **No schema changes in any VECO database**: no new tables, columns, procedures, views or triggers.
   Only add rows into VECO's existing `Transaction` and `Allocation` columns, as VECO does.
   Omnia Recon's own history goes in **Omnia Recon's own PostgreSQL database** (new migration 021).
4. **Never modify an existing VECO row.** Delete may delete **only rows this feature created**,
   identified by the TransactionPK / AllocationPK values Omnia Recon generated and stored.
5. **Keep the existing "Download Vico file" option and "Earlier exports" exactly as they are.**
6. **Secrets:** the RW MCP URL contains its key. It goes **only** in a server-side environment
   variable `VECO_RW_MCP_URL` (never a `VITE_` variable). Never put it in code, logs, tests, commits,
   error messages or the browser. Add only the variable NAME (empty value) to `.env.example`.
7. Branch `feature/veco-direct-push`. Never push to `main`. Synthetic data only in tests.

---

## 1. Background

Omnia Recon's export file has only 5 values per payment:
`Sort code, Account number, Date, Amount, Standing order reference (TID)` (+ blank Reference),
e.g. `207906, 43789276, 14-Oct-26, 997.27, T5755`. In VECO, staff paste the file path into
Accounts Procedures → Import Receipts → Import → Process, and **the VECO desktop program** fills
everything else. The database cannot do this itself: there is no import procedure, and
`usp_Transactions_i` needs all 81 values. So for a direct push, Omnia Recon must fill the other
columns itself, exactly as below.

---

## 2. What to write per receipt: 2 rows

### 2a. `dbo.[Transaction]`: 79 columns, 30 with values, 49 NULL
Insert with an **explicit column list of all 79 columns** in VECO's order; the 49 below are NULL.

VECO's column order (1–79): TransactionPK, CompanyFK, OfficeFK, StaffFK, OwnerGroupFK, EstateFK,
PropertyFK, TenancyFK, SupplierFK, ContactFK, FreeholderGroupFK, WorksOrderFK, strType, dtePosting,
dteDate, dteDateFrom, dteDateTo, strAccountPeriod, strPaymentMethod, strBankingRef, strChequeNumber,
dblAmount, dblVAT, dblGross, strInvoiceNumber, dblTaxRate, lngDaysDelay, memDescription, blnDeleted,
DeletedFK, DeletedByFK, dteDeletedDate, dteChequeDate, dblDiscount, strDepartment, strInvoiceStatus,
strSubDepartment, strStatus, dteStatus, StatusStaffFK, strReference, strTransactionStatus,
strBankingMethod, blnBankingRef, strBatchReference, strLockedUserFK, dteLocked, blnOwnerPayment,
strStandingOrderReference, memAttachment, blnAttachmentLocked, strOverrideBankingMethod,
strOverridePayeeName, strOverrideAccountNumber, strOverrideSortCode, strOverrideBACSRef,
OverrideAddressFK, blnChargedInArrears, dteConverted, dteFound, intRemittance, dteStatementPrinted,
dteAttachmentPrinted, ChargeFK, blnSuppress, strSupressedBy, dteSuppressed, blnInvoiceNumbers, BankFK,
blnEIBT, strSupplierEmail, strCategory, memDebug, dteContra, strContraBy, ContraFK, strDiscountType,
TenancyTransferFK, blnProfitLoss.

| # | Column | Value | Source / rule |
|---|---|---|---|
| 1 | TransactionPK | new GUID (uppercase) | generated; store it in Omnia Recon |
| 2 | CompanyFK | `46F81970-9647-46A5-B5B3-352150533B39` | constant (setting `veco.company_fk`) |
| 3 | OfficeFK | `Office.OfficePK` where `Office.strOfficeName = Tenancy.strTenancyOfficeName` | lookup, must match exactly 1 |
| 4 | StaffFK | the pushing user's VECO `Staff.StaffPK` | see §4 |
| 5 | OwnerGroupFK | `Owns.OwnerFK` where `Owns.PropertyFK = PropertyFK AND blnCurrentOwner = 1` | lookup, must be exactly 1 |
| 7 | PropertyFK | `Tenancy.PropertyFK` | lookup |
| 8 | TenancyFK | `Tenant.TenancyFK` where `Tenant.strStandingOrderReference = TID` | lookup, must be exactly 1 |
| 10 | ContactFK | `Tenant.ContactFK` (same row) | lookup |
| 13 | strType | `'SLP'` | constant |
| 14 | dtePosting | push time, UK local time (Europe/London), with ms | generated |
| 15 | dteDate | payment date from file, time 00:00:00 | file |
| 18 | strAccountPeriod | `'YYYY/MM'` of **dteDate** | file |
| 20 | strBankingRef | `'S' + YYYYMMDD(push date) + '-' + 4-digit counter` restarting at 0001 each push | generated |
| 22 | dblAmount | amount, 2 dp, positive | file |
| 23 | dblVAT | 0 | constant |
| 24 | dblGross | = dblAmount | file |
| 26 | dblTaxRate | 20 | constant |
| 27 | lngDaysDelay | 7 if `Property.blnDelayPayment = 1`, else 0 | lookup |
| 28 | memDescription | copy `memDescription` of the tenant's latest previous imported receipt (`strType='SLP' AND strBatchReference IS NOT NULL AND memDescription LIKE 'Rent Received  From %'`, same ContactFK, newest dtePosting). If none: `'Rent Received  From ' + Contacts.strAddressTitle`. **Two spaces before "From"; copy trailing spaces exactly.** | lookup |
| 29 | blnDeleted | 0 | constant |
| 35 | strDepartment | copy `strDepartment` of the tenancy's latest previous imported receipt (same TenancyFK). If none (first-ever receipt, ~3%): the user picks `Owner` or `Tenancy` in the confirm step | lookup / user |
| 38 | strStatus | `'Live'` | constant |
| 39 | dteStatus | push time (same as dtePosting, a few ms later is fine) | generated |
| 40 | StatusStaffFK | = StaffFK | §4 |
| 41 | strReference | VECO format, built from dtePosting: `[A+hour][ss][2 random digits][A+month][mm][dd]-[8 random uppercase hex]` (A=0, so 13:00→`N`, October→`K`), e.g. 14 Oct 14:17:06 → `O06xxK1714-89B4456C` | generated, must be unique |
| 42 | strTransactionStatus | `'Live'` | constant |
| 45 | strBatchReference | push start time `'YYYY-MM-DD-HH-MM'` (UK time), same for the whole push | generated |
| 48 | blnOwnerPayment | 0 | constant |
| 49 | strStandingOrderReference | TID from file | file |
| 69 | BankFK | `877A0B7D-802E-4C49-88C7-A74337DCD08F` (Omnia 9276, Barclays 20-79-06 / 43789276) | constant (setting `veco.bank_fk`); the file's sort code/account must equal this account |

**The 49 NULL columns:** EstateFK, SupplierFK, FreeholderGroupFK, WorksOrderFK, dteDateFrom, dteDateTo,
strPaymentMethod, strChequeNumber, strInvoiceNumber, DeletedFK, DeletedByFK, dteDeletedDate,
dteChequeDate, dblDiscount, strInvoiceStatus, strSubDepartment, strBankingMethod, blnBankingRef,
strLockedUserFK, dteLocked, memAttachment, blnAttachmentLocked, strOverrideBankingMethod,
strOverridePayeeName, strOverrideAccountNumber, strOverrideSortCode, strOverrideBACSRef,
OverrideAddressFK, blnChargedInArrears, dteConverted, dteFound, intRemittance, dteStatementPrinted,
dteAttachmentPrinted, ChargeFK, blnSuppress, strSupressedBy, dteSuppressed, blnInvoiceNumbers, blnEIBT,
strSupplierEmail, strCategory, memDebug, dteContra, strContraBy, ContraFK, strDiscountType,
TenancyTransferFK, blnProfitLoss. (Keep VECO's spellings, e.g. `strSupressedBy`, `dblCommision`.)

### 2b. `dbo.Allocation`: 14 columns, 7 with values, 7 NULL (one per receipt, always)
| Column | Value |
|---|---|
| AllocationPK | new GUID (store it) |
| DebitTransactionFK | the receipt's TransactionPK |
| CreditTransactionFK | the receipt's TransactionPK (same: it points at itself) |
| dblAmount | 0 |
| dtePosting | the receipt's dtePosting |
| dblPercentage | 0 |
| strAccountPeriod | the receipt's strAccountPeriod |
| NULL | dteStatement, dblTotalTax, dblTotalCommision, dblTax, dblCommision, dteDateFrom, dteDateTo |

---

## 3. Held back (never pushed, never guessed)
A payment goes to a **Held back** list with a reason if: TID not found in `Tenant`; TID on 2+ tenants;
property has 0 or 2+ current owners; tenancy office name matches 0 or 2+ offices; amount ≤ 0;
sort code/account ≠ the configured bank account; first-ever receipt and the user did not pick a
department; already pushed (see §5). The test DB is a copy from **15 Apr 2026**, so tenants added
later (e.g. T7684, T7703) will be held back there; that is correct.

## 4. Staff user: each person pushes under their own VECO name
- Map Omnia Recon user → VECO `Staff.StaffPK` by email (`Staff.strEmailAddress1`), with an admin
  override in Omnia Recon settings. No linked VECO user → push button disabled with "No VECO user linked".
- People who import today (last 12 months): **Sheshan B, Tejus J, Chethan K** (office MY). Only these
  get push permission by default.
- The MCP connection stays one shared login; "who" goes into StaffFK/StatusStaffFK + Omnia Recon history.

## 5. The flow in the app
1. **Push to VECO (test database)** button next to "Download Vico file" (same receipts that are
   "waiting for Vico").
2. **Preview (no writes):** per source bank (the statement the payment came from) count + £ total,
   grand total, Ready list, Held-back list with reasons, department picker only for first-ever
   receipts. All lookups read-only, in as few queries as possible.
3. **Confirm → push:** one SQL batch per push wrapped in `BEGIN TRAN … COMMIT` with `TRY/CATCH` +
   `ROLLBACK` (all or nothing). Before inserting, re-check none of the TransactionPKs already exist.
   Mark the payments as sent in Omnia Recon so they can't be pushed again (and can't be exported twice
   by the manual option either). Plain `INSERT … VALUES` with values escaped safely; SQL Server 2016,
   possibly compatibility level 100, so **no OPENJSON, STRING_SPLIT, STRING_AGG**.
4. **After (cross-check):** query the test DB by the stored TransactionPKs and return: date, TID,
   tenant name, property, landlord, department, amount, banking ref; total and per-bank totals next to
   the "before" numbers; per row ✅/❌ from a column-by-column compare of all 30 values (+ the
   Allocation row). ❌ rows name the differing column.
5. **"Earlier VECO pushes"** section, laid out like the existing "Earlier exports":
   Pushed (date/time) · Batch ref · Pushed by · Receipts · Total · Check (✅ matches VECO / ❌ / Deleted) ·
   **View** (re-runs the cross-check live) · **Download** (CSV of the read-back) · **Delete**.
6. **Delete (test DB only, user click + confirm dialog):** deletes only the `Allocation` rows then the
   `Transaction` rows whose PKs this push stored, in one transaction, then re-queries to prove
   0 rows / £0.00 remain, and marks the push "Deleted" (and the payments as not sent).

## 6. Omnia Recon's own tables (migration `db/migrations/021_veco_push.sql`)
`veco_push_batch` (id, target_db, batch_reference, pushed_by, staff_fk, status
[previewed/pushed/verified/failed/deleted], receipts, total, totals_by_bank jsonb, verify_result jsonb,
created_at, pushed_at, verified_at, deleted_at) and `veco_push_item` (id, batch_id, payment_id UNIQUE
while not deleted, source_bank, tid, amount, payment_date, transaction_pk, allocation_pk, banking_ref,
veco_row jsonb [all 79 values as sent], status, error). Plus the staff mapping (Omnia Recon user →
VECO StaffFK, admin override).

## 7. Settings (server side)
`VECO_RW_MCP_URL` (secret env), target DB `'Test Database Read Write'` (code refuses any other),
company FK, bank FK, staff mapping.

## 8. MCP usage
Reuse the client in `server/src/jobs/veco-sync/mcp-client.ts` (initialize → session id →
`tools/call execute_sql`). It wraps SELECTs in `FOR JSON PATH`; add a separate method for the write
batch that does **not** wrap. Every write batch asserts `DB_NAME() = 'Test Database Read Write'` and
`THROW`s otherwise.

## 9. Tests (fakes/synthetic data only, no real VECO writes)
- Row builder: exactly 79 columns, the 49 NULL, constants right, description double space, period from
  payment date, banking refs 0001…n, batch ref format, strReference format + uniqueness, UK time incl. BST.
- Lookups: unknown/duplicate TID, owner 0/2+, office 0/2+, negative amount → held back with reason.
- Department copied from last receipt; first-ever requires the user's pick.
- Push SQL: single transaction, DB-name guard, no OPENJSON; re-push blocked.
- Cross-check: totals before == after, column diff detects a changed value.
- Delete: only stored PKs, Allocation before Transaction, guard on DB name.
- UI: both options visible; "Earlier exports" unchanged.

## 10. First real test (done by the user, not by the agent)
After everything passes and the user approves, the user pushes 3 receipts dated 14 Oct 2026:
T5755 £997.27, T6008 £890.00, T2822 £950.00 (total £2,837.27). Expected: 6 rows
(3 Transaction + 3 Allocation), cross-check ✅, totals £2,837.27.
