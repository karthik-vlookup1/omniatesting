# APPLY: agentOS accounting UI (recon-603)

Proposed by: planner, 2026-10-07. This is the web half of recon-601/602, split so each feature is one coder pass. It needs human approval
because `.claude/state/feature_list.json` is protected. Plan: `plans/recon-603.md`.

How to apply:
1. Append the object below to `features` in `.claude/state/feature_list.json`, after recon-602.
2. Create the contract file below in `.claude/state/contracts/`.
3. Run `node .claude/bin/hx.cjs feature list`.

## JSON entry

```json
{
  "id": "recon-603", "priority": 1103, "area": "phase-6-letmc-parity",
  "title": "agentOS accounting UI: Take a Payment section (tenant, Payment From, Omnia ledger balance, Will deposit to, Type, Amount, Description, optional card auth code; export + mark posted) and multi-row Journal Transfer grid (Person, Branch, Property, Account Type, Account Balance, Amount; running total must be £0.00)",
  "user_visible_behavior": "On /agentos a writer can take a Card payment for a tenant and see the balance change, export and mark payments posted, and post a journal with several rows that must total £0.00. Readonly users see the lists but no forms.",
  "scope": ["web/src/features/agentos/**", "e2e/agentos-payment.spec.ts", "e2e/agentos-journal.spec.ts", "server/test/fixtures/agentos-payment-seed.ts", "plans/**"],
  "verification": [{"level": "unit", "cmd": "npm run test:web -- agentos"}, {"level": "e2e", "cmd": "npm run test:e2e -- agentos-payment.spec"}, {"level": "e2e", "cmd": "npm run test:e2e -- agentos-journal.spec"}],
  "status": "not_started", "evidence": [], "notes": "HARD (5+ files)", "dependsOn": ["recon-601", "recon-602"]
}
```

## Contract file

### .claude/state/contracts/feature-recon-603.md
```
# Sprint Contract: <title of recon-603 above>

## Scope

<one "- glob" line per scope entry of recon-603>

## Verification Standards

- [web] `npm run test:web -- agentos`; [e2e] `npm run test:e2e -- agentos-payment.spec`, `npm run test:e2e -- agentos-journal.spec`; lint, typecheck
- e2e: a Card payment of 12.34 raises the shown balance by 12.34. The export CSV has a header plus 1 row, and mark posted works once.
  A 3-row journal posts only when the total is £0.00. Readonly users see no forms.
- Amounts handled as integer pence. One clientRequestId per open form (double submit = one payment).
- Synthetic data only.

## Exclusions

Everything outside scope, in particular server/src/**, db/migrations/**, package.json, playwright.config.*, web/vite.config.ts.
```
