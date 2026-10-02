/**
 * Veco -> Postgres tenancy sync against a real database, with synthetic warehouse rows.
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { loadConfig } from '../../src/config/env.js';
import { createPool, type Pool } from '../../src/db/pool.js';
import { decrypt } from '../../src/lib/crypto.js';
import { createLogger } from '../../src/lib/logger.js';
import { SyncRefusedError, syncTenancies, type SyncOptions } from '../../src/jobs/veco-sync/sync.js';
import { vecoRow, vecoRows } from '../fixtures/veco-rows.js';

const config = loadConfig();
const keys = { hashKey: config.hashKey, encryptionKey: config.encryptionKey };
let pool: Pool;

const sync = (rows: unknown[], opts: Partial<SyncOptions> = {}) =>
  syncTenancies(pool, rows, { keys, today: '2026-10-02', ...opts });

async function count(sql: string, params: unknown[] = []): Promise<number> {
  const { rows } = await pool.query<{ n: number }>(`SELECT (${sql})::int AS n`, params);
  return rows[0]!.n;
}

async function tenancy(tid: string) {
  const { rows } = await pool.query<{ status: string; end_date: string | null; management_type: string; unit_ref: string }>(
    `SELECT t.status::text, to_char(t.end_date, 'YYYY-MM-DD') AS end_date, t.management_type::text, u.unit_ref
       FROM tenancies t JOIN property_units u ON u.id = t.unit_id WHERE t.tid = $1`,
    [tid],
  );
  return rows[0];
}

beforeAll(() => {
  pool = createPool({ databaseUrl: config.databaseUrl, hashKey: config.hashKey, max: 4 }, createLogger({ level: 'silent' }));
});

beforeEach(async () => {
  await pool.query(
    'TRUNCATE rent_schedules, tenancy_tenants, tenancies, tenants, property_units, properties, branches CASCADE',
  );
});

afterAll(async () => {
  await pool?.end();
});

describe('first sync', () => {
  it('creates branches, buildings, rooms, tenants, tenancies, lead links and rent schedules', async () => {
    const s = await sync(vecoRows(12));
    expect(s).toMatchObject({
      fetched: 12,
      rejected: [],
      branches: { inserted: 2 },
      properties: { inserted: 2, updated: 0 },
      units: { inserted: 12 },
      tenants: { inserted: 12, updated: 0 },
      tenancies: { inserted: 12, updated: 0, reactivated: 0, ended: 0 },
      rentChanges: 0,
      ni: { missing: 0, invalid: 0, conflicts: 0 },
      managementType: { IRG: 4, RG: 8, defaultedToRG: 0 },
    });
    expect(await count("SELECT count(*) FROM tenancies WHERE status = 'active'")).toBe(12);
    expect(await count('SELECT count(*) FROM tenancy_tenants WHERE is_lead AND left_on IS NULL')).toBe(12);
    expect(await count("SELECT count(*) FROM rent_schedules WHERE effective_to IS NULL AND amount = 650 AND frequency = 'monthly'")).toBe(12);
    expect(await tenancy('T9003')).toMatchObject({ status: 'active', management_type: 'IRG', unit_ref: 'P9000-4' });
  });

  it('stores NI as SQL-compatible hash + ciphertext + last 3, never in plain text', async () => {
    await sync([vecoRow(1, { ni: 'ab 10 00 01 c' })]);
    const { rows } = await pool.query<{ ni_hash: string; sql_hash: string; ni_encrypted: Buffer; ni_last3: string; plain: number }>(
      `SELECT ni_hash, secure_hash('AB100001C') AS sql_hash, ni_encrypted, ni_last3,
              (SELECT count(*)::int FROM tenants WHERE row_to_json(tenants)::text ILIKE '%AB100001C%') AS plain
         FROM tenants`,
    );
    const t = rows[0]!;
    expect(t.ni_hash).toBe(t.sql_hash);
    expect(t.ni_last3).toBe('01C');
    expect(decrypt(t.ni_encrypted, keys.encryptionKey, 'tenants.ni')).toBe('AB100001C');
    expect(t.plain).toBe(0);
  });

  it('records the actor in the audit log', async () => {
    await sync([vecoRow(1)], { actor: 'admin-x@example.test' });
    expect(await count("SELECT count(*) FROM audit_log WHERE table_name = 'tenancies' AND changed_by = 'admin-x@example.test'")).toBe(1);
  });
});

describe('repeat syncs', () => {
  it('a second identical run writes nothing (audit log unchanged)', async () => {
    await sync(vecoRows(12));
    const before = await count('SELECT count(*) FROM audit_log');
    const s = await sync(vecoRows(12));
    expect(s).toMatchObject({
      branches: { inserted: 0 },
      properties: { inserted: 0, updated: 0 },
      units: { inserted: 0 },
      tenants: { inserted: 0, updated: 0 },
      tenancies: { inserted: 0, updated: 0, reactivated: 0, ended: 0 },
      rentChanges: 0,
    });
    expect(await count('SELECT count(*) FROM audit_log')).toBe(before);
  });

  it('a rent change closes the old schedule yesterday and opens a new one today', async () => {
    await sync(vecoRows(5));
    const s = await sync([...vecoRows(4), vecoRow(5, { rent: 700.5, frequency: 'Four Weekly' })]);
    expect(s.rentChanges).toBe(1);
    const { rows } = await pool.query<{ amount: string; frequency: string; f: string; t: string | null }>(
      `SELECT amount::text, frequency::text, to_char(effective_from,'YYYY-MM-DD') f, to_char(effective_to,'YYYY-MM-DD') t
         FROM rent_schedules rs JOIN tenancies tn ON tn.id = rs.tenancy_id WHERE tn.tid = 'T9005' ORDER BY effective_from`,
    );
    expect(rows).toEqual([
      { amount: '650.00', frequency: 'monthly', f: '2025-04-01', t: '2026-10-01' },
      { amount: '700.50', frequency: 'four_weekly', f: '2026-10-02', t: null },
    ]);
  });

  it('a renamed tenant, moved room and new owner status are updated in place', async () => {
    await sync(vecoRows(5));
    const s = await sync([
      ...vecoRows(4),
      vecoRow(5, { tenantName: 'Renamed Person', unitRef: 'P9000-9', ohgOwned: 1 }),
    ]);
    expect(s.tenants.updated).toBe(1);
    expect(s.tenancies.updated).toBe(1);
    expect(s.units.inserted).toBe(1);
    expect(await tenancy('T9005')).toMatchObject({ unit_ref: 'P9000-9', management_type: 'IRG' });
    expect(await count("SELECT count(*) FROM tenants WHERE first_name = 'Renamed' AND last_name = 'Person'")).toBe(1);
  });

  it('a new Veco contact on a tenancy becomes lead and the old lead is closed', async () => {
    await sync([vecoRow(1)]);
    await sync([vecoRow(1, { contactPk: '22222222-0000-4000-8000-000000000001', ni: 'AB200001C', tenantName: 'New Lead' })]);
    const { rows } = await pool.query<{ last_name: string; left_on: string | null }>(
      `SELECT tn.last_name, to_char(tt.left_on,'YYYY-MM-DD') AS left_on FROM tenancy_tenants tt
         JOIN tenants tn ON tn.id = tt.tenant_id ORDER BY tt.left_on NULLS LAST`,
    );
    expect(rows).toEqual([
      { last_name: 'Tenant1', left_on: '2026-10-02' },
      { last_name: 'Lead', left_on: null },
    ]);
  });
});

describe('ending and reactivating', () => {
  it('ends tenancies missing from the feed, closing their rent schedule', async () => {
    await sync(vecoRows(10));
    const s = await sync(vecoRows(9));
    expect(s.tenancies.ended).toBe(1);
    expect(await tenancy('T9010')).toMatchObject({ status: 'ended', end_date: '2026-10-02' });
    expect(await count("SELECT count(*) FROM rent_schedules rs JOIN tenancies t ON t.id = rs.tenancy_id WHERE t.tid = 'T9010' AND rs.effective_to IS NULL")).toBe(0);
    expect(await count("SELECT count(*) FROM tenancy_tenants tt JOIN tenancies t ON t.id = tt.tenancy_id WHERE t.tid = 'T9010' AND tt.left_on = '2026-10-02'")).toBe(1);
  });

  it('reactivates an ended tenancy that reappears', async () => {
    await sync(vecoRows(10));
    await sync(vecoRows(9));
    const s = await sync(vecoRows(10));
    expect(s.tenancies.reactivated).toBe(1);
    expect(await tenancy('T9010')).toMatchObject({ status: 'active', end_date: null });
    expect(await count("SELECT count(*) FROM tenancy_tenants tt JOIN tenancies t ON t.id = tt.tenancy_id WHERE t.tid = 'T9010' AND tt.is_lead AND tt.left_on IS NULL")).toBe(1);
    // Same rent: the closed schedule is reopened, not duplicated.
    expect(await count("SELECT count(*) FROM rent_schedules rs JOIN tenancies t ON t.id = rs.tenancy_id WHERE t.tid = 'T9010'")).toBe(1);
  });

  it('a reactivated tenancy with a new rent starts it after the old schedule closed', async () => {
    await sync(vecoRows(10));
    await sync(vecoRows(9));
    const s = await sync([...vecoRows(9), vecoRow(10, { rent: 720 })]);
    expect(s.rentChanges).toBe(1);
    const { rows } = await pool.query<{ amount: string; f: string; t: string | null }>(
      `SELECT amount::text, to_char(effective_from,'YYYY-MM-DD') f, to_char(effective_to,'YYYY-MM-DD') t
         FROM rent_schedules rs JOIN tenancies tn ON tn.id = rs.tenancy_id WHERE tn.tid = 'T9010' ORDER BY effective_from`,
    );
    expect(rows).toEqual([
      { amount: '650.00', f: '2025-04-01', t: '2026-10-02' },
      { amount: '720.00', f: '2026-10-03', t: null },
    ]);
  });

  it('refuses to end more than 20% of active tenancies unless forced, changing nothing', async () => {
    await sync(vecoRows(10));
    await expect(sync(vecoRows(7))).rejects.toThrow(SyncRefusedError);
    expect(await count("SELECT count(*) FROM tenancies WHERE status = 'active'")).toBe(10);
    const s = await sync(vecoRows(7), { force: true });
    expect(s.tenancies.ended).toBe(3);
  });

  it('refuses a feed with no usable rows', async () => {
    await expect(sync([])).rejects.toThrow(/none were usable/);
    await expect(sync([{ tid: 'junk' }])).rejects.toThrow(SyncRefusedError);
  });
});

describe('data problems are counted, not guessed', () => {
  it('missing, invalid and conflicting NI numbers; missing names; rejected rows; default RG', async () => {
    const s = await sync([
      vecoRow(1, { ni: null }),
      vecoRow(2, { ni: 'NOT-AN-NI' }),
      vecoRow(3, { ni: 'AB100003C' }),
      vecoRow(4, { ni: 'AB100003C' }), // a different Veco contact with the same NI
      vecoRow(5, { tenantName: null, ohgOwned: null }),
      vecoRow(6, { tid: 'bad' }),
    ]);
    expect(s.ni).toEqual({ missing: 1, invalid: 1, conflicts: 1 });
    expect(s.namesMissing).toBe(1);
    expect(s.managementType.defaultedToRG).toBe(1);
    expect(s.rejected).toEqual([{ tid: 'bad', reason: expect.stringContaining('tid') as string }]);
    expect(await count('SELECT count(*) FROM tenancies')).toBe(5);
    // T9003 keeps its NI; T9005 has its own default one; T9004's duplicate was not stored.
    expect(await count('SELECT count(*) FROM tenants WHERE ni_hash IS NOT NULL')).toBe(2);
  });

  it('a tenancy without a Veco contact gets a tenant keyed by its TID', async () => {
    await sync([vecoRow(1, { contactPk: null })]);
    expect(await count("SELECT count(*) FROM tenants WHERE tenant_ref = 'veco-tid:T9001'")).toBe(1);
  });
});

describe('dry run', () => {
  it('reports what would change and leaves the database untouched', async () => {
    const s = await sync(vecoRows(5), { dryRun: true });
    expect(s).toMatchObject({ dryRun: true, tenancies: { inserted: 5 } });
    expect(await count('SELECT count(*) FROM tenancies')).toBe(0);
    expect(await count('SELECT count(*) FROM branches')).toBe(0);
  });
});
