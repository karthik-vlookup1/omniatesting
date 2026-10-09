/** agentOS end-to-end pipeline on the synthetic 5 Aug 2026 demo: seed, upload, reassign, export, post, journal. */
import { readFileSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createApp } from '../../src/api/app.js';
import { CSRF_HEADER, CSRF_HEADER_VALUE, SESSION_COOKIE } from '../../src/api/auth/middleware.js';
import { loadConfig } from '../../src/config/env.js';
import { createPool, type Pool } from '../../src/db/pool.js';
import { createLogger } from '../../src/lib/logger.js';
import { upsertUser, type Role } from '../../src/services/auth.service.js';
import { seedAgentosTenants } from '../../src/services/agentos/seed.js';

const PASSWORD = 'correct-horse-battery';
const config = loadConfig();
const logger = createLogger({ level: 'silent' });
const run = randomUUID().slice(0, 8);
let pool: Pool;
const cookies = {} as Record<Role, string>;

const fx = (n: string) => readFileSync(new URL(`../../../fixtures/agentos/demo-2026-08-05/${n}`, import.meta.url));
const app = () => createApp({ config, pool, logger });

async function signIn(role: Role): Promise<string> {
  const email = `${role}-aop-${run}@example.test`;
  await upsertUser(pool, { email, fullName: `Aop ${role}`, role, password: PASSWORD });
  const res = await request(app()).post('/api/auth/login').set(CSRF_HEADER, CSRF_HEADER_VALUE).send({ email, password: PASSWORD });
  return (res.headers['set-cookie'] as unknown as string[]).find((c) => c.startsWith(`${SESSION_COOKIE}=`))!.split(';')[0]!;
}

const post = (path: string, role: Role) =>
  request(app()).post(path).set('Cookie', cookies[role]).set(CSRF_HEADER, CSRF_HEADER_VALUE);
const get = (path: string, role: Role) => request(app()).get(path).set('Cookie', cookies[role]);
const upload = (content: Buffer) => post('/api/agentos/intake', 'staff').attach('file', content, 'bank-formatted.csv');
const getCsv = (path: string) =>
  get(path, 'readonly')
    .buffer(true)
    .parse((res, cb) => {
      const b: Buffer[] = [];
      res.on('data', (c: Buffer) => b.push(c));
      res.on('end', () => cb(null, Buffer.concat(b)));
    });

async function clean() {
  await pool.query('TRUNCATE agentos_journal_exports, agentos_journal_transfers CASCADE');
  await pool.query('TRUNCATE agentos_intake_batches CASCADE');
  await pool.query('DELETE FROM agentos_tenants');
  await pool.query(
    "DELETE FROM audit_log WHERE table_name IN ('agentos_journal_exports', 'agentos_journal_transfers', 'agentos_journal_entries', 'agentos_exports', 'agentos_intake_lines', 'agentos_intake_batches', 'agentos_tenants')",
  );
}

let batchId = '';
let exportId = '';
const ids = new Map<number, string>();

beforeAll(async () => {
  pool = createPool({ databaseUrl: config.databaseUrl, hashKey: config.hashKey, max: 6 }, logger);
  await clean();
  for (const role of ['admin', 'accounts', 'staff', 'readonly'] as const) cookies[role] = await signIn(role);
});

afterAll(async () => {
  await clean();
  await pool?.end();
});

describe('agentOS 5 Aug 2026 demo pipeline', () => {
  it('seeds the demo tenants idempotently', async () => {
    const first = await seedAgentosTenants(pool, fx('tenants.csv').toString());
    expect(first).toMatchObject({ rows: 10, created: 10 });
    const again = await seedAgentosTenants(pool, fx('tenants.csv').toString());
    expect(again).toMatchObject({ rows: 10, created: 0, updated: 0 });
  });

  it('rejects the whole file when it holds an outgoing payment', async () => {
    const res = await upload(fx('bank-with-outgoing.csv'));
    expect(res.status).toBe(400);
    expect(JSON.stringify(res.body)).toContain('outgoing payments are not accepted');
    const { rows } = await pool.query<{ count: string }>('SELECT count(*) FROM agentos_intake_batches');
    expect(Number(rows[0]!.count)).toBe(0);
  });

  it('uploads the bank file with 11/0/2 match counts', async () => {
    const res = await upload(fx('bank-formatted.csv'));
    expect(res.status).toBe(201);
    const b = res.body.batch;
    expect(b.rowsTotal).toBe(13);
    expect(b.amountTotalPence).toBe(496275);
    expect(b.periodFrom).toBe('2026-08-05');
    expect(b.periodTo).toBe('2026-08-05');
    expect(b.matchCounts).toEqual({ matched: 11, ambiguous: 0, unmatched: 2 });
    batchId = b.batchId;
    const { rows } = await pool.query<{ id: string; line_no: number }>('SELECT id, line_no FROM agentos_intake_lines WHERE batch_id = $1', [batchId]);
    for (const r of rows) ids.set(r.line_no, r.id);
    expect(ids.size).toBe(13);
  });

  it('refuses the same bytes twice', async () => {
    expect((await upload(fx('bank-formatted.csv'))).status).toBe(409);
  });

  it('reassigns row 12 to TID 9309', async () => {
    const res = await post(`/api/agentos/lines/${ids.get(13)}/reassign`, 'staff').send({ tid: '9309' });
    expect(res.status).toBe(200);
    expect(res.body.line.matchStatus).toBe('matched');
    expect(res.body.line.tid).toBe('9309');
    expect(res.body.previous.matchStatus).toBe('unmatched');
  });

  it('exports 12 matched rows', async () => {
    const res = await post('/api/agentos/exports', 'staff').send({ batchId });
    expect(res.status).toBe(201);
    expect(res.body.export.rowsTotal).toBe(12);
    expect(res.body.export.amountTotalPence).toBe(487275);
    exportId = res.body.export.id;
    const csv = await getCsv(`/api/agentos/exports/${exportId}.csv`);
    expect(csv.status).toBe(200);
    const text = (csv.body as Buffer).toString('utf8').replace(/^[\u{FEFF}]/u, '');
    const lines = text.split('\r\n').filter((l) => l !== '');
    expect(lines).toHaveLength(13);
    expect(lines.some((l) => l.startsWith('9301,9301 Ava Demoford'))).toBe(true);
    expect(lines.some((l) => l.includes('9399') || l.includes('Someone Else'))).toBe(false);
  });

  it('marks posted only what was exported', async () => {
    const ok = await post(`/api/agentos/lines/${ids.get(2)}/posted`, 'staff');
    expect(ok.status).toBe(200);
    expect(ok.body.line.postingStatus).toBe('posted');
    expect((await post(`/api/agentos/lines/${ids.get(14)}/posted`, 'staff')).status).toBe(409);
  });

  it('moves money between tenants with a journal transfer', async () => {
    const t = await post('/api/agentos/journal/transfers', 'accounts').send({
      fromTid: '9301',
      toTid: '9302',
      amountPence: 5000,
      description: 'Demo: row 11 paid to wrong account',
      nominalCode: 'DEMO',
      accountType: 'Rent',
    });
    expect(t.status).toBe(201);
    const ex = await post('/api/agentos/journal/exports', 'accounts');
    expect(ex.status).toBe(201);
    expect(ex.body.export.transfersTotal).toBe(1);
    const tid = t.body.transfer?.id ?? t.body.id;
    expect((await post(`/api/agentos/journal/transfers/${tid}/posted`, 'accounts')).status).toBe(200);
  });
});
