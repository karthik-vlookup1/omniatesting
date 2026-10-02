# Goal

<!-- One sentence describing what to do -->

{{GOAL}}

## Acceptance Criteria

<!-- Machine-verifiable completion conditions — each one must be checkable by an exit code. -->

- [ ] `{{VERIFY_CMD}}` passes

## Scope

### Fair game

- {{SCOPE_FAIR_GAME}}

### Hands off

- {{SCOPE_HANDS_OFF}}

## Verification Method

Run the acceptance criteria commands in order. Fix failures before moving to the next one.

## Stop Conditions

- all acceptance criteria pass
- max rounds reached: {{MAX_ROUNDS}}
- no progress for {{STALL_ROUNDS}} consecutive rounds (same error signature repeats)
- an unresolvable blocker is reported (missing dependency, environment problem)

## How To Work

1. Read `AGENTS.md` and `feature_list.json` first.
2. Explain the plan before making changes.
3. Verify after each sub-task.
4. If stuck for more than 2 rounds, change approach or simplify.
5. Update progress at the end of each round.
