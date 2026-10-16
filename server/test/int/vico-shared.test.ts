/** Vico export shared-folder copy: bytes, header, feature off, missing/unwritable dir, never overwrite. */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createApp } from '../../src/api/app.js';
import { CSRF_HEADER, CSRF_HEADER_VALUE, SESSION_COOKIE } from '../../src/api/auth/middleware.js';
import { loadConfig } from '../../src/config/env.js';
import { createPool, type Pool } from '../../src/db/pool.js';
import { syncTenancies } from '../../src/jobs/veco-sync/sync.js';
import { actorDb } from '../../src/db/context.js';
import { createLogger } from '../../src/lib/logger.js';
import { createExport } from '../../src/services/vico/vico.service.js';
import { upsertUser, type Role } from '../../src/services/auth.service.js';
import { vecoRows } from '../fixtures/veco-rows.js';

const PASSWORD = 'correct-horse-battery';
const config = loadConfig();
const logger = createLogger({ level: 'silent' });
const run = randomUUID().slice(0, 8);
let pool: Pool;
const cookies = {} as Record<Role, string>;
let tenancies: { id: string; tid: string }[] = [];

let tmp = '';
const appWith = (over: Partial<typeof config>) => createApp({ config: { ...config, ...over }, pool, logger });
const app = () => appWith({});
async function signIn(role: Role): Promise<string> {
  const email = `${role}-vico-shared-${run}@example.test`;
  await upsertUser(pool, { email, fullName: `Vico ${role}`, role, password: PASSWORD });
  const res = await request(app()).post('/api/auth/login').set(CSRF_HEADER, CSRF_HEADER_VALUE).send({ email, password: PASSWORD });
  return (res.headers['set-cookie'] as unknown as string[]).find((c) => c.startsWith(`${SESSION_COOKIE}=`))!.split(';')[0]!;
}
let current: Partial<typeof config> = {};
const get = (p: string, role: Role = 'accounts') => request(appWith(current)).get(p).set('Cookie', cookies[role]);
const send = (method: 'post' | 'put', p: string, role: Role = 'accounts') =>
  request(appWith(current))[method](p).set('Cookie', cookies[role]).set(CSRF_HEADER, CSRF_HEADER_VALUE);
const on = (dir: string | null, display: string | null = null) => {
  current = { vicoExportDir: dir, vicoExportDisplayDir: display };
};


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
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'vico-shared-'));
  pool = createPool({ databaseUrl: config.databaseUrl, hashKey: config.hashKey, max: 4 }, logger);
  await pool.query(
    `TRUNCATE allocations, receipts, match_suggestions, payer_bank_accounts, payment_references, bank_transactions,
              import_batches, bank_csv_profiles, bank_accounts, external_refs,
              rent_schedules, tenancy_tenants, tenancies, tenants, property_units, properties, branches CASCADE`,
  );
  await pool.query("DELETE FROM integration_settings WHERE system = 'vico'");
  await syncTenancies(pool, vecoRows(5), { keys: { hashKey: config.hashKey, encryptionKey: config.encryptionKey }, force: true });
  tenancies = (await pool.query<{ id: string; tid: string }>('SELECT id, tid FROM tenancies ORDER BY tid LIMIT 5')).rows;
  for (const role of ['admin', 'accounts', 'staff'] as const) cookies[role] = await signIn(role);
  expect((await send('put', '/api/vico/settings', 'admin').send({ sortCode: '11-22-33', accountNumber: '44556677' })).status).toBe(200);
});

afterAll(async () => {
  fs.rmSync(tmp, { recursive: true, force: true });
  await pool?.end();
});

let next = 0;
const newReceipt = () => manualReceipt(tenancies[next++ % tenancies.length]!.id, '10.00');
const vicoRefs = async () => Number((await pool.query("SELECT count(*) FROM external_refs WHERE system = 'vico'")).rows[0].count);
const isPending = async (id: string) =>
  ((await get('/api/vico/pending')).body as { rows: { receiptId: string }[] }).rows.some((r) => r.receiptId === id);
const fileOf = (res: request.Response) => /filename="([^"]+)"/.exec(res.headers['content-disposition'] as string)![1]!;

describe('Vico shared folder', () => {
  it('writes the same bytes into the folder and reports the display path', async () => {
    on(tmp, '\\\\fileserver\\vico');
    const id = await newReceipt();
    const res = await send('post', '/api/vico/exports').send({ receiptIds: [id] });
    expect(res.status).toBe(200);
    const name = fileOf(res);
    expect(decodeURIComponent(res.headers['x-vico-shared-path'] as string)).toBe(`\\\\fileserver\\vico\\${name}`);
    expect(fs.readFileSync(path.join(tmp, name))).toEqual(Buffer.from(res.text));
    expect(fs.readdirSync(tmp)).toEqual([name]);
    expect(res.headers['access-control-expose-headers']).toContain('X-Vico-Shared-Path');
    const list = (await get('/api/vico/exports')).body.exports as { exportId: string; sharedPath: string | null }[];
    const mine = list.find((x) => x.exportId === res.headers['x-vico-export-id'])!;
    expect(mine.sharedPath).toBe(`\\\\fileserver\\vico\\${name}`);
    const again = await get(`/api/vico/exports/${mine.exportId}/file`);
    expect(decodeURIComponent(again.headers['x-vico-shared-path'] as string)).toBe(mine.sharedPath);
  });

  it('feature off: no file, no header, null path', async () => {
    const before = fs.readdirSync(tmp);
    on(null);
    const id = await newReceipt();
    const res = await send('post', '/api/vico/exports').send({ receiptIds: [id] });
    expect(res.status).toBe(200);
    expect(res.headers['x-vico-shared-path']).toBeUndefined();
    const list = (await get('/api/vico/exports')).body.exports as { sharedPath: string | null }[];
    expect(list[0]!.sharedPath).toBeNull();
    expect(fs.readdirSync(tmp)).toEqual(before);
  });

  it('missing folder: 409, nothing exported', async () => {
    on(path.join(tmp, 'nope'));
    const id = await newReceipt();
    const refs = await vicoRefs();
    const res = await send('post', '/api/vico/exports').send({ receiptIds: [id] });
    expect(res.status).toBe(409);
    expect(res.body.error.details.reason).toBe('vico_shared_dir_unavailable');
    expect(await isPending(id)).toBe(true);
    expect(await vicoRefs()).toBe(refs);
  });

  it('folder is a regular file: 409, receipt still pending', async () => {
    const notDir = path.join(tmp, 'afile');
    fs.writeFileSync(notDir, 'x');
    on(notDir);
    const id = await newReceipt();
    const res = await send('post', '/api/vico/exports').send({ receiptIds: [id] });
    expect(res.status).toBe(409);
    expect(await isPending(id)).toBe(true);
  });

  it.skipIf(process.getuid?.() === 0 || process.platform === 'win32')('read-only folder: 409, receipt still pending', async () => {
    const ro = fs.mkdtempSync(path.join(tmp, 'ro-'));
    fs.chmodSync(ro, 0o500);
    on(ro);
    const id = await newReceipt();
    const res = await send('post', '/api/vico/exports').send({ receiptIds: [id] });
    fs.chmodSync(ro, 0o700);
    expect(res.status).toBe(409);
    expect(await isPending(id)).toBe(true);
  });

  it('never overwrites an existing file', async () => {
    const dir = fs.mkdtempSync(path.join(tmp, 'exists-'));
    const id = await newReceipt();
    fs.writeFileSync(path.join(dir, 'vico-20300102-030405.csv'), 'ORIGINAL');
    await expect(
      createExport(actorDb(pool, 't@example.test'), [id], {
        shared: { exportDir: dir, displayDir: null },
        now: () => new Date('2030-01-02T03:04:05Z'),
      }),
    ).rejects.toMatchObject({ details: { reason: 'vico_shared_file_exists' } });
    expect(fs.readFileSync(path.join(dir, 'vico-20300102-030405.csv'), 'utf8')).toBe('ORIGINAL');
    expect(fs.readdirSync(dir)).toHaveLength(1);
    current = {};
    expect(await isPending(id)).toBe(true);
  });
});
