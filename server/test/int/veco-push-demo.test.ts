/**
 * The demo seed and a full push over the SQL-text fake VECO, against Postgres. No real VECO / MCP endpoint is
 * called and VECO_RW_MCP_URL is never read.
 */
import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createApp } from '../../src/api/app.js';
import { CSRF_HEADER, CSRF_HEADER_VALUE, SESSION_COOKIE } from '../../src/api/auth/middleware.js';
import { loadConfig } from '../../src/config/env.js';
import { createPool, type Pool } from '../../src/db/pool.js';
import { createLogger } from '../../src/lib/logger.js';
import { upsertUser } from '../../src/services/auth.service.js';
import { DEMO_AMOUNT, DEMO_DATE, DEMO_FAKE_SEED, DEMO_MARKER, DEMO_TIDS } from '../../src/services/veco-push/demo-data.js';
import { removeVecoPushDemo, seedVecoPushDemo } from '../../src/services/veco-push/demo-seed.js';
import { createFakeVecoSql, type FakeVecoSql } from '../../src/services/veco-push/fake-veco-sql.js';
import { createSqlGateway } from '../../src/services/veco-push/gateway.js';

const PASSWORD = 'correct-horse-battery';
const config = loadConfig();
const logger = createLogger({ level: 'silent' });
const email = `accounts-veco-demo-${randomUUID().slice(0, 8)}@example.test`;
const TABLES = ['receipts', 'tenancies', 'tenants', 'properties', 'external_refs', 'veco_push_batch', 'veco_staff_link'] as const;
let pool: Pool;
let cookie = '';
let fake: FakeVecoSql;
let snapshot: Record<string, number> = {};

const app = () =>
  createApp({
    config,
    pool,
    logger,
    vecoPush: { gateway: createSqlGateway(fake), now: () => new Date('2026-10-14T13:17:06Z') },
  });
const get = (path: string) => request(app()).get(path).set('Cookie', cookie);
const send = (method: 'post' | 'delete', path: string) =>
  request(app())[method](path).set('Cookie', cookie).set(CSRF_HEADER, CSRF_HEADER_VALUE);

const counts = async (): Promise<Record<string, number>> => {
  const out: Record<string, number> = {};
  for (const t of TABLES) out[t] = (await pool.query<{ n: number }>(`SELECT count(*)::int AS n FROM ${t}`)).rows[0]!.n;
  return out;
};
const demoPending = async () => {
  const rows = ((await get('/api/vico/pending')).body as { rows: { receiptId: string; tid: string; amount: string; receivedOn: string }[] }).rows;
  return rows.filter((r) => (DEMO_TIDS as readonly string[]).includes(r.tid));
};

beforeAll(async () => {
  pool = createPool({ databaseUrl: config.databaseUrl, hashKey: config.hashKey, max: 4 }, logger);
  fake = createFakeVecoSql(DEMO_FAKE_SEED);
  await pool.query("DELETE FROM integration_settings WHERE system = 'vico'");
  await removeVecoPushDemo(pool);
  await upsertUser(pool, { email, fullName: 'Demo accounts', role: 'accounts', password: PASSWORD });
  const res = await request(app()).post('/api/auth/login').set(CSRF_HEADER, CSRF_HEADER_VALUE).send({ email, password: PASSWORD });
  cookie = (res.headers['set-cookie'] as unknown as string[]).find((c) => c.startsWith(`${SESSION_COOKIE}=`))!.split(';')[0]!;
  snapshot = await counts();
});

afterAll(async () => {
  await removeVecoPushDemo(pool);
  await pool?.end();
});

describe('VECO push demo data', () => {
  it('seed creates three £1.00 receipts dated 2026-10-14 that wait in /api/vico/pending', async () => {
    const summary = await seedVecoPushDemo(pool, { userEmail: email });
    expect(summary).toMatchObject({ receiptsCreated: 3, receiptsWaiting: 3 });
    const waiting = await demoPending();
    expect(waiting.map((r) => r.tid).sort()).toEqual([...DEMO_TIDS].sort());
    for (const r of waiting) expect(r).toMatchObject({ amount: DEMO_AMOUNT, receivedOn: DEMO_DATE });
  });

  it('seeding twice still leaves exactly three waiting demo receipts', async () => {
    const again = await seedVecoPushDemo(pool, { userEmail: email });
    expect(again).toMatchObject({ receiptsCreated: 0, receiptsWaiting: 3 });
    expect(await demoPending()).toHaveLength(3);
    const marked = await pool.query('SELECT 1 FROM receipts WHERE notes = $1', [DEMO_MARKER]);
    expect(marked.rowCount).toBe(3);
  });

  it('preview marks all three ready, none held', async () => {
    const ids = (await demoPending()).map((r) => r.receiptId);
    const res = await send('post', '/api/veco-push/preview').send({ receiptIds: ids });
    expect(res.status).toBe(200);
    expect(res.body.ready).toHaveLength(3);
    expect(res.body.held).toHaveLength(0);
  });

  it('push, verify and delete the three through the real gateway over the fake', async () => {
    const ids = (await demoPending()).map((r) => r.receiptId);
    const pushed = await send('post', '/api/veco-push/pushes').send({ idempotencyKey: randomUUID(), receiptIds: ids, departments: {} });
    expect(pushed.status).toBe(201);
    expect(pushed.body.batch).toMatchObject({ status: 'verified', receipts: 3, total: '3.00' });
    expect(pushed.body.verify.ok).toBe(true);
    expect(fake.transactions.size).toBe(3);
    expect(fake.allocations.size).toBe(3);
    expect(fake.batches.every((b) => !/\bCOMMIT\b|\bBEGIN\s+TRAN/i.test(b))).toBe(true);

    const deleted = await send('delete', `/api/veco-push/batches/${pushed.body.batch.id as string}`);
    expect(deleted.status).toBe(200);
    expect(deleted.body.remaining).toEqual({ transactions: 0, allocations: 0, total: '0.00' });
    expect(fake.transactions.size).toBe(0);
    expect(await demoPending()).toHaveLength(3);
  });

  it('seed refuses different Vico bank settings', async () => {
    await pool.query("UPDATE integration_settings SET value = '11-11-11' WHERE system = 'vico' AND key = 'sort_code'");
    try {
      await expect(seedVecoPushDemo(pool, { userEmail: email })).rejects.toThrow('Vico settings are 11-11-11/43789276; set 20-79-06 / 43789276 first');
      const kept = await pool.query("SELECT value FROM integration_settings WHERE system = 'vico' AND key = 'sort_code'");
      expect(kept.rows[0].value).toBe('11-11-11');
    } finally {
      await pool.query("UPDATE integration_settings SET value = '20-79-06' WHERE system = 'vico' AND key = 'sort_code'");
    }
  });

  it('remove deletes only demo rows', async () => {
    const summary = await removeVecoPushDemo(pool);
    expect(summary.receiptsRemoved).toBe(3);
    expect(await counts()).toEqual(snapshot);
    expect((await pool.query('SELECT 1 FROM receipts WHERE notes = $1', [DEMO_MARKER])).rowCount).toBe(0);
    expect((await pool.query('SELECT 1 FROM veco_staff_link WHERE updated_by = $1', [DEMO_MARKER])).rowCount).toBe(0);
    expect((await pool.query("SELECT 1 FROM properties WHERE property_ref LIKE 'DEMO-VECO-%'")).rowCount).toBe(0);
    expect((await pool.query("SELECT 1 FROM branches WHERE code = 'DEMO-VECO'")).rowCount).toBe(0);
  });
});
