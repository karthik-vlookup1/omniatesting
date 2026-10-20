/**
 * Demo data for the VECO push: receipts that wait on the Vico export page (three 1.00 ones by default), plus a VECO
 * staff link for one login. Runs on localhost:5433, or on the cloud database with --cloud. Everything it creates is
 * keyed on DEMO_MARKER / DEMO-VECO refs, so remove deletes only that.
 *
 *   tsx --env-file=.env.local server/src/services/veco-push/demo-seed.ts seed --user <email>
 *   tsx --env-file=.env.local server/src/services/veco-push/demo-seed.ts remove
 *   demo-seed.ts seed --cloud --user <email> --staff <StaffPK> --receipts "T5755=997.27,T6008=890.00"
 *   demo-seed.ts users --cloud
 *
 * For the cloud, scripts/cloud-demo-seed.ps1 prompts for the secrets and calls this with --cloud.
 */
import { loadConfig } from '../../config/env.js';
import { createPool, type Pool } from '../../db/pool.js';
import { isMainModule } from '../../lib/is-main.js';
import { createLogger } from '../../lib/logger.js';
import { DEMO_AMOUNT, DEMO_DATE, DEMO_MARKER, DEMO_STAFF_PK, DEMO_TIDS } from './demo-data.js';

const SORT_CODE = '20-79-06';
const ACCOUNT_NUMBER = '43789276';
const BRANCH = 'DEMO-VECO';
const refOf = (tid: string) => `DEMO-VECO-${tid}`;

export const TID_RE = /^T\d{3,6}$/;
export const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const AMOUNT_RE = /^\d{1,10}\.\d{2}$/;

export interface DemoReceipt {
  tid: string;
  amount: string;
}

/** "T5755=997.27,T6008=890.00" -> receipts. Errors name the bad item. */
export function parseReceipts(text: string): DemoReceipt[] {
  const items = text.split(',').map((s) => s.trim());
  if (items.every((s) => s === '')) throw new Error('--receipts needs at least one TID=amount item');
  if (items.length > 50) throw new Error('--receipts takes at most 50 items');
  const seen = new Set<string>();
  return items.map((item) => {
    const eq = item.indexOf('=');
    const tid = (eq < 0 ? item : item.slice(0, eq)).trim().toUpperCase();
    const amount = eq < 0 ? '' : item.slice(eq + 1).trim();
    if (!TID_RE.test(tid) || !AMOUNT_RE.test(amount) || !(Number(amount) > 0)) throw new Error(`Bad --receipts item "${item}"`);
    if (seen.has(tid)) throw new Error(`Duplicate TID in --receipts: ${tid}`);
    seen.add(tid);
    return { tid, amount };
  });
}

export class UsageError extends Error {}

export type DemoArgs =
  | { command: 'seed'; userEmail: string; cloud: boolean; staffPk: string; receipts: DemoReceipt[] }
  | { command: 'remove'; cloud: boolean }
  | { command: 'users'; cloud: boolean };

export function parseArgs(argv: string[]): DemoArgs {
  const [command, ...rest] = argv;
  if (command !== 'seed' && command !== 'remove' && command !== 'users') throw new UsageError('Unknown or missing command');
  const allowed = command === 'seed' ? ['--cloud', '--user', '--staff', '--receipts'] : ['--cloud'];
  const values = new Map<string, string>();
  let cloud = false;
  for (let i = 0; i < rest.length; i++) {
    const flag = rest[i]!;
    if (!allowed.includes(flag)) throw new UsageError(`Unknown option ${flag}`);
    if (flag === '--cloud' ? cloud : values.has(flag)) throw new UsageError(`Repeated option ${flag}`);
    if (flag === '--cloud') {
      cloud = true;
      continue;
    }
    const value = rest[++i];
    if (value === undefined || value === '' || value.startsWith('--')) throw new UsageError(`Option ${flag} needs a value`);
    values.set(flag, value);
  }
  if (command !== 'seed') return { command, cloud };
  const userEmail = values.get('--user');
  if (!userEmail) throw new UsageError('seed needs --user <email>');
  const staff = values.get('--staff');
  if (staff !== undefined && !UUID_RE.test(staff)) throw new UsageError('--staff must be a StaffPK (UUID)');
  const text = values.get('--receipts');
  let receipts: DemoReceipt[];
  try {
    receipts = text === undefined ? DEMO_TIDS.map((tid) => ({ tid, amount: DEMO_AMOUNT })) : parseReceipts(text);
  } catch (err) {
    throw new UsageError(err instanceof Error ? err.message : 'Bad --receipts');
  }
  return { command, userEmail, cloud, staffPk: staff === undefined ? DEMO_STAFF_PK : staff.toUpperCase(), receipts };
}

/** Refuses anything but a database on localhost port 5433. */
export function assertLocalDatabase(url: string): void {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    throw new Error('Demo seed refuses an unreadable DATABASE_URL');
  }
  const host = parsed.hostname.replace(/^\[|\]$/g, '');
  if (!['localhost', '127.0.0.1', '::1'].includes(host) || parsed.port !== '5433') {
    throw new Error('Demo seed only runs against localhost:5433');
  }
}

export interface DatabaseTarget {
  databaseUrl: string;
  label: 'localhost:5433' | 'cloud database';
}

/** Picks the database to use. No message here ever contains the URL or its host. */
export function resolveDatabaseTarget(env: Record<string, string | undefined>, cloud: boolean): DatabaseTarget {
  if (!cloud) {
    const databaseUrl = env.DATABASE_URL ?? '';
    assertLocalDatabase(databaseUrl);
    return { databaseUrl, label: 'localhost:5433' };
  }
  const databaseUrl = env.DATABASE_URL_UNPOOLED || env.NEON_DATABASE_URL_UNPOOLED || env.DATABASE_URL;
  if (!databaseUrl) throw new Error('--cloud needs DATABASE_URL_UNPOOLED, NEON_DATABASE_URL_UNPOOLED or DATABASE_URL');
  let parsed: URL;
  try {
    parsed = new URL(databaseUrl);
  } catch {
    throw new Error('Demo seed refuses an unreadable cloud database URL');
  }
  if (['localhost', '127.0.0.1', '::1'].includes(parsed.hostname.replace(/^\[|\]$/g, ''))) {
    throw new Error('--cloud refuses a local database; drop --cloud');
  }
  return { databaseUrl, label: 'cloud database' };
}

/** Hides the URL, its host and its password in an error message (pg errors such as ENOTFOUND include the host). */
export function redact(msg: string, url: string): string {
  const secrets = [url];
  try {
    const parsed = new URL(url);
    secrets.push(parsed.hostname);
    if (parsed.password) secrets.push(decodeURIComponent(parsed.password), parsed.password);
  } catch {
    // an unreadable URL has no separate host or password to hide
  }
  let out = msg;
  for (const secret of secrets.filter(Boolean).sort((x, y) => y.length - x.length)) out = out.split(secret).join('cloud database');
  return out;
}

async function inTransaction<T>(pool: Pool, fn: (q: Pool | import('pg').PoolClient) => Promise<T>): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const out = await fn(client);
    await client.query('COMMIT');
    return out;
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

async function preflight(q: Pool | import('pg').PoolClient): Promise<void> {
  const ok = (
    await q.query<{ ok: boolean }>(
      `SELECT to_regclass('veco_staff_link') IS NOT NULL AND to_regclass('veco_push_item') IS NOT NULL
          AND to_regclass('v_vico_export') IS NOT NULL AS ok`,
    )
  ).rows[0]!.ok;
  if (!ok) throw new Error('The database has no VECO push tables (migration 021); apply migrations first');
}

export interface SeedSummary {
  receiptsCreated: number;
  receiptsWaiting: number;
  tenanciesCreated: number;
  linkedUser: string;
  staffLink: 'created' | 'updated' | 'kept';
}

export async function seedVecoPushDemo(
  pool: Pool,
  {
    userEmail,
    staffPk = DEMO_STAFF_PK,
    receipts = DEMO_TIDS.map((tid) => ({ tid, amount: DEMO_AMOUNT })),
  }: { userEmail: string; staffPk?: string; receipts?: DemoReceipt[] },
): Promise<SeedSummary> {
  return inTransaction(pool, async (q) => {
    await preflight(q);
    // Vico bank settings: fill what is missing, never overwrite.
    const wanted: Record<string, string> = { sort_code: SORT_CODE, account_number: ACCOUNT_NUMBER };
    const have = new Map(
      (await q.query<{ key: string; value: string }>("SELECT key, value FROM integration_settings WHERE system = 'vico'")).rows.map(
        (r) => [r.key, r.value],
      ),
    );
    for (const [key, value] of Object.entries(wanted)) {
      const current = have.get(key);
      if (current !== undefined && current !== value) {
        throw new Error(
          `Vico settings are ${have.get('sort_code') ?? 'unset'}/${have.get('account_number') ?? 'unset'}; set ${SORT_CODE} / ${ACCOUNT_NUMBER} first`,
        );
      }
    }
    for (const [key, value] of Object.entries(wanted)) {
      if (!have.has(key)) await q.query("INSERT INTO integration_settings (system, key, value) VALUES ('vico', $1, $2)", [key, value]);
    }

    const user = (
      await q.query<{ id: string; role: string; email: string }>(
        'SELECT id, role, email FROM app_users WHERE lower(email) = lower($1)',
        [userEmail],
      )
    ).rows[0];
    if (!user) throw new Error('No such user');
    if (user.role !== 'admin' && user.role !== 'accounts') throw new Error('The demo user must be an admin or accounts user');

    let tenanciesCreated = 0;
    let receiptsCreated = 0;
    for (const { tid, amount } of receipts) {
      let tenancyId = (await q.query<{ id: string }>('SELECT id FROM tenancies WHERE tid = $1', [tid])).rows[0]?.id;
      if (!tenancyId) {
        let branchId = (await q.query<{ id: string }>('SELECT id FROM branches WHERE code = $1', [BRANCH])).rows[0]?.id;
        if (!branchId) {
          branchId = (
            await q.query<{ id: string }>("INSERT INTO branches (code, name) VALUES ($1, 'Demo VECO') RETURNING id", [BRANCH])
          ).rows[0]!.id;
        }
        const propertyId = (
          await q.query<{ id: string }>(
            `INSERT INTO properties (property_ref, branch_id, address_line1, postcode)
             VALUES ($1, $2, $3, 'ZZ1 1ZZ') RETURNING id`,
            [refOf(tid), branchId, `Demo property ${tid}`],
          )
        ).rows[0]!.id;
        const tenantId = (
          await q.query<{ id: string }>(
            "INSERT INTO tenants (tenant_ref, first_name, last_name) VALUES ($1, 'Demo', $2) RETURNING id",
            [refOf(tid), `Tenant ${tid}`],
          )
        ).rows[0]!.id;
        tenancyId = (
          await q.query<{ id: string }>(
            `INSERT INTO tenancies (tid, property_id, management_type, start_date)
             VALUES ($1, $2, 'RG', '2026-01-01') RETURNING id`,
            [tid, propertyId],
          )
        ).rows[0]!.id;
        await q.query('INSERT INTO tenancy_tenants (tenancy_id, tenant_id, is_lead) VALUES ($1, $2, true)', [tenancyId, tenantId]);
        tenanciesCreated++;
      }
      const waiting = (
        await q.query<{ amount: string }>(
          `SELECT r.amount::text AS amount FROM v_vico_export v JOIN receipts r ON r.id = v.receipt_id
            WHERE r.tenancy_id = $1 AND r.notes = $2`,
          [tenancyId, DEMO_MARKER],
        )
      ).rows[0];
      if (waiting && Number(waiting.amount) !== Number(amount)) {
        throw new Error(`Demo receipt for ${tid} is already waiting at ${waiting.amount}; run remove first`);
      }
      if (!waiting) {
        await q.query(
          `INSERT INTO receipts (tenancy_id, payer, amount, received_on, matched_via, notes)
           VALUES ($1, 'tenant', $2, $3, 'manual', $4)`,
          [tenancyId, amount, DEMO_DATE, DEMO_MARKER],
        );
        receiptsCreated++;
      }
    }

    // A link the demo made (or the app's unconfirmed email auto-link) is replaced; a real admin choice is kept or refused.
    const link = (
      await q.query<{ staff: string; source: string; can_push: boolean; updated_by: string | null }>(
        'SELECT upper(staff_fk::text) AS staff, source, can_push, updated_by FROM veco_staff_link WHERE user_id = $1',
        [user.id],
      )
    ).rows[0];
    let staffLink: SeedSummary['staffLink'] = 'kept';
    if (!link || link.updated_by === DEMO_MARKER || (link.source === 'email' && !link.can_push)) {
      await q.query(
        `INSERT INTO veco_staff_link (user_id, staff_fk, source, can_push, updated_by)
         VALUES ($1, $2, 'admin', true, $3)
         ON CONFLICT (user_id) DO UPDATE
           SET staff_fk = EXCLUDED.staff_fk, source = 'admin', can_push = true, updated_by = EXCLUDED.updated_by, updated_at = now()`,
        [user.id, staffPk, DEMO_MARKER],
      );
      staffLink = link ? 'updated' : 'created';
    } else if (link.staff !== staffPk.toUpperCase() || !link.can_push) {
      throw new Error(`${user.email} already has a VECO staff link set in the app; change or unlink it on the Settings page first`);
    }

    const receiptsWaiting = (
      await q.query<{ n: number }>(
        `SELECT count(*)::int AS n FROM v_vico_export v JOIN receipts r ON r.id = v.receipt_id WHERE r.notes = $1`,
        [DEMO_MARKER],
      )
    ).rows[0]!.n;
    return { receiptsCreated, receiptsWaiting, tenanciesCreated, linkedUser: user.email, staffLink };
  });
}

export interface RemoveSummary {
  receiptsRemoved: number;
  tenanciesRemoved: number;
  staffLinksRemoved: number;
}

export async function removeVecoPushDemo(pool: Pool): Promise<RemoveSummary> {
  return inTransaction(pool, async (q) => {
    await preflight(q);
    const ids = (await q.query<{ id: string }>('SELECT id FROM receipts WHERE notes = $1', [DEMO_MARKER])).rows.map((r) => r.id);
    if (ids.length > 0) {
      // Deleting a pushed item would orphan its rows in VECO.
      const live = (
        await q.query<{ n: number }>(
          "SELECT count(*)::int AS n FROM veco_push_item WHERE payment_id = ANY($1::uuid[]) AND status IN ('pushing','pushed')",
          [ids],
        )
      ).rows[0]!.n;
      if (live > 0) throw new Error(`${live} demo receipts are still pushed to VECO; delete that batch on the Vico export page first`);
      const batchIds = (
        await q.query<{ batch_id: string }>('SELECT DISTINCT batch_id FROM veco_push_item WHERE payment_id = ANY($1::uuid[])', [ids])
      ).rows.map((r) => r.batch_id);
      await q.query('DELETE FROM veco_push_item WHERE payment_id = ANY($1::uuid[])', [ids]);
      if (batchIds.length > 0) {
        await q.query(
          `DELETE FROM veco_push_batch b WHERE b.id = ANY($1::uuid[])
             AND NOT EXISTS (SELECT 1 FROM veco_push_item i WHERE i.batch_id = b.id)`,
          [batchIds],
        );
      }
      await q.query("DELETE FROM external_refs WHERE system = 'vico' AND entity_type = 'receipt' AND entity_id = ANY($1::uuid[])", [ids]);
      await q.query('DELETE FROM receipts WHERE id = ANY($1::uuid[])', [ids]);
    }

    const tenancies = (
      await q.query<{ id: string }>(
        `SELECT t.id FROM tenancies t JOIN properties p ON p.id = t.property_id
          WHERE p.property_ref LIKE 'DEMO-VECO-%'
            AND NOT EXISTS (SELECT 1 FROM receipts r WHERE r.tenancy_id = t.id)`,
      )
    ).rows.map((r) => r.id);
    if (tenancies.length > 0) {
      await q.query('DELETE FROM tenancy_tenants WHERE tenancy_id = ANY($1::uuid[])', [tenancies]);
      await q.query('DELETE FROM tenancies WHERE id = ANY($1::uuid[])', [tenancies]);
    }
    await q.query(
      `DELETE FROM tenants t WHERE t.tenant_ref LIKE 'DEMO-VECO-%'
         AND NOT EXISTS (SELECT 1 FROM tenancy_tenants tt WHERE tt.tenant_id = t.id)`,
    );
    await q.query(
      `DELETE FROM properties p WHERE p.property_ref LIKE 'DEMO-VECO-%'
         AND NOT EXISTS (SELECT 1 FROM tenancies t WHERE t.property_id = p.id)`,
    );
    await q.query(
      `DELETE FROM branches b WHERE b.code = $1 AND NOT EXISTS (SELECT 1 FROM properties p WHERE p.branch_id = b.id)`,
      [BRANCH],
    );
    const links = await q.query('DELETE FROM veco_staff_link WHERE updated_by = $1', [DEMO_MARKER]);
    return { receiptsRemoved: ids.length, tenanciesRemoved: tenancies.length, staffLinksRemoved: links.rowCount ?? 0 };
  });
}

/** Active logins that can be given a staff link. */
export async function listDemoUsers(pool: Pool): Promise<string[]> {
  const res = await pool.query<{ email: string }>("SELECT email FROM app_users WHERE is_active AND role IN ('admin','accounts') ORDER BY email");
  return res.rows.map((r) => r.email);
}

const USAGE =
  'Usage: demo-seed.ts seed --user <email> [--staff <StaffPK>] [--receipts "T1234=1.00,..."] [--cloud] | remove [--cloud] | users [--cloud]\n';

async function cli(argv: string[]): Promise<number> {
  let args: DemoArgs;
  try {
    args = parseArgs(argv);
  } catch (err) {
    if (!(err instanceof UsageError)) throw err;
    process.stderr.write(`${err.message}\n${USAGE}`);
    return 2;
  }
  let url = '';
  try {
    const target = resolveDatabaseTarget(process.env, args.cloud);
    url = target.databaseUrl;
    const config = loadConfig({ ...process.env, DATABASE_URL: target.databaseUrl });
    if (!args.cloud && config.nodeEnv === 'production') throw new Error('Demo seed refuses to run in production');
    const pool = createPool({ databaseUrl: config.databaseUrl, hashKey: config.hashKey, max: 2 }, createLogger({ level: 'silent' }));
    try {
      const summary =
        args.command === 'seed'
          ? await seedVecoPushDemo(pool, { userEmail: args.userEmail, staffPk: args.staffPk, receipts: args.receipts })
          : args.command === 'remove'
            ? await removeVecoPushDemo(pool)
            : { emails: await listDemoUsers(pool) };
      process.stdout.write(`${JSON.stringify({ command: args.command, database: target.label, ...summary })}\n`);
      return 0;
    } finally {
      await pool.end();
    }
  } catch (err) {
    if (!args.cloud) throw err;
    process.stderr.write(`${redact(err instanceof Error ? err.message : 'Demo seed failed', url)}\n`);
    return 1;
  }
}

if (isMainModule(import.meta.url)) {
  cli(process.argv.slice(2)).then(
    (code) => process.exit(code),
    (err: unknown) => {
      process.stderr.write(`${err instanceof Error ? err.message : 'Demo seed failed'}\n`);
      process.exit(1);
    },
  );
}
