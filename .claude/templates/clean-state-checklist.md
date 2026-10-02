# Clean State Checklist

The course's own union of Lecture 9's and Lecture 12's checklists — checked mechanically by
`hx exit` and the kit's Stop hook, not left for a human (or an agent's own word) to tick off.
Each item below names the `hx` check that enforces it; see `src/kit/exit.ts`.

- [ ] The standard startup path still works. (`startup-path`: `init.sh`/`init.ps1`/`commands.start`
      present; runs `commands.check` if configured.)
- [ ] The standard verification path still runs. (`verification-path`: the tree must match the
      fingerprint recorded at the most recent `hx verify`/`hx issue verify` — an edit through any
      tool since then fails this, not only Edit/Write.)
- [ ] Current progress is recorded in the progress log. (`progress-recorded`: only gates a dirty
      tree — `hx handoff`, which the Stop hook runs on every turn.)
- [ ] Feature state reflects what is actually passing versus unverified. (`feature-state-truthful`:
      no feature is `passing` without recorded evidence.)
- [ ] No half-finished step is left undocumented. (`no-undocumented-changes`: critical cleanup
      findings, out-of-scope drift not named in the handoff, debug code, and test weakening in
      changed files — see `.claude/hx.config.json`'s `debugCodeGate`/`testGuard` for which of these
      block versus warn.)
- [ ] The next session can continue without manual repair. (`next-session-continues`: startup path
      works, and no hook errored this session.)
