/**
 * Local demo data for the VECO push: three 1.00 receipts that wait on the Vico export page, plus a VECO staff link
 * for one login. Local only (localhost:5433). Everything it creates is keyed on DEMO_MARKER / DEMO-VECO refs, so
 * remove deletes only that.
 *
 *   tsx --env-file=.env.local server/src/services/veco-push/demo-seed.ts seed --user <email>
 *   tsx --env-file=.env.local server/src/services/veco-push/demo-seed.ts remove
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

export interface SeedSummary {
  receiptsCreated: number;
  receiptsWaiting: number;
  tenanciesCreated: number;
  linkedUser: string;
}

export async function seedVecoPushDemo(pool: Pool, { userEmail }: { userEmail: string }): Promise<SeedSummary> {
  return inTransaction(pool, async (q) => {
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
      await q.query<{ id: string; role: string }>('SELECT id, role FROM app_users WHERE lower(email) = lower($1)', [userEmail])
    ).rows[0];
    if (!user) throw new Error('No such user');
    if (user.role !== 'admin' && user.role !== 'accounts') throw new Error('The demo user must be an admin or accounts user');

    let tenanciesCreated = 0;
    let receiptsCreated = 0;
    for (const tid of DEMO_TIDS) {
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
        await q.query(
          `SELECT 1 FROM v_vico_export v JOIN receipts r ON r.id = v.receipt_id WHERE r.tenancy_id = $1 AND r.notes = $2`,
          [tenancyId, DEMO_MARKER],
        )
      ).rowCount;
      if (!waiting) {
        await q.query(
          `INSERT INTO receipts (tenancy_id, payer, amount, received_on, matched_via, notes)
           VALUES ($1, 'tenant', $2, $3, 'manual', $4)`,
          [tenancyId, DEMO_AMOUNT, DEMO_DATE, DEMO_MARKER],
        );
        receiptsCreated++;
      }
    }

    await q.query(
      `INSERT INTO veco_staff_link (user_id, staff_fk, source, can_push, updated_by)
       VALUES ($1, $2, 'admin', true, $3)
       ON CONFLICT (user_id) DO UPDATE
         SET staff_fk = EXCLUDED.staff_fk, source = 'admin', can_push = true, updated_by = EXCLUDED.updated_by, updated_at = now()`,
      [user.id, DEMO_STAFF_PK, DEMO_MARKER],
    );

    const receiptsWaiting = (
      await q.query<{ n: number }>(
        `SELECT count(*)::int AS n FROM v_vico_export v JOIN receipts r ON r.id = v.receipt_id WHERE r.notes = $1`,
        [DEMO_MARKER],
      )
    ).rows[0]!.n;
    return { receiptsCreated, receiptsWaiting, tenanciesCreated, linkedUser: userEmail };
  });
}

export interface RemoveSummary {
  receiptsRemoved: number;
  tenanciesRemoved: number;
}

export async function removeVecoPushDemo(pool: Pool): Promise<RemoveSummary> {
  return inTransaction(pool, async (q) => {
    const ids = (await q.query<{ id: string }>('SELECT id FROM receipts WHERE notes = $1', [DEMO_MARKER])).rows.map((r) => r.id);
    if (ids.length > 0) {
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
    await q.query('DELETE FROM veco_staff_link WHERE updated_by = $1', [DEMO_MARKER]);
    return { receiptsRemoved: ids.length, tenanciesRemoved: tenancies.length };
  });
}

async function cli(argv: string[]): Promise<number> {
  const [command, flag, value] = argv;
  const usage = command === 'seed' ? flag === '--user' && Boolean(value) : command === 'remove' && argv.length === 1;
  if (!usage) {
    process.stderr.write('Usage: demo-seed.ts seed --user <email> | remove\n');
    return 2;
  }
  const config = loadConfig();
  if (config.nodeEnv === 'production') throw new Error('Demo seed refuses to run in production');
  assertLocalDatabase(config.databaseUrl);
  const pool = createPool({ databaseUrl: config.databaseUrl, hashKey: config.hashKey, max: 2 }, createLogger({ level: 'silent' }));
  try {
    const summary = command === 'seed' ? await seedVecoPushDemo(pool, { userEmail: value! }) : await removeVecoPushDemo(pool);
    process.stdout.write(`${JSON.stringify({ command, ...summary })}\n`);
    return 0;
  } finally {
    await pool.end();
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
