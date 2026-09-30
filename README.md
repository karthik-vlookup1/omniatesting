# Omnia Recon

Rent reconciliation for Omnia Housing. Staff upload each bank CSV once; the system matches every
line to a tenancy, queues anything uncertain for review, records receipts, allocates them to rent
periods (oldest arrears first, per payer) and produces three outputs from one PostgreSQL database:

- a filled-in bank statement CSV (replaces the "Bank Statement" Google Sheet);
- a Vico upload file;
- Xero draft invoices via the API.

See [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) for layers and data flow, and
[`docs/BUILD_BRIEF.md`](docs/BUILD_BRIEF.md) for the full specification.

## Requirements

- Node.js 22.12+ and npm 10+
- Docker (PostgreSQL 16 runs in `docker compose`)

## Getting started

```sh
docker compose up -d --wait db     # PostgreSQL 16 on localhost:5432
npm ci
cp .env.example .env               # then fill in real keys (see below)
npm run db:migrate                 # applies db/migrations/*.sql in order
npm run user:create -- --email admin@example.com --name "Admin" --role admin
npm run dev:server                 # API on http://localhost:3001
```

### Environment

| Variable | Purpose |
|---|---|
| `DATABASE_URL` | Postgres connection string |
| `HASH_KEY` | HMAC key for NI / bank-account lookup hashes. Must match across every environment that shares a database; changing it orphans existing hashes. At least 32 characters. |
| `ENCRYPTION_KEY` | 32 random bytes, base64. AES-256-GCM key for NI / account ciphertext. |
| `SESSION_SECRET` | At least 32 characters. Signs nothing sensitive today; reserved for cookie signing. |
| `AUTO_MATCH_THRESHOLD` | Confidence at which a single suggestion is auto-confirmed. Default `0.95`. |
| `PORT` | API port. Default `3001`. |
| `LOG_LEVEL` | pino level. Default `info`. |
| `COOKIE_SECURE` | `true` behind HTTPS (default in production). |

Generate keys with `node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"`.
Keys come from the environment only; never commit them.

## Scripts

| Script | What it does |
|---|---|
| `npm run lint` | ESLint over the whole repo |
| `npm run typecheck` | `tsc --noEmit` for server and web |
| `npm run db:migrate` | Apply pending migrations to `DATABASE_URL` |
| `npm run db:test` | Fresh test DB, all migrations, every `db/tests/*.sql`; fails unless each prints its `ALL ... PASSED` line |
| `npm run test:unit -- <filter>` | Vitest unit tests |
| `npm run test:int -- <filter>` | Vitest + supertest against a real test database |
| `npm run test:e2e -- <filter>` | Playwright |
| `npm run user:create -- ...` | Create or reset an app user (prompts for the password) |

## Repository layout

```
db/migrations/      SQL migrations, applied in filename order (never edit an applied one)
db/tests/           SQL scenario tests
server/src/         lib → config → db → domain → services → jobs → api
web/src/            React + Vite + TanStack Query, one folder per feature
scripts/            db:test runner and Vitest global setup
docs/               brief, architecture, reference material
.claude/            hx harness: feature list, issues, agents, hooks
```

## Data protection

All fixtures are synthetic. NI numbers and payer account numbers are stored only as an HMAC hash
(for lookup), AES-256-GCM ciphertext (for authorised display) and their last 3–4 characters.
Logs redact cookies and authorization headers.
