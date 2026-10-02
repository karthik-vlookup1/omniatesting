# Pass Gate Policy

A feature may only move from `passes: false` to `passes: true` when:

- the expected workflow has been exercised
- the evidence of success is recorded
- no blocking error is present in the tested path
- the implementation does not leave the app in a broken or ambiguous state

---

**Enforced by:** `hx verify` (pass gate + evaluator rubric — only hx verify can mark a feature passing).
