# Omnia Recon — Architecture

Omnia Recon replaces a manual, multi-sheet rent reconciliation process (see
`docs/reference/rental-income-flow.md`). Staff upload each bank CSV **once**; everything
downstream — the filled-in bank statement, the Vico upload and the Xero invoices — is produced
from **one PostgreSQL database**. Nothing is keyed twice.

## 1. Guiding rule: the database is the rules engine

The money rules live in SQL (`db/migrations/`), not in TypeScript:

| Concern | Where it lives |
|---|---|
| Rent charges per period per payer | `generate_rent_charges(tenancy, until)` |
| Oldest-arrears-first allocation, credit carry-forward | `allocate_oldest_first(receipt)`, `reallocate_tenancy(tenancy)` |
| Matching cascade (TID → NI → payer account → learned rule → fuzzy → yet to take) | `suggest_matches(txn)`, `auto_match(txn, threshold)` |
| Receipt creation, allocation, "remember this payer" | `confirm_match(...)` |
| Ledger code (001/001B/001G/206–208/001C) | `xero_ledger_rules` + receipt trigger |
| Integrity (receipts ≤ bank line, allocations ≤ receipt and charge, same tenancy) | triggers |
| Audit trail | `audit_row()` trigger on every money table, reading `app.user_email` |

The server's job is to **feed** these functions (parse, normalise, hash, insert) and to
**expose** them (API, review UI, exports). A rule change is a new migration (`003_*.sql`+)
with its own SQL test in `db/tests/`, never a TypeScript re-implementation.

## 2. Server layers

```
lib  →  config  →  db  →  domain  →  services  →  api / jobs
```

Each layer may import only from layers to its left. This will be enforced by `architecture.layers`
in `.claude/hx.config.json` (proposed via `.claude/approvals/`).

| Layer | Responsibility | Examples |
|---|---|---|
| `lib` | Pure helpers, no I/O, no config | HMAC hash matching `secure_hash()`, AES-256-GCM, masking, money/date parsing |
| `config` | Read and validate env once (Zod), fail fast | `DATABASE_URL`, `HASH_KEY`, `ENCRYPTION_KEY`, `AUTO_MATCH_THRESHOLD` |
| `db` | Pool, migration runner, per-request context | every connection: `SET app.hash_key`; every request tx: `SET LOCAL app.user_email` |
| `domain` | Types and invariants for one concept (Zod schemas, value objects) | tenancy, receipt, bank line, CSV profile |
| `services` | Use cases; own transactions; call SQL functions | ingest, matching, receipts, exports, Xero sync |
| `api` | Express routers: auth, validation, HTTP mapping only | `/api/imports`, `/api/review`, `/api/exports` |
| `jobs` | Scheduled / background work | nightly charge generation, Xero outbox worker, LetMC import |

**Web** (`web/src/features/<feature>/`) is React + Vite + TanStack Query, one folder per feature,
talking only to the API.

## 3. Data flow

```
 bank CSV ──upload──▶ import_batches (file_sha256 UNIQUE → same file rejected)
                          │
                          ▼  bank_csv_profiles: columns found by HEADER NAME via header_aliases
                   parse + normalise
                          │  extract TID / NI / payer sort code + account
                          │  NI + account → HMAC hash (+ last 3–4 chars); raw row kept as jsonb
                          ▼
                   bank_transactions (dedupe_key UNIQUE per bank → overlapping files skip dupes)
                          │
                          ▼  auto_match(txn, AUTO_MATCH_THRESHOLD)
      ┌───────────────────┼─────────────────────────┬──────────────────┐
   matched          needs_review               yet_to_take          excluded
 (one ≥ 0.95)    (match_suggestions)        ("Yet to take")      (money out)
      │                   │ staff: accept / pick / remember / split / manual
      │                   ▼
      └──────────▶ confirm_match → receipts → allocations (oldest arrears first, per payer)
                                        │
             ┌──────────────────────────┼───────────────────────────┐
             ▼                          ▼                           ▼
   (a) Bank statement CSV        (b) Vico upload             (c) Xero invoices
   v_bank_statement_enriched     v_vico_export               v_xero_rental_income
                                 → external_refs (vico)      → sync_outbox → worker → Xero API
                                                             → external_refs (xero), status read-back
```

Reference data (branches, bank accounts, landlords, properties, tenants, tenancies, rent
schedules, benefit awards, payer splits, payment methods, known payer accounts) is loaded in bulk
from LetMC once, then maintained in the app. A nightly job runs `generate_rent_charges` so
charges exist before receipts arrive.

## 4. The three outputs

| Output | Source | Exactly-once mechanism |
|---|---|---|
| **(a) Filled-in bank statement CSV** — replaces the "Bank Statement" Google Sheet | `v_bank_statement_enriched`, filtered by bank / date / status | Read-only; regenerated on demand. Unmatched lines stay visible as "Yet to take". |
| **(b) Vico upload** — TID + amount + constant sort code / account | `v_vico_export` (only receipts with no `external_refs` row for `vico`) | Writing the file and inserting `external_refs(system='vico', entity='receipt')` happen in one transaction. File export only for now (upload mechanism is an open question). |
| **(c) Xero draft invoices via API** — one per receipt, ledger code + branch tracking | `v_xero_rental_income` + `xero_invoices` / `xero_invoice_lines` | `sync_outbox.idempotency_key` per receipt; worker retries never duplicate; APPROVED / VOIDED read back. Field map from `integration_settings`. |

Only **matched receipts** reach (b) and (c).

## 5. Cross-cutting

- **Personal data.** NI numbers and payer account numbers are stored as HMAC-SHA256 hash
  (`secure_hash`, keyed by `app.hash_key`) for lookup, AES-256-GCM ciphertext for authorised
  display, and last 3–4 characters for masking. Keys come only from env vars. The TypeScript hash
  must equal the SQL hash for the same key (tested). All fixtures are synthetic.
- **Idempotency.** File SHA-256, per-line `dedupe_key`, outbox idempotency keys, `external_refs`.
- **Audit.** Every mutating request runs in a transaction that sets `app.user_email`; the audit
  trigger records old/new rows and who changed them.
- **Never guess silently.** `resolved_via` records how every line was matched; suggestions carry
  a confidence and a human-readable reason.
- **Roles.** `admin`, `accounts`, `staff`, `readonly` (from `app_users.role`). Full NI shown only
  to `admin` / `accounts`.

## 6. Local runtime and tests

- `docker compose up -d db` — PostgreSQL 16 (`pgcrypto`, `btree_gist`, `pg_trgm`).
- `server/src/db/migrate.ts` applies `db/migrations/*.sql` in filename order and records them in
  `schema_migrations`. It does **not** wrap files in a transaction (each file manages its own;
  002's `ALTER TYPE ... ADD VALUE` must run outside one).
- `npm run db:test` — fresh DB, all migrations, every `db/tests/*.sql` with `ON_ERROR_STOP=1`,
  requires each file's `ALL ... PASSED` line.
- Vitest (unit), Vitest + supertest against a real test DB (integration), Playwright (e2e).
