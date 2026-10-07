# LetMC (agentOS) accounting parity - gap audit and Phase 6 proposal

Goal: give Omnia Recon every LetMC tenant-accounting workflow from the owner's 12-screenshot guide, starting with
a single-tenant Take a Payment endpoint and a full multi-entry Journal Transfer. Source: owner request 2026-10-07.
Screens are described generically; no personal data copied. Ledger rule today: decisions.md 2026-10-02 "Xero is the
only ledger"; agentOS posting = CSV export (decisions 2026-10-06), no agentOS write API.

## LetMC screens seen (inputs -> outcome)
- Take a Payment dialog: Payment From (tenant + tenancy descriptor, read-only), Balance (read-only), Will deposit to
  (client-account dropdown, clearable), Type (dropdown, e.g. Cash), Amount* (required, 2dp, spinner), Description and
  Card Authorisation Code (textarea). Close / Take a Payment -> receipt posted, balance falls.
- Journal Transfer dialog: Description, Nominal Code (dropdown), Journal Entries grid (Branch, Person, Property,
  Account Type, Account Balance, Amount), Add row, paged, running total. Journal Transfer -> legs posted.
- Actions > Accounting menu: Allow Invoice Creation, Apply Charge, Apply Refund, Create Invoice, Email Receipts, Find
  Last Payment Details, Import from Online Applicant, Journal Transfer, Journal Transfer Closed, Make a Payment, Make
  Rent Due, Make Rent Undue, Manual Rent Refund, Manual Rent Transfer, Print Receipts, Record Telephone Call, Request a
  Payment with App, Send Chase Email, Send Chase Letter (list cut off below).
- Overview panels: Rent Chase (amount outstanding, managed by, last paid method/amount/date, deposit description, last
  chased, rent chaser, account status); Balances; account summary (outstanding rent, rent made due, rent paid, total
  charges, total refunds, positive/negative staff journals); Deposit Held (held, required deposit).
- Tenancy tab: is head tenant, tenancy link, residence link, deposit scheme/bond scheme (e.g. Un-protected), account
  balance, last credit date, last debit date.
- Rent Chasing tab: main rent chaser, account status, last chase method, date of last rent arrears, last chased, next
  money-owed reminder, delay chasing until, delay chasing reason. Admin tab: auto rent chase toggle, last credit,
  opt out of referencing, clone of applicant/tenant.
- Bank Details tab: account name, number, sort code, account type (Personal...), outgoing payments reference,
  BIC/SWIFT, IBAN, bank name + address 1-4 + postcode, VAT number, payment status filter, AML required for payments,
  AML exemption (flag + text), Direct Debit "collect rent by DD".
- Notes tab: confidential notes, referencing notes. Personal Details tab: CRM identity/contact fields (not accounting
  except "email copy of invoice to").

## Gap table (E = exists, P = partial, M = missing, X = out of scope)
| LetMC workflow | Omnia today | |
|---|---|---|
| Take a Payment (bulk, from bank file) | POST /api/agentos/exports + /lines/:id/posted (recon-504/510) | E |
| Take a Payment (single, from tenant record) | none; only bank-file intake lines can be exported | M |
| Journal Transfer | /api/agentos/journal/* (recon-506): 2 legs fromTid/toTid, free-text nominal/account type | P |
| Journal Transfer Closed | no closed-tenancy legs | M |
| Manual Rent Transfer | covered by the 2-leg journal only | P |
| Apply Refund / Manual Rent Refund | POST /api/adjustments kind=refund (no payout, no export) | P |
| Apply Charge | adjustments kinds are write_off/refund only | M |
| Make Rent Due / Make Rent Undue | nightly POST /api/rent/generate only; no manual raise/cancel | P / M |
| Make a Payment (money out to tenant) | none | M |
| Create Invoice / Allow Invoice Creation | Xero invoice per confirmed receipt only (recon-303) | P / M |
| Print Receipts | statement PDF/CSV /api/reports/statement/:tid (recon-401) | P |
| Email Receipts | none | M |
| Find Last Payment Details | none (data exists in receipts/intake lines) | M |
| Account summary + balances panel | /api/rent/:tid expected-vs-received; dashboard arrears ageing | P |
| Rent Chase panel + Rent Chasing tab + auto chase | none | M |
| Record Telephone Call / Send Chase Email / Letter | none | M |
| Deposit Held / deposit scheme | none | M |
| Tenancy tab (head tenant, last credit/debit) | tenancies + tenancy_tenants; no last credit/debit | P |
| Bank details (payout data, BIC/IBAN, VAT, AML, DD) | payer_bank_accounts hash+last4 for matching; payment_methods | P |
| Statement / payer accounts / rent terms | /api/reports/statement, /api/payer-accounts, /api/rent/* | E |
| Notes (confidential, referencing) | none | M |
| Request a Payment with App, Import from Online Applicant, referencing/AML checks, clone, Personal Details CRM | - | X |

Counts: exists 2, partial 10, missing 13, out of scope 1 row (5 items).

## Proposed Phase 6 (in order; one coder pass each)
| id | title | user-visible behaviour | class | deps |
|---|---|---|---|---|
| recon-601 | Single Take a Payment | POST /api/agentos/payments + dialog on tenant: TID, deposit-to (bank_accounts+aliases), type (seeded list), amount, description/card auth; joins next Take a Payment CSV | HARD | 510 |
| recon-602 | Multi-entry Journal Transfer | N legs (TID, property, branch, account type, signed amount, live balance), must net to zero, nominal code from a list; CSV per leg | HARD | 506, 601 |
| recon-603 | Configurable accounting lists | admin screen for payment types, nominal codes, account types, account statuses, chase methods | MEDIUM | 602 |
| recon-604 | Tenant account summary | GET /api/tenants/:tid/account + panel: balance, outstanding, rent due/paid, charges, refunds, +/- journals, last paid, last credit/debit | HARD | 601, 602 |
| recon-605 | Journal Transfer Closed | legs may target ended tenancies, flagged and listed | MEDIUM | 602 |
| recon-606 | Apply Charge | ad-hoc charge (type, amount, date, description) on a tenant account, reversible | HARD | 604 |
| recon-607 | Make Rent Due / Undue | raise or cancel one rent charge period manually, audited | HARD | 604 |
| recon-608 | Tenant bank and payout details | encrypted+masked bank fields, BIC/IBAN, VAT, AML flags, collect-by-DD | HARD | - |
| recon-609 | Refund and Make a Payment out | refund/payment to tenant bank details, approval step, export file | HARD | 606, 608 |
| recon-610 | Rent chasing fields | chaser, status, last/next chase, delay until + reason, auto chase toggle | HARD | 603, 604 |
| recon-611 | Chase log | record call / chase email / chase letter entries; updates last chased | MEDIUM | 610 |
| recon-612 | Receipts print/email + last payment | per-payment receipt PDF, email it, "last payment" lookup | MEDIUM | 604 |
| recon-613 | Deposit and tenancy accounting fields | deposit required/held, scheme list, head tenant flag | MEDIUM | 603 |
| recon-614 | Tenant notes | confidential + referencing notes, role-restricted | MEDIUM | - |
| recon-615 | Invoices | allow-invoice flag + create invoice to Xero via bridge | HARD | owner Q1 |

## Open questions for the owner
1. Ledger of record: decisions say Xero is the only ledger and agentOS gets CSVs. Do 601/602/606/607/609 post to
   Omnia's own tenant ledger, only export to agentOS, also push to Xero, or a mix? (Blocks 604 balance math.)
2. Take a Payment types: exact list (Cash, Card, Cheque, BACS, Standing Order, DD, Council/UC?) and is card auth code required for Card?
3. Journal Transfer: real nominal codes and account types; may a journal leg hit a landlord or non-tenant account?
4. Who may post payments, journals, charges, refunds, rent due/undue: accounts role only, or staff too? Two-person approval above an amount?
5. Payments out (609): is Omnia allowed to hold full payee bank numbers, and what payout file/bank format?
6. Chase email/letter (611): which email provider and templates, or log-only for now?
7. Confirm out of scope: Request a Payment with App, Import from Online Applicant, referencing/AML/R2R, CRM personal details.

Risks: 602 changes the recon-506 CSV format and agentos_journal_entries (new migration 018+, never edit 001/002);
rollback = keep recon-506 2-leg export behind the old route. Bank fields (608) are PII: reuse AES-GCM + masking lib.
Verify per feature: `node .claude/bin/hx.cjs verify <id>` exits 0 plus npm lint/typecheck/test:unit/test:int/db:test.
