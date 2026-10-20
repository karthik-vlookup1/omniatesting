# APPLY: VECO push on Vercel (recon-605)

Proposed by: planner, 2026-10-20. Needs human approval because `.claude/state/feature_list.json` is protected.
No other protected file is changed. Plan: `plans/recon-605.md`. Depends on recon-604. Migration 021 on the cloud DB is out of scope.

How to apply:
1. Append the object below to `features` in `.claude/state/feature_list.json`, after recon-604.
2. Create the contract file below in `.claude/state/contracts/`.
3. Run `node .claude/bin/hx.cjs feature list`.

## JSON entry

```json
{
  "id": "recon-605", "priority": 1105, "area": "phase-6-letmc-parity",
  "title": "VECO push on Vercel: one shared helper (services/veco-push/wiring.ts) builds the push gateway for both app.ts main() and the Vercel function server/api/index.ts; VECO_RW_MCP_URL set -> mcp, unset or invalid -> off; URL never logged or returned; no local behaviour change",
  "user_visible_behavior": "On the Vercel deployment, the Vico export page's Push to VECO is available when VECO_RW_MCP_URL is set, and says 'not configured' when it is unset or the VECO push settings are invalid. Locally nothing changes.",
  "scope": ["server/src/services/veco-push/wiring.ts", "server/src/api/app.ts", "server/api/index.ts", "server/test/unit/veco-push*.test.ts", "plans/**"],
  "verification": [{"level": "unit", "cmd": "npm run test:unit -- veco-push"}, {"level": "integration", "cmd": "npm run test:int -- veco-push"}],
  "status": "not_started", "evidence": [], "notes": "HARD", "dependsOn": ["recon-604"]
}
```

## Contract file

### .claude/state/contracts/feature-recon-605.md
```
# Sprint Contract: VECO push on Vercel: one shared helper (services/veco-push/wiring.ts) builds the push gateway for both app.ts main() and the Vercel function server/api/index.ts; VECO_RW_MCP_URL set -> mcp, unset or invalid -> off; URL never logged or returned; no local behaviour change

## Scope

- server/src/services/veco-push/wiring.ts
- server/src/api/app.ts
- server/api/index.ts
- server/test/unit/veco-push*.test.ts
- plans/**

## Verification Standards

- [unit] `npm run test:unit -- veco-push`; [integration] `npm run test:int -- veco-push`; plus lint and typecheck
- createVecoPushGateway: off -> null; fake -> gateway; mcp -> gateway built with no fetch call (lazy, safe for serverless).
- loadVecoPushWiring, production: URL set -> mode mcp, configured; no URL -> off; VECO_PUSH_MODE=fake -> throws with
  onInvalid 'throw', and with 'off' it is off and logs the reason once.
- The VECO_RW_MCP_URL value (its key) appears in no log call and no thrown message.
- app.ts main() keeps the same 'veco push (test database)' log line and still fails at startup on a bad config.
  server/api/index.ts uses onInvalid 'off'.
- No network calls in tests. Synthetic data only.

## Exclusions

package.json, package-lock.json, docker-compose.yml, .github/**, server/package.json, web/package.json,
*/tsconfig*.json, eslint.config.*, vitest.config.*, playwright.config.*, server/vercel.json, server/scripts/vercel-build.mjs,
db/migrations/**, server/src/db/**, server/src/config/**, server/src/lib/**, server/src/jobs/**,
server/src/services/veco-push/{config,gateway,fake-veco-sql,demo-data,veco-push.service,sql-batches}.ts,
server/src/api/veco-push/**, server/test/int/**, web/**, .env.example.
```

## Notes (not work)
1. Migration 021 is not applied to the cloud DB (vercel-build.mjs skips migrations when VERCEL_ENV !== 'production').
   The /api/veco-push routes that read its tables will fail on Vercel until the user decides the database setup.
2. server/vercel.json has no maxDuration. The first real push on Vercel should be watched against the function time limit.
