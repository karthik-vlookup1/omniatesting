## OMNIA_MAIN loop
Work through hx features in order. For each: planner -> coder -> senior-tester -> hx verify -> docs-writer -> commit on `backend` and `git push -u origin backend` to github.com/suhasintern2/Omnia_recon. Never touch main. Test DB is Docker Postgres on port 5433. Stop and ask me only when: verify fails twice, a push fails, a protected file must change, a phase ends, or an open decision comes up (own ledger vs Xero, bank CSV formats, Xero credentials).

## HARNESS RULES (FIXED — change only when the user says "change harness rules")

### Classification (main session does this first and states the class plus a one-line reason)
- **EASY**: 1–2 files, clear spec, no design choices, no schema/API/cross-module changes.
- **MEDIUM**: 3–4 files or minor design choices, single module, no schema/API/security changes.
- **HARD**: any of 5+ files, multiple modules, schema/migration/public API/security changes, an ambiguous spec, or a previously blocked feature.
- If unsure between two classes, pick the higher one. If the user names a class, use it.

### Routing
- EASY or MEDIUM: `quick-coder` → `summarizer`.
- HARD: `planner` → `coder` → `summarizer`.
- If quick-coder reports ESCALATE: reclassify as HARD and run the HARD flow.

### HARD failure loop
- Coder retries once on a small mistake.
- A second failure or a coder-report goes back to the planner for a re-plan, then the coder runs again.
- After 2 re-plans with no pass: the summarizer marks the feature blocked and the session asks the user.

### Truth
- `hx verify <id>` is the only source of truth. Nothing is reported as done without a passing verify after the last code edit.

### Orchestration and token discipline
- The main session only classifies, invokes agents, passes file paths, and reports. It never writes code, plans, or logs itself.
- Pass file paths between agents, not pasted content. Don't re-read unchanged files.
- Don't edit `CLAUDE.md`, `.claude/**`, or `specs/**` during feature work.
- User reports: 5 lines or less covering id, class, status, files changed, and next step.
- If a request conflicts with these rules, refuse and name the blocking rule unless the user says "change harness rules".
