/**
 * Build step for the Vercel API project (server/vercel.json "buildCommand").
 *
 * Production deployments apply pending migrations to the cloud database, using the direct (not
 * pooled) Neon endpoint. The runner is idempotent and refuses edited migrations, so re-running it
 * on every deploy is safe. Preview deployments skip it: they share the production database.
 *
 * One-time admin bootstrap: when OMNIA_ADMIN_EMAIL and OMNIA_NEW_USER_PASSWORD are set on the
 * project, the admin user is created (or reset). Remove both variables after one deploy, or every
 * deploy resets that user's password.
 *
 * Every build (preview too) first creates an empty public/ directory: Vercel requires an output
 * directory when buildCommand is set and framework is null.
 */
import { spawnSync } from 'node:child_process';
import { mkdirSync } from 'node:fs';

const out = (line) => process.stdout.write(`[vercel-build] ${line}\n`);

// Vercel needs an output directory when buildCommand is set and framework is null; the API itself is the function in api/.
mkdirSync('public', { recursive: true });

if (process.env.VERCEL_ENV !== 'production') {
  out(`VERCEL_ENV=${process.env.VERCEL_ENV ?? 'unset'}: skipping migrations`);
  process.exit(0);
}

// Same order as api/index.ts.
const databaseUrl =
  process.env.DATABASE_URL_UNPOOLED || process.env.NEON_DATABASE_URL_UNPOOLED || process.env.DATABASE_URL;
if (!databaseUrl) {
  out('no database URL on the project: skipping migrations');
  process.exit(0);
}

const env = { ...process.env, DATABASE_URL: databaseUrl, LOG_LEVEL: 'warn' };

function tsx(args) {
  // node --import tsx: no shell, so arguments with spaces (the admin name) stay intact.
  const res = spawnSync(process.execPath, ['--import', 'tsx', ...args], { stdio: 'inherit', env });
  if (res.status !== 0) {
    out(`tsx ${args[0]} failed (exit ${res.status})`);
    process.exit(res.status ?? 1);
  }
}

out('applying migrations');
tsx(['src/db/migrate.ts']);

if (env.OMNIA_ADMIN_EMAIL && env.OMNIA_NEW_USER_PASSWORD) {
  out(`creating admin user ${env.OMNIA_ADMIN_EMAIL}`);
  tsx(['src/jobs/create-user.ts', '--email', env.OMNIA_ADMIN_EMAIL, '--name', env.OMNIA_ADMIN_NAME || 'Admin', '--role', 'admin']);
}
