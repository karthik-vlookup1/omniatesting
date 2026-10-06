/** agentOS tenant seed: fixture loads, bad rows rejected whole, idempotent reseed, tenancy link by tid. Synthetic data only. */
import { readFileSync } from 'node:fs';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { loadConfig } from '../../src/config/env.js';
import { createPool, type Pool } from '../../src/db/pool.js';
import { syncTenancies } from '../../src/jobs/veco-sync/sync.js';
import { createLogger } from '../../src/lib/logger.js';
import { AgentosSeedError } from '../../src/domain/agentos/types.js';
import { seedAgentosTenants } from '../../src/services/agentos/seed.js';
import { vecoRows } from '../fixtures/veco-rows.js';

const config = loadConfig();
const keys = { hashKey: config.hashKey, encryptionKey: config.encryptionKey };
let pool: Pool;
const csv = readFileSync(new URL('../../../fixtures/agentos/tenants.csv', import.meta.url), 'utf8');
const [header, ...dataLines] = csv.trim().split('\n') as [string, ...string[]];
const withRow = (i: number, from: string, to: string) =>
  [header, ...dataLines.map((l, j) => (j === i ? l.replace(from, to) : l))].join('\n') + '\n';
const count = async () => Number(((await pool.query('SELECT count(*) AS n FROM agentos_tenants')).rows[0] as { n: string }).n);
const reject = async (text: string) => {
  const err = await seedAgentosTenants(pool, text).catch((e: unknown) => e);
  expect(err).toBeInstanceOf(AgentosSeedError);
  return err as AgentosSeedError;
};

beforeAll(async () => {
  pool = createPool({ databaseUrl: config.databaseUrl, hashKey: config.hashKey, max: 4 }, createLogger({ level: 'silent' }));
  await pool.query('DELETE FROM agentos_tenants');
});

afterAll(async () => {
  await pool?.query('DELETE FROM agentos_tenants');
  await pool?.query("DELETE FROM audit_log WHERE table_name = 'agentos_tenants'");
  await pool?.end();
});

describe('agentOS tenant seed', () => {
  it('loads the 12 fixture rows with tenancy_id null when no tenancy has that TID', async () => {
    const r = await seedAgentosTenants(pool, csv);
    expect(r).toMatchObject({ rows: 12, created: 12, updated: 0, linked: 0 });
    expect(await count()).toBe(12);
    const { rows } = await pool.query("SELECT forename, agentos_ref FROM agentos_tenants WHERE tid = '9101'");
    expect(rows[0]).toEqual({ forename: '9101 Alex', agentos_ref: 'ten-9001' });
  });

  it('rejects a bad TID and a bad ten- ref, writing nothing', async () => {
    await pool.query('DELETE FROM agentos_tenants');
    const e1 = await reject(withRow(2, '9103,ten-9003', '91x3,ten-9003'));
    expect(e1.errors.map((e) => e.field)).toContain('TID');
    const e2 = await reject(withRow(4, 'ten-9005', 'tenant-9005'));
    expect(e2.errors).toContainEqual({ line: 6, field: 'Tenant ID', reason: 'must look like ten-<n>' });
    expect(await count()).toBe(0);
  });

  it('reseed is idempotent', async () => {
    await seedAgentosTenants(pool, csv);
    const again = await seedAgentosTenants(pool, csv);
    expect(again).toMatchObject({ rows: 12, created: 0, updated: 0 });
    expect(await count()).toBe(12);
  });

  it('links tenancy_id when tenancies.tid matches, picked up on reseed', async () => {
    await syncTenancies(pool, vecoRows(1), { keys, force: true });
    const { rows: t } = await pool.query<{ id: string; tid: string }>('SELECT id, tid FROM tenancies LIMIT 1');
    const tenancy = t[0]!;
    await pool.query("UPDATE tenancies SET tid = '9101' WHERE id = $1", [tenancy.id]);
    try {
      const r = await seedAgentosTenants(pool, csv);
      expect(r).toMatchObject({ created: 0, updated: 1, linked: 1 });
      const { rows } = await pool.query('SELECT tid, tenancy_id FROM agentos_tenants WHERE tenancy_id IS NOT NULL');
      expect(rows).toEqual([{ tid: '9101', tenancy_id: tenancy.id }]);
    } finally {
      await pool.query('UPDATE tenancies SET tid = $1 WHERE id = $2', [tenancy.tid, tenancy.id]);
    }
  });
});
