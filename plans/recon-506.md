# recon-506 plan: agentOS Journal Transfer, tenant to tenant, zero-sum, export once, mark posted (HARD)
Goal: a writer moves an amount (pence > 0) from one agentOS tenant (TID) to another. It is stored as one transfer with two entries (from = -amount, to = +amount, sum 0), exported once into a stored Journal Transfer CSV (BOM, CRLF, formula-safe) and then marked posted per transfer.

## Files
Create: `db/migrations/015_agentos_journal.sql`, `server/src/services/agentos/journal.service.ts`, `server/test/int/agentos-journal.test.ts`, `web/src/features/agentos/JournalSection.tsx`, `e2e/agentos-journal.spec.ts`. Modify: `server/src/api/agentos/routes.ts`, `web/src/features/agentos/api.ts`, `web/src/features/agentos/AgentosPage.tsx`. No golden file (it would need `.gitattributes`). The test builds the expected bytes itself.

## Steps
1. `015_agentos_journal.sql` (BEGIN/COMMIT, header comment like 014). Create the tables in this order:
   `agentos_journal_exports`: id uuid PK DEFAULT gen_random_uuid(); transfers_total int NOT NULL CHECK (>=0); amount_total_pence bigint NOT NULL CHECK (>=0); csv text NOT NULL; created_by uuid NOT NULL REFERENCES app_users(id); created_at timestamptz NOT NULL DEFAULT now().
   `agentos_journal_transfers`: id uuid PK; from_tid text NOT NULL CHECK (from_tid ~ '^\d{4}$'); to_tid text NOT NULL (same CHECK); CHECK (from_tid <> to_tid); amount_pence bigint NOT NULL CHECK (amount_pence > 0 AND amount_pence <= 9999999999); description text NOT NULL CHECK (char_length 1..200); nominal_code text NOT NULL CHECK (1..50); account_type text NOT NULL CHECK (1..50); posting_status text NOT NULL DEFAULT 'not_exported' CHECK IN ('not_exported','exported','posted'); export_id uuid REFERENCES agentos_journal_exports(id); posted_at timestamptz; posted_by uuid REFERENCES app_users(id); created_by uuid NOT NULL REFERENCES app_users(id); created_at/updated_at timestamptz NOT NULL DEFAULT now(). Add CHECKs `agentos_journal_transfers_export_chk` and `_posted_chk` copied from 014:30-33 (with 'exported','posted'). Add indexes on (export_id) and (created_at DESC).
   `agentos_journal_entries`: id uuid PK; transfer_id uuid NOT NULL REFERENCES agentos_journal_transfers(id) ON DELETE CASCADE; side text NOT NULL CHECK IN ('from','to'); agentos_tenant_id uuid REFERENCES agentos_tenants(id) ON DELETE SET NULL; tid text NOT NULL; person, branch, property text NOT NULL (snapshot at create); amount_pence bigint NOT NULL; UNIQUE (transfer_id, side); CHECK ((side='from') = (amount_pence < 0)); CHECK (amount_pence <> 0). Reason: SET NULL lets the existing seeds and tests (`DELETE FROM agentos_tenants`) keep working. The snapshot keeps the CSV stable.
   Zero-sum guard (deferred, so the service can insert both rows first):
   ```sql
   CREATE FUNCTION agentos_journal_zero_sum() RETURNS trigger LANGUAGE plpgsql AS $$
   BEGIN
     IF (SELECT count(*) <> 2 OR coalesce(sum(amount_pence),0) <> 0
           FROM agentos_journal_entries WHERE transfer_id = NEW.transfer_id) THEN
       RAISE EXCEPTION 'journal transfer % must have 2 entries summing to 0', NEW.transfer_id;
     END IF; RETURN NULL;
   END $$;
   CREATE CONSTRAINT TRIGGER t_zero_sum AFTER INSERT OR UPDATE OF amount_pence ON agentos_journal_entries
     DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION agentos_journal_zero_sum();
   ```
   Add a `t_audit` trigger (AFTER INSERT OR UPDATE OR DELETE ... audit_row(), as in 014:23-24) on all 3 tables.
2. `journal.service.ts`. Import `BOM` and `pounds` from `../export/statement-csv.js`, and `paymentFrom` from `./export.service.js`. Copy `cell()` from export.service.ts:35-38 verbatim. Exports:
   ```ts
   export const JOURNAL_HEADER = ['Description','Nominal Code','Branch','Person','Property','Account Type','Account Balance','Amount'] as const;
   export interface JournalEntryDto { side: 'from'|'to'; tid: string; person: string; branch: string; property: string; amountPence: number }
   export interface JournalTransferDto { id: string; fromTid: string; toTid: string; amountPence: number; description: string; nominalCode: string; accountType: string; postingStatus: 'not_exported'|'exported'|'posted'; exportId: string|null; postedAt: string|null; createdAt: string; entries: JournalEntryDto[] }
   export interface JournalExportDto { id: string; transfersTotal: number; amountTotalPence: number; createdAt: string }
   export function buildJournalCsv(rows: string[][]): string  // BOM + [header,...rows].map(cells).join('\r\n') + '\r\n'
   createJournalTransfer(db: ActorDb, i: {fromTid,toTid,amountPence,description,nominalCode,accountType,userId}): Promise<JournalTransferDto>
   listJournalTransfers(pool: Pool): Promise<JournalTransferDto[]>   // newest first, LIMIT 200, entries ordered from, to
   createJournalExport(db: ActorDb, i: {userId}): Promise<JournalExportDto>; getJournalExportCsv(pool, id); markTransferPosted(db, {transferId,userId})
   ```
3. `createJournalTransfer` runs in `db.tx`. If fromTid === toTid, throw `AppError('bad_request','From and to tenant must be different')`. Then `SELECT id, tid, forename, surname, managed_by, residence FROM agentos_tenants WHERE tid = ANY($1)`. For each missing tid, throw `bad_request 'No agentOS tenant has TID <tid>'` (check from before to). INSERT the transfer, then the 'from' entry (-amount), then the 'to' entry (+amount). person = paymentFrom(tid, forename, surname), branch = managed_by, property = residence. Return the DTO.
4. `createJournalExport` runs in `db.tx`. (a) `pg_advisory_xact_lock(hashtext('agentos-journal-export'))`. (b) SELECT transfers `WHERE posting_status='not_exported' ORDER BY created_at, id FOR UPDATE`, plus their entries. (c) For each transfer write 2 rows (from, then to): [desc, nominal_code, branch, person, property, account_type, '' (no balance is held, decided), pounds(BigInt(entry.amount_pence))]. desc = `` `${description} | Recon ${transfer.id}` ``. (d) INSERT the export with transfers_total and amount_total_pence = sum of transfer amounts. (e) UPDATE those transfers to posting_status='exported' and set export_id. Zero eligible transfers still makes a header-only export (as in 504).
5. `getJournalExportCsv` works like 504 `getAgentosExportCsv` but on agentos_journal_exports. `markTransferPosted` copies 504 `markLinePosted` on agentos_journal_transfers. Messages: `not_found 'No such journal transfer'`, `conflict 'This transfer is already marked posted'`, `conflict 'Only exported transfers can be marked posted'`. Returns the full DTO (re-select it).
6. `routes.ts`: add doc-comment lines and these routes. Ids are checked with z.uuid(); a non-uuid id gives 404.
   - `GET /journal/transfers` (signed in) returns `{ transfers }`.
   - `POST /journal/transfers` (requireWriter). zod body: fromTid/toTid `z.string().regex(/^\d{4}$/)`; amountPence `z.number().int().positive().max(9999999999)`; description `z.string().trim().min(1).max(200)`; nominalCode and accountType `z.string().trim().min(1).max(50)`. On failure, throw `bad_request` with message `Invalid <first issue path>: <field rule>`, using these fixed rules: tid "must be 4 digits", amountPence "must be a whole number of pence above 0", text fields "is required, max N characters". Return 201 `{ transfer }` and log `req.log.info({ agentosJournal: { id, fromTid, toTid, amountPence } })`.
   - `POST /journal/exports` (writer, no body) returns 201 `{ export }`. `GET /journal/exports/:id.csv` uses headers like 504, with filename `agentos-journal-transfer-<YYYY-MM-DD>-<id8>.csv`. 404 message: `No such journal export`.
   - `POST /journal/transfers/:id/posted` (writer) returns 200 `{ transfer }`.
7. `web/.../api.ts`: mirror the DTOs. Add `useJournalTransfers()` (key `['agentos','journal']`) and the mutations `useCreateJournalTransfer`, `useCreateJournalExport` and `useMarkJournalPosted`, each invalidating `['agentos']`. Add `journalCsvUrl(id)` and `JOURNAL_STATUS_LABELS` {not_exported 'Not exported', exported 'Exported', posted 'Posted'}.
8. `JournalSection.tsx` (`export function JournalSection({ writer }: { writer: boolean })`): `Title order={3}` "Journal transfers". Writer-only form: searchable Selects "From tenant" and "To tenant" (data from useAgentosTenants, value tid, label name); NumberInput "Amount (£)" (min 0.01, decimalScale 2, fixedDecimalScale), sent as `Math.round(v*100)`; TextInputs "Description", "Nominal Code", "Account Type"; Button "Create transfer", disabled until all fields are filled and from !== to. Server errors go in an Alert role="alert". Writer-only `Button "Export journal transfers (N)"`, where N = the not_exported count, disabled at 0. On success, show an Alert with "Exported N transfer(s)" and an Anchor "Download journal CSV". Table columns: Created, From, To, Amount (gbp), Description, Nominal Code, Account Type, Status (Badge), Actions. Each row has `data-testid={`journal-${t.id}`}`. A writer gets "Mark posted" only when the status is exported. Readonly users see the table only. Empty table text: "No journal transfers yet".
9. `AgentosPage.tsx`: after the closing `</>` of the batch block (line 122), render `<Divider />` and `<JournalSection writer={writer} />`. Nothing else changes, so the agentos.spec selectors stay the same.

## Tests: `server/test/int/agentos-journal.test.ts`
Copy signIn and clean from agentos-export.test.ts:26-52, using email `<role>-aoj-<run>@example.test`. clean = `TRUNCATE agentos_journal_exports, agentos_journal_transfers CASCADE`, `DELETE FROM agentos_tenants`, and delete audit_log rows for the 3 journal tables and agentos_tenants. Seed match-tenants.csv the same way that file does.
- Staff creates 9201 to 9202, 12345 pence, description `=SUM(A1) moved`, accountType ` Rent `. This gives 201. The entries are -12345 and +12345 and sum to 0. accountType is stored as `Rent`. Persons are `9201 Alex Testperson` and `9202 Mary Jo O'Testson`.
- DB zero-sum: inside a manual BEGIN, inserting a transfer with only one entry fails at COMMIT (error mentions "summing to 0").
- 9201 to 9201 gives 400 with no rows. 9201 to 9299 gives 400 `No agentOS tenant has TID 9299`. amountPence 0, -5 or 1.5 gives 400. A blank description, or nominalCode over 50 characters, gives 400.
- Roles: no cookie gives 401 on GET and POST. Readonly gets 200 on GET /journal/transfers and 403 on create, export and posted.
- Export: 201 with transfersTotal 1 and amount 12345. The CSV bytes equal `BOM + [header, fromRow, toRow].join('\r\n') + '\r\n'`, built from DB managed_by/residence, with the description cell `"'=SUM(A1) moved | Recon <id>"` and amounts `-123.45` and `123.45`. A second export gives transfersTotal 0 and a header-only CSV. Promise.all on two exports after a new transfer gives {1, 0}.
- Posted: on a not_exported transfer, 409. On an exported one, 200 and the DB has posted_at and posted_by set. Again, 409. Unknown uuid or `nope`, 404.
- Audit: audit_log has INSERT rows for agentos_journal_transfers, agentos_journal_entries (2) and agentos_journal_exports, and an UPDATE on transfers.

## E2E `e2e/agentos-journal.spec.ts`
Copy runTs and signIn from e2e/agentos.spec.ts:21-50. Users: `e2e-aoj-admin` and `e2e-aoj-readonly`. beforeAll creates the 2 users and runs `server/test/fixtures/agentos-reassign-seed.ts`. The admin goes to /agentos and picks tenants with `getByRole('combobox',{name:'From tenant'})` then `getByRole('option',{name:/^9201 /})`, and To = 9202. Enter amount 12.34 and Description `J-${RUN}`, then Create. Expect a row with `J-${RUN}` and "Not exported". Export, then `waitForEvent('download')` gives `/^agentos-journal-transfer-/`. The row shows Exported. Mark posted makes it show Posted. Readonly sees the row but no "Create transfer", Export or "Mark posted".

## Edge cases
Same TID (400, plus the DB CHECK). Unknown TID (400, never a partial insert). Free-text fields are trimmed and length-capped, not enums. A tenant deleted later sets the entry tenant_id null, but the snapshot keeps the CSV intact. Concurrent exports are serialised by the advisory lock plus FOR UPDATE. Transfers are not tied to an intake batch.

## Risks, scope problems, rollback
SCOPE 1: the e2e reuses `server/test/fixtures/agentos-reassign-seed.ts` (outside scope) read-only, with no edit. SCOPE 2: the same Scope/Exclusions conflict as 502-505 may list routes.ts, web/** and server/test/**, so the coordinator must confirm. Risk: int test files that share the DB in parallel. The journal tables are only touched here. Rollback: revert, then `DROP TABLE agentos_journal_entries, agentos_journal_transfers, agentos_journal_exports; DROP FUNCTION agentos_journal_zero_sum();`.

## Out of scope
Real Nominal Code and Account Type lists, Account Balance values, more than 2 entries or split transfers, edit, delete, un-export and un-post, and linking a transfer to an intake line.

## Verify
`npm run test:int -- agentos-journal` exits 0 with every case above green. Then `npm run test:e2e -- agentos` (both specs), lint, typecheck, test:unit, db:test and full test:int all exit 0.
