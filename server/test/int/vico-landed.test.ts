/** VECO landed check: read-only matching of a Vico export against SLP rows, saved per export. */
import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createApp } from '../../src/api/app.js';
import { CSRF_HEADER, CSRF_HEADER_VALUE, SESSION_COOKIE } from '../../src/api/auth/middleware.js';
import { loadConfig } from '../../src/config/env.js';
import { createPool, type Pool } from '../../src/db/pool.js';
import { syncTenancies } from '../../src/jobs/veco-sync/sync.js';
import { VecoSourceError, type SqlSource } from '../../src/jobs/veco-sync/mcp-client.js';
import { createLogger } from '../../src/lib/logger.js';
import { upsertUser, type Role } from '../../src/services/auth.service.js';
import { SNAPSHOT_SQL } from '../../src/services/vico/landed.js';
import { vecoRows } from '../fixtures/veco-rows.js';

const PASSWORD = 'correct-horse-battery';
const config = loadConfig();
const logger = createLogger({ level: 'silent' });
const run = randomUUID().slice(0, 8);
let pool: Pool;
const cookies = {} as Record<Role, string>;
let tenancies: { id: string; tid: string }[] = [];
let hsbc = '';
let exportId = '';
const recorded: string[] = [];

const fake: SqlSource = {
  async queryRows(sql) {
    recorded.push(sql);
    if (sql === SNAPSHOT_SQL) return [{ refreshedAt: '2026-10-16 03:30' }];
    return [{ tid: tenancies[0]!.tid, txDate: '2026-09-11', amount: 50 }];
  },
};
const app = (vecoSource?: SqlSource) => createApp({ config, pool, logger, ...(vecoSource ? { vecoSource } : {}) });
async function signIn(role: Role): Promise<string> {
  const email = `${role}-vico-landed-${run}@example.test`;
  await upsertUser(pool, { email, fullName: `Vico ${role}`, role, password: PASSWORD });
  const res = await request(app()).post('/api/auth/login').set(CSRF_HEADER, CSRF_HEADER_VALUE).send({ email, password: PASSWORD });
  return (res.headers['set-cookie'] as unknown as string[]).find((c) => c.startsWith(`${SESSION_COOKIE}=`))!.split(';')[0]!;
}
const get = (path: string, role: Role = 'accounts', a = app()) => request(a).get(path).set('Cookie', cookies[role]);
const send = (method: 'post' | 'put', path: string, role: Role = 'accounts', a = app()) =>
  request(a)[method](path).set('Cookie', cookies[role]).set(CSRF_HEADER, CSRF_HEADER_VALUE);

async function bankReceipt(tid: string, amount: string, day: number): Promise<string> {
  const csv = `Date,Description,Paid in,Paid out,Balance
${day}/09/2026,"COUNCIL HB ${tid} RENT",${amount},,1.00
`;
  const res = await send('post', '/api/imports', 'staff').field('bankAccountId', hsbc).attach('file', Buffer.from(csv), `e${day}.csv`);
  expect(res.status).toBe(201);
  const { rows } = await pool.query<{ id: string }>(
    "SELECT r.id FROM receipts r JOIN tenancies t ON t.id = r.tenancy_id WHERE t.tid = $1 AND r.status = 'active' ORDER BY r.created_at DESC LIMIT 1",
    [tid],
  );
  return rows[0]!.id;
}

async function manualReceipt(tenancyId: string, amount: string): Promise<string> {
  const { rows } = await pool.query<{ id: string }>(
    `INSERT INTO receipts (tenancy_id, payer, amount, received_on, matched_via)
     VALUES ($1, 'tenant', $2, '2026-09-01', 'manual') RETURNING id`,
    [tenancyId, amount],
  );
  return rows[0]!.id;
}

beforeAll(async () => {
  pool = createPool({ databaseUrl: config.databaseUrl, hashKey: config.hashKey, max: 4 }, logger);
  await pool.query(
    `TRUNCATE allocations, receipts, match_suggestions, payer_bank_accounts, payment_references, bank_transactions,
              import_batches, bank_csv_profiles, bank_accounts, external_refs, vico_landed_checks,
              rent_schedules, tenancy_tenants, tenancies, tenants, property_units, properties, branches CASCADE`,
  );
  await pool.query("DELETE FROM integration_settings WHERE system = 'vico'");
  await syncTenancies(pool, vecoRows(5), { keys: { hashKey: config.hashKey, encryptionKey: config.encryptionKey }, force: true });
  tenancies = (await pool.query<{ id: string; tid: string }>('SELECT id, tid FROM tenancies ORDER BY tid LIMIT 3')).rows;
  for (const role of ['admin', 'accounts', 'staff'] as const) cookies[role] = await signIn(role);
  await send('post', '/api/bank-accounts/defaults', 'admin');
  hsbc = ((await get('/api/bank-accounts')).body.bankAccounts as { code: string; id: string }[]).find((b) => b.code === 'HSBC')!.id;
  expect((await send('put', '/api/vico/settings', 'admin').send({ sortCode: '11-22-33', accountNumber: '44556677' })).status).toBe(200);
  const a = await bankReceipt(tenancies[0]!.tid, '50.00', 11);
  const b = await manualReceipt(tenancies[1]!.id, '12.30');
  const res = await send('post', '/api/vico/exports').send({ receiptIds: [a, b] });
  expect(res.status).toBe(200);
  exportId = res.headers['x-vico-export-id'] as string;
});

afterAll(async () => {
  await pool?.end();
});

describe('Vico landed check', () => {
  it('matches, saves, lists and overwrites', async () => {
    const a = app(fake);
    const res = await send('post', `/api/vico/exports/${exportId}/landed-check`, 'accounts', a);
    expect(res.status).toBe(200);
    const check = res.body.landedCheck;
    expect(check.landed).toBe(1);
    expect(check.rows).toBe(2);
    expect(check.snapshotRefreshedAt).toBe('2026-10-16 03:30');
    expect(check.banks).toMatchObject([
      { bankCode: 'HSBC', landed: 1 },
      { bankCode: null, landed: 0 },
    ]);
    const first = await pool.query<{ id: string }>('SELECT id FROM vico_landed_checks WHERE export_id = $1', [exportId]);
    const firstId = first.rows[0]!.id;
    const list = (await get('/api/vico/exports', 'accounts', a)).body.exports as { exportId: string; landedCheck: unknown }[];
    expect(list.find((e) => e.exportId === exportId)!.landedCheck).toEqual(check);

    expect((await send('post', `/api/vico/exports/${exportId}/landed-check`, 'accounts', a)).status).toBe(200);
    const second = await pool.query<{ id: string }>('SELECT id FROM vico_landed_checks WHERE export_id = $1', [exportId]);
    expect(second.rowCount).toBe(1);
    expect(second.rows[0]!.id).toBe(firstId);
    expect(recorded.length).toBeGreaterThan(0);
    for (const sql of recorded) expect(sql).toMatch(/^SELECT /);
  });

  it('409s when VECO is not configured', async () => {
    const res = await send('post', `/api/vico/exports/${exportId}/landed-check`);
    expect(res.status).toBe(409);
    expect(res.body.error.details.reason).toBe('veco_not_configured');
  });

  it('404s for an unknown or malformed export id', async () => {
    const a = app(fake);
    expect((await send('post', `/api/vico/exports/${randomUUID()}/landed-check`, 'accounts', a)).status).toBe(404);
    expect((await send('post', '/api/vico/exports/not-a-uuid/landed-check', 'accounts', a)).status).toBe(404);
  });

  it('502s when VECO fails and saves nothing new', async () => {
    await pool.query('DELETE FROM vico_landed_checks');
    const bad: SqlSource = {
      async queryRows() {
        throw new VecoSourceError('Veco query failed: x');
      },
    };
    const res = await send('post', `/api/vico/exports/${exportId}/landed-check`, 'accounts', app(bad));
    expect(res.status).toBe(502);
    expect(res.body.error.code).toBe('veco_unavailable');
    expect((await pool.query('SELECT 1 FROM vico_landed_checks')).rowCount).toBe(0);
  });

  it('forbids staff', async () => {
    const res = await send('post', `/api/vico/exports/${exportId}/landed-check`, 'staff', app(fake));
    expect(res.status).toBe(403);
  });
});
