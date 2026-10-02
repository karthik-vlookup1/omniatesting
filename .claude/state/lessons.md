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
