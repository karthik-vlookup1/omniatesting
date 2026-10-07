# Sprint Contract: agentOS accounting UI: Take a Payment section (tenant, Payment From, Omnia ledger balance, Will deposit to, Type, Amount, Description, optional card auth code; export + mark posted) and multi-row Journal Transfer grid (Person, Branch, Property, Account Type, Account Balance, Amount; running total must be £0.00)

## Scope

- web/src/features/agentos/**
- e2e/agentos-payment.spec.ts
- e2e/agentos-journal.spec.ts
- server/test/fixtures/agentos-payment-seed.ts
- plans/**

## Verification Standards

- [web] `npm run test:web -- agentos`; [e2e] `npm run test:e2e -- agentos-payment.spec`, `npm run test:e2e -- agentos-journal.spec`; lint, typecheck
- e2e: a Card payment of 12.34 raises the shown balance by 12.34. The export CSV has a header plus 1 row, and mark posted works once.
  A 3-row journal posts only when the total is £0.00. Readonly users see no forms.
- Amounts handled as integer pence. One clientRequestId per open form (double submit = one payment).
- Synthetic data only.

## Exclusions

Everything outside scope, in particular server/src/**, db/migrations/**, package.json, playwright.config.*, web/vite.config.ts.
