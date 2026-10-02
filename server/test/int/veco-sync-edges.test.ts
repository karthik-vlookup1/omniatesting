/**
 * Veco sync edge cases (senior-tester): concurrency lock, rejected rows vs ending, zero rent,
 * NI changes, search escaping. Synthetic data only.
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { loadConfig } from '../../src/config/env.js';
import { createPool, type Pool } from '../../src/db/pool.js';
import { createLogger } from '../../src/lib/logger.js';
import { SyncRefusedError, syncTenancies, type SyncOptions } from '../../src/jobs/veco-sync/sync.js';
import { searchTenancies } from '../../src/services/tenancy/tenancy.service.js';
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

beforeAll(() => {
  pool = createPool({ databaseUrl: config.databaseUrl, hashKey: config.hashKey, max: 4 }, createLogger({ level: 'silent' }));
});

beforeEach(async () => {
  await pool.query('TRUNCATE rent_schedules, tenancy_tenants, tenancies, tenants, property_units, properties, branches CASCADE');
});

afterAll(async () => {
  await pool?.end();
});

describe('concurrency', () => {
  it('a second sync while one holds the lock is refused and writes nothing', async () => {
    const holder = await pool.connect();
    try {
      await holder.query('BEGIN');
      await holder.query('SELECT pg_advisory_xact_lock(7102001)');
      await expect(sync(vecoRows(3))).rejects.toThrow(/already running/);
      expect(await count('SELECT count(*) FROM tenancies')).toBe(0);
    } finally {
      await holder.query('ROLLBACK');
      holder.release();
    }
    const s = await sync(vecoRows(3));
    expect(s.tenancies.inserted).toBe(3);
  });

  it('two simultaneous syncs: at most one succeeds, no duplicates', async () => {
    const results = await Promise.allSettled([sync(vecoRows(5)), sync(vecoRows(5))]);
    const ok = results.filter((r) => r.status === 'fulfilled');
    expect(ok.length).toBeGreaterThanOrEqual(1);
    for (const r of results) {
      if (r.status === 'rejected') expect(r.reason).toBeInstanceOf(SyncRefusedError);
    }
    expect(await count('SELECT count(*) FROM tenancies')).toBe(5);
    expect(await count('SELECT count(*) FROM rent_schedules')).toBe(5);
  });
});

describe('rejected rows', () => {
  it('a still-active tenancy whose Veco row fails validation is not ended', async () => {
    await sync(vecoRows(10));
    const s = await sync([...vecoRows(9), vecoRow(10, { frequency: 'Annually' })]);
    expect(s.rejected).toHaveLength(1);
    expect(s.tenancies.ended).toBe(0);
    expect(await count("SELECT count(*) FROM tenancies WHERE tid = 'T9010' AND status = 'active'")).toBe(1);
  });
});

describe('money', () => {
  it('zero rent is stored as 0.00 and a repeat run changes nothing', async () => {
    await sync([vecoRow(1, { rent: 0 })]);
    expect(await count("SELECT count(*) FROM rent_schedules WHERE amount = 0 AND effective_to IS NULL")).toBe(1);
    const before = await count('SELECT count(*) FROM audit_log');
    const s = await sync([vecoRow(1, { rent: 0 })]);
    expect(s.rentChanges).toBe(0);
    expect(await count('SELECT count(*) FROM audit_log')).toBe(before);
  });

  it('sub-penny noise in Veco does not cause a rent change', async () => {
    await sync([vecoRow(1, { rent: 346.1499 })]);
    const s = await sync([vecoRow(1, { rent: 346.15 })]);
    expect(s.rentChanges).toBe(0);
  });
});

describe('NI changes', () => {
  it('a corrected NI is re-protected once, then stays quiet; summary never carries the NI', async () => {
    await sync([vecoRow(1, { ni: 'AB100001C' })]);
    const s = await sync([vecoRow(1, { ni: 'AB100009C' })]);
    expect(s.tenants.updated).toBe(1);
    expect(JSON.stringify(s)).not.toMatch(/AB10000\dC/);
    expect(await count("SELECT count(*) FROM tenants WHERE ni_hash = secure_hash('AB100009C') AND ni_last3 = '09C'")).toBe(1);
    const again = await sync([vecoRow(1, { ni: 'AB100009C' })]);
    expect(again.tenants.updated).toBe(0);
  });
});

describe('search escaping', () => {
  it('treats _, backslash and quotes as literals and never errors', async () => {
    await sync([vecoRow(1, { tenantName: "Ann O'Brien" }), vecoRow(2, { tenantName: 'Bob Smith' })]);
    const search = (q: string) => searchTenancies(pool, keys.hashKey, { q, status: 'all' });
    expect(await search('__')).toHaveLength(0);
    expect(await search('\\\\')).toHaveLength(0);
    expect((await search("O'Brien")).map((t) => t.tid)).toEqual(['T9001']);
    expect(await search("'; DROP TABLE tenancies; --")).toHaveLength(0);
    expect(await count('SELECT count(*) FROM tenancies')).toBe(2);
  });
});
