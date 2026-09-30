---
name: issue-solve
description: Orchestrates solving one issue end to end — triage, route to the right skill/agents, fix, verify, hand off for review. Use when asked to work an issue, or when picking the next item off the issue list.
---

# Issue Solve

One issue at a time — don't start a second while one is `in_progress`.

## 1. Triage (if not already triaged)

```
node .claude/bin/hx.cjs issue route <id>       # preview the routing, no change
node .claude/bin/hx.cjs issue triage <id>       # apply it (or --skill to override)
```

Routing table (see `.claude/agents/*.md` for what each agent does):

| Issue source | Skill | Agent chain |
|---|---|---|
| `test-failure` | run-tests | test-writer -> fixer -> verifier |
| `cleanup` | harness | fixer -> verifier |
| `rule-violation` | harness | fixer -> verifier |
| `todo-marker` | harness | fixer -> verifier |
| `manual` | issue-solve (this skill) | triager -> fixer -> verifier |

## 2. Start and fix

```
node .claude/bin/hx.cjs issue start <id>
```

Dispatch to the routed agent chain (as sub-agent Task calls, not inline in this conversation —
each one should get a fresh context, especially the verifier). A `test-writer` step runs first
when the chain calls for it; `fixer` implements inside `scope`; then:

```
node .claude/bin/hx.cjs issue verify <id>
```

This is the only thing that can move the issue to `resolved-pending-review` — it re-runs the
real verification command and checks the exit code. If it fails, feed the output back to
`fixer` and try again.

The 3-attempt cap (`maxAttempts` in `.claude/hx.config.json`) is **enforced by `issue start`**,
not left to you to count: the fourth start is refused. When you hit it, stop and report the
blocker — what was tried, what the verification command printed, and what is in the way.

## 3. Review

Dispatch `verifier` as a fresh sub-agent once the issue is `resolved-pending-review`. It reports
approve or reject. On reject, it runs `issue reject <id> --reason "..."` itself, which sends the
issue back to `triaged` — go to step 2 again.

## 4. Hand off — do not close it yourself

On approve, **stop and tell the user** the issue is ready, and give them the command to run in
their own terminal:

```
node .claude/bin/hx.cjs issue close <id> --human
```

Do not run it yourself. Under this kit's default `autonomy: "review"` the close is refused twice
over: without `--human`, and *with* `--human` when the command detects it is running inside an
agent session. That is deliberate — `--human` was previously only a flag, so "a human decides"
depended entirely on the agent choosing not to type it. If this project should let you close your
own work, the user sets `autonomy` to `"commit"` or `"full"` in `.claude/hx.config.json`.
