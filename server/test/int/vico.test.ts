/**
 * Vico export end to end: settings, pending receipts from v_vico_export, export once (external_refs),
 * history and re-download, concurrency, and who may do what. Tenancies come from synthetic Veco rows.
 */
import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createApp } from '../../src/api/app.js';
import { CSRF_HEADER, CSRF_HEADER_VALUE, SESSION_COOKIE } from '../../src/api/auth/middleware.js';
import { loadConfig } from '../../src/config/env.js';
import { createPool, type Pool } from '../../src/db/pool.js';
import { syncTenancies } from '../../src/jobs/veco-sync/sync.js';
import { createLogger } from '../../src/lib/logger.js';
import { upsertUser, type Role } from '../../src/services/auth.service.js';
import type { PendingReceipt } from '../../src/services/vico/vico.service.js';
import { vecoRows } from '../fixtures/veco-rows.js';

const PASSWORD = 'correct-horse-battery';
const config = loadConfig();
const logger = createLogger({ level: 'silent' });
const run = randomUUID().slice(0, 8);
const started = new Date();
let pool: Pool;
const cookies = {} as Record<Role, string>;
const bankIds: Record<string, string> = {};

const fixture = (name: string) => readFileSync(new URL(`../../../fixtures/banks/${name}`, import.meta.url));
const app = () => createApp({ config, pool, logger });

async function signIn(role: Role): Promise<string> {
  const email = `${role}-vico-${run}@example.test`;
  await upsertUser(pool, { email, fullName: `Vico ${role}`, role, password: PASSWORD });
  const res = await request(app()).post('/api/auth/login').set(CSRF_HEADER, CSRF_HEADER_VALUE).send({ email, password: PASSWORD });
  return (res.headers['set-cookie'] as unknown as string[]).find((c) => c.startsWith(`${SESSION_COOKIE}=`))!.split(';')[0]!;
}

const get = (path: string, role: Role = 'accounts') => request(app()).get(path).set('Cookie', cookies[role]);
const post = (path: string, role: Role = 'accounts') =>
  request(app()).post(path).set('Cookie', cookies[role]).set(CSRF_HEADER, CSRF_HEADER_VALUE);
const put = (path: string, role: Role = 'admin') =>
  request(app()).put(path).set('Cookie', cookies[role]).set(CSRF_HEADER, CSRF_HEADER_VALUE);
const upload = (code: string, name: string, content?: string) =>
  post('/api/imports', 'staff')
    .field('bankAccountId', bankIds[code]!)
    .attach('file', content === undefined ? fixture(name) : Buffer.from(content), name);
const pending = async () =>
  (await get('/api/vico/pending')).body as { rows: PendingReceipt[]; total: number; totalAmount: string };
const vicoRefs = async () =>
  (await pool.query<{ n: number }>("SELECT count(*)::int AS n FROM external_refs WHERE system = 'vico'")).rows[0]!.n;

beforeAll(async () => {
  pool = createPool({ databaseUrl: config.databaseUrl, hashKey: config.hashKey, max: 6 }, logger);
  await pool.query(
    `TRUNCATE allocations, receipts, match_suggestions, payer_bank_accounts, payment_references, bank_transactions,
              import_batches, bank_csv_profiles, bank_accounts, external_refs,
              rent_schedules, tenancy_tenants, tenancies, tenants, property_units, properties, branches CASCADE`,
  );
  await pool.query("DELETE FROM integration_settings WHERE system = 'vico'");
  await syncTenancies(pool, vecoRows(20), {
    keys: { hashKey: config.hashKey, encryptionKey: config.encryptionKey },
    force: true,
  });
  for (const role of ['admin', 'accounts', 'staff', 'readonly'] as const) cookies[role] = await signIn(role);
  await post('/api/bank-accounts/defaults', 'admin');
  const banks = (await get('/api/bank-accounts')).body.bankAccounts as { code: string; id: string }[];
  for (const b of banks) bankIds[b.code] = b.id;
});

afterAll(async () => {
  await pool?.end();
});

describe('permissions and settings', () => {
  it('only admin and accounts reach /api/vico', async () => {
    expect((await get('/api/vico/pending', 'staff')).status).toBe(403);
    expect((await get('/api/vico/pending', 'readonly')).status).toBe(403);
    expect((await post('/api/vico/exports', 'staff').send({})).status).toBe(403);
    expect((await get('/api/vico/pending', 'accounts')).status).toBe(200);
    expect((await get('/api/vico/pending', 'admin')).status).toBe(200);
  });

  it('exporting before the sort code and account are set is refused clearly', async () => {
    expect((await get('/api/vico/settings')).body.settings).toEqual({ sortCode: null, accountNumber: null });
    const res = await post('/api/vico/exports').send({});
    expect(res.status).toBe(409);
    expect(res.body.error.message).toContain('sort code and account number');
  });

  it('only admin sets the constants, and they are validated and normalised', async () => {
    expect((await put('/api/vico/settings', 'accounts').send({ sortCode: '123456', accountNumber: '12345678' })).status).toBe(403);
    expect((await put('/api/vico/settings').send({ sortCode: '12345', accountNumber: '12345678' })).status).toBe(400);
    expect((await put('/api/vico/settings').send({ sortCode: '123456', accountNumber: '1234567' })).status).toBe(400);
    expect((await put('/api/vico/settings').send({ sortCode: '123456', accountNumber: '12345678', x: 1 })).status).toBe(400);
    const ok = await put('/api/vico/settings').send({ sortCode: '000099', accountNumber: '00009999' });
    expect(ok.status).toBe(200);
    expect(ok.body.settings).toEqual({ sortCode: '00-00-99', accountNumber: '00009999' });
    expect((await get('/api/vico/settings')).body.settings).toEqual({ sortCode: '00-00-99', accountNumber: '00009999' });
  });
});

describe('export', () => {
  let firstFile = '';
  let firstId = '';

  it('lists confirmed receipts not yet exported, with an exact total', async () => {
    expect((await pending()).total).toBe(0);
    const res = await upload('HSBC', 'hsbc.csv');
    expect(res.status).toBe(201);
    const p = await pending();
    expect(p.total).toBe(res.body.matching.autoMatched);
    expect(p.total).toBeGreaterThanOrEqual(2);
    expect(p.rows.map((r) => r.tid)).toContain('T9001');
    expect(p.rows[0]).toMatchObject({ bankCode: 'HSBC' });
    expect(p.rows[0]!.receivedOn).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    const pence = p.rows.reduce((a, r) => a + Math.round(Number(r.amount) * 100), 0);
    expect(p.totalAmount).toBe((pence / 100).toFixed(2));
  });

  it('exports chosen receipts as a CSV and marks each one exported once', async () => {
    const before = await pending();
    const one = before.rows.find((r) => r.tid === 'T9001')!;
    const res = await post('/api/vico/exports').send({ receiptIds: [one.receiptId] });
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toContain('text/csv');
    expect(res.headers['content-disposition']).toMatch(/^attachment; filename="vico-\d{8}-\d{6}\.csv"$/);
    expect(res.headers['x-vico-rows']).toBe('1');
    expect(res.text).toBe(`TID,Amount,Sort Code,Account Number\r\nT9001,${Number(one.amount).toFixed(2)},00-00-99,00009999\r\n`);
    firstFile = res.text;
    firstId = res.headers['x-vico-export-id'] as string;

    const after = await pending();
    expect(after.total).toBe(before.total - 1);
    expect(after.rows.map((r) => r.receiptId)).not.toContain(one.receiptId);

    const again = await post('/api/vico/exports').send({ receiptIds: [one.receiptId] });
    expect(again.status).toBe(409);
    expect(again.body.error.details.notPending).toEqual([one.receiptId]);
    expect(await vicoRefs()).toBe(1);
  });

  it('a request mixing pending and exported receipts exports nothing', async () => {
    const p = await pending();
    const { rows } = await pool.query<{ entity_id: string }>("SELECT entity_id FROM external_refs WHERE system = 'vico'");
    const res = await post('/api/vico/exports').send({ receiptIds: [p.rows[0]!.receiptId, rows[0]!.entity_id] });
    expect(res.status).toBe(409);
    expect((await pending()).total).toBe(p.total);
    expect(await vicoRefs()).toBe(1);
  });

  it('bad bodies are rejected', async () => {
    expect((await post('/api/vico/exports').send({ receiptIds: [] })).status).toBe(400);
    expect((await post('/api/vico/exports').send({ receiptIds: ['nope'] })).status).toBe(400);
    expect((await post('/api/vico/exports').send({ all: true })).status).toBe(400);
    expect((await post('/api/vico/exports').send({ receiptIds: [randomUUID()] })).status).toBe(409);
  });

  it('exports everything still pending, then has nothing left', async () => {
    const p = await pending();
    const res = await post('/api/vico/exports').send({});
    expect(res.status).toBe(200);
    expect(res.headers['x-vico-rows']).toBe(String(p.total));
    expect(res.headers['x-vico-total']).toBe(p.totalAmount);
    const lines = res.text.trimEnd().split('\r\n');
    expect(lines).toHaveLength(p.total + 1);
    for (const l of lines.slice(1)) expect(l).toMatch(/^T\d{3,6},\d+\.\d{2},00-00-99,00009999$/);

    expect((await pending()).total).toBe(0);
    const none = await post('/api/vico/exports').send({});
    expect(none.status).toBe(409);
    expect(none.body.error.message).toContain('Nothing to export');
  });

  it('keeps a history, and an earlier file downloads again unchanged', async () => {
    const res = await get('/api/vico/exports');
    expect(res.status).toBe(200);
    const exports = res.body.exports as { exportId: string; rows: number; totalAmount: string; fileName: string }[];
    expect(exports).toHaveLength(2);
    expect(exports[1]!.exportId).toBe(firstId); // newest first
    expect(exports[1]!.rows).toBe(1);

    const file = await get(`/api/vico/exports/${firstId}/file`);
    expect(file.status).toBe(200);
    expect(file.text).toBe(firstFile);
    expect(file.headers['content-disposition']).toContain(exports[1]!.fileName);

    expect((await get(`/api/vico/exports/${randomUUID()}/file`)).status).toBe(404);
    expect((await get('/api/vico/exports/not-a-uuid/file')).status).toBe(404);
  });

  it('two exports at the same time never send a receipt twice', async () => {
    const csv =
      'Date,Description,Paid in,Paid out,Balance\n' +
      Array.from({ length: 6 }, (_, i) => `1${i}/09/2026,"COUNCIL HB T90${i + 10} RENT",650.00,,1.00`).join('\n') +
      '\n';
    expect((await upload('HSBC', 'vico-race.csv', csv)).status).toBe(201);
    expect((await pending()).total).toBe(6);
    const before = await vicoRefs();

    const [a, b] = await Promise.all([post('/api/vico/exports').send({}), post('/api/vico/exports').send({})]);
    expect([a.status, b.status].sort()).toEqual([200, 409]);
    const winner = a.status === 200 ? a : b;
    expect(winner.headers['x-vico-rows']).toBe('6');
    expect(await vicoRefs()).toBe(before + 6);
    const { rows } = await pool.query<{ n: number }>(
      `SELECT count(*)::int AS n FROM (SELECT entity_id FROM external_refs WHERE system = 'vico'
         GROUP BY entity_id HAVING count(*) > 1) d`,
    );
    expect(rows[0]!.n).toBe(0);
  });

  it('exporting leaves the receipts themselves untouched', async () => {
    const { rows } = await pool.query<{ n: number }>(
      "SELECT count(*)::int AS n FROM audit_log WHERE table_name = 'receipts' AND action = 'UPDATE' AND changed_at >= $1",
      [started],
    );
    expect(rows[0]!.n).toBe(0);
  });
});
