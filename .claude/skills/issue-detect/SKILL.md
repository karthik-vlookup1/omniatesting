---
name: issue-detect
description: Scan the project for rule violations, critical cleanup findings, and TODO/FIXME markers, and file an issue for each new one. Use at session start, or whenever asked to "check for problems" / "find bugs" without a specific one named.
---

# Issue Detect

```
node .claude/bin/hx.cjs issue detect
```

Reads the same signals `hx doctor` and `hx exit` already collect — rule violations, critical
cleanup findings, TODO/FIXME/HACK/XXX markers — and drafts one issue per new finding. Each
finding is deduped by a content signature, so running this repeatedly (e.g. at every session
start) never files the same thing twice; only genuinely new findings create new issues.

This only *files* issues — it never starts fixing anything. Report what was created, then let
the user or the normal issue-solve flow decide what to work next.

If you want an on-demand check without touching the issue list, run the underlying checks
directly instead: `hx doctor`, `hx exit`, `hx rule check`.
