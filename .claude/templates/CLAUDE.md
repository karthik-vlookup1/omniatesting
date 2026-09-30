# CLAUDE.md

This repository is managed by the `hx` harness, designed for long-running implementation work.
Prioritize reliable completion, continuity across sessions, and explicit verification over speed.

## Rules

- One active feature at a time — `hx feature start` refuses a second one (source: WIP=1 is
  enforced by the command, not a convention to remember).
- Do not claim completion without runnable evidence. Only `hx verify` can set a feature to
  `passing` (source: `hx verify` is the only command that writes passing status).
- Do not rewrite `feature_list.json` by hand to hide unfinished work — use `hx feature` commands
  (source: a hand-edited status with no verification run behind it is exactly what the passing
  gate above exists to prevent).
- Do not remove or weaken verification commands just to make the task look complete (source: a
  weakened command still exits 0, which reads as real evidence to every reader after you).
- Use repository artifacts as the system of record, not chat history (source: chat history does
  not survive a session restart; `feature_list.json`/`claude-progress.md` does).
- The coordinator owns `hx`: implementation sub-agents never run `hx`, never edit
  `feature_list.json`, never commit or deploy (source: sops/multi-agent-build.md; `hx` has no
  mechanical check for this).
- Attest what was observed, with numbers, not the plan restated (source: `hx verify --attest`
  warns under 40 characters; `attestMinChars` refuses).

## Operating Loop

At the start of every session, run `hx start`. It confirms the repo root, reads
`claude-progress.md` and `feature_list.json`, shows recent commits, runs the init check and
baseline verification, and reports whether the baseline is broken.

Then select exactly one unfinished feature (`hx feature start <id>`) and work only on that
feature until you either verify it (`hx verify <id>`) or document why it is blocked
(`hx feature block <id> --reason "..."`).

## Required Files

- `feature_list.json`
- `claude-progress.md`
- `init.sh` / `init.ps1`
- `session-handoff.md` when a compact handoff is useful

## Completion Gate

A feature can move to `passing` only after `hx verify` succeeds and the result is recorded as
evidence. You cannot set this status yourself.

## Before You Stop

Run `hx exit` (clean-state gate) then `hx handoff` (writes the progress log and handoff note),
then commit once the repository is safe to resume.
