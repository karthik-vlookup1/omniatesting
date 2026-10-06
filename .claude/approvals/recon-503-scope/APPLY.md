# APPLY: add one test file to recon-503 scope

Why: recon-503 auto-matches lines inside the intake upload, so recon-502's own test
`server/test/int/agentos-intake.test.ts:75` (asserted every line stays `pending`) had to change
to `match_status !== 'pending'`. Senior-tester confirmed it is the only change in that file and is
not a weakening (agentos-match asserts exact per-line statuses). hx verify passed all levels but the
rubric blocks on scope because that file is outside recon-503's declared scope.

Change (protected `.claude/state/feature_list.json`):
- recon-503 `scope`: append `"server/test/int/agentos-intake.test.ts"`.

Then run:
`node .claude/bin/hx.cjs verify recon-503 --accept-contract-change --reason "auto-match changes recon-502 test assertion; user-approved scope addition"`
