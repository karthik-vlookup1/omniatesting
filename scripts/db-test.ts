/**
 * npm run db:test
 *
 * 1. Makes sure the compose database is up.
 * 2. Drops and recreates a throwaway database, applies every migration with the app's runner.
 * 3. Runs every db/tests/*.sql in filename order with psql -v ON_ERROR_STOP=1.
 * 4. Fails unless each file exits 0 AND prints its "ALL ... PASSED" line.
 *
 * psql runs inside the compose container by default (db/ is mounted at /omnia-db), so no local
 * Postgres client is needed. Set DB_TEST_PSQL=local to use a psql on PATH instead.
 */
import { spawnSync } from 'node:child_process';
import { readdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { resetDatabase, runMigrations } from '../server/src/db/migrate.js';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const TESTS_DIR = path.join(ROOT, 'db', 'tests');
const CONTAINER_TESTS_DIR = '/omnia-db/tests';
const PASSED_LINE = /ALL .+ PASSED/;

const databaseUrl =
  process.env.DBTEST_DATABASE_URL ?? 'postgres://omnia:omnia_local_dev@localhost:5432/omnia_dbtest';
const useLocalPsql = process.env.DB_TEST_PSQL === 'local';

const out = (line: string) => process.stdout.write(`${line}\n`);

function run(cmd: string, args: string[]): { status: number; output: string } {
  const res = spawnSync(cmd, args, { cwd: ROOT, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
  if (res.error) throw res.error;
  return { status: res.status ?? 1, output: `${res.stdout ?? ''}${res.stderr ?? ''}` };
}

function psqlFile(file: string): { status: number; output: string } {
  const url = new URL(databaseUrl);
  const dbName = decodeURIComponent(url.pathname.slice(1));
  if (useLocalPsql) {
    return run('psql', [databaseUrl, '-X', '-v', 'ON_ERROR_STOP=1', '-f', path.join(TESTS_DIR, file)]);
  }
  return run('docker', [
    'compose', 'exec', '-T', 'db',
    'psql', '-X', '-U', decodeURIComponent(url.username), '-d', dbName,
    '-v', 'ON_ERROR_STOP=1', '-f', `${CONTAINER_TESTS_DIR}/${file}`,
  ]);
}

async function main(): Promise<number> {
  if (!useLocalPsql) {
    const up = run('docker', ['compose', 'up', '-d', '--wait', 'db']);
    if (up.status !== 0) {
      out(up.output.trim());
      out('db:test: could not start the compose database (is Docker running?)');
      return 1;
    }
  }

  await resetDatabase(databaseUrl);
  const { applied } = await runMigrations(databaseUrl, { log: (m) => out(`  ${m}`) });
  out(`migrations applied: ${applied.length} (${applied.join(', ')})`);

  const files = readdirSync(TESTS_DIR).filter((f) => f.endsWith('.sql')).sort();
  if (files.length === 0) {
    out('db:test: no SQL test files found in db/tests');
    return 1;
  }

  let failures = 0;
  for (const file of files) {
    const { status, output } = psqlFile(file);
    const passedLine = output.split(/\r?\n/).find((l) => PASSED_LINE.test(l));
    if (status === 0 && passedLine) {
      out(`PASS ${file}: ${passedLine.replace(/^.*?(ALL .+ PASSED).*$/, '$1')}`);
    } else {
      failures += 1;
      out(`FAIL ${file} (exit ${status}${passedLine ? '' : ', no ALL ... PASSED line'})`);
      out(output.split(/\r?\n/).filter((l) => /ERROR|FAIL/.test(l)).slice(0, 20).join('\n'));
    }
  }
  out(`db:test: ${files.length - failures}/${files.length} SQL test files passed`);
  return failures === 0 ? 0 : 1;
}

main().then(
  (code) => process.exit(code),
  (err: unknown) => {
    out(`db:test: ${err instanceof Error ? err.message : String(err)}`);
    process.exit(1);
  },
);
