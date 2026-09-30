---
name: api-smoke
description: Run this project's declared HTTP smoke checks after a change to an API endpoint. Use when a feature or issue touches a route/endpoint/handler.
---

# API Smoke Checks

If `.claude/hx.config.json` has a `smoke` array (add it yourself if this project needs it — it's
not in the config by default), each entry is `{method, path, expectStatus}` against the
project's dev server. Start the server (per the project's own startup command — check
`package.json`'s `scripts.dev` or equivalent), then check each declared endpoint's status code.

If no `smoke` config exists yet and this feature/issue is API work, propose 2-3 entries for the
endpoint you touched and add them to `.claude/hx.config.json` under `smoke` — this makes the
check repeatable for the next session instead of a one-off manual curl.

Treat a smoke failure the same as a failing verification command: it blocks marking the
feature/issue done, it doesn't get silently ignored because "the unit tests passed."
