# recon-509 plan: read-only agentOS v4 sync into agentos_tenants
Goal: pull live tenants (maintenance), tenancies (reporting) and lead flags (deposits) from agentOS v4 into `agentos_tenants` (source='api'), so the matcher (503/507) reads real rows instead of the seed. GET only; never writes to agentOS. Tests use synthetic fixture JSON with no network access.

## Files
New: db/migrations/016_agentos_tenants_api_sync.sql; server/src/domain/agentos/sync.ts; server/src/services/agentos/api-client.ts; server/src/services/agentos/sync.service.ts; scripts/agentos-sync.ts (root scripts/ is in server tsconfig include, so it gets typechecked); server/test/unit/agentos-sync.test.ts; server/test/int/agentos-sync.test.ts; server/test/fixtures/agentos/api/{tenants,tenancies,deposits}.json.
Modify: server/src/domain/agentos/types.ts (add types); server/src/services/agentos/seed.ts (one line); docs/agentos/field-spec.md (append section 11). Protected (APPLY only): package.json script `"agentos:sync": "tsx scripts/agentos-sync.ts"`.

## Steps
1. **016 migration** (BEGIN/COMMIT). Use these exact default constraint names and no IF EXISTS, so a wrong name fails loudly:
   `ALTER TABLE agentos_tenants DROP CONSTRAINT agentos_tenants_tid_key, DROP CONSTRAINT agentos_tenants_tid_check, DROP CONSTRAINT agentos_tenants_forename_check, ALTER COLUMN tid DROP NOT NULL, ALTER COLUMN agentos_ref DROP NOT NULL, ALTER COLUMN crm_ref DROP NOT NULL;`
   Add columns: `source text NOT NULL DEFAULT 'seed' CHECK (source IN ('seed','api'))`, `agentos_oid text UNIQUE CHECK (agentos_oid ~* '^[0-9a-f]{4}(-[0-9a-f]{4}){3}$')`, `tenancy_oid text`, `property_oid text`, `global_reference text`, `title text`, `email text`, `phone text`, `is_archived boolean NOT NULL DEFAULT false`, `sync_flags text[] NOT NULL DEFAULT '{}'`, `last_synced_at timestamptz`.
   Add checks: `tid IS NULL OR tid ~ '^\d{4,5}$'`; `source='api' OR (tid IS NOT NULL AND agentos_ref IS NOT NULL AND crm_ref IS NOT NULL AND forename ~ '^\d{4} .+')`; `source='seed' OR agentos_oid IS NOT NULL`.
   Indexes: `CREATE UNIQUE INDEX agentos_tenants_seed_tid_key ON agentos_tenants (tid) WHERE source='seed'`; `CREATE INDEX ON agentos_tenants (tid)`; `CREATE INDEX ON agentos_tenants (tenancy_oid)`.
   New table `agentos_sync_runs (id uuid PK default gen_random_uuid(), started_at timestamptz NOT NULL, finished_at timestamptz NOT NULL, counts jsonb NOT NULL)`. No audit trigger on this table. Reason: dropping the TID UNIQUE lets joint tenants share a TID. The matcher already handles several candidates per TID (match.ts filters `same` and picks by name).
2. **seed.ts**: change `ON CONFLICT (tid) DO UPDATE` to `ON CONFLICT (tid) WHERE source = 'seed' DO UPDATE`. Reason: the conflict now infers the partial index. Seed behaviour is unchanged.
3. **types.ts**: add `ApiTenant {OID, TenancyOID, PropertyID, GlobalReference, Title, Forename, Surname, EmailAddress, MobileNumber, Landline, IsArchived}`, typed `string|null` / `boolean|null`. Add `ApiTenancy {OID, DisplayAddress, Address, TenancyPorpertyOID, TermStartDate, TermEndDate, IsPeriodic, IsProposed, IsSigned, IsTenancyEnded, IsTenancyClosed, IsAbandoned, TenancyIsArchived}`, `ApiDeposit {OID, TenancyDetails:{TenantOID, TenantIsLeadTenant}[]}`, `SyncFlag` (union of the 8 flags in step 4), `SyncTenantRow`, `SyncReport` and `AgentosApiError(status, path)`.
4. **domain/sync.ts** (pure, no IO). `parseTid(forename)` uses `/^T?(\d{4,5})(\s+|$)/` and returns `{tid, firstName, flags}`. `stripTid` trims. `buildRows(tenants, tenancies, deposits, {managedBy, depositTo})` returns `SyncTenantRow[]` with these flags: `no_tid` (no leading number, or empty), `tid_only_forename` (digits only), `tid_5_digit`, `tid_shared_across_tenancies` (same tid on more than one distinct tenancy_oid; set on every such row), `no_reporting_tenancy`, `no_deposit_record`, `lead_inferred`, `gdpr_withheld` (Forename and Surname both null).
   Field rules: `forename` = raw Forename trimmed, or '' if null. `surname` = trimmed, or ''. `residence` = DisplayAddress, else Address1..4 and Postcode joined ', ', else ''. `tenancy_descriptor` = `<status> Tenancy <dd/mm/yyyy start> - <dd/mm/yyyy end | No End Date>`, where status is the first true of IsAbandoned->Abandoned, IsTenancyClosed->Closed, IsTenancyEnded->Ended, IsSigned->Signed, IsProposed->Proposed, else Unknown, plus ' Periodic' if IsPeriodic. With no reporting row it is 'Unknown Tenancy'. `is_head_tenant` = the TenantIsLeadTenant match on TenantOID. If no lead is flagged on that tenancy, the lowest OID (string sort) gets true and `lead_inferred`. `email` = trimmed or null. `phone` = Mobile, else Landline, with spaces removed and `+44` changed to `0`, or null. Reason: a pure function is unit-testable without a DB.
5. **api-client.ts**: `loadAgentosApiConfig(env)` requires AGENTOS_API_KEY and AGENTOS_BASE_URL (must start with `https://`). Defaults: AGENTOS_SHORT_NAME 'isl', AGENTOS_BRANCH_ID '0004-6020-1894-c1a8', AGENTOS_MANAGED_BY 'Investing Solutions'. Optional: AGENTOS_DEPOSIT_TO. Throw ConfigError (from config/env.js) naming the variable, never its value. Do not touch `loadConfig`.
   `createAgentosClient(cfg, deps={fetch: globalThis.fetch, sleep, now: Date.now, pageSize: 1000, minIntervalMs: 1300})` exposes `listTenants()`, `listTenancies()` and `listDeposits()`. These call `/v4/maintenance/{sn}/contacts/tenants/{branch}/{o}/{c}`, `/v4/reporting/{sn}/lettings/tenancies/{o}/{c}` and `/v4/deposits/{sn}/deposits/{branch}/tenancies/{o}/{c}`, each with `?integrator=omnia-recon` and header `X-API-KEY`.
   Paging: offset 0, step pageSize, `while offset < Count`. Stop early on an empty `Data`. Throw if more than 100 pages. Throttle to at least 1300 ms between any two calls, so fewer than 47 per minute. On 429 or 5xx, `sleep(60000)` and retry, with at most 3 attempts. On other non-2xx, throw `AgentosApiError` with no body or key in the message. Use `AbortSignal.timeout(30000)`. Method is always GET.
6. **sync.service.ts**: `syncAgentosTenants(pool, client, {dryRun, replaceSeed, depositTo})`. Fetch all 3 lists before opening a DB transaction. If `!dryRun && !depositTo`, throw 'AGENTOS_DEPOSIT_TO is required'. In a dry run, a missing depositTo is filled with '(unset)'.
   Then BEGIN and count seed rows. If there are seed rows and `!replaceSeed`, throw `AgentosSyncError('seed rows present: rerun with --replace-seed')`. If replaceSeed is set, refuse when any `agentos_intake_lines` or `agentos_journal_entries` row references a seed row. Otherwise `DELETE ... WHERE source='seed'`.
   Upsert per row with `INSERT ... source='api', tenancy_id=(SELECT id FROM tenancies WHERE tid=$tid), last_synced_at=now() ON CONFLICT (agentos_oid) DO UPDATE`. On update: forename/surname use `CASE WHEN EXCLUDED.x='' THEN agentos_tenants.x ELSE EXCLUDED.x END`; title, email, phone, global_reference and residence use `COALESCE(EXCLUDED.x, agentos_tenants.x)`; deposit_to and managed_by are left unchanged. Guard with an `IS DISTINCT FROM` WHERE over all content columns (pattern: seed.ts lines 67-73) and return `(xmax=0) AS inserted`.
   Count created, updated and unchanged. `missingFromApi` = api rows whose agentos_oid is not in this fetch; never delete them. Insert one `agentos_sync_runs` row, then COMMIT, or ROLLBACK when dryRun. Return `SyncReport {dryRun, fetched:{tenants,tenancies,deposits}, created, updated, unchanged, seedDeleted, missingFromApi, flags: Record<SyncFlag,number>}`. Reason: a full dry run gives exact counts and leaves nothing behind.
7. **scripts/agentos-sync.ts**: follow server/scripts/seed-agentos-demo.ts (loadConfig, createPool max 2, finally pool.end, exitCode 1). Flags: `--dry-run` and `--replace-seed`. Unknown flags exit 1 with usage. Print counts and flag counts only, with no names, emails or OIDs (GDPR). Start with `DRY RUN (rolled back)` when dry.
8. **Fixtures** (synthetic, TIDs 97xx, OIDs `aaaa-0000-0000-00nn`, `@example.test`): 10 tenants and 8 tenancies covering:
   - joint 9701 Ana/Bo on tenancy A (Ana lead)
   - 9701 Gil on tenancy G (shared across tenancies)
   - '9702' digits only
   - '97031 Cy'
   - 'T9705 Fin'
   - 'Dee' (no number)
   - '' (empty)
   - 9704 Eve with no deposit record
   - one tenant whose tenancy is missing from reporting
   - one GDPR-null tenant
9. **Unit test** (`agentos-sync`): parseTid cases (each fixture forename), buildRows flag counts, descriptor text, phone normalising. Client paging with fake fetch, pageSize 3 over 10 records: 4 calls per list, the X-API-KEY header is sent, the URL path has offset/count, and fake `sleep` gets 1300 between calls. A 429 then 200 retries once with sleep 60000. A 401 throws AgentosApiError without the key in the message.
10. **Int test** (`agentos-sync`): `clean()` deletes agentos_sync_runs and agentos_tenants (the 508 order for intake/journal tables).
    a. Dry run: created 10, then `SELECT count(*)` = 0.
    b. Real sync: created 10. 9701 has 3 rows. `no_tid` rows have tid NULL. Two `sync_flags` contain no_tid.
    c. Re-sync of the same data: created 0, updated 0, unchanged 10.
    d. Fixture variant with Ana's email/Forename nulled: her stored email and forename are unchanged.
    e. Seed via `seedAgentosTenants`, then sync without replaceSeed throws. With replaceSeed: seedDeleted 12.
    f. `runMatchForBatch`-style check: `decideMatch` over DB candidates for TID 9701 + 'Bo Testa' gives matched.

## Edge cases
- 5-digit TIDs are stored, but intake (recon-507) accepts only 4 digits, so they stay unmatched (open decision).
- The 41 tenancies without a deposit record get `no_deposit_record` and an inferred lead.
- Count changes mid-run: the loop uses the latest Count and stops on an empty page.

## Risks and rollback
Dropping tid UNIQUE could affect journal.service (`tid = ANY`). Joint rows return several rows there, so the coder must check that journal tests stay green and STOP if they do not. Rollback: revert the code. The 016 down migration is hand-written (drop the new columns and table, restore the constraints). It is only possible while there are no api rows.

## Out of scope
Writing to agentOS, deleting rows missing from the API, tenancies/tenancy_tenants/rent sync, DOB concierge calls, widening intake to 5 digits, UI, a scheduler.

## Verify
`npm run test:unit -- agentos-sync` and `npm run test:int -- agentos-sync`. Then `npm run test:int -- agentos` (seed, match, pipeline, journal regressions), `npm run db:test`, `npm run lint` and `npm run typecheck`. Passing means all exit 0 with the counts above. A live `--dry-run` is a human step after APPLY.

## Open decisions (human)
1. The AGENTOS_DEPOSIT_TO value for API rows. It must equal the bank file's "Will deposit to" text.
2. Approve the package.json `agentos:sync` script (protected file).
3. Policy when replacing seed rows: delete them, refusing if any are referenced (as planned).
4. Do joint tenants share a TID? The design works either way. Shared TIDs across tenancies are flagged.
5. Whether to widen intake to 5-digit TIDs (separate feature).
6. GDPR sign-off before the first non-dry run stores real personal data.
7. The flag-to-status wording in the descriptor (informational only).
