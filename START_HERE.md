# Omnia Recon: starter pack

## What's in here

| File | What it is | Status |
|---|---|---|
| `docs/BUILD_BRIEF.md` | The full instructions for Claude Code: context, rules, phases and backlog | Final |
| `db/migrations/001_baseline.sql` | Database: tenants, tenancies, rent, receipts, allocation, Xero | Tested on PostgreSQL 16 |
| `db/migrations/002_matching_layer.sql` | Database: bank CSV profiles, payer accounts, matching cascade, enriched + Vico views | Tested on PostgreSQL 16 |
| `db/tests/001_baseline_scenarios.sql` | 5 rent scenarios with assertions | All passing |
| `db/tests/002_matching_scenarios.sql` | 38 matching checks with assertions | All passing |
| `docs/reference/rental-income-flow.md` | Today's manual process (from the flow chart PDF) | Reference |

## Where to put the files

1. **Find your project folder.** It's the one that contains the `.claude/` folder, i.e. where you ran `hx kit install`.
2. **Unzip into it** so the folders merge:
   ```
   your-project/
   ├── .claude/                  ← already there (harness)
   ├── START_HERE.md
   ├── docs/
   │   ├── BUILD_BRIEF.md
   │   └── reference/
   │       ├── rental-income-flow.md
   │       └── Omnia Rental Income Processing Flow Chart.pdf   ← copy the PDF here yourself (optional)
   └── db/
       ├── migrations/001_baseline.sql
       ├── migrations/002_matching_layer.sql
       ├── tests/001_baseline_scenarios.sql
       └── tests/002_matching_scenarios.sql
   ```
3. **Commit** so the harness sees a clean baseline:
   ```
   git add -A && git commit -m "Add Omnia Recon starter pack"
   ```

## What to type into Claude Code

Open Claude Code in the project folder and paste this one message. You don't need to paste the whole brief.

```
Read docs/BUILD_BRIEF.md in full and follow it exactly, starting with section 10
("First session"). Stop at the end of Phase 0 and give me the phase report.
```

After each phase report, reply **"approved, start Phase N"**, or tell it what to change.

## If the harness isn't installed yet

Run this in the unzipped `hx` harness folder:

```
npm install && npm run build && npm run build:kit
node dist/cli.js kit install /path/to/your-project
```

## Check the database yourself (optional)

This needs Docker:

```
docker run -d --name omnia-pg -e POSTGRES_PASSWORD=pg -p 5432:5432 postgres:16
export PGPASSWORD=pg
for f in db/migrations/001_baseline.sql db/migrations/002_matching_layer.sql \
         db/tests/001_baseline_scenarios.sql db/tests/002_matching_scenarios.sql; do
  psql -h localhost -U postgres -v ON_ERROR_STOP=1 -q -f "$f" || break
done
```

The last lines should say `ALL 001 BASELINE CHECKS PASSED` and `ALL 002 MATCHING CHECKS PASSED`.
