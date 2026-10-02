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
