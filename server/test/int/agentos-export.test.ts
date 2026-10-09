/** agentOS Take a Payment export: golden CSV bytes, export-once, mark posted, concurrency. */
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
import { buildTakePaymentCsv, paymentFrom, TAKE_PAYMENT_HEADER } from '../../src/services/agentos/export.service.js';
import { BOM } from '../../src/services/export/statement-csv.js';

const PASSWORD = 'correct-horse-battery';
const config = loadConfig();
const logger = createLogger({ level: 'silent' });
const run = randomUUID().slice(0, 8);
let pool: Pool;
const cookies = {} as Record<Role, string>;

const fixtureBytes = (name: string) => readFileSync(new URL(`../fixtures/agentos/${name}`, import.meta.url));
const app = () => createApp({ config, pool, logger });

async function signIn(role: Role): Promise<string> {
  const email = `${role}-aoe-${run}@example.test`;
  await upsertUser(pool, { email, fullName: `Aoe ${role}`, role, password: PASSWORD });
  const res = await request(app()).post('/api/auth/login').set(CSRF_HEADER, CSRF_HEADER_VALUE).send({ email, password: PASSWORD });
  return (res.headers['set-cookie'] as unknown as string[]).find((c) => c.startsWith(`${SESSION_COOKIE}=`))!.split(';')[0]!;
}

const post = (path: string, role: Role) =>
  request(app()).post(path).set('Cookie', cookies[role]).set(CSRF_HEADER, CSRF_HEADER_VALUE);
const get = (path: string, role: Role) => request(app()).get(path).set('Cookie', cookies[role]);
const uploadBytes = (role: Role, content: Buffer) => post('/api/agentos/intake', role).attach('file', content, 'export-lines.csv');
const getCsv = (path: string) =>
  get(path, 'readonly')
    .buffer(true)
    .parse((res, cb) => {
      const b: Buffer[] = [];
      res.on('data', (c: Buffer) => b.push(c));
      res.on('end', () => cb(null, Buffer.concat(b)));
    });

async function clean() {
  await pool.query('TRUNCATE agentos_intake_batches CASCADE');
  await pool.query('DELETE FROM agentos_tenants');
  await pool.query(
    "DELETE FROM audit_log WHERE table_name IN ('agentos_exports', 'agentos_intake_lines', 'agentos_intake_batches', 'agentos_tenants')",
  );
}

const lineId = (n: number) => `00000000-0000-4000-8000-00000000000${n}`;
let batchId = '';
let exportId = '';

beforeAll(async () => {
  pool = createPool({ databaseUrl: config.databaseUrl, hashKey: config.hashKey, max: 6 }, logger);
  await clean();
  await seedAgentosTenants(pool, fixtureBytes('match-tenants.csv').toString('utf8'));
  for (const role of ['admin', 'accounts', 'staff', 'readonly'] as const) cookies[role] = await signIn(role);
});

afterAll(async () => {
  await clean();
  await pool?.end();
});

describe('pure helpers', () => {
  it('paymentFrom drops a leading tid and collapses whitespace', () => {
    expect(paymentFrom('9202', '9202 Mary  Jo', "O'Testson")).toBe("9202 Mary Jo O'Testson");
    expect(paymentFrom('9201', 'Alex', 'Testperson')).toBe('9201 Alex Testperson');
  });

  it('buildTakePaymentCsv escapes formula starters but not negative numbers', () => {
    const csv = buildTakePaymentCsv([['1', '+44', 'x', 'Cash', '-5.00', 'd']]);
    expect(csv).toBe(`${BOM}${TAKE_PAYMENT_HEADER.join(',')}\r\n1,'+44,x,Cash,-5.00,d\r\n`);
  });
});

describe('Take a Payment export', () => {
  it('upload gives the expected match counts and pins line ids', async () => {
    const res = await uploadBytes('staff', fixtureBytes('export-lines.csv'));
    expect(res.status).toBe(201);
    expect(res.body.batch.matchCounts).toEqual({ matched: 5, ambiguous: 0, unmatched: 1 });
    batchId = res.body.batch.batchId;
    for (const n of [2, 3, 4, 5, 7]) {
      await pool.query('UPDATE agentos_intake_lines SET id = $1 WHERE batch_id = $2 AND line_no = $3', [lineId(n), batchId, n]);
    }
  });

  it('guards the export endpoint', async () => {
    expect((await post('/api/agentos/exports', 'readonly').send({ batchId })).status).toBe(403);
    const anon = await request(app()).post('/api/agentos/exports').set(CSRF_HEADER, CSRF_HEADER_VALUE).send({ batchId });
    expect(anon.status).toBe(401);
    expect((await post('/api/agentos/exports', 'staff').send({ batchId: 'x' })).status).toBe(400);
    expect((await post('/api/agentos/exports', 'staff').send({ batchId: randomUUID() })).status).toBe(404);
  });

  it('staff export returns 5 rows and the golden bytes', async () => {
    const res = await post('/api/agentos/exports', 'staff').send({ batchId });
    expect(res.status).toBe(201);
    expect(res.body.export.rowsTotal).toBe(5);
    expect(res.body.export.amountTotalPence).toBe(117501);
    exportId = res.body.export.id;
    const csv = await getCsv(`/api/agentos/exports/${exportId}.csv`);
    expect(csv.status).toBe(200);
    expect(csv.headers['content-type']).toContain('text/csv');
    expect(csv.headers['content-disposition']).toContain(`-${exportId.slice(0, 8)}.csv"`);
    const expected = Buffer.from(fixtureBytes('take-payment.golden.csv').toString('utf8').replace(/\r?\n/g, '\r\n'), 'utf8');
    expect(Buffer.isBuffer(csv.body) && csv.body.equals(expected)).toBe(true);
    const body = csv.body as Buffer;
    expect([...body.subarray(0, 3)]).toEqual([0xef, 0xbb, 0xbf]);
    const text = body.toString('utf8');
    expect(text.endsWith('\r\n')).toBe(true);
    expect(text.replace(/\r\n/g, '')).not.toMatch(/[\r\n]/);
  });

  it('marks eligible lines exported and leaves the others', async () => {
    const { rows } = await pool.query<{ line_no: number; posting_status: string; export_id: string | null }>(
      'SELECT line_no, posting_status, export_id FROM agentos_intake_lines WHERE batch_id = $1 ORDER BY line_no',
      [batchId],
    );
    for (const r of rows) {
      if ([2, 3, 4, 5, 7].includes(r.line_no)) {
        expect(r.posting_status).toBe('exported');
        expect(r.export_id).toBe(exportId);
      } else {
        expect(r.posting_status).toBe('not_ready');
        expect(r.export_id).toBeNull();
      }
    }
  });

  it('a second export is header-only with 0 rows', async () => {
    const res = await post('/api/agentos/exports', 'staff').send({ batchId });
    expect(res.status).toBe(201);
    expect(res.body.export.rowsTotal).toBe(0);
    const csv = await getCsv(`/api/agentos/exports/${res.body.export.id}.csv`);
    expect(csv.body.toString('utf8')).toBe(`${BOM}${TAKE_PAYMENT_HEADER.join(',')}\r\n`);
    expect((await get(`/api/agentos/exports/${randomUUID()}.csv`, 'readonly')).status).toBe(404);
    expect((await get('/api/agentos/exports/nope.csv', 'readonly')).status).toBe(404);
  });

  it('mark posted is guarded', async () => {
    const ok = await post(`/api/agentos/lines/${lineId(2)}/posted`, 'staff');
    expect(ok.status).toBe(200);
    expect(ok.body.line.postingStatus).toBe('posted');
    const { rows } = await pool.query<{ posted_at: Date | null; posted_by: string | null }>(
      'SELECT posted_at, posted_by FROM agentos_intake_lines WHERE id = $1',
      [lineId(2)],
    );
    expect(rows[0]!.posted_at).not.toBeNull();
    expect(rows[0]!.posted_by).not.toBeNull();

    expect((await post(`/api/agentos/lines/${lineId(2)}/posted`, 'staff')).status).toBe(409);

    const { rows: nm } = await pool.query<{ id: string }>(
      'SELECT id FROM agentos_intake_lines WHERE batch_id = $1 AND line_no = 6',
      [batchId],
    );
    expect((await post(`/api/agentos/lines/${nm[0]!.id}/posted`, 'staff')).status).toBe(409);
    const { rows: after } = await pool.query<{ posting_status: string; posted_at: Date | null }>(
      'SELECT posting_status, posted_at FROM agentos_intake_lines WHERE id = $1',
      [nm[0]!.id],
    );
    expect(after[0]).toEqual({ posting_status: 'not_ready', posted_at: null });

    expect((await post(`/api/agentos/lines/${randomUUID()}/posted`, 'staff')).status).toBe(404);
    expect((await post('/api/agentos/lines/nope/posted', 'staff')).status).toBe(404);
    expect((await post(`/api/agentos/lines/${lineId(3)}/posted`, 'readonly')).status).toBe(403);
  });

  it('two concurrent exports split the lines exactly once', async () => {
    const up = await uploadBytes('staff', Buffer.concat([fixtureBytes('export-lines.csv'), Buffer.from('\n')]));
    expect(up.status).toBe(201);
    const id = up.body.batch.batchId;
    const [a, b] = await Promise.all([
      post('/api/agentos/exports', 'staff').send({ batchId: id }),
      post('/api/agentos/exports', 'staff').send({ batchId: id }),
    ]);
    expect(a.status).toBe(201);
    expect(b.status).toBe(201);
    expect([a.body.export.rowsTotal, b.body.export.rowsTotal].sort()).toEqual([0, 5]);
  });
});
