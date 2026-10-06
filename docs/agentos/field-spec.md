# agentOS (formerly LetMC) field spec

Source: the screenshots in `letmc guide/` (read 2026-10-06). Every field below was read from
a screenshot. Anything that could not be read or is ambiguous is listed under **Open questions**
and has not been guessed. The screenshots show a real record, so the examples here are
**synthetic** and only copy the *format* of the real values.

Conventions seen across agentOS:
- Dates are shown as `dd/mm/yyyy` (e.g. `10/09/2026`). The Admin "Last Credit" field also has a time picker.
- Money is shown as `£#,##0.00` on display (`£1,045.00`). Input boxes take plain decimals (`873.22`, `0.00`).
  Some overview totals show 4 decimal places (`19855.0000`, `171.7800`).
- Dropdowns with no value show `-- None Selected --`.
- Toggles are YES/NO.

## 1. Identifiers and search (steps 1-3)

| Identifier | Format | Example (synthetic) | Where seen |
|---|---|---|---|
| Tenant number ("TID") | 4-digit number written at the **start of Forename** | `9101` (Forename `9101 Alex`) | Search hit, record title, Personal Details > Forename |
| Tenant record ID | `ten-<n>` | `ten-9001` | Search hit `(ten-…)`, Personal Details > Office Details > ID |
| CRM ID | `crm-<n>` | `crm-9501` | Search hit `(crm-…)` only |
| Record title | `<TID> <Forename-rest> <Surname>` | `9101 Alex Testperson` | Tenant header, tab label `Tenant 9101 Alex Te…` |

Search result line format (global search box, top left):
```
Tenant <TID> <Name> (ten-<n>)(crm-<n>)
<Role> at <Residence address>; <Tenancy status> <Tenancy type> (<Let type>) <start dd/mm/yyyy> - <end date | No End Date> (<Managed by>)
```
Synthetic example: `Head Tenant at Room 1, Flat 1, Test House, Sample Estate, London, ZZ1 1ZZ; Signed Periodic Tenancy (First Let) 01/02/2025 - No End Date (Test Lettings)`.

## 2. Tenant record fields (Tenant Details tabs)

Tabs, in order: Personal Details, Bank Details, Tenancy, Rent Chasing, Admin, Notes, Right to Rent, CRM.
"Required?" means marked with `*` in the UI. No tab screenshot shows a `*`, so required = unknown (see Q4).

### 2.1 Personal Details
| Section | Field | Type | Example (synthetic) |
|---|---|---|---|
| Office Details | ID | text (read-only?) | `ten-9001` |
| Office Details | Managed by | dropdown + link | `Test Lettings` |
| Office Details | Bulk Upload Reference | text | (blank) |
| Tenant Details | Salutation | text | (blank) |
| Tenant Details | Title | text | (blank) |
| Tenant Details | Forename | text | `9101 Alex` |
| Tenant Details | Middle Name | text | (blank) |
| Tenant Details | Surname | text | `Testperson` |
| Tenant Details | Nationality | dropdown | `United Kingdom` |
| Tenant Details | Date of Birth | date (label cut off) | unreadable |
| Contact Details | EMail | text | (blank) |
| Contact Details | Second Email Address | text | (blank) |
| Contact Details | Email Copy of Invoice To | text | (blank) |
| Contact Details | Mobile Phone | text | (blank) |
| Contact Details | EMail Letters | toggle | `NO` |
| Contact Details | Send Tenant App Invites | toggle | `YES` |

### 2.2 Bank Details
| Section | Field | Type | Example |
|---|---|---|---|
| Account Details | Account Name | text | (blank) |
| Account Details | Account Number | text | (blank) |
| Account Details | Account Sort Code | text | (blank) |
| Account Details | Account Type | dropdown | `Personal` |
| Account Details | Outgoing Payments Reference | text | (blank) |
| Account Details | BIC / SWIFT Code | text | (blank) |
| Account Details | IBAN Code | text (input cut off) | unreadable |
| Bank Address | Bank Name, Bank Address 1, 2, 3, 4, Bank Postcode | text | (blank) |
| VAT Number | VAT Number | text | (blank) |
| Payment Details | Payment Status Filter | dropdown + link | `-- None Selected --` |
| Payment Details | AML Required for Payments (Calmony Use Only) | toggle | `YES` |
| Payment Details | Has Active AML Exemption | toggle | `NO` |
| Payment Details | Active AML Exemption | text | (blank) |
| Direct Debit | Collect Rent by DD | toggle (cut off) | unreadable |

### 2.3 Tenancy
| Section | Field | Type | Example |
|---|---|---|---|
| Current Tenancy | Is Head Tenant | toggle | `YES` |
| Current Tenancy | Tenancy | dropdown + link | `Signed Periodic Tenancy (First Let) on Room 1, …` |
| Current Tenancy | Residence | dropdown + link | `Room 1, Flat 1, Test House, Sample Estate, …` |
| Deposit Scheme ID | Bond Scheme | dropdown | `Un-protected` |
| Account | Balance | decimal (spinner) | `873.22` |
| Account | Last Credit | date | `10/09/2026` |
| Account | Last Debit | date | `10/09/2026` |

### 2.4 Rent Chasing
| Section | Field | Type | Example |
|---|---|---|---|
| Rent Chase Status | Main Rent Chaser | dropdown + link | `-- None Selected --` |
| Rent Chase Status | Account Status | dropdown + link | `-- None Selected --` |
| Rent Chase Status | Last Chase Method | dropdown + link | `-- None Selected --` |
| Rent Chase Status | Date of Last Rent Arrears | date | `10/07/2026` |
| (header unreadable, shows `?`) | Last Chased | date | (blank) |
| same | Next Money Owed Reminder | date | (blank) |
| same | Delay Chasing Until | date | (blank) |
| same | Delay Chasing Reason | textarea | (blank) |

### 2.5 Admin
| Field | Type | Example |
|---|---|---|
| Clone of Applicant | dropdown + link | `-- None Selected --` |
| Clone of Tenant | dropdown + link | `-- None Selected --` |
| Opt out of Referencing | toggle | `NO` |
| Last Credit | date + time | (blank) |
| Auto Rent Chase | toggle | `YES` |

### 2.6 Notes
Confidential Notes (textarea), Referencing Notes (textarea).

### 2.7 Overview panels (read-only, useful for matching/checks)
- Rent Chase: Amount Outstanding (`-£873.22`), Property Managed By (`ISL`-style short code), Last Paid
  (`<Type> for £<amount> received on <dd/mm/yyyy>`, e.g. `Card Deposit for £1,045.00 received on 10/09/2026`),
  Deposit Description (free text, e.g. a payer label like `<Name> UC`), Last Chased, Rent Chaser, Account Status.
- Balances: `£873.22`. Deposit Held: `£0.00`, Required Deposit: `£0.00`.
- Rent totals: Outstanding Rent `171.78`, Rent Made Due `20026.78`, Rent Paid `19855.0000`, Total Charges `0.00`,
  Total Refunds `0.00`, Positive Staff Journals `0.00`, Negative Staff Journals `171.7800`.
- Phone Numbers: `Landlord - <Landlord name> (Landlord)`, Landline.

## 3. Posting workflow (one bank receipt -> one tenant)

1. Global **Search** box: type the TID (4 digits). (Screenshot `first step.png`.)
2. Click the `Tenant <TID> …` hit. (`second step.png` is a duplicate of step 1, see Q1.)
3. Tenant record opens on **Overview**. (`third step.png`.)
4. Click **Actions** (top right) > **Accounting** section. Items seen, in order: Allow Invoice Creation, Apply Charge,
   Apply Refund, Create Invoice, Email Receipts, Find Last Payment Details, Import from Online Applicant,
   Journal Transfer, Journal Transfer Closed, Make a Payment, Make Rent Due, Make Rent Undue, Manual Rent Refund,
   Manual Rent Transfer, Print Receipts, Record Telephone Call, Request a Payment with App, Send Chase Email,
   Send Chase Letter, … (list cut off; "Take a Payment" not visible, see Q2).
5. **Take a Payment** modal, then press **Take a Payment** (or Close to cancel).

### 3.1 Take a Payment fields
| Field | Type | Required | Format / example |
|---|---|---|---|
| Payment From | read-only | n/a | `<TID> <Name>( <Role> at '<Residence>'; <Tenancy descriptor> )` |
| Balance | read-only | n/a | `£873.22` |
| Will deposit to | searchable dropdown, clearable | unknown (no `*`) | `<Landlord/Branch> - Client Account`, e.g. `Test Lettings - Client Account` |
| Type | dropdown | unknown (no `*`) | `Cash` (only value seen, see Q3) |
| Amount | decimal spinner | **yes** (`*`) | `0.00` default; 2 dp |
| Description and Card Authorisation Code | textarea | no | free text |

### 3.2 Journal Transfer fields
| Field | Type | Required | Format / example |
|---|---|---|---|
| Description | text | unknown | free text |
| Nominal Code | dropdown | unknown | placeholder `Nominal Code` (values not shown, see Q6) |
| Journal Entries (grid) | rows added with **Add** | at least one? | columns: Branch, Person, Property, Account Type, Account Balance, Amount |
| (grid footer) | computed total | n/a | `£0.00`; grid pages 5 items per page |
Then press **Journal Transfer** (or Close).

## 4. Test data

Fixture: `fixtures/agentos/tenants.csv` (12 synthetic rows, TIDs 9101–9112). Headers: `TID, Tenant ID, CRM ID, Forename, Surname, Managed by, Residence, Tenancy, Is Head Tenant, Will deposit to`.
Loaded by `seedAgentosTenants()` in `server/src/services/agentos/seed.ts` into `agentos_tenants` table (migration 012).
All-or-nothing upsert on TID, idempotent. Tenancy ID links by `tenancies.tid` with no foreign key (other suites TRUNCATE tenancies).

## 5. Uploading the formatted bank record

Post a CSV to `POST /api/agentos/intake` (writer role). Returns `201` on success, `400` if any row is malformed (listing bad line numbers), or `409` if the same file was already uploaded (idempotent by file hash). Retrieve with `GET /api/agentos/intake` (list all) or `GET /api/agentos/intake/:id` (one record).

CSV header (exact order): `Date,TID,Payer Name,Amount,Type,Will deposit to,Description`. Dates are `dd/mm/yyyy`. Amounts are 2 decimal places, stored as pence, and must be above 0. One invalid row rejects the entire file. Unknown `Type` values are accepted with an `unverified_type` warning. Stored in `agentos_intake` table (migration 013).

## 6. Matching lines to tenancies

Matching runs automatically during the upload transaction. Every intake line is assigned one of four statuses: `matched`, `name_mismatch`, `deposit_mismatch`, or `unmatched`. Matching requires an exact TID. Names are normalised: trimmed, lowercased, whitespace collapsed to single spaces, and the leading TID prefix stripped from the tenant's forename. Precedence (first match wins): blank or unknown TID → unmatched; name mismatch → name_mismatch; deposit mismatch → deposit_mismatch; otherwise → matched. For joint tenants, a name match on any tenant counts. No fuzzy or suggestion matching is performed. The upload response includes `matchCounts` with totals for each status.

## 7. Exporting to agentOS (Take a Payment)

A writer exports one intake batch's `matched` lines via `POST /api/agentos/exports` (201 with export id), immutably stored as a BOM + CRLF CSV. Each line is exported only once; a global advisory lock prevents double exports. The CSV columns are: TID, Payment From, Will deposit to, Type, Amount, Description and Card Authorisation Code. Formula-safe cells use `'` prefix. Staff download via `GET /api/agentos/exports/:id.csv` (200 text/csv), enter each row in agentOS Take a Payment, then `POST /api/agentos/lines/:id/posted` (200) to mark it imported. Migration 014 adds `agentos_exports` table and posting columns to `agentos_intake_lines`.

## Open questions
1. `second step.png` is identical to `first step.png`. What happens between search and record (click hit? choose among several hits)?
2. Where is "Take a Payment" in the Actions menu? The visible list ends at "Send Chase Letter". Is it lower in Accounting, or is "Make a Payment" the same thing?
3. Full list of **Type** values in Take a Payment (Cash, Card, BACS, Standing Order, UC…?). Which Type do bank-statement receipts use?
4. Which tenant record fields are mandatory? No `*` is visible on any tab.
5. Is the **TID** the 4-digit number in Forename (e.g. 6568-style) or the `ten-<n>` ID? Which one appears on bank references?
6. **Journal Transfer**: when is it used instead of Take a Payment (misallocated receipt, split across tenants, UC)? What Nominal Code values and Account Type values exist? Must entries sum to £0.00?
7. **Will deposit to**: list of client accounts and how one maps to our bank accounts.
8. Sign convention: Overview shows Amount Outstanding `-£873.22` but Balance `£873.22`, and Outstanding Rent `171.78`. Which number means "tenant owes"?
9. Unreadable: Date of Birth input, IBAN Code input, Collect Rent by DD value, Rent Chasing right-hand section header (`?`), and the Right to Rent and CRM tabs (no screenshot).
10. What should "Description and Card Authorisation Code" contain for a bank receipt (bank reference, statement date, our receipt id)?
