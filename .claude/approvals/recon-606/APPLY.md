# APPLY: VECO push demo seed can target the cloud database (recon-606)

Proposed by: planner, 2026-10-20. This needs human approval because `.claude/state/feature_list.json` is protected.
No other protected file changes. Plan: `plans/recon-606.md`. Depends on recon-605. The user runs the cloud seed and remove in their own terminal; secrets are never given to the agent.

How to apply:
1. Append the object below to `features` in `.claude/state/feature_list.json`, after recon-605.
2. Create the contract file below in `.claude/state/contracts/`.
3. Run `node .claude/bin/hx.cjs feature list`.

## JSON entry

```json
{
  "id": "recon-606", "priority": 1106, "area": "phase-6-letmc-parity",
  "title": "VECO push demo seed can target the cloud database: demo-seed.ts gains --cloud (explicit opt-in; DATABASE_URL_UNPOOLED > NEON_DATABASE_URL_UNPOOLED > DATABASE_URL; URL never printed), --staff <StaffPK>, --receipts \"TID=amount,...\" and a users command; remove deletes only seed-made rows and refuses receipts still pushed to VECO; scripts/cloud-demo-seed.ps1 prompts for secrets in the user's own terminal; defaults unchanged",
  "user_visible_behavior": "In their own PowerShell the user runs scripts\\cloud-demo-seed.ps1 seed and types the Neon direct URL and the 3 keys at masked prompts. Chosen receipts then wait on the cloud Vico export page, and the script prints the counts and the login email it linked to the given VECO StaffPK. 'remove' deletes exactly what seed created. Running locally without flags behaves as before.",
  "scope": ["server/src/services/veco-push/demo-seed.ts", "scripts/cloud-demo-seed.ps1", "server/test/unit/veco-push*.test.ts", "server/test/int/veco-push-demo.test.ts", "plans/**"],
  "verification": [{"level": "unit", "cmd": "npm run test:unit -- veco-push"}, {"level": "integration", "cmd": "npm run test:int -- veco-push"}],
  "status": "not_started", "evidence": [], "notes": "HARD", "dependsOn": ["recon-605"]
}
```

## Contract file

### .claude/state/contracts/feature-recon-606.md
```
# Sprint Contract: VECO push demo seed can target the cloud database: demo-seed.ts gains --cloud (explicit opt-in; DATABASE_URL_UNPOOLED > NEON_DATABASE_URL_UNPOOLED > DATABASE_URL; URL never printed), --staff <StaffPK>, --receipts "TID=amount,..." and a users command; remove deletes only seed-made rows and refuses receipts still pushed to VECO; scripts/cloud-demo-seed.ps1 prompts for secrets in the user's own terminal; defaults unchanged

## Scope

- server/src/services/veco-push/demo-seed.ts
- scripts/cloud-demo-seed.ps1
- server/test/unit/veco-push*.test.ts
- server/test/int/veco-push-demo.test.ts
- plans/**

## Verification Standards

- [unit] `npm run test:unit -- veco-push`; [integration] `npm run test:int -- veco-push`; plus lint and typecheck
- Without --cloud: the localhost:5433 guard and the production refusal behave exactly as before.
- With --cloud: URL order UNPOOLED > NEON_ > plain; refuses local, missing and unreadable URLs; no output or error contains the URL, the host or the password (redact).
- parseArgs/parseReceipts: TID /^T\d{3,6}$/ uppercased; amounts with 2dp, > 0; no duplicates; 1-50 items; --staff a uuid, uppercased.
- seed: 021 preflight; custom amounts; refuses a waiting demo receipt with another amount; the staff link is created/updated/kept, and seed refuses to overwrite a link set in the app; it prints the linked email.
- remove: deletes only DEMO_MARKER / DEMO-VECO rows and the seed-owned staff link; refuses while demo items are pushing/pushed.
- cloud-demo-seed.ps1: masked prompts, process env only, secrets cleared in finally, nothing written to disk, prints only counts and emails.
- Existing 6 demo int tests and DEMO_FAKE_SEED unchanged. No network calls in tests. Synthetic data only.

## Exclusions

package.json, package-lock.json, docker-compose.yml, .github/**, server/package.json, web/package.json,
*/tsconfig*.json, eslint.config.*, vitest.config.*, playwright.config.*, server/vercel.json, server/scripts/**,
scripts/setup-cloud-db.ps1, db/migrations/**, server/src/db/**, server/src/config/**, server/src/lib/**, server/src/jobs/**,
server/src/api/**, server/api/**, server/src/services/veco-push/{config,gateway,fake-veco-sql,demo-data,veco-push.service,sql-batches,wiring}.ts,
web/**, .env*, .env.example.
```

## Notes (not work)
1. The cloud DB must already have migration 021. If it does not, seed and remove stop with a clear preflight message.
2. With --cloud, NODE_ENV=production is allowed, because --cloud is the explicit opt-in and the wrapper sets NODE_ENV=production as setup-cloud-db.ps1 does.
3. The 4 extra default TIDs (T5126, T7074, T7684, T7703) are not in DEMO_FAKE_SEED. They only push against the real VECO test database.
