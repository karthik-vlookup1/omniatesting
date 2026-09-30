# Omnia Recon: build brief for Claude Code

You are the lead engineer building **Omnia Recon**, a rent reconciliation system for Omnia Housing, a UK property management company. This repo uses the **hx harness kit** in `.claude/`.

- **This brief** says **what** to build.
- **The harness** says **how** to work.

If the two conflict, the harness wins. Tell me about the conflict.

This brief has 10 sections:

1. How you must work (harness rules)
2. Business context
3. Non-negotiable principles
4. Stack and repo layout
5. Database (already written and tested)
6. Matching rules
7. The build, in phases
8. Known unknowns
9. Definition of done (every feature)
10. First session: do exactly this

---

## 1. How you must work (harness rules)

1. **Check the harness first.** Run:
   - `node .claude/bin/hx.cjs --version` (expect `hx v0.6.0`);
   - `node .claude/bin/hx.cjs kit doctor`.

   If the kit is missing or doctor fails, stop and tell me what failed. Don't repair the harness yourself. The SessionStart hook already ran `hx start`, so don't run it again.
2. **Always use the vendored binary:** `node .claude/bin/hx.cjs <command>` (written as `hx` below).
3. **One feature at a time (WIP=1).** For each feature:
   1. `hx feature start <id>`. If the advanced pack is present, run `hx plan new <topic>` first.
   2. Implement it, inside the feature's declared `scope` only.
   3. `hx verify <id>`. Only this can mark a feature passing.
   4. `hx drift`, to check you stayed in scope.
   5. Commit.
4. **Registering features.** Run `hx feature --help` first.
   - **If `feature add` exists,** use it for every feature in §7.
   - **If it doesn't exist** (the v0.6.0 source ships without it, even though the README mentions it):
     1. Make **one** edit to `.claude/state/feature_list.json`, appending the §7 backlog. Match the existing entry format, with `status: "not_started"`, `evidence: []` and `notes: ""`.
     2. Run `hx feature list` and `hx doctor` to confirm the file validates.
     3. Record it with `hx decision add "Backlog registered by direct edit" --reason "no feature add command in this build"`.

   After that one edit, never touch `feature_list.json` by hand again. If you need to widen a scope and no command exists for it, stop and ask me.
5. **Protected files.** `.claude/hx.config.json`, `.claude/settings*.json`, `.claude/bin/**` and `.env*` are protected. Don't edit them, and don't work around the guard. If one needs a change:
   1. Write the proposed file to `.claude/approvals/<name>/`.
   2. Add an `APPLY.md` beside it saying why.
   3. Tell me. I'll copy it into place.
6. **Human blockers.** For a real bank CSV, credentials, or a business rule nobody has decided, run `hx feature block <id> --reason "..." --needs-human`. Then continue with the next feature that doesn't depend on it.
7. **Record decisions and lessons.** Use `hx decision add` for design choices and `hx lesson add` for surprises.
8. **Attest with observed numbers.** For example: "7 fixture CSVs parsed, 412 rows, 0 errors, 3 duplicates skipped". Not "parser works".
9. **Issue work uses the sub-agents** in `.claude/agents/` (`triager`, `test-writer`, `fixer`, `verifier`). Never close an issue yourself; `autonomy` is set to `review`.

## 2. Business context

Omnia Housing manages tenancies across several branches. Rent arrives in **7 bank accounts**: HSBC, Lloyds, Apollo TW, Redstone, Army, ISL, and one more still to confirm. Each payment comes from one of three kinds of payer:

| Who pays | What identifies the tenant on the bank line |
|---|---|
| Council (Housing Benefit) or DWP (Universal Credit) | **Tenant ID (TID)**, e.g. `T1234` |
| The tenant themselves | Their **National Insurance (NI) number** |
| A landlord, a relative or another third party | Only the payer's **sort code and account number** |

Terms used throughout this brief:

- **TID:** created when a tenant moves into a property. It belongs to that tenant, property and move-in date. A tenant who moves gets a new TID. The NI number stays the same for life.
- **RG / MG / IRG:** a tenancy's management status. It decides the Xero ledger code.
- **LHA / UC / HB:** benefit awards. The council or DWP may pay part of the rent (for example 50% for a working tenant, or a fixed LHA amount). The tenant pays whatever is left.

### Today's manual process (being replaced)

The step-by-step flow chart is in `docs/reference/rental-income-flow.md`.

1. **Download.** Staff download a CSV from each of the 7 banks every day. Every bank orders its columns differently, and the order sometimes changes.
2. **First Google Sheet.** They copy the rows into a "Bank Statement" Google Sheet and look up each TID or NI number by hand. Expenses are dropped. A rent payment with no identifier is marked "Yet to take".
3. **LetMC.** They search each TID in LetMC (now Agent OS) and record the receipt. **LetMC is being retired.**
4. **Vico.** They re-key the payment into Vico, an in-house app reached over RDP. Vico needs only **TID + amount**, plus a sort code and account number that are the same on every row.
5. **Second Google Sheet.** A second sheet re-checks everything and assigns the Xero ledger code:

   | Payment | RG | MG | IRG |
   |---|---|---|---|
   | Regular rent | 001 | 001B | 001G |
   | Back-dated rent | 206 | 207 | 208 |
   | Ended-tenancy overpayment | 001C | 001C | 001C |

6. **Xero.** They build a CSV, import it into Xero as draft invoices, review the drafts and approve them.

### What we are building

Staff **upload each bank CSV once**. The system then:

1. reads any bank's layout;
2. matches every line to a tenancy and fills in the missing identifiers;
3. queues anything uncertain for a person;
4. records receipts and allocates them to rent periods.

It produces three outputs from **one Postgres database**:

- (a) a **filled-in bank statement CSV**, replacing the Google Sheet;
- (b) a **Vico upload**;
- (c) **Xero invoices through the API**.

Nothing is ever keyed in twice.

## 3. Non-negotiable principles

- **A bank line is not a rent payment.** A bank line becomes one or more **receipts** (one council payment can cover many tenancies). Receipts are **allocated** to rent charges.
- **Rent is charged per payer** (tenant, council_hb, dwp_uc, other). The tenant owes whatever the third parties don't pay. Arrears are tracked per payer.
- **Allocation is oldest arrears first**, within the same tenancy and payer. Money left over is credit and is applied automatically to later charges. Staff can override any allocation.
- **Never guess silently.** Every filled-in value records how it was found (`resolved_via`). An unmatched line stays visible as "Yet to take".
- **Idempotent everywhere:**
  - the same file uploaded twice is rejected by its SHA-256;
  - duplicate lines from overlapping statements are skipped;
  - each receipt is sent to Xero or Vico exactly once, using an idempotency key.
- **Only matched receipts go to Vico or Xero.**
- **Personal data is protected:**
  - NI numbers and payer account numbers are stored only as an HMAC keyed hash (for lookup), plus AES-256-GCM ciphertext for authorised display, plus the last 3–4 characters;
  - keys come from env vars only;
  - **all fixtures are synthetic**: no real bank data, NI numbers or account numbers in the repo, logs or test output.
- **Everything is audited.**

## 4. Stack and repo layout (PERN)

- **Database:** PostgreSQL 16, run locally with `docker compose`, with `pgcrypto`, `btree_gist` and `pg_trgm`.
- **Migrations:** plain SQL files in `db/migrations/`, applied in filename order by a small runner, `server/src/db/migrate.ts`, which records applied files in `schema_migrations`.
  - Each file manages its own transaction, and 002 has one statement outside it on purpose. So the runner must **not** wrap files in an extra transaction.
  - Never edit an applied migration; new changes go in `003_*.sql` onward.
- **Server:** Node 20+, TypeScript, Express, `pg`, Zod, `csv-parse`, pino.
  - Every DB connection runs `SET app.hash_key = $HASH_KEY` and, per request, `SET LOCAL app.user_email`.
- **Web:** React + Vite + TypeScript + TanStack Query. Choose a UI kit and record the choice with `hx decision add`.
- **Tests:** Vitest (unit), Vitest + supertest against a real test database (integration), Playwright (e2e).
- **Folder layout (npm workspaces):**
  ```
  db/migrations/   001_baseline.sql, 002_matching_layer.sql   (PROVIDED, tested)
  db/tests/        001_baseline_scenarios.sql, 002_matching_scenarios.sql (PROVIDED)
  server/src/{lib,config,db,domain,services,api,jobs}
  web/src/features/<feature>/
  fixtures/banks/  one synthetic CSV per bank (columns deliberately reordered/renamed)
  docs/            BUILD_BRIEF.md (this), ARCHITECTURE.md, reference/
  ```
- **Server layer order:** `lib → config → db → domain → services → api/jobs`. Lower layers never import higher ones. Propose this as `architecture.layers` in `.claude/hx.config.json` via the approvals flow (§1.5), along with:
  - `handsOff: ["docs/reference/**", "db/migrations/001_*", "db/migrations/002_*"]`;
  - `protectedPaths: ["fixtures/private/**"]`.
- **Root scripts.** Names must stay stable, because every verification command uses them:
  - `npm run lint`
  - `npm run typecheck`
  - `npm run test:unit -- <filter>`
  - `npm run test:int -- <filter>`
  - `npm run test:e2e -- <filter>`
  - `npm run db:test`: creates a fresh test DB, applies all migrations, runs every `db/tests/*.sql` with `ON_ERROR_STOP=1`, and fails if any file doesn't print its `ALL ... PASSED` line.

## 5. Database (already written and tested)

Both migrations pass on PostgreSQL 16. Treat them as fixed.

**`001_baseline.sql`** has 30 tables:

- reference data;
- tenants and tenancies (TID, RG/MG/IRG, NI stored as encrypted + hash);
- rent schedules (weekly to quarterly, with history);
- benefit awards (LHA/UC/HB), payer splits and payment methods;
- `rent_charges`, with one row per period per payer;
- import batches and bank transactions;
- remittances;
- matching tables;
- receipts, allocations and adjustments;
- Xero ledger rules (seeded with the table above) and invoices;
- sync outbox/inbox, `external_refs` and the audit log.

It also has these functions and views:

- `generate_rent_charges(tenancy, until)`, `allocate_oldest_first(receipt)` and `reallocate_tenancy(tenancy)`;
- `v_charge_status`, `v_tenancy_balance`, `v_arrears_aging` and `v_xero_rental_income`, which has the exact columns of today's "Rental Income for Xero" sheet.

**`002_matching_layer.sql`** adds:

- **`bank_csv_profiles`:** find columns by header name through `header_aliases`, never by position. One active profile per bank. A bank renaming a header means a new profile version, not a code change.
- **`payer_bank_accounts`:** a known landlord, relative or tenant account, stored as a hash plus last 4 digits, linked to a tenancy or to a landlord (which covers all of that landlord's tenancies).
- **New columns on `bank_transactions`:** `extracted_tid`, `extracted_ni_hash`, `payer_sort_code`, `payer_account_hash`, `payer_account_last4`, `resolved_tenancy_id`, `resolved_via` and `profile_id`.
- **`integration_settings`:** constants such as Vico's sort code and account number, and the Xero field map.
- **Functions:**
  - `secure_hash`, `extract_tid` and `extract_ni`;
  - `suggest_matches(txn)`: the cascade in §6;
  - `auto_match(txn, threshold)`: auto-confirms if exactly one suggestion reaches the threshold;
  - `confirm_match(txn, tenancy, payer, method, remember, user, amount)`: creates the receipt, allocates it, and learns the payer if `remember` is set.
- **Views:** `v_bank_statement_enriched` (replaces the Google Sheet) and `v_vico_export` (only receipts not yet exported).

**Tests.** `db/tests/*.sql` covers 5 rent scenarios and 38 matching checks, all passing:

- arrears backtracking, a 50% UC split, an LHA shortfall, a council bulk split and an ended-tenancy 001C payment;
- TID, NI, a tenant who moved, a landlord paying for 3 tenancies, learning, fuzzy matching, "Yet to take" and the Vico export.

Keep them passing. Add new SQL tests next to them for every new migration.

## 6. Matching rules (implemented in SQL; the server wraps them)

| # | Rule | Payer | Confidence |
|---|---|---|---|
| 1 | TID on the line exists | the tenancy's council/DWP split, else `council_hb` | 1.00 |
| 2 | NI → tenant with **one** live tenancy (the reason flags arrears on older tenancies) | tenant | 0.95 |
| 2b | NI → tenant with several live tenancies | tenant | 0.60 each |
| 3 | Payer account known and linked to **one** tenancy | the account's payer | 0.95 |
| 3b | Payer account covers several tenancies (landlord) | the account's payer | 0.70 where the expected payment equals the amount, else 0.40 |
| 4 | Learned reference rule | stored payer | 0.95 |
| 5 | Fuzzy tenant name + amount within 5% of expected | tenant | ≤ 0.60 (suggestion only) |
| 6 | Nothing matched | — | status `yet_to_take` |

Default auto-match threshold: **0.95**, from env `AUTO_MATCH_THRESHOLD`.

- **The server's job:** parse and extract identifiers per `bank_csv_profiles`, insert the lines, call `auto_match` for each one, and expose `confirm_match` to the review UI, including "remember this payer".
- **Don't reimplement the cascade in TypeScript.** If a rule needs changing, write a new migration with a SQL test.

## 7. The build, in phases

Work the phases in order. **At the end of every phase, stop.** Give me a phase report: the features that passed, the numbers, what's blocked and on whom, and anything you'd change. Wait for my go-ahead before starting the next phase.

### Phase 0: Foundation

Goal: the repo runs, the provided database passes its tests, and security and auth are in place.

### Phase 1: Tenants and properties

Goal: all the reference data the matching needs is in the system.

- Branches, bank accounts, landlords, properties.
- Tenants with their NI number, and their tenancies.
- Rent terms, LHA/UC/HB splits and payment methods.
- Known payer accounts.
- The LetMC import that loads all of this in bulk.

### Phase 2: Bank ingest and matching

Goal: upload the 7 CSVs, have most lines matched automatically, and let staff clear the rest in a review screen.

### Phase 3: Outputs

Goal: the filled-in bank statement CSV, the Vico upload and the Xero API sync.

### Phase 4: Reporting

Goal: dashboard, arrears ageing and tenant rent statements.

### Backlog

Register these features as described in §1.4. Also save this JSON as `docs/omnia-features.json` for reference. `area` gives the phase.

```json
[
  {"id":"recon-001","priority":1,"area":"phase-0-foundation","title":"Monorepo scaffold: npm workspaces, docker compose Postgres 16, lint/typecheck/test scripts, README, ARCHITECTURE.md",
   "user_visible_behavior":"On a clean clone: docker compose up -d db && npm ci && npm run lint && npm run typecheck all exit 0.",
   "scope":["package.json","package-lock.json","docker-compose.yml",".github/**","server/package.json","server/tsconfig*.json","web/package.json","web/tsconfig*.json","web/vite.config.ts","README.md","docs/ARCHITECTURE.md",".env.example","eslint.config.*","vitest.config.*","playwright.config.*"],
   "verification":[{"level":"static","cmd":"npm run lint"},{"level":"static","cmd":"npm run typecheck"}]},
  {"id":"recon-002","priority":2,"area":"phase-0-foundation","title":"Migration runner + db:test running the provided 001/002 migrations and SQL tests","dependsOn":["recon-001"],
   "user_visible_behavior":"npm run db:test applies 001+002 to a fresh DB and both SQL test files print their ALL ... PASSED line.",
   "scope":["server/src/db/migrate.ts","scripts/db-test.*","package.json","server/package.json"],
   "verification":[{"level":"integration","cmd":"npm run db:test"}]},
  {"id":"recon-003","priority":3,"area":"phase-0-foundation","title":"Config + crypto lib: env validation (Zod), HMAC hash matching secure_hash(), AES-256-GCM encrypt/decrypt, masking helpers","dependsOn":["recon-001"],
   "user_visible_behavior":"TS hash of an NI/account equals SQL secure_hash() for the same key; missing env vars fail fast with a clear message.",
   "scope":["server/src/lib/crypto*","server/src/config/**","server/test/unit/crypto*","server/test/unit/config*","server/test/int/crypto*"],
   "verification":[{"level":"unit","cmd":"npm run test:unit -- crypto config"},{"level":"integration","cmd":"npm run test:int -- crypto"}]},
  {"id":"recon-004","priority":4,"area":"phase-0-foundation","title":"Auth + roles (admin/accounts/staff/readonly) + per-request audit context (SET LOCAL app.user_email) + app shell with login","dependsOn":["recon-002","recon-003"],
   "scope":["server/src/api/auth/**","server/src/services/auth*","server/src/db/context*","server/src/api/app.ts","web/src/app/**","web/src/features/auth/**","server/test/**/auth*","e2e/auth*"],
   "verification":[{"level":"integration","cmd":"npm run test:int -- auth"},{"level":"e2e","cmd":"npm run test:e2e -- auth"}]},

  {"id":"recon-101","priority":101,"area":"phase-1-tenants","title":"Branches, bank accounts, landlords, properties: API + UI (list, search, create, edit)","dependsOn":["recon-004"],
   "scope":["server/src/{domain,services,api}/{branch,bank-account,landlord,property}*/**","web/src/features/{branches,bank-accounts,landlords,properties}/**","server/test/**/property*","e2e/property*"],
   "verification":[{"level":"integration","cmd":"npm run test:int -- property"},{"level":"e2e","cmd":"npm run test:e2e -- property"}]},
  {"id":"recon-102","priority":102,"area":"phase-1-tenants","title":"Tenants + tenancies: TID, RG/MG/IRG, joint tenants, NI stored encrypted+hashed+last3, search by TID/name/NI; tenancy end flow","dependsOn":["recon-101"],
   "user_visible_behavior":"Staff search a tenant by TID, name or full NI; NI is never shown in full except to admin/accounts; ending a tenancy requires an end date.",
   "scope":["server/src/{domain,services,api}/{tenant,tenancy}*/**","web/src/features/{tenants,tenancies}/**","server/test/**/tenan*","e2e/tenan*"],
   "verification":[{"level":"integration","cmd":"npm run test:int -- tenan"},{"level":"e2e","cmd":"npm run test:e2e -- tenan"}]},
  {"id":"recon-103","priority":103,"area":"phase-1-tenants","title":"Rent terms: rent schedules, benefit awards (LHA/UC/HB), payer splits, payment methods; nightly charge generation job + rent account view per tenancy","dependsOn":["recon-102"],
   "user_visible_behavior":"On a tenancy page staff set rent + cycle, add an HB award of a fixed amount and see the tenant/council split per period and the running balance per payer.",
   "scope":["server/src/{domain,services,api}/{rent,benefit,payer-split,payment-method}*/**","server/src/jobs/generate-charges*","web/src/features/rent-terms/**","server/test/**/rent*","e2e/rent*"],
   "verification":[{"level":"integration","cmd":"npm run test:int -- rent"},{"level":"e2e","cmd":"npm run test:e2e -- rent"}]},
  {"id":"recon-104","priority":104,"area":"phase-1-tenants","title":"Known payer accounts: add/link landlord, relative or tenant accounts (hash + last4) to a tenancy or landlord","dependsOn":["recon-102","recon-003"],
   "scope":["server/src/{domain,services,api}/payer-account*/**","web/src/features/payer-accounts/**","server/test/**/payer-account*"],
   "verification":[{"level":"integration","cmd":"npm run test:int -- payer-account"}]},
  {"id":"recon-105","priority":105,"area":"phase-1-tenants","title":"LetMC import: tenants, tenancies, properties, landlords + opening balances at a cutover date; dry-run report before commit","dependsOn":["recon-103"],
   "user_visible_behavior":"Import a (synthetic) LetMC export in dry-run; see counts, duplicates and rejects; commit; arrears appear as opening_balance charges, credits as negative adjustments.",
   "scope":["server/src/jobs/letmc-import/**","server/src/api/imports/letmc*","web/src/features/letmc-import/**","fixtures/letmc/**","server/test/**/letmc*"],
   "verification":[{"level":"integration","cmd":"npm run test:int -- letmc"}]},

  {"id":"recon-201","priority":201,"area":"phase-2-matching","title":"Bank CSV ingest: upload, profile by header name, dedupe, raw row kept, extraction of TID/NI/payer account; CSV profile admin screen","dependsOn":["recon-104"],
   "user_visible_behavior":"Uploading each of 7 synthetic bank files (columns reordered/renamed per bank) imports the expected rows; re-upload is rejected; an overlapping file inserts only new lines; an unknown layout fails naming the missing fields.",
   "scope":["server/src/{domain,services,api}/ingest/**","web/src/features/{upload,csv-profiles}/**","fixtures/banks/**","server/test/**/ingest*"],
   "verification":[{"level":"unit","cmd":"npm run test:unit -- ingest"},{"level":"integration","cmd":"npm run test:int -- ingest"}]},
  {"id":"recon-202","priority":202,"area":"phase-2-matching","title":"Matching service: auto_match on every ingested line, match summary per import, API for suggestions / confirm / remember / reject","dependsOn":["recon-201"],
   "user_visible_behavior":"After upload the summary shows N matched automatically, N for review, N yet to take, N excluded.",
   "scope":["server/src/{services,api}/matching/**","server/test/**/matching*"],
   "verification":[{"level":"integration","cmd":"npm run test:int -- matching"}]},
  {"id":"recon-203","priority":203,"area":"phase-2-matching","title":"Review queue UI: suggestions with confidence + reason, accept / pick another tenancy / remember payer, yet-to-take list with manual match","dependsOn":["recon-202"],
   "scope":["web/src/features/review/**","e2e/review*"],
   "verification":[{"level":"e2e","cmd":"npm run test:e2e -- review"}]},
  {"id":"recon-204","priority":204,"area":"phase-2-matching","title":"Receipt operations: split a bulk council payment / upload remittance, manual allocation override, reverse a receipt, adjustments (write-off, refund)","dependsOn":["recon-202"],
   "scope":["server/src/{domain,services,api}/{receipt,allocation,remittance,adjustment}*/**","web/src/features/receipts/**","server/test/**/receipt*"],
   "verification":[{"level":"integration","cmd":"npm run test:int -- receipt"}]},

  {"id":"recon-301","priority":301,"area":"phase-3-outputs","title":"Filled-in bank statement CSV download (replaces the Google Sheet) with filters by bank/date/status","dependsOn":["recon-202"],
   "scope":["server/src/{services,api}/export/statement*","web/src/features/export/**","server/test/**/export-statement*"],
   "verification":[{"level":"integration","cmd":"npm run test:int -- export-statement"}]},
  {"id":"recon-302","priority":302,"area":"phase-3-outputs","title":"Vico export from v_vico_export: file download (TID, amount, constant sort code/account), marks each receipt exported once via external_refs","dependsOn":["recon-202"],
   "scope":["server/src/{services,api,jobs}/vico/**","web/src/features/vico/**","server/test/**/vico*"],
   "verification":[{"level":"integration","cmd":"npm run test:int -- vico"}]},
  {"id":"recon-303","priority":303,"area":"phase-3-outputs","title":"Xero sync: OAuth2, contact mapping, one draft invoice per receipt (ledger code + branch tracking), status read-back, idempotent outbox worker; field map from integration_settings","dependsOn":["recon-202"],
   "user_visible_behavior":"Against a mocked Xero API: one invoice per receipt, retries never duplicate, APPROVED/VOIDED flows back. A real sandbox run is a manual step.",
   "scope":["server/src/{services,api,jobs}/xero/**","web/src/features/xero/**","server/test/**/xero*"],
   "verification":[{"level":"integration","cmd":"npm run test:int -- xero"}]},

  {"id":"recon-401","priority":401,"area":"phase-4-reporting","title":"Dashboard: today's imports per bank, auto-match rate, review backlog, balances per payer, arrears ageing, tenant rent statement (PDF/CSV)","dependsOn":["recon-203","recon-301"],
   "scope":["server/src/{services,api}/reports/**","web/src/features/dashboard/**","e2e/dashboard*"],
   "verification":[{"level":"e2e","cmd":"npm run test:e2e -- dashboard"}]}
]
```

## 8. Known unknowns

Don't invent answers to these. Build the part you can, block only the dependent part with `--needs-human`, and ask the exact question.

1. **Real bank CSVs.** We don't have real CSV samples from the 7 banks. Build synthetic fixtures now. Adding a real bank must be a new `bank_csv_profiles` row, not a code change.
2. **Xero fields.** Which **4 fields** Xero needs, and whether the contact is the tenant or the council. Keep the mapping config-driven.
3. **Vico upload.** How Vico accepts an upload: a file import, its database, or screen automation. For now, build the file export only.
4. **Back-dated rent.** What makes a payment "back-dated" (codes 206–208). For now, staff flag it by hand.
5. **Landlord payments.** Whether a landlord's payment reduces the tenant's share or the council's. For now, use the `payer` set on `payer_bank_accounts`.
6. **TID with no council split.** A TID with no council/DWP split defaults to `council_hb`. Confirm whether tenants ever quote their TID themselves.
7. **Credentials and hosting.** Xero app credentials, production database and hosting. Use `.env.example` placeholders only.

## 9. Definition of done (every feature)

A feature is done only when all of these are true:

- lint, typecheck and its verification commands pass through `hx verify <id>`;
- `hx drift` is clean;
- `npm run db:test` still passes;
- error paths are tested, not just the happy path;
- no real personal data is anywhere in the repo;
- the attestation includes observed numbers;
- it's committed with a clear message.

## 10. First session: do exactly this

1. Run the harness check (§1.1) and report the version and the doctor result.
2. Read this brief, `docs/reference/rental-income-flow.md`, and both files in `db/migrations/`. Then write `docs/ARCHITECTURE.md`, 1–2 pages: layers, data flow and the three outputs.
3. Propose the `hx.config.json` changes through `.claude/approvals/` (§4).
4. Register the backlog (§1.4 and §7), then show me the output of `hx feature list`.
5. Start **Phase 0** with `recon-001`. Work through Phase 0, then **stop** and give me the phase report.
