# CLAUDE.md — project-local agent kit

This project uses the portable `hx` agent kit. Everything it needs lives in `.claude/` —
no global config, no machine-specific setup. `hx` is vendored at `.claude/bin/hx.cjs`; if the
global `hx` command also exists on this machine, either works, but prefer the vendored one so
this kit behaves identically on any machine:

```
node .claude/bin/hx.cjs <command>
```

## Session Start

The SessionStart hook already ran `start` and listed open/triaged issues above (capped to the 10
most severe of each — `issue list --status <s>` shows the rest) — **do not re-run those three
commands**; that would print the identical information twice into this session. Work the
highest-priority item from whichever list is more urgent — a `critical`/`high` severity issue
usually outranks a routine feature. Only run `issue list --status <other>` for a status the hook
didn't already show you (e.g. `blocked`, `resolved`).

## Feature Work

Same as the standard harness: `feature start <id>` (WIP=1) -> implement -> `verify <id>` (only
this can mark it `passing`) -> `drift` before you finish, to check you stayed in scope.

## Issue Flow (Create -> Flow -> Solve)

1. **Create.** A bug report, a failing test, or something you noticed:
   `issue create "<title>" --scope <globs> --verification "<cmd>"`
   Or let it find things itself: `issue detect` scans rule violations, critical cleanup
   findings, and TODO markers, and drafts one issue per new one (deduped — safe to run often).

2. **Flow (route).** `issue triage <id>` assigns a skill and agent chain automatically (see
   the routing table in `.claude/skills/issue-solve/SKILL.md`), or pass `--skill <name>` to
   override it. Use `issue route <id>` to preview the route without changing anything.

3. **Solve.** Follow the triaged skill's own instructions (`.claude/skills/<skill>/SKILL.md`).
   In general: `issue start <id>` -> implement the fix in-scope -> `issue verify <id>` (only a
   real passing run advances it to `resolved-pending-review`; you cannot self-declare it done).

4. **Review and close.** This kit starts in `autonomy: "review"` mode
   (`.claude/hx.config.json`) — an issue at `resolved-pending-review` needs a human to run
   `issue close <id> --human` before it's done. **Do not close an issue yourself.** This is
   enforced, not requested: `issue close` refuses without `--human`, and refuses *with* `--human`
   when it detects it is running inside an agent session. Report that the issue is ready and let
   the user run the command in their own terminal. If the project should let you close your own
   work, the user changes `autonomy` to `"commit"` or `"full"` — a recorded decision, not a flag.
   If your fix doesn't hold up, say so — use `issue reject <id> --reason "..."` yourself only when
   you are the one reviewing someone else's fix, never on your own work.

   You also get **three attempts** per issue (`maxAttempts` in `.claude/hx.config.json`).
   `issue start` refuses the fourth. When you hit the cap, stop and report the blocker: what you
   tried, what the verification command actually printed, and what you think is in the way.

## Sub-Agents

`.claude/agents/` — use these for issue work, not the main conversation thread, so a review
never shares context with the fix it's reviewing:
- `triager.md` — reproduces and scopes an issue; never edits code
- `test-writer.md` — adds a failing regression test before a fix
- `fixer.md` — implements a fix, strictly inside the issue's declared `scope`
- `verifier.md` — fresh-context review; read/search/run tools only, cannot edit files

## Session End

Nothing to run by hand: the SessionEnd hook writes `.claude/state/progress.md` and `handoff.md`
from the feature list, git state, and the event log automatically when the session ends, and
PreCompact refreshes them before context is squeezed. If you want a fresh handoff mid-session,
`node .claude/bin/hx.cjs handoff` does the same thing on demand.

## Rules

- One active feature and, separately, one active issue at a time — don't juggle several
  (source: `feature start`/`issue start` enforce WIP=1, refuse a second).
- Nothing is "done" without a real command exiting 0. Not your own judgment, not "looks right"
  (source: `verify`/`issue verify` are the only commands that can mark something passing).
- Stay inside declared `scope`. If you need to touch something outside it, stop and say why
  before doing it — don't just widen scope silently (source: `drift` and the PostToolUse hook
  both check the real diff against declared `scope`, not what you report).
- This file, its `.claude/` siblings, and the state they read/write are the source of truth.
  Chat history is not — if the session restarts, `.claude/state/` is what's left (source: SessionEnd
  regenerates `progress.md`/`handoff.md` from `.claude/state/` and git, never from chat).
- The coordinator owns `hx`: implementation sub-agents never run `hx`, never edit
  `feature_list.json`, never commit or deploy (source: sops/multi-agent-build.md; `hx` has no
  mechanical check for this).
- Attest what was observed, with numbers, not the plan restated (source: `hx verify --attest`
  warns under 40 characters; `attestMinChars` refuses).

## Autonomous loop

@../AUTONOMOUS_LOOP.md
