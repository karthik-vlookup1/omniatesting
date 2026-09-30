---
name: harness
description: Command reference for the vendored hx harness — feature list, verification, drift, handoff, rules. Use whenever unsure which hx command applies.
---

# hx Command Reference (this project's vendored copy)

All commands below run as `node .claude/bin/hx.cjs <command>` from the project root. State
lives under `.claude/state/`; issues under `.claude/issues/` — both are git-tracked, both are
configured in `.claude/hx.config.json`.

## Features (one at a time — WIP=1)

- `feature list` — every feature and its status
- `feature start <id>` — locks it as the only active feature; refuses a second one
- `verify <id>` — runs its verification commands for real; only this can mark it `passing`
- `feature block <id> --reason "..."` / `feature reopen <id> --reason "..."` (reopen is
  human-only — an agent should not run this on its own work)
- `drift` — files changed outside the active feature's declared scope

## Issues (Create -> Flow -> Solve)

See the `issue-create` and `issue-solve` skills for the full flow. Quick reference:
`issue create`, `issue list [--status ...]`, `issue show <id>`, `issue route <id>`,
`issue triage <id>`, `issue start <id>`, `issue verify <id>`, `issue reject <id> --reason ...`,
`issue close <id> --human`, `issue detect`.

## Session boundaries

- `start` — the fixed startup report (progress, recent commits, init checks, next feature)
- `exit` — clean-state gate; nonzero exit if something's wrong (stale artifacts, an unevidenced
  `passing` feature, a stale progress log)
- `handoff` — regenerates the progress log and handoff note from actual repo/git/event-log
  state, not from memory

## Rules

- `rule check` — run the built-in executable rules (e.g. no direct filesystem access from
  renderer code) against the repo
- `rule add <id> <description> --from "<where this rule came from>"` — promote a repeated
  review comment or recurring mistake into a rule that gets checked mechanically from now on

## Doctor

`doctor` — repo readiness score, init prerequisite checks, AGENTS.md/CLAUDE.md length lint, and
a lint pass over every verification command (catches things like a `jq` filter with no `-e`,
whose exit code wouldn't actually reflect the check it claims to run).
