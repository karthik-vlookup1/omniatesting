# Deploying Omnia Recon to Vercel (test environment)

One GitHub repo (`karthik-vlookup1/omniatesting`, branch `final`) feeds two Vercel projects, plus
a Neon Postgres database:

```
Browser ──► omniatesting.vercel.app        project "omniatesting",     root "web"    (Vite)
               │  /api/* rewritten server-side (web/vercel.json)
               ▼
            omniatesting-api.vercel.app    project "omniatesting-api", root "server" (Express as one Function)
               │
               ▼
            Neon Postgres 16
```

The browser only ever talks to `omniatesting.vercel.app`, so the SameSite=Strict session cookie
and the `X-Requested-With` CSRF header work without any CORS setup.

Every push to `final` redeploys both projects.

## What is already in the repo

| File | Purpose |
|---|---|
| `server/api/index.ts` | Builds the Express app and exports it as the Function (no `listen()`, no scheduled jobs) |
| `server/vercel.json` | Sends every path to that Function |
| `web/vercel.json` | Forwards `/api/*` to the backend; everything else falls back to `index.html` |
| `scripts/setup-cloud-db.ps1` | One-time: migrate the cloud database and create an admin user |

## 1. Create the database

**Option A, inside Vercel (recommended).** Vercel dashboard → **Storage** → **Create Database** →
**Neon** → pick a region near `iad1` (Washington, D.C.) → create → **Connect Project** →
`omniatesting-api` (Production; Preview too if you like).

This sets `DATABASE_URL` (pooled) and `DATABASE_URL_UNPOOLED` (direct) on the project.
`server/api/index.ts` uses `DATABASE_URL_UNPOOLED` when it is present, so nothing else to do.

**Option B, a separate Neon account.** Create a free Postgres 16 project at neon.tech and copy the
**direct** connection string (Connection Details → turn **off** "Connection pooling"; the host has
no `-pooler`). Add it to `omniatesting-api` as `DATABASE_URL` (Settings → Environment Variables).

Either way, the app needs the **direct** connection, not the pooled one: it sets `app.hash_key` once
per database connection, and a transaction pooler can hand the next query a connection without it.
Append `?sslmode=require` if the string does not already have it.

## 2. Migrate and create an admin user (once)

In your own PowerShell window, from the repo folder:

```powershell
powershell -ExecutionPolicy Bypass -File scripts\setup-cloud-db.ps1
```

It asks for the **direct** connection string and the three keys (`HASH_KEY`, `ENCRYPTION_KEY`,
`SESSION_SECRET`), which must match the values on the Vercel project, then for the admin email,
name and password. Nothing is saved to disk.

## 3. Backend project `omniatesting-api`

Already created: root directory `server`, framework "Other", Node 22, linked to the repo.
Production environment variables:

| Name | Value |
|---|---|
| `NODE_ENV` | `production` |
| `HASH_KEY` | generated key (keep a copy in your password manager) |
| `ENCRYPTION_KEY` | generated key, 32 bytes base64 |
| `SESSION_SECRET` | generated key |
| `DATABASE_URL` / `DATABASE_URL_UNPOOLED` | from step 1 |

After adding the database, redeploy: Deployments → latest → **Redeploy** (env vars only apply to
new deployments). Then check:

```
https://omniatesting-api.vercel.app/api/health   →   {"status":"ok"}
```

If you ever recreate the project by hand: **Add New → Project → import the repo**, root directory
`server`, framework preset **Other**, leave build settings empty, add the variables above, Deploy.

## 4. Frontend project `omniatesting`

Root directory `web`, preset Vite, no environment variables. It redeploys on every push to
`final`; to pick up a change without a push, Deployments → latest → **Redeploy**.

## 5. Sign in

Open https://omniatesting.vercel.app and sign in with the admin user from step 2.

## 6. Known limits on Vercel

- **Scheduled jobs do not run**: Veco nightly sync, Xero export worker, automatic rent charge
  generation and the hourly expired-session purge. They live in `main()` in `server/src/api/app.ts`,
  which a Function never calls. Run them by hand from a machine with the cloud `DATABASE_URL` if
  a test needs them.
- **Request bodies are capped at about 4.5 MB**, so larger bank CSV / LetMC uploads fail with 413.
- **The first request after a quiet spell can take a few seconds** (cold start plus Neon waking up).
- **Login rate limiting is keyed on the client IP**, which behind the frontend rewrite can be the
  proxy's address, so failed sign-ins from different testers may share one counter.

## 7. If the name `omniatesting-api` is ever taken

Use the production URL Vercel gives the backend project instead, and update the destination in
`web/vercel.json`:

```json
{ "source": "/api/:path*", "destination": "https://<your-backend>.vercel.app/api/:path*" }
```

Commit, push to `final`, and the frontend redeploys with the new target.
