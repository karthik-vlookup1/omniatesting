# The `.claude/` agent kit

Portable, project-local. Drop this folder into any repository and Claude Code picks it up
automatically — no global config, no `npm link`, nothing installed outside this folder.

## What's here

| Path | Purpose |
|---|---|
| `CLAUDE.md` | Router: the operating loop, when to use the issue flow, when to use each skill/agent |
| `settings.json` | Hooks (SessionStart/PostToolUse/Stop) wired to `bin/hx.cjs`, plus a read-only command allowlist |
| `hx.config.json` | State location, issues location, autonomy level, retry cap, optional custom routes |
| `bin/hx.cjs` | Vendored `hx` — a single bundled file, Node is the only requirement |
| `templates/` | Templates `bin/hx.cjs` reads from (feature list, progress, goal/maker/checker prompts, etc.) |
| `agents/` | triager, test-writer, fixer, verifier — sub-agents for issue work |
| `skills/` | issue-create, issue-solve, issue-detect, run-tests, format-lint, api-smoke, harness |
| `state/` | `feature_list.json`, `progress.md`, `handoff.md`, `events.jsonl` — created on first use |
| `issues/` | `ISSUE-0001.md` etc. — one file per issue, git-tracked |

## What runs on its own

This is the part that matters. A command an agent has to remember to run is a suggestion; a hook
is a mechanism. Everything below fires without anyone asking, and none of it can take the session
down — a hook that fails reports the reason and exits cleanly.

| When | What happens | Why |
|---|---|---|
| Session starts | Prints the startup report, open and triaged issues, plus anything left `in_progress` or awaiting human review | The two mid-flight states are exactly what gets forgotten between sessions |
| After every Edit/Write | Checks whether files outside the active feature's declared scope were touched | Scope drift is invisible until someone diffs; this catches it at the edit |
| Turn ends | Runs the clean-state check and reports it | Catches stale artifacts and unevidenced "passing" features |
| Session ends | Regenerates `state/progress.md` and `state/handoff.md` from the feature list, git and the event log | These exist to survive a session ending, so they must be written *at* the ending, not when someone remembers |
| Before compaction | Refreshes the handoff | The other moment session knowledge evaporates |

Two things are enforced in the binary rather than asked for in prose: an issue can be started at
most `maxAttempts` times (default 3), and `issue close` refuses `--human` when it detects it is
running inside an agent session. Both were previously instructions, which meant they held only
while the agent chose to follow them.

`hx.config.json` controls the strictness:

| Key | Default | Effect |
|---|---|---|
| `stopGate` | `"warn"` | `"block"` stops the turn on a failed clean-state check; `"off"` disables it |
| `maxAttempts` | `3` | Attempts allowed per issue before `issue start` refuses |
| `verifyTimeoutMs` | `600000` | Wall-clock cap on any single verification command |
| `autonomy` | `"review"` | `"commit"`/`"full"` let an agent close its own issues |

`stopGate` defaults to warn deliberately. A blocking gate that fires on something the agent cannot
fix is worse than no gate, because it teaches the reader to dismiss every gate.

## Install

From a machine that has this kit built (`npm run build:kit` in the `hx` source repo produces
`dist-kit/.claude/`):

```
node <path-to-hx-source>/dist/cli.js kit install .
```

Or, once one project already has the kit installed, just copy its `.claude/` folder into a new
project — `bin/hx.cjs` is self-contained.

## First session

Claude Code reads `CLAUDE.md` automatically. It will:
1. Run `start` and `issue list` to see what's outstanding.
2. Work the feature list one item at a time, same as the root-layout harness.
3. File and solve issues through `issue create` → `issue triage` (auto-routes to a skill) →
   `issue start` → fix → `issue verify` (only this can mark it `resolved-pending-review`) →
   a human runs `issue close --human`.

`autonomy` in `hx.config.json` starts at `"review"` — nothing closes without a human. Raise it
to `"commit"` or `"full"` only once you trust the loop on this project.

## Check it's wired correctly

```
node .claude/bin/hx.cjs kit doctor .
```
