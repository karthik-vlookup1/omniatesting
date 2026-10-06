/** agentOS reassign: audited TID change that re-runs the match rules, lock after export. */
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
const emails = {} as Record<Role, string>;

const fixtureBytes = (name: string) => readFileSync(new URL(`../fixtures/agentos/${name}`, import.meta.url));
const app = () => createApp({ config, pool, logger });

async function signIn(role: Role): Promise<string> {
  const email = `${role}-aor-${run}@example.test`;
  emails[role] = email;
  await upsertUser(pool, { email, fullName: `Aor ${role}`, role, password: PASSWORD });
  const res = await request(app()).post('/api/auth/login').set(CSRF_HEADER, CSRF_HEADER_VALUE).send({ email, password: PASSWORD });
  return (res.headers['set-cookie'] as unknown as string[]).find((c) => c.startsWith(`${SESSION_COOKIE}=`))!.split(';')[0]!;
}

const post = (path: string, role: Role) =>
  request(app()).post(path).set('Cookie', cookies[role]).set(CSRF_HEADER, CSRF_HEADER_VALUE);
const get = (path: string, role: Role) => request(app()).get(path).set('Cookie', cookies[role]);
const uploadBytes = (role: Role, content: Buffer) => post('/api/agentos/intake', role).attach('file', content, 'export-lines.csv');

async function clean() {
  await pool.query('TRUNCATE agentos_intake_batches CASCADE');
  await pool.query('DELETE FROM agentos_tenants');
  await pool.query(
    "DELETE FROM audit_log WHERE table_name IN ('agentos_exports', 'agentos_intake_lines', 'agentos_intake_batches', 'agentos_tenants')",
  );
}

let batchId = '';
const lineIds: Record<number, string> = {};
const tenantIds: Record<string, string> = {};
const reassign = (n: number, role: Role, tid: unknown) => post(`/api/agentos/lines/${lineIds[n]}/reassign`, role).send({ tid });
const auditCount = async () =>
  Number((await pool.query<{ n: string }>("SELECT count(*) AS n FROM audit_log WHERE table_name = 'agentos_intake_lines'")).rows[0]!.n);

beforeAll(async () => {
  pool = createPool({ databaseUrl: config.databaseUrl, hashKey: config.hashKey, max: 6 }, logger);
  await clean();
  await seedAgentosTenants(pool, fixtureBytes('match-tenants.csv').toString('utf8'));
  for (const role of ['admin', 'staff', 'readonly'] as const) cookies[role] = await signIn(role);
  const up = await uploadBytes('staff', fixtureBytes('export-lines.csv'));
  expect(up.status).toBe(201);
  batchId = up.body.batch.batchId;
  const { rows } = await pool.query<{ id: string; line_no: number }>(
    'SELECT id, line_no FROM agentos_intake_lines WHERE batch_id = $1',
    [batchId],
  );
  for (const r of rows) lineIds[r.line_no] = r.id;
  const { rows: t } = await pool.query<{ id: string; tid: string }>('SELECT id, tid FROM agentos_tenants');
  for (const r of t) tenantIds[r.tid] = r.id;
});

afterAll(async () => {
  await clean();
  await pool?.end();
});

describe('GET /tenants', () => {
  it('lists the tenants in TID order for any signed-in user', async () => {
    const res = await get('/api/agentos/tenants', 'readonly');
    expect(res.status).toBe(200);
    expect(res.body.tenants.map((t: { tid: string }) => t.tid)).toEqual(['9201', '9202', '9203']);
    expect(res.body.tenants[0].name).toBe('9201 Alex Testperson');
    expect((await request(app()).get('/api/agentos/tenants')).status).toBe(401);
  });
});

describe('POST /lines/:id/reassign', () => {
  it('a blank-TID line reassigned to 9201 matches and writes exactly one audit row', async () => {
    const before = await auditCount();
    const res = await reassign(6, 'staff', '9201');
    expect(res.status).toBe(200);
    expect(res.body.line.matchStatus).toBe('matched');
    expect(res.body.line.tid).toBe('9201');
    expect(res.body.line.agentosTenantId).toBe(tenantIds['9201']);
    expect(res.body.previous).toMatchObject({ tid: null, matchStatus: 'unmatched' });
    expect((await auditCount()) - before).toBe(1);
    const { rows } = await pool.query<{ old_row: Record<string, unknown>; new_row: Record<string, unknown>; changed_by: string; action: string }>(
      "SELECT old_row, new_row, changed_by, action FROM audit_log WHERE table_name = 'agentos_intake_lines' AND row_id = $1 ORDER BY id DESC LIMIT 1",
      [lineIds[6]],
    );
    expect(rows[0]!.action).toBe('UPDATE');
    expect(rows[0]!.old_row.tid_raw).toBeNull();
    expect(rows[0]!.new_row.tid_raw).toBe('9201');
    expect(rows[0]!.new_row.match_status).toBe('matched');
    expect(rows[0]!.changed_by).toBe(emails.staff);
  });

  it('re-runs the rules for name, deposit and same-TID cases', async () => {
    const a = await reassign(4, 'staff', '9202');
    expect(a.body.line.matchStatus).toBe('name_mismatch');
    expect(a.body.line.agentosTenantId).toBe(tenantIds['9202']);
    const b = await reassign(5, 'staff', '9203');
    expect(b.status).toBe(200);
    expect(b.body.line.matchStatus).toBe('deposit_mismatch');
    const c = await reassign(2, 'staff', '9203');
    expect(c.body.line.matchStatus).toBe('name_mismatch');
    const d = await reassign(2, 'staff', '9201');
    expect(d.body.line.matchStatus).toBe('matched');
  });

  it('rejects bad input and bad roles', async () => {
    const before = await auditCount();
    const unknown = await reassign(4, 'staff', '9299');
    expect(unknown.status).toBe(400);
    expect(unknown.body.error.message).toContain('9299');
    const { rows } = await pool.query<{ tid_raw: string }>('SELECT tid_raw FROM agentos_intake_lines WHERE id = $1', [lineIds[4]]);
    expect(rows[0]!.tid_raw).toBe('9202');
    expect((await reassign(4, 'staff', 'abc')).status).toBe(400);
    expect((await post(`/api/agentos/lines/${randomUUID()}/reassign`, 'staff').send({ tid: '9201' })).status).toBe(404);
    expect((await post('/api/agentos/lines/nope/reassign', 'staff').send({ tid: '9201' })).status).toBe(404);
    expect((await reassign(4, 'readonly', '9201')).status).toBe(403);
    const anon = await request(app())
      .post(`/api/agentos/lines/${lineIds[4]}/reassign`)
      .set(CSRF_HEADER, CSRF_HEADER_VALUE)
      .send({ tid: '9201' });
    expect(anon.status).toBe(401);
    expect(await auditCount()).toBe(before);
  });

  it('the reassigned line feeds the export, then exported and posted lines are locked', async () => {
    const exp = await post('/api/agentos/exports', 'staff').send({ batchId });
    expect(exp.status).toBe(201);
    expect(exp.body.export.rowsTotal).toBe(4);
    const before = await auditCount();
    expect((await reassign(2, 'staff', '9201')).status).toBe(409);
    expect(await auditCount()).toBe(before);
    expect((await post(`/api/agentos/lines/${lineIds[2]}/posted`, 'staff')).status).toBe(200);
    expect((await reassign(2, 'staff', '9201')).status).toBe(409);
  });
});
