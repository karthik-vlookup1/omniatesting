# Autonomous build loop (Omnia Recon, OMNIA_MAIN)

You build this repo feature by feature with no human in the loop, through the hx harness
(`node .claude/bin/hx.cjs`, "hx" below). hx rules and protected files win over this file.
Use only commands that `hx --help` lists; never invent hx commands or hand-edit `.claude/state/`.

## Token rules
- Your knowledge base is hx: status, the feature's spec (`.claude/state/contracts/feature-<id>.md` + its row in `hx feature list`), decisions,
  lessons, blocks and session log. Read those first, every feature, and after any /compact.
- Do not reread the repo to "understand the concept". Open only files the current feature
  touches, and search (grep) before opening. Never read migrations 001/002 in full.
- Don't guess. If something isn't in hx or the brief, check the code once, then record what
  you learned with `hx decision add` or `hx lesson add` so nobody has to look again.
- Keep tool output short (tail logs, filter test output to failures and summaries).

## Loop (one feature at a time, WIP=1, in hx order)
1. `git checkout backend`; `git status`. Keep leftover in-scope work for the current feature.
2. Pick the next feature from `hx feature list` whose dependencies pass. `hx feature start <id>`.
3. Build it inside the feature's scope. Log every design choice (`hx decision add "..." --reason "..."`)
   and every surprise or mistake (`hx lesson add`) as you go.
4. Hand the diff to the **senior-tester** subagent (`.claude/agents/senior-tester.md`). Fix every
   blocking finding it returns, then send it back until it returns APPROVED.
5. `hx verify <id>`, attesting with observed numbers (tests run/passed, scenarios), never "it works".
6. `npm run lint`, `npm run typecheck`, `npm run test:unit`, `npm run test:int`, `npm run test:e2e` (when the feature has e2e), `npm run db:test` all exit 0; `hx drift` clean.
7. Commit on `backend` with a message of about 60 words: a subject line `<id>: <what>`, then a
   body saying what was built, how it was tested (numbers), and any decision taken.
8. `git push -u origin backend`. Never push or merge to `main`, never force-push.
9. Print a 5-line progress note (feature, verify numbers, commit hash, pushed yes/no, next id)
   and continue with the next feature. Run /compact between features if context is large;
   resume from hx state afterwards.

## Stop and wait for the user only when
- verify fails twice for the same feature (after the tester's fixes): `hx feature block <id>
  --reason "..." --needs-human`, then report what fails and your best diagnosis;
- a feature needs an open decision: own rent ledger vs Xero-as-only-ledger (decide before Phase 2,
  i.e. before recon-201), real bank CSV formats (recon-201), Xero credentials (recon-303).
  Block that feature with `--needs-human` and carry on with any feature that doesn't depend on it;
  stop when nothing unblocked is left;
- `git push` fails for auth or remote reasons, or a protected file must change (write the proposal
  to `.claude/approvals/<name>/APPLY.md` first);
- the end of each phase (after recon-004, recon-105, recon-204, recon-303, recon-401): print the
  phase report (features passed with numbers, blocks and on whom, what you'd change) and wait
  for "approved, start Phase N".

## Fixed facts
- Test DB: Docker Postgres on port 5433. A Windows PostgreSQL 18 service owns 5432; don't touch it.
- `db/migrations/001_*` and `002_*` are fixed; new SQL goes in `003_*` onward. Synthetic data only.
- Remote: https://github.com/suhasintern2/Omnia_recon (account suhasintern2), branch `backend`.
