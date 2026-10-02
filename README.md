# Omnia Recon — web frontend

The staff-facing web app for Omnia Recon, Omnia Housing's rent reconciliation system. Staff upload
each bank CSV once; the backend matches every line to a tenancy, queues anything uncertain for
review, records receipts and allocates them to rent periods, and produces the bank statement CSV,
the Vico upload and Xero invoices. This app is the screen over that workflow.

The API lives in a separate repository (`Omnia_recon-backend`). This app talks to it only over
HTTP at `/api`. See [`docs/FRONTEND.md`](docs/FRONTEND.md) for the architecture, the API contract
it relies on, and which screens still run on mock data.

## Requirements

- Node.js 22.12+ and npm 10+
- For real sign-in: the backend API running on `http://localhost:3001`
  (`npm run dev:server` in `Omnia_recon-backend`)

## Getting started

```sh
npm ci
npm run dev        # http://localhost:5173 — /api is proxied to http://localhost:3001
```

Set `OMNIA_API_URL` to proxy to a different API, e.g. `OMNIA_API_URL=http://localhost:4000 npm run dev`.

## Scripts

| Script | What it does |
|---|---|
| `npm run dev` | Vite dev server on :5173 with the `/api` proxy |
| `npm run build` | Production build into `web/dist` |
| `npm run preview` | Serve the production build on :4173 (also proxies `/api`) |
| `npm run lint` | ESLint over the repo |
| `npm run typecheck` | `tsc --noEmit` for the web package |
| `npm run test:unit -- <filter>` | Vitest + Testing Library (jsdom) |

## Layout

```
web/src/
  main.tsx            entry: providers + router
  app/                shell: routes, layout, navigation, top-level pages
  components/         shared UI built on Mantine (one design system)
  theme/              Mantine theme tokens
  lib/                API client, formatters, small helpers
  data/<domain>/      the only place that knows where data comes from (real API or typed mock)
  features/<feature>/ screens for one workflow step
  test/               test setup and helpers
docs/FRONTEND.md      architecture and API contract
.claude/              hx harness: feature list, decisions, issues, hooks
```

## Data protection

All mock data is synthetic. NI numbers and payer account numbers are only ever shown masked
(last 3–4 characters) unless the server returns more for an authorised role. Nothing sensitive is
written to the console or to browser storage.
