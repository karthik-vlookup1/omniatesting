---
name: run-tests
description: Detect and run this project's test command. Use before verifying a feature or issue, or whenever asked to run the tests.
---

# Run Tests

Detect the test command from what's actually in the repo, in this order, and use whichever
matches first:
1. `package.json` → `scripts.test` (run with the matching package manager: `npm test` /
   `pnpm test` / `yarn test`)
2. `pyproject.toml` or `pytest.ini` → `pytest` (or `uv run pytest` if `uv.lock` exists)
3. `Cargo.toml` → `cargo test`
4. `go.mod` → `go test ./...`

Once you know the command, that's also what belongs in a feature's or issue's `verification`
field — don't invent a different check for verification than the one you actually ran here.

If the project defines a scoped test command (e.g. `npm test -- src/leads`), prefer that for a
single feature/issue instead of the full suite — faster feedback, same exit-code discipline.
