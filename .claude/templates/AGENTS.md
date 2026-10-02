# AGENTS.md

This repository is set up for long-running coding-agent work using the `hx` harness. The goal
is not to maximize raw code output. The goal is to leave the repo in a state where the next
session can continue without guessing.

## Working Rules

- Work on one feature at a time (source: `hx feature start <id>` enforces this — WIP=1).
- Do not mark a feature complete just because code was added. Only `hx verify` can mark a
  feature `passing`, and only after its verification commands actually pass (source: `hx verify`
  is the only command that writes passing evidence to `feature_list.json`).
- Keep changes within the selected feature's declared `scope` (check with `hx drift`) unless a
  blocker forces a narrow supporting fix (source: `hx drift` derives scope violations from the
  real git diff, not from what you report).
- Do not silently change verification commands during implementation — if a command is wrong,
  fix it explicitly and note why in `notes` (source: an undocumented command change is exactly
  what makes a later "why did this used to pass" investigation unrecoverable).
- Prefer durable repo artifacts (`feature_list.json`, `claude-progress.md`) over chat summaries
  (source: chat history does not survive a session restart; `.claude/state`/`feature_list.json`
  does).
- The coordinator owns `hx`: implementation sub-agents never run `hx`, never edit
  `feature_list.json`, never commit or deploy (source: sops/multi-agent-build.md; `hx` has no
  mechanical check for this).
- Attest what was observed, with numbers, not the plan restated (source: `hx verify --attest`
  warns under 40 characters; `attestMinChars` refuses).

## Startup Workflow

Before writing code, run `hx start`. It will:

1. Confirm the working directory.
2. Read `claude-progress.md` for the latest verified state and next step.
3. Read `feature_list.json` and select the highest-priority unfinished feature.
4. Show recent commits.
5. Run the init check and baseline verification.
6. Print the next feature to work on and what counts as passing.

If baseline verification is already failing, fix that first. Do not stack new feature work on
top of a broken starting state.

## Required Artifacts

- `feature_list.json`: source of truth for feature state (`hx feature`, `hx verify`)
- `claude-progress.md`: session log and current verified status (`hx handoff`)
- `init.sh` / `init.ps1`: standard startup and verification path (`hx start` runs this logic
  directly; the scripts are kept for manual/CI use)
- `session-handoff.md`: compact handoff for larger sessions (`hx handoff`)

## Definition Of Done

A feature is done only when all of the following are true:

- the target behavior is implemented
- `hx verify <id>` actually ran and every verification level passed
- evidence is recorded in `feature_list.json` (automatic — `hx verify` writes it)
- the repository remains restartable from `hx start`

## End Of Session

Run `hx exit` before ending a session. It checks:

1. the standard verification path still runs
2. the feature list reflects what's actually passing
3. no critical stale-artifact findings remain
4. progress is recorded

Then run `hx handoff` to write `claude-progress.md` and `session-handoff.md`, and commit.
