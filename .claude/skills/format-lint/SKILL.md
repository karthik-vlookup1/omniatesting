---
name: format-lint
description: Detect and run this project's formatter and linter. Use before hx exit, or whenever asked to clean up formatting/lint issues.
---

# Format & Lint

Detect from what's configured, in this order:
1. `package.json` → `scripts.lint` / `scripts.format` (ESLint, Prettier, Biome — whichever is
   configured)
2. `.ruff.toml` / `pyproject.toml` `[tool.ruff]` → `ruff check` / `ruff format`
3. `rustfmt.toml` or a `[workspace]` in `Cargo.toml` → `cargo fmt --check` / `cargo clippy`

A lint or format failure that recurs across sessions is a candidate for `hx rule add` (see the
`harness` skill) — turn a repeated fix into a mechanical check instead of re-fixing it by hand
every time.
