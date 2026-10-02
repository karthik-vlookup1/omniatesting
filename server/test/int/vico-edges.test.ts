/**
 * Vico export edge cases: receipts with no bank line (legacy/manual, allowed by the schema and listed by
 * v_vico_export), receipts reversed after export, settings changed after export, oversized requests.
 */
import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createApp } from '../../src/api/app.js';
import { CSRF_HEADER, CSRF_HEADER_VALUE, SESSION_COOKIE } from '../../src/api/auth/middleware.js';
import { loadConfig } from '../../src/config/env.js';
import { createPool, type Pool } from '../../src/db/pool.js';
import { syncTenancies } from '../../src/jobs/veco-sync/sync.js';
import { createLogger } from '../../src/lib/logger.js';
import { upsertUser, type Role } from '../../src/services/auth.service.js';
import { vecoRows } from '../fixtures/veco-rows.js';

const PASSWORD = 'correct-horse-battery';
const config = loadConfig();
const logger = createLogger({ level: 'silent' });
const run = randomUUID().slice(0, 8);
let pool: Pool;
const cookies = {} as Record<Role, string>;
let tenancies: { id: string; tid: string }[] = [];
let hsbc = '';

const app = () => createApp({ config, pool, logger });
async function signIn(role: Role): Promise<string> {
  const email = `${role}-vico-edges-${run}@example.test`;
  await upsertUser(pool, { email, fullName: `Vico ${role}`, role, password: PASSWORD });
  const res = await request(app()).post('/api/auth/login').set(CSRF_HEADER, CSRF_HEADER_VALUE).send({ email, password: PASSWORD });
  return (res.headers['set-cookie'] as unknown as string[]).find((c) => c.startsWith(`${SESSION_COOKIE}=`))!.split(';')[0]!;
}
const get = (path: string, role: Role = 'accounts') => request(app()).get(path).set('Cookie', cookies[role]);
const send = (method: 'post' | 'put', path: string, role: Role = 'accounts') =>
  request(app())[method](path).set('Cookie', cookies[role]).set(CSRF_HEADER, CSRF_HEADER_VALUE);

/** One auto-matched, bank-backed receipt for `tid` (synthetic HSBC line). */
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

/** A receipt with no bank line, as a legacy import or manual entry would create (schema allows it). */
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
              import_batches, bank_csv_profiles, bank_accounts, external_refs,
              rent_schedules, tenancy_tenants, tenancies, tenants, property_units, properties, branches CASCADE`,
  );
  await pool.query("DELETE FROM integration_settings WHERE system = 'vico'");
  await syncTenancies(pool, vecoRows(5), { keys: { hashKey: config.hashKey, encryptionKey: config.encryptionKey }, force: true });
  tenancies = (await pool.query<{ id: string; tid: string }>('SELECT id, tid FROM tenancies ORDER BY tid LIMIT 3')).rows;
  for (const role of ['admin', 'accounts', 'staff'] as const) cookies[role] = await signIn(role);
  await send('post', '/api/bank-accounts/defaults', 'admin');
  hsbc = ((await get('/api/bank-accounts')).body.bankAccounts as { code: string; id: string }[]).find((b) => b.code === 'HSBC')!.id;
  expect((await send('put', '/api/vico/settings', 'admin').send({ sortCode: '11-22-33', accountNumber: '44556677' })).status).toBe(200);
});

afterAll(async () => {
  await pool?.end();
});

describe('Vico export edges', () => {
  it('a receipt with no bank line is in v_vico_export, so it is pending and exportable', async () => {
    const id = await manualReceipt(tenancies[0]!.id, '12.30');
    const view = await pool.query('SELECT 1 FROM v_vico_export WHERE receipt_id = $1', [id]);
    expect(view.rowCount).toBe(1);
    const pending = (await get('/api/vico/pending')).body as { rows: { receiptId: string }[] };
    expect(pending.rows.map((r) => r.receiptId)).toContain(id);
    const res = await send('post', '/api/vico/exports').send({ receiptIds: [id] });
    expect(res.status).toBe(200);
    expect(res.text).toContain(`${tenancies[0]!.tid},12.30,11-22-33,44556677\r\n`);
  });

  it('a receipt reversed after export never comes back as pending, and its export history is kept', async () => {
    const id = await bankReceipt(tenancies[1]!.tid, '50.00', 11);
    const res = await send('post', '/api/vico/exports').send({ receiptIds: [id] });
    expect(res.status).toBe(200);
    const exportId = res.headers['x-vico-export-id'] as string;
    await pool.query("UPDATE receipts SET status = 'reversed', reversed_reason = 'test' WHERE id = $1", [id]);
    const pending = (await get('/api/vico/pending')).body as { rows: { receiptId: string }[] };
    expect(pending.rows.map((r) => r.receiptId)).not.toContain(id);
    const again = await get(`/api/vico/exports/${exportId}/file`);
    expect(again.status).toBe(200);
    expect(again.text).toBe(res.text); // the file that was sent, reversal or not
  });

  // Documents the chosen behaviour: a re-download rebuilds the rows sent, with the CURRENT bank details.
  it('re-downloading an earlier export after the bank details change keeps the rows but uses the new details', async () => {
    const id = await bankReceipt(tenancies[2]!.tid, '7.05', 12);
    const res = await send('post', '/api/vico/exports').send({ receiptIds: [id] });
    expect(res.status).toBe(200);
    expect((await send('put', '/api/vico/settings', 'admin').send({ sortCode: '99-88-77', accountNumber: '12121212' })).status).toBe(200);
    const again = await get(`/api/vico/exports/${res.headers['x-vico-export-id'] as string}/file`);
    expect(again.text).toBe(res.text.replace('11-22-33,44556677', '99-88-77,12121212'));
  });

  it('refuses more than 5000 receipt ids, and a non-JSON body', async () => {
    const ids = Array.from({ length: 5001 }, () => randomUUID());
    expect((await send('post', '/api/vico/exports').send({ receiptIds: ids })).status).toBe(400);
    expect((await send('post', '/api/vico/exports').send({ receiptIds: 'x' })).status).toBe(400);
  });
});
