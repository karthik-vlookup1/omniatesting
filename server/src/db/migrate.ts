/**
 * Migration runner.
 *
 * Applies db/migrations/NNN_*.sql in filename order and records each in schema_migrations.
 * Files manage their own transactions (002 deliberately runs `ALTER TYPE ... ADD VALUE` outside
 * one), so this runner never wraps a file in an extra transaction. Each file is sent as a single
 * simple-protocol query, exactly as psql -f would run it.
 *
 * Applied files are checksummed (line endings normalised); editing an applied migration is an
 * error. New changes go in a new file.
 *
 * CLI:  tsx server/src/db/migrate.ts [--reset]
 *   --reset  drop and recreate the target database first (only for *_test / *_e2e / *_dbtest).
 */
import { createHash } from 'node:crypto';
import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';
import { isMainModule } from '../lib/is-main.js';

export const MIGRATIONS_DIR = fileURLToPath(new URL('../../../db/migrations/', import.meta.url));

const MIGRATION_FILE = /^\d{3}_[A-Za-z0-9_-]+\.sql$/;
const RESETTABLE_DB = /_(test|e2e|dbtest)$/;
/** Arbitrary constant so two runners against one database never interleave. */
const ADVISORY_LOCK_KEY = 72_310_551;

export interface MigrationFile {
  filename: string;
  sql: string;
  checksum: string;
}

export interface MigrateResult {
  applied: string[];
  alreadyApplied: string[];
}

export type MigrateLog = (message: string) => void;

export function checksumOf(sql: string): string {
  return createHash('sha256').update(sql.replace(/\r\n/g, '\n')).digest('hex');
}

export async function loadMigrations(dir: string = MIGRATIONS_DIR): Promise<MigrationFile[]> {
  const entries = await readdir(dir);
  const files = entries.filter((f) => MIGRATION_FILE.test(f)).sort();
  const seen = new Set<string>();
  const result: MigrationFile[] = [];
  for (const filename of files) {
    const prefix = filename.slice(0, 3);
    if (seen.has(prefix)) {
      throw new Error(`Two migrations share the number ${prefix} in ${dir}`);
    }
    seen.add(prefix);
    const sql = await readFile(path.join(dir, filename), 'utf8');
    result.push({ filename, sql, checksum: checksumOf(sql) });
  }
  return result;
}

function databaseNameOf(databaseUrl: string): string {
  const name = decodeURIComponent(new URL(databaseUrl).pathname.replace(/^\//, ''));
  if (!name) throw new Error('DATABASE_URL has no database name');
  return name;
}

/** Drops and recreates the database named in `databaseUrl`. Refuses anything but a test database. */
export async function resetDatabase(databaseUrl: string): Promise<void> {
  const dbName = databaseNameOf(databaseUrl);
  if (!RESETTABLE_DB.test(dbName)) {
    throw new Error(
      `Refusing to reset "${dbName}": only databases ending in _test, _e2e or _dbtest can be reset`,
    );
  }
  const adminUrl = new URL(databaseUrl);
  adminUrl.pathname = '/postgres';
  const client = new pg.Client({ connectionString: adminUrl.toString() });
  await client.connect();
  try {
    const ident = client.escapeIdentifier(dbName);
    await client.query(`DROP DATABASE IF EXISTS ${ident} WITH (FORCE)`);
    await client.query(`CREATE DATABASE ${ident}`);
  } finally {
    await client.end();
  }
}

export async function runMigrations(
  databaseUrl: string,
  { dir = MIGRATIONS_DIR, log = () => {} }: { dir?: string; log?: MigrateLog } = {},
): Promise<MigrateResult> {
  const migrations = await loadMigrations(dir);
  const client = new pg.Client({ connectionString: databaseUrl, application_name: 'omnia-migrate' });
  await client.connect();
  try {
    await client.query('SELECT pg_advisory_lock($1)', [ADVISORY_LOCK_KEY]);
    await client.query(`
      CREATE TABLE IF NOT EXISTS schema_migrations (
        filename   text PRIMARY KEY,
        checksum   text NOT NULL,
        applied_at timestamptz NOT NULL DEFAULT now()
      )`);

    const { rows } = await client.query<{ filename: string; checksum: string }>(
      'SELECT filename, checksum FROM schema_migrations ORDER BY filename',
    );
    const applied = new Map(rows.map((r) => [r.filename, r.checksum]));
    const onDisk = new Set(migrations.map((m) => m.filename));

    for (const filename of applied.keys()) {
      if (!onDisk.has(filename)) {
        throw new Error(`Migration ${filename} is recorded as applied but is missing from ${dir}`);
      }
    }

    const result: MigrateResult = { applied: [], alreadyApplied: [] };
    let pendingSeen = false;
    for (const m of migrations) {
      const recorded = applied.get(m.filename);
      if (recorded !== undefined) {
        if (pendingSeen) {
          throw new Error(`Migration ${m.filename} is applied but an earlier file is not; order is broken`);
        }
        if (recorded !== m.checksum) {
          throw new Error(
            `Migration ${m.filename} has changed since it was applied. Never edit an applied ` +
              'migration; add a new file instead.',
          );
        }
        result.alreadyApplied.push(m.filename);
        continue;
      }
      pendingSeen = true;
      log(`applying ${m.filename}`);
      try {
        await client.query(m.sql);
      } catch (err) {
        // A file that failed inside its own BEGIN leaves the session in an aborted transaction.
        await client.query('ROLLBACK').catch(() => {});
        const message = err instanceof Error ? err.message : String(err);
        throw new Error(`Migration ${m.filename} failed: ${message}`, { cause: err });
      }
      await client.query('INSERT INTO schema_migrations (filename, checksum) VALUES ($1, $2)', [
        m.filename,
        m.checksum,
      ]);
      result.applied.push(m.filename);
    }
    return result;
  } finally {
    await client.query('SELECT pg_advisory_unlock($1)', [ADVISORY_LOCK_KEY]).catch(() => {});
    await client.end();
  }
}

async function main(): Promise<void> {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    throw new Error('DATABASE_URL is not set');
  }
  const out = (line: string) => process.stdout.write(`${line}\n`);
  if (process.argv.includes('--reset')) {
    out(`resetting ${databaseNameOf(databaseUrl)}`);
    await resetDatabase(databaseUrl);
  }
  const { applied, alreadyApplied } = await runMigrations(databaseUrl, { log: out });
  out(`migrations: ${applied.length} applied, ${alreadyApplied.length} already up to date`);
}

if (isMainModule(import.meta.url)) {
  main().catch((err: unknown) => {
    process.stderr.write(`migrate: ${err instanceof Error ? err.message : String(err)}\n`);
    process.exit(1);
  });
}
