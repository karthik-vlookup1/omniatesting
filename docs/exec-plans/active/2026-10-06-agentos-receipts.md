# agentos-receipts

Created: 2026-10-06

> Note: the planner has no shell, so this file follows the `hx plan new` template by hand
> (path pattern `docs/exec-plans/active/YYYY-MM-DD-<topic>.md`). The coordinator may run
> `node .claude/bin/hx.cjs plan new agentos-receipts` and paste this body in if hx needs to register it.

## Objective

Bank exports mix incoming and outgoing lines, so a person formats each bank record first. Recon
takes that formatted file, matches every line to exactly one agentOS tenant (by TID), and produces
the exact agentOS "Take a Payment" input for each one. There are no agentOS API credentials, so
the output is a **downloadable CSV posting sheet**. Its columns are named and ordered like the
Take a Payment modal, so staff can key each row in exactly. It also gives a later API bridge a
fixed contract. The format comes from `docs/agentos/field-spec.md`. This change spans several
modules, a schema change and a new API, so it needs a plan.

## Scope And Out-Of-Scope

In scope (6 sequential features, area `phase-5-agentos`):
- **recon-501 (MEDIUM): synthetic agentOS tenant seed.** Migration `012_agentos_tenants.sql` adds
  `agentos_tenants` (tid text unique `^\d{4}$`, agentos_ref `^ten-\d+$` unique, crm_ref `^crm-\d+$`,
  forename, surname, managed_by, residence, tenancy_descriptor, is_head_tenant bool,
  deposit_to text not null, tenancy_id uuid null FK tenancies, linked by `tenancies.tid` when present).
  Also adds the fixture `fixtures/agentos/tenants.csv` (headers = agentOS labels, 12 synthetic rows,
  forename `"<TID> <First>"`) and `seedAgentosTenants()` plus `npm run`-free test usage.
- **recon-502 (HARD): formatted bank record intake.** Fixed CSV header (exact, in order):
  `Date,TID,Payer Name,Amount,Type,Will deposit to,Description`. Date is `dd/mm/yyyy`. Amount is
  `0.00` and must be > 0, because outgoing lines are rejected per row with their line numbers.
  The file is rejected whole if any row is bad (same rule as decision on 2026-10-02). A file hash
  dedupes uploads. Migration `013_agentos_intake.sql`: `agentos_intake_batches` and
  `agentos_intake_lines` (amount_pence int, received_on date, tid_raw, payer_name, payment_type,
  deposit_to, description, match_status, agentos_tenant_id null, posting_status).
- **recon-503 (HARD): match to TID.** This runs inside the upload transaction. If `TID` equals
  `agentos_tenants.tid` and the normalised Payer Name equals the normalised forename-without-TID
  plus surname, the line is `matched`. If the TID matches but the name differs, the line is
  `name_mismatch`. If the TID is unknown or blank, the line is `unmatched`. If `Will deposit to`
  differs from the tenant's `deposit_to`, the line is `deposit_mismatch`. There is no fuzzy auto-match.
  Only `matched` lines can be exported.
- **recon-504 (HARD): post-to-agentOS export.** `GET /api/agentos/exports/:id.csv` serves a CSV
  with a UTF-8 BOM and CRLF line endings, reusing the statement CSV helpers. Columns:
  `TID,Payment From,Will deposit to,Type,Amount,Description and Card Authorisation Code`.
  `Payment From` is `<TID> <name>`. Amount is pounds to 2 decimal places. Description is
  `<Description> | Recon <line id>`. Each line is exported only once
  (`posting_status` goes `ready` -> `exported` -> `posted`). Exports run under an advisory lock.
  Migration `014_agentos_exports.sql` adds `agentos_exports`. A `POST .../lines/:id/posted`
  endpoint lets staff confirm a line was keyed in.
- **recon-505 (HARD): human review UI** at `/agentos`. Staff can upload, view a status-filtered
  list, reassign a TID (dropdown of `agentos_tenants`, re-runs 503 rules for that line, audited),
  export, and mark lines posted.
- **recon-506 (HARD, blocked needs-human): Journal Transfer export.** This waits on field-spec Q6.

Out of scope:
- Creating Recon `receipts`, sending anything to Xero or Vico from these lines (open decision D2).
- Any live agentOS API or browser automation; real tenant data; changes to migrations 001/002 or to
  existing ingest/matching/receipt code.

## Verification Path

Every feature must pass `npm run lint`, `npm run typecheck`, `npm run test:unit` and `npm run db:test`.
Each feature also has its own check below:
- 501: `npm run test:int -- agentos-seed` passes when the 12 fixture rows load, a bad TID
  format is rejected, and re-seeding is idempotent.
- 502: `npm run test:unit -- agentos-intake` (parser) and `npm run test:int -- agentos-intake`
  pass when an outgoing or zero row rejects the whole file with line numbers, and a duplicate
  file returns 409.
- 503: `npm run test:int -- agentos-match` passes when all four statuses are hit by the fixtures.
- 504: `npm run test:int -- agentos-export` passes when the CSV bytes equal the golden file
  `server/test/fixtures/agentos/take-payment.golden.csv` and a second export holds 0 rows.
- 505: `npm run test:e2e -- agentos` passes the upload -> reassign -> export -> mark posted flow.

## Risks And Blockers

- The TID meaning is not confirmed (field-spec Q5). The plan assumes it is the 4-digit number in
  Forename, which equals the Veco `tenancies.tid`. If that is wrong, only the 501 regex and the 503
  join change.
- The `Type` values are unknown (Q3). The value passes through as-is. Anything other than `Cash`
  gets the warning `unverified_type` but is not rejected.
- The Take a Payment menu location (Q2) does not change the export; it only affects the staff instructions.
- Rollback: each feature adds only new tables, routes and features. To roll back, revert the
  commit and drop migrations 012-014 (all new tables, no FK into them from existing tables).

## Progress Log

- 2026-10-06: [CURRENT] plan created, not yet started

## Open Decisions

- D1: Is the TID the Forename number or `ten-<n>`? (field-spec Q5)
- D2: Should matched agentOS lines also become Recon receipts (Xero/Vico flow), or stay posting-only?
- D3: What are the Take a Payment `Type` values, and which one applies to bank receipts? (Q3)
- D4: When is a Journal Transfer used, and what are the Nominal Code and Account Type lists? (Q6, gates recon-506)
- D5: What is the list of "Will deposit to" client accounts per landlord/branch? (Q7)
