# Proposed change: `.claude/hx.config.json`

**Apply:** copy `hx.config.json` from this folder over `.claude/hx.config.json`, then run hx
`doctor`. Its "hx.config.json validates" line must say PASS.

## What changes, and why

Existing keys are unchanged. This adds:

| Key | Value | Why |
|---|---|---|
| `handsOff` | `docs/reference/**`, `db/migrations/001_*`, `db/migrations/002_*` | BUILD_BRIEF §4. Reference material and the two applied, tested migrations are never edited; new schema changes go in `003_*.sql` onward. |
| `protectedPaths` | `fixtures/private/**` | BUILD_BRIEF §4. Somewhere to keep any real bank sample out of agent reach. |
| `allowEdit` | `.env.example` | **Not in the brief; needed to resolve a conflict.** hx protects `.env*` by default, but recon-001's scope includes `.env.example` (placeholders only, as §8.7 requires). Without this, recon-001 cannot create it. Real `.env` files stay protected. |
| `architecture.layers` | lib → config → db → domain → services → jobs → api | BUILD_BRIEF §4 layer order. hx's layer rule is a strict order, so `jobs` and `api` (peers in the brief) can't share a rank. `jobs` comes first: the rule then flags a job importing an API route, which would be the real mistake. The reverse (an endpoint that triggers a job, e.g. the LetMC import) stays allowed. |
| `commands` | install / start / check / verify | Gives hx a documented startup path. Without it the Stop hook reports "Standard startup path: FAIL" at the end of every session. `check` is cheap (lint + typecheck); `verify` adds `db:test`. |
| `logging.allowedFiles` | `server/src/lib/logger.ts` | The pino logger module, so hx's no-console-outside-logger rule doesn't flag it. |
