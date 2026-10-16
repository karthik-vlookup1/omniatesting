/**
 * Push to VECO (test database) through the HTTP API, against Postgres and an in-memory fake VECO.
 * No real VECO / MCP endpoint is called and VECO_RW_MCP_URL is never read.
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
import { createMemoryGateway, type MemoryGateway } from '../../src/services/veco-push/memory-gateway.js';
import type { TenantLookupRow } from '../../src/services/veco-push/classify.js';
import { vecoRows } from '../fixtures/veco-rows.js';

const PASSWORD = 'correct-horse-battery';
const config = loadConfig();
const logger = createLogger({ level: 'silent' });
const run = randomUUID().slice(0, 8);
const STAFF_A = '9A9A9A9A-0000-4000-8000-00000000000A';
let pool: Pool;
const cookies = {} as Record<Role, string>;
const ids = {} as Record<Role, string>;
let tenancies: { id: string; tid: string }[] = [];
let hsbc = '';
let clock = new Date('2026-10-14T13:17:06Z');
let mem: MemoryGateway;

const emailOf = (role: Role) => `${role}-veco-push-${run}@example.test`;
const app = (gateway: MemoryGateway | null = mem) => createApp({ config, pool, logger, vecoPush: { gateway, now: () => clock } });
async function signIn(role: Role): Promise<string> {
  const email = emailOf(role);
  await upsertUser(pool, { email, fullName: `Push ${role}`, role, password: PASSWORD });
  ids[role] = (await pool.query<{ id: string }>('SELECT id FROM app_users WHERE lower(email) = $1', [email])).rows[0]!.id;
  const res = await request(app()).post('/api/auth/login').set(CSRF_HEADER, CSRF_HEADER_VALUE).send({ email, password: PASSWORD });
  return (res.headers['set-cookie'] as unknown as string[]).find((c) => c.startsWith(`${SESSION_COOKIE}=`))!.split(';')[0]!;
}
const get = (path: string, role: Role = 'accounts', gw: MemoryGateway | null = mem) => request(app(gw)).get(path).set('Cookie', cookies[role]);
const send = (method: 'post' | 'put' | 'delete', path: string, role: Role = 'accounts', gw: MemoryGateway | null = mem) =>
  request(app(gw))[method](path).set('Cookie', cookies[role]).set(CSRF_HEADER, CSRF_HEADER_VALUE);
const pushBody = (receiptIds: string[], departments: Record<string, string> = {}, idempotencyKey: string = randomUUID()) => ({
  idempotencyKey,
  receiptIds,
  departments,
});

async function bankReceipt(tid: string, amount: string, day: number): Promise<string> {
  const csv = `Date,Description,Paid in,Paid out,Balance
${day}/09/2026,"COUNCIL HB ${tid} RENT",${amount},,1.00
`;
  const res = await send('post', '/api/imports', 'staff').field('bankAccountId', hsbc).attach('file', Buffer.from(csv), `p${day}.csv`);
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

const lookupFor = (tid: string, n: number, over: Partial<TenantLookupRow> = {}): TenantLookupRow => ({
  tid,
  tenancyFk: `BBBBBBBB-0000-4000-8000-${String(n).padStart(12, '0')}`,
  contactFk: `CCCCCCCC-0000-4000-8000-${String(n).padStart(12, '0')}`,
  propertyFk: `DDDDDDDD-0000-4000-8000-${String(n).padStart(12, '0')}`,
  officeName: 'MY',
  ownerCount: 1,
  ownerFk: `EEEEEEEE-0000-4000-8000-${String(n).padStart(12, '0')}`,
  officeCount: 1,
  officeFk: `FFFFFFFF-0000-4000-8000-${String(n).padStart(12, '0')}`,
  delayPayment: false,
  addressTitle: `Tenant ${n}`,
  lastDescription: `Rent Received  From Tenant ${n}  `,
  lastDepartment: 'Tenancy',
  ...over,
});

const pendingIds = async () =>
  ((await get('/api/vico/pending')).body as { rows: { receiptId: string }[] }).rows.map((r) => r.receiptId);
const refCount = async (ids: string[]) =>
  (await pool.query("SELECT count(*)::int AS n FROM external_refs WHERE system = 'vico' AND entity_id = ANY($1::uuid[])", [ids])).rows[0].n as number;

let r1 = '', r2 = '', r3 = '', r4 = '', r5 = '';
let batchA = '';
let batchB = '';

beforeAll(async () => {
  pool = createPool({ databaseUrl: config.databaseUrl, hashKey: config.hashKey, max: 4 }, logger);
  await pool.query(
    `TRUNCATE allocations, receipts, match_suggestions, payer_bank_accounts, payment_references, bank_transactions,
              import_batches, bank_csv_profiles, bank_accounts, external_refs, veco_push_batch, veco_staff_link,
              rent_schedules, tenancy_tenants, tenancies, tenants, property_units, properties, branches CASCADE`,
  );
  await pool.query("DELETE FROM integration_settings WHERE system = 'vico'");
  await syncTenancies(pool, vecoRows(5), { keys: { hashKey: config.hashKey, encryptionKey: config.encryptionKey }, force: true });
  tenancies = (await pool.query<{ id: string; tid: string }>('SELECT id, tid FROM tenancies ORDER BY tid LIMIT 5')).rows;
  for (const role of ['admin', 'accounts', 'staff', 'readonly'] as const) cookies[role] = await signIn(role);
  await send('post', '/api/bank-accounts/defaults', 'admin');
  hsbc = ((await get('/api/bank-accounts')).body.bankAccounts as { code: string; id: string }[]).find((b) => b.code === 'HSBC')!.id;
  expect((await send('put', '/api/vico/settings', 'admin').send({ sortCode: '20-79-06', accountNumber: '43789276' })).status).toBe(200);

  r1 = await bankReceipt(tenancies[0]!.tid, '100.00', 1);
  r2 = await bankReceipt(tenancies[1]!.tid, '200.50', 2);
  r3 = await manualReceipt(tenancies[2]!.id, '50.25');
  r4 = await bankReceipt(tenancies[4]!.tid, '70.00', 3); // TID unknown to the fake VECO
  r5 = await bankReceipt(tenancies[3]!.tid, '80.00', 5); // first-ever receipt: needs a department pick

  mem = createMemoryGateway({
    staff: [{ staffPk: STAFF_A, email: emailOf('accounts') }],
    lookups: [
      lookupFor(tenancies[0]!.tid, 1),
      lookupFor(tenancies[1]!.tid, 2),
      lookupFor(tenancies[2]!.tid, 3),
      lookupFor(tenancies[3]!.tid, 4, { lastDepartment: null, lastDescription: null }),
    ],
  });
});

afterAll(async () => {
  await pool?.end();
});

describe('VECO push', () => {
  it('without a VECO_RW_MCP_URL gateway: status says not configured, push is 409, the manual Vico export is untouched', async () => {
    const status = await get('/api/veco-push/status', 'accounts', null);
    expect(status.status).toBe(200);
    expect(status.body.configured).toBe(false);
    const res = await send('post', '/api/veco-push/pushes', 'accounts', null).send(pushBody([r1]));
    expect(res.status).toBe(409);
    expect(res.body.error.details.reason).toBe('veco_push_not_configured');
    expect((await get('/api/vico/pending')).status).toBe(200);
    expect((await get('/api/vico/exports')).status).toBe(200);
  });

  it('staff and read-only users get 403', async () => {
    for (const role of ['staff', 'readonly'] as const) {
      expect((await get('/api/veco-push/status', role)).status).toBe(403);
      expect((await send('post', '/api/veco-push/preview', role).send({ receiptIds: [r1] })).status).toBe(403);
      expect((await send('post', '/api/veco-push/pushes', role).send(pushBody([r1]))).status).toBe(403);
    }
    expect((await get('/api/veco-push/staff-links', 'accounts')).status).toBe(403);
  });

  it('auto-links by e-mail without push permission; an admin grants it and can fix a bad StaffPK', async () => {
    const status = await get('/api/veco-push/status');
    expect(status.body.me).toMatchObject({ linked: true, canPush: false, source: 'email', staffFk: STAFF_A });
    const denied = await send('post', '/api/veco-push/pushes').send(pushBody([r1]));
    expect(denied.status).toBe(403);
    expect(denied.body.error.message).toMatch(/push permission/);
    expect(mem.transactions.size).toBe(0);

    // The admin has no VECO staff row: no link at all.
    expect((await get('/api/veco-push/status', 'admin')).body.me).toMatchObject({ linked: false, canPush: false });
    const adminPush = await send('post', '/api/veco-push/pushes', 'admin').send(pushBody([r1]));
    expect(adminPush.status).toBe(403);
    expect(adminPush.body.error.message).toMatch(/No VECO user linked/);

    const unknown = await send('put', `/api/veco-push/staff-links/${ids.accounts}`, 'admin').send({ staffFk: randomUUID(), canPush: true });
    expect(unknown.status).toBe(400);
    const granted = await send('put', `/api/veco-push/staff-links/${ids.accounts}`, 'admin').send({ staffFk: STAFF_A, canPush: true });
    expect(granted.status).toBe(200);
    expect((granted.body.links as { userId: string; canPush: boolean; source: string }[]).find((l) => l.userId === ids.accounts)).toMatchObject({
      canPush: true,
      source: 'admin',
    });
    expect((await get('/api/veco-push/status')).body.me).toMatchObject({ canPush: true, source: 'admin' });
    expect((await get('/api/veco-push/staff-links', 'admin')).status).toBe(200);
  });

  it('preview shows per-bank totals, held reasons and the department picker, and writes nothing', async () => {
    const callsBefore = mem.calls.filter((c) => c === 'insert').length;
    const res = await send('post', '/api/veco-push/preview').send({ receiptIds: [r1, r2, r3, r4, r5] });
    expect(res.status).toBe(200);
    expect(res.body.ready.map((r: { receiptId: string }) => r.receiptId).sort()).toEqual([r1, r2, r3].sort());
    expect(res.body.byBank.map((b: { bank: string; count: number }) => [b.bank, b.count])).toEqual([['HSBC', 4], ['MANUAL', 1]]);
    expect(res.body.total).toBe('500.75');
    expect(res.body.readyTotal).toBe('350.75');
    const held = res.body.held as { receiptId: string; code: string; needsDepartment: boolean }[];
    expect(held.find((h) => h.receiptId === r4)!.code).toBe('tid_not_found');
    expect(held.find((h) => h.receiptId === r5)).toMatchObject({ code: 'department_not_chosen', needsDepartment: true });
    expect(mem.calls.filter((c) => c === 'insert')).toHaveLength(callsBefore);
    expect(mem.transactions.size).toBe(0);
    expect((await pool.query('SELECT count(*)::int AS n FROM veco_push_batch')).rows[0].n).toBe(0);
    expect(await refCount([r1, r2, r3])).toBe(0);
  });

  it('pushes 3 receipts: 3 Transaction + 3 Allocation rows, stored items, sent markers, cross-check verified', async () => {
    const exportsBefore = (await get('/api/vico/exports')).body.exports as unknown[];
    const res = await send('post', '/api/veco-push/pushes').send(pushBody([r1, r2, r3]));
    expect(res.status).toBe(201);
    expect(res.body.replay).toBe(false);
    expect(res.body.batch).toMatchObject({ status: 'verified', receipts: 3, total: '350.75', batchReference: '2026-10-14-14-17' });
    expect(res.body.verify.ok).toBe(true);
    expect(res.body.verify.after).toEqual(res.body.verify.before);
    expect(res.body.verify.before.byBank).toEqual([
      { bank: 'HSBC', count: 2, total: '300.50' },
      { bank: 'MANUAL', count: 1, total: '50.25' },
    ]);
    batchA = res.body.batch.id as string;
    expect(mem.transactions.size).toBe(3);
    expect(mem.allocations.size).toBe(3);

    const items = await pool.query("SELECT status, source_bank, banking_ref FROM veco_push_item WHERE batch_id = $1 ORDER BY banking_ref", [batchA]);
    expect(items.rows.map((r) => r.status)).toEqual(['pushed', 'pushed', 'pushed']);
    expect(items.rows.map((r) => r.banking_ref)).toEqual(['S20261014-0001', 'S20261014-0002', 'S20261014-0003']);
    const refs = await pool.query(
      "SELECT external_id, external_key2 FROM external_refs WHERE system = 'vico' AND entity_id = ANY($1::uuid[])",
      [[r1, r2, r3]],
    );
    expect(refs.rowCount).toBe(3);
    expect(refs.rows.every((r) => r.external_key2 === null && String(r.external_id).startsWith('veco-push:'))).toBe(true);

    const pending = await pendingIds();
    for (const id of [r1, r2, r3]) expect(pending).not.toContain(id);
    const manual = await send('post', '/api/vico/exports').send({ receiptIds: [r1, r2, r3] });
    expect(manual.status).toBe(409);
    expect((await get('/api/vico/exports')).body.exports).toEqual(exportsBefore);
  });

  it('a replay with the same key returns the stored batch with no second VECO call; a new key finds nothing ready', async () => {
    const key = randomUUID();
    const first = await send('post', '/api/veco-push/pushes').send(pushBody([r5], { [r5]: 'Owner' }, key));
    // Same UK minute as the first push: refused, and nothing was written.
    expect(first.status).toBe(409);
    expect(first.body.error.details.reason).toBe('same_minute');
    expect(await pendingIds()).toContain(r5);

    const inserts = mem.calls.filter((c) => c === 'insert').length;
    const again = await send('post', '/api/veco-push/pushes').send(pushBody([r1, r2, r3], {}, (await pool.query('SELECT idempotency_key FROM veco_push_batch WHERE id = $1', [batchA])).rows[0].idempotency_key as string));
    expect(again.status).toBe(200);
    expect(again.body.replay).toBe(true);
    expect(again.body.batch.id).toBe(batchA);
    expect(mem.calls.filter((c) => c === 'insert')).toHaveLength(inserts);

    const stale = await send('post', '/api/veco-push/pushes').send(pushBody([r1, r2, r3]));
    expect(stale.status).toBe(409);
    expect(stale.body.error.details.reason).toBe('nothing_ready');
    expect(mem.transactions.size).toBe(3);
  });

  it('a department pick applies to a first-ever receipt, and a push a minute later succeeds', async () => {
    clock = new Date('2026-10-14T13:19:30Z');
    const res = await send('post', '/api/veco-push/pushes').send(pushBody([r5], { [r5]: 'Owner' }));
    expect(res.status).toBe(201);
    expect(res.body.batch).toMatchObject({ status: 'verified', batchReference: '2026-10-14-14-19' });
    batchB = res.body.batch.id as string;
    const row = [...mem.transactions.values()].find((t) => t.strStandingOrderReference === tenancies[3]!.tid)!;
    expect(row.strDepartment).toBe('Owner');
    expect(row.memDescription).toBe('Rent Received  From Tenant 4');
    expect(row.strBankingRef).toBe('S20261014-0001'); // restarts for every push
  });

  it('a tampered VECO row shows as a mismatch on dblAmount, and the CSV download says so', async () => {
    const pk = (await pool.query('SELECT transaction_pk FROM veco_push_item WHERE batch_id = $1 ORDER BY banking_ref LIMIT 1', [batchA])).rows[0].transaction_pk as string;
    const key = [...mem.transactions.keys()].find((k) => k.toUpperCase() === pk.toUpperCase())!;
    const original = mem.transactions.get(key)!.dblAmount;
    mem.transactions.get(key)!.dblAmount = '999.00';
    const verify = await send('post', `/api/veco-push/batches/${batchA}/verify`);
    expect(verify.status).toBe(200);
    expect(verify.body.verify.ok).toBe(false);
    const bad = (verify.body.verify.rows as { ok: boolean; diffs: string[] }[]).filter((r) => !r.ok);
    expect(bad).toHaveLength(1);
    expect(bad[0]!.diffs).toEqual(['dblAmount']);
    const csv = await get(`/api/veco-push/batches/${batchA}/readback.csv`);
    expect(csv.status).toBe(200);
    expect(csv.headers['content-type']).toMatch(/text\/csv/);
    expect(csv.headers['content-disposition']).toContain('veco-push-2026-10-14-14-17.csv');
    expect(csv.text.split('\r\n')[0]).toBe('Date,TID,Tenant,Property,Landlord,Department,Amount,Banking ref,TransactionPK,Check,Differences');
    expect(csv.text).toContain('DIFFERENT');
    mem.transactions.get(key)!.dblAmount = original;
    const fixed = await send('post', `/api/veco-push/batches/${batchA}/verify`);
    expect(fixed.body.verify.ok).toBe(true);
    expect(fixed.body.batch.status).toBe('verified');
  });

  it('lists earlier pushes', async () => {
    const res = await get('/api/veco-push/batches');
    expect(res.status).toBe(200);
    const batches = res.body.batches as { id: string; status: string; pushedBy: string }[];
    expect(batches.map((b) => b.id)).toEqual(expect.arrayContaining([batchA, batchB]));
    expect(batches.every((b) => b.pushedBy === 'Push accounts')).toBe(true);
  });

  it('a failed insert marks the batch failed and the receipts are pending again', async () => {
    clock = new Date('2026-10-14T13:25:00Z');
    const r6 = await bankReceipt(tenancies[0]!.tid, '33.00', 6);
    const size = mem.transactions.size;
    mem.failNextInsert = new Error('simulated VECO outage');
    const res = await send('post', '/api/veco-push/pushes').send(pushBody([r6]));
    expect(res.status).toBe(201);
    expect(res.body.batch.status).toBe('failed');
    expect(res.body.batch.error).toContain('simulated VECO outage');
    expect(mem.transactions.size).toBe(size);
    expect(await pendingIds()).toContain(r6);
    expect(await refCount([r6])).toBe(0);
  });

  it('refuses to delete when the connection is on another database, then deletes only its own rows', async () => {
    mem.dbName = 'Veco-onesystem';
    const refused = await send('delete', `/api/veco-push/batches/${batchB}`);
    expect(refused.status).toBe(409);
    expect(refused.body.error.details.reason).toBe('wrong_database');
    expect(mem.transactions.size).toBe(4);
    expect((await get('/api/veco-push/batches')).body.batches.find((b: { id: string }) => b.id === batchB).status).toBe('verified');
    mem.dbName = 'Test Database Read Write';

    mem.calls.length = 0;
    const res = await send('delete', `/api/veco-push/batches/${batchA}`);
    expect(res.status).toBe(200);
    expect(res.body.remaining).toEqual({ transactions: 0, allocations: 0, total: '0.00' });
    expect(res.body.batch.status).toBe('deleted');
    expect(mem.calls.indexOf('delete:Allocation')).toBeGreaterThan(-1);
    expect(mem.calls.indexOf('delete:Allocation')).toBeLessThan(mem.calls.indexOf('delete:Transaction'));
    expect(mem.transactions.size).toBe(1); // batch B's row is untouched
    expect(mem.allocations.size).toBe(1);
    const pending = await pendingIds();
    for (const id of [r1, r2, r3]) expect(pending).toContain(id);
    expect(await refCount([r1, r2, r3])).toBe(0);
    expect((await send('delete', `/api/veco-push/batches/${batchA}`)).status).toBe(409);
  });

  it('a deleted receipt can be pushed again', async () => {
    clock = new Date('2026-10-14T13:40:00Z');
    const res = await send('post', '/api/veco-push/pushes').send(pushBody([r1]));
    expect(res.status).toBe(201);
    expect(res.body.batch.status).toBe('verified');
    expect(mem.transactions.size).toBe(2);
  });
});
