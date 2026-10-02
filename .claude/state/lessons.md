# Lessons

A running log of reasons things didn't work out — why a feature got blocked, why a fix was
rejected, why an issue was marked won't-fix. Regenerated automatically (`hx feature block`,
`hx issue reject`, `hx issue wontfix`, or `hx lesson add`) — read this before repeating the same
dead end a future session might otherwise walk into again.

## 2026-10-01: recon-002 verify blocked: Docker engine not running

- Source: manual (manual)
- Session 2026-10-01: npm run db:test exit 1 ('could not start the compose database'). Docker Desktop was stopped; after launching it the engine answered HTTP 500 on /_ping and docker info hung for over 3 minutes. No local psql/Postgres exists, so every Phase 0 verification (db:test, test:int) needs a healthy Docker engine before starting.

## 2026-10-02: Native Postgres on 5432 shadows the compose DB

- Source: manual (manual)
- A Windows service postgresql-x64-18 listens on 0.0.0.0:5432, so localhost:5432 reaches it and db:test fails with password auth for user omnia. Run compose with OMNIA_DB_PORT=5433 and DBTEST_DATABASE_URL / TEST_DATABASE_URL pointing at 5433, or stop the service.

## 2026-10-02: spawnSync with shell:true splits args on Windows

- Source: manual (recon-004)
- e2e seeding ran npm with shell:true; '--name E2E Admin' split into two args and create-user rejected 'Admin'. Spawn process.execPath with ['--import','tsx', script, ...args] and no shell.

## 2026-10-02: Mantine PasswordInput: getByLabel('Password') is ambiguous

- Source: manual (recon-004)
- The visibility toggle is aria-labelled 'Toggle password visibility' and the required label renders 'Password *', so getByLabel (exact or not) fails. Use getByRole('textbox', { name: 'Password' }).

## 2026-10-02: Kill leftover e2e servers before rerunning Playwright

- Source: manual (recon-004)
- An interrupted run left API on 3001 and vite on 5173; next run hung ~8 min. Stop listeners on 3001/5173 first; a clean auth e2e run takes ~15s.

## 2026-10-02: npm run db:test runs docker compose up for db; export OMNIA_DB_PORT=5433 first

- Source: manual (recon-004)
- docker-compose.yml defaults OMNIA_DB_PORT to 5432, so db:test without it recreates omnia-recon-db on 5432 (the Windows Postgres port) and moves it off 5433.

## 2026-10-02: Test requireWriter/requireRole with a minimal express app in server/test/int

- Source: manual (recon-004)
- No write routes exist yet for non-admins; a probe app wiring authenticate+csrfGuard+requireWriter plus a req.db.tx current_setting probe covers readonly-cannot-write and SET LOCAL isolation under concurrency.

## 2026-10-02: Veco MCP returns unquoted CSV; use FOR JSON PATH

- Source: manual (recon-102)
- execute_sql returns text CSV with no quoting (commas/newlines in values break rows, NULL prints as None). Wrap queries in FOR JSON PATH, INCLUDE_NULL_VALUES, drop the JSON_F52E... header line and join the remaining lines with '' — 3000-row probe round-tripped exactly. Transport is MCP streamable HTTP: initialize -> mcp-session-id header -> notifications/initialized -> tools/call; responses are SSE 'data:' lines.

## 2026-10-02: Live Veco dry run 2026-10-02: 1097 tenancies, 0 rejected, 11 invalid NI

- Source: manual (recon-102)
- Real feed via MCP in 13s: 10 branches, 369 buildings, 1097 rooms/tenants; IRG 534 / RG 563 (55 defaulted, no owner record); NI 3 missing + 11 invalid (9 malformed typos, 2 non-HMRC prefixes) - those tenants sync without NI and match by TID only. Fix NI typos in Veco, not here.

## 2026-10-02: Reactivated tenancy: rent schedule overlap

- Source: manual (recon-102)
- An ended tenancy keeps a closed schedule; inserting a new one from start_date violates the daterange EXCLUDE. Reopen the last schedule if rent is unchanged, else start the day after it closed.

## 2026-10-02: Scope globs {tenant,tenancy}*/** need a matching FOLDER

- Source: manual (recon-102)
- server/src/services/tenancy.service.ts and api/tenancies/ were flagged as drift: the glob only matches files inside a dir named tenant*/tenancy*. Put feature code under services/<name>/ and api/<name>/ with the singular name the scope uses.

## 2026-10-02: Sync ending must exclude rejected feed rows

- Source: manual (recon-102)
- Ending 'active tenancies not in the feed' by valid TIDs only means a row that fails validation (e.g. a new frequency label) ends a live tenancy; the end set and the >20% guard must count every TID Veco returned, valid or rejected.

## 2026-10-02: csv-parse record index is not the file line

- Source: manual (recon-201)
- skip_empty_lines and quoted newlines shift records; use csv-parse info:true (info.lines) for row error line numbers

## 2026-10-02: Strip-all-commas money parsing turns 1,23 into 123.00

- Source: manual (recon-201)
- validate thousands grouping (^\d{1,3}(,\d{3})*) before removing commas; reject anything else

## 2026-10-02: Heredocs and Edit turn \uFEFF into a literal BOM in test files

- Source: manual (recon-201)
- eslint no-irregular-whitespace fails; write the escape via node String.fromCharCode(92)

## 2026-10-02: Two identical uploads race on file_sha256 UNIQUE

- Source: manual (recon-201)
- The SHA pre-check runs before insert, so a concurrent duplicate hit 23505 -> 500. Map 23505 on import_batches_file_sha256_key to 409.

## 2026-10-02: Synthetic names 'Test TenantN' make fuzzy tier suggest many tenancies

- Source: manual (recon-202)
- word_similarity >= 0.5 for every Test Tenant1..20, all capped 0.6 - tests must not assume a single fuzzy suggestion; real data is more distinctive

## 2026-10-02: Re-running suggest_matches on a line reuses UNIQUE(txn,tenancy,method) + ON CONFLICT DO NOTHING

- Source: manual (recon-202)
- Old rejected suggestions block re-insert, so a re-included line falls through to yet_to_take; reopen/delete exclusion-rejected suggestions before auto_match

## 2026-10-02: Table rows need a focusable control

- Source: manual (recon-203)
- Table.Tr onClick alone is mouse-only; put a button with an aria-label in the row so keyboard and screen-reader users can open it
