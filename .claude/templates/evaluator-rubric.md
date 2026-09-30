# Evaluator Rubric

Use this rubric after implementation and before final acceptance. Scale is 0-2 per category
(0 = fails, 1 = partial, 2 = meets bar). This scale is declared here rather than assumed — see
docs/COURSE-ISSUES.md #23 for why the course itself uses three incompatible scales across
different files.

| Category | Question | Score (0-2) | Notes |
| --- | --- | --- | --- |
| Correctness | Does the implemented behavior match the requested feature? | | |
| Verification | Did `hx verify` actually run, with evidence recorded? | | |
| Scope discipline | Did the session stay inside the feature's declared `scope` (`hx drift`)? | | |
| Reliability | Does the result survive `hx exit` / a restart without repair? | | |
| Maintainability | Is the code and documentation clear enough for the next session? | | |
| Handoff readiness | Can a fresh session continue work from `hx start` output alone? | | |

## Verdict

- Accept
- Revise
- Block

## Required Follow-Up

- Missing evidence:
- Required fixes:
- Next review trigger:

## Tuning note

Agents are poor self-judges (Lecture 9). If you automate this rubric as a checker role, compare
its scores against a human's on a few sessions, tighten the wording where they diverge, and
re-run. Plan for several tuning rounds — the course reports 3-5.
