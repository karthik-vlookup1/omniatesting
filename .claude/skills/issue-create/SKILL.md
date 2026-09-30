---
name: issue-create
description: Draft a structured local issue from a bug report, a failing command, or something noticed while working. Use whenever the user reports a bug, pastes an error, or you find something wrong that isn't the current active feature/issue.
---

# Issue Create

Don't fix it inline as a side effect of unrelated work — that's how scope drift happens. File it:

```
node .claude/bin/hx.cjs issue create "<short title>" \
  --scope "<glob>" [--scope "<glob2>" ...] \
  --verification "<a command whose exit code proves it's fixed>" \
  --severity critical|high|medium|low
```

Then edit the body Repro/Expected/Actual/Log sections in the created `.claude/issues/ISSUE-NNNN.md`
with what you actually observed — the more concrete, the easier triage is later. If you can't yet
name a verification command, leave `--verification` off; triage can add it once someone's
reproduced it.

Do not start fixing it now unless the user asked you to fix this specific thing right now — in
that case, skip straight to issue-solve instead of filing and waiting.
