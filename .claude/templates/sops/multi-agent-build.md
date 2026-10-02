# SOP: Multi-Agent Build

Use this SOP when a feature (or a sprint of features) is large enough to split across several
agents working at once, not because more agents are always faster, but because the review
discipline below is what makes parallel work safe instead of just fast.

## Goal

Let several builders touch a codebase concurrently without corrupting harness state, without
silent scope collisions on shared files, and without a review pass that just repeats what a
single agent already believed about its own work.

## Roles

- **Coordinator.** Owns every `hx` command and every commit. Runs `hx feature start`, assigns
  disjoint file ownership to each builder, merges their work, runs `hx verify`, and attests. A
  builder never runs `hx`, never edits `feature_list.json`, and never commits or deploys — the
  harness has no mechanical check for this split (agents cannot be told apart from the
  coordinator by any command), so it is enforced by convention, stated here and in the
  CLAUDE/AGENTS templates.
- **Builders.** Each owns a disjoint set of files, stated up front. A file that must be touched by
  more than one builder (a shared entrypoint, a shared type) is edited only with an exact-string
  replace (never a full overwrite) and re-read immediately before each edit, so two builders'
  changes land as a diff, not a race.

## Execution SOP

1. The coordinator starts the feature (`hx feature start <id>`) and writes the file-ownership
   split: which builder owns which paths, and which files are shared and how (exact-string edits
   only, in a named region if the file is large).
2. Each builder works only inside its own ownership, reporting back instead of guessing when a
   change outside it looks necessary.
3. The coordinator collects every builder's diff and runs three independent review lenses over
   the combined result:
   - **Correctness / tests** — does it do what it claims, and is there a real test for it.
   - **Security** — new attack surface, secrets, permission or trust boundaries.
   - **Docs vs. behaviour** — does the written description match what the code actually does.
   Each lens returns only findings it can point at a concrete file and line, not impressions.
4. **One master review adjudicates.** It reads every lens's findings against the real diff and
   decides, per finding, whether it survives — roughly half of all findings get refuted here
   (measured on the first real project: `docs/FIELD-NOTES-shreedurga.md`), because a lens reading
   one file in isolation flags things the full picture already explains. This step is what keeps
   review fast without keeping review shallow: the fix pass only touches what the master review
   confirmed.
5. A fix pass addresses only the surviving findings, done by the coordinator or the owning
   builder, never by re-running a fresh lens from scratch.
6. The coordinator runs `hx verify <id>` (only this can mark it `passing`) and, for anything
   needing a human look, `hx verify --attest` with what was actually observed.

## Definition Of Done

- Every builder's changes stayed inside its declared ownership, or the coordinator explicitly
  widened it before the fact.
- Every shared-file edit was an exact-string replace, not an overwrite that could silently drop
  another builder's concurrent change.
- All three review lenses ran, the master review adjudicated their findings, and only confirmed
  findings were fixed.
- `hx verify <id>` passed for real, and the coordinator — not a builder — ran it.

---

**Enforced by:** two rules in `CLAUDE.md`/`AGENTS.md` (source: this SOP); `hx verify --attest`'s
thin-attestation check covers the last step, the rest is manual — the harness has no mechanical
way to tell a builder session from the coordinator.
