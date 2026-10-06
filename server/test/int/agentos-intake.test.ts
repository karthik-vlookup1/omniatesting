/**
 * agentOS formatted bank record intake end to end: upload, dedupe, whole-file rejection,
 * permissions and the read endpoints.
 */
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

const PASSWORD = 'correct-horse-battery';
const config = loadConfig();
const logger = createLogger({ level: 'silent' });
const run = randomUUID().slice(0, 8);
let pool: Pool;
const cookies = {} as Record<Role, string>;

const fixture = (name: string) => readFileSync(new URL(`../fixtures/agentos/${name}`, import.meta.url));
const app = () => createApp({ config, pool, logger });

async function signIn(role: Role): Promise<string> {
  const email = `${role}-aoi-${run}@example.test`;
  await upsertUser(pool, { email, fullName: `Aoi ${role}`, role, password: PASSWORD });
  const res = await request(app()).post('/api/auth/login').set(CSRF_HEADER, CSRF_HEADER_VALUE).send({ email, password: PASSWORD });
  return (res.headers['set-cookie'] as unknown as string[]).find((c) => c.startsWith(`${SESSION_COOKIE}=`))!.split(';')[0]!;
}

const post = (path: string, role: Role) =>
  request(app()).post(path).set('Cookie', cookies[role]).set(CSRF_HEADER, CSRF_HEADER_VALUE);
const get = (path: string, role: Role) => request(app()).get(path).set('Cookie', cookies[role]);
const upload = (role: Role, file: string) => post('/api/agentos/intake', role).attach('file', fixture(file), file);

async function counts() {
  const b = await pool.query<{ n: string }>('SELECT count(*)::text AS n FROM agentos_intake_batches');
  const l = await pool.query<{ n: string }>('SELECT count(*)::text AS n FROM agentos_intake_lines');
  return { batches: Number(b.rows[0]!.n), lines: Number(l.rows[0]!.n) };
}

async function clean() {
  await pool.query('TRUNCATE agentos_intake_batches CASCADE');
  await pool.query("DELETE FROM audit_log WHERE table_name IN ('agentos_intake_batches', 'agentos_intake_lines')");
}

let firstBatchId = '';

beforeAll(async () => {
  pool = createPool({ databaseUrl: config.databaseUrl, hashKey: config.hashKey, max: 4 }, logger);
  await clean();
  for (const role of ['admin', 'accounts', 'staff', 'readonly'] as const) cookies[role] = await signIn(role);
});

afterAll(async () => {
  await clean();
  await pool?.end();
});

describe('POST /api/agentos/intake', () => {
  it('staff uploads the valid file', async () => {
    const res = await upload('staff', 'intake-valid.csv');
    expect(res.status).toBe(201);
    expect(res.body.batch.rowsTotal).toBe(6);
    expect(res.body.batch.amountTotalPence).toBe(258073);
    expect(res.body.batch.linesWithWarnings).toBe(1);
    firstBatchId = res.body.batch.batchId;
    const { rows } = await pool.query<{ match_status: string; posting_status: string }>(
      'SELECT match_status, posting_status FROM agentos_intake_lines WHERE batch_id = $1',
      [firstBatchId],
    );
    expect(rows).toHaveLength(6);
    expect(rows.every((r) => r.match_status !== 'pending' && r.posting_status === 'not_ready')).toBe(true);
  });

  it('rejects the same file again with the first batch id', async () => {
    const res = await upload('staff', 'intake-valid.csv');
    expect(res.status).toBe(409);
    expect(res.body.error.details.batchId).toBe(firstBatchId);
  });

  it('rejects the whole outgoing file and imports nothing', async () => {
    const before = await counts();
    const res = await upload('staff', 'intake-outgoing.csv');
    expect(res.status).toBe(400);
    expect(res.body.error.details.reason).toBe('bad_rows');
    expect(res.body.error.details.rowErrors.map((e: { line: number }) => e.line)).toEqual([3, 5]);
    expect(await counts()).toEqual(before);
  });

  it('rejects a bad header', async () => {
    const res = await upload('staff', 'intake-bad-header.csv');
    expect(res.status).toBe(400);
    expect(res.body.error.details.reason).toBe('bad_header');
  });

  it('readonly gets 403', async () => {
    expect((await upload('readonly', 'intake-valid.csv')).status).toBe(403);
  });

  it('no cookie gets 401', async () => {
    const res = await request(app())
      .post('/api/agentos/intake')
      .set(CSRF_HEADER, CSRF_HEADER_VALUE)
      .attach('file', fixture('intake-valid.csv'), 'x.csv');
    expect(res.status).toBe(401);
  });

  it('no file gets 400', async () => {
    const res = await post('/api/agentos/intake', 'staff');
    expect(res.status).toBe(400);
    expect(res.body.error.message).toBe('Choose a CSV file to upload');
  });
});

describe('GET /api/agentos/intake', () => {
  it('lists the batch', async () => {
    const res = await get('/api/agentos/intake', 'readonly');
    expect(res.status).toBe(200);
    expect(res.body.batches.map((b: { id: string }) => b.id)).toContain(firstBatchId);
  });

  it('returns one batch with its lines in order', async () => {
    const res = await get(`/api/agentos/intake/${firstBatchId}`, 'readonly');
    expect(res.status).toBe(200);
    expect(res.body.lines).toHaveLength(6);
    expect(res.body.lines.map((l: { lineNo: number }) => l.lineNo)).toEqual([2, 3, 4, 6, 7, 8]);
    expect(res.body.batch.periodFrom).toBe('2026-03-02');
  });

  it('404s for a bad id', async () => {
    expect((await get('/api/agentos/intake/nope', 'readonly')).status).toBe(404);
    expect((await get(`/api/agentos/intake/${randomUUID()}`, 'readonly')).status).toBe(404);
  });
});
