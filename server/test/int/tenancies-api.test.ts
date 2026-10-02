/**
 * /api/tenancies end to end: search, role-based NI visibility and the admin "sync now" endpoint,
 * with a fake Veco source (no network).
 */
import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createApp } from '../../src/api/app.js';
import { CSRF_HEADER, CSRF_HEADER_VALUE, SESSION_COOKIE } from '../../src/api/auth/middleware.js';
import { loadConfig } from '../../src/config/env.js';
import { createPool, type Pool } from '../../src/db/pool.js';
import { createLogger } from '../../src/lib/logger.js';
import { createVecoSyncRunner, VecoSourceError, type SqlSource } from '../../src/jobs/veco-sync/index.js';
import { upsertUser, type Role } from '../../src/services/auth.service.js';
import { vecoRow, vecoRows } from '../fixtures/veco-rows.js';

const PASSWORD = 'correct-horse-battery';
const config = loadConfig();
const keys = { hashKey: config.hashKey, encryptionKey: config.encryptionKey };
const logger = createLogger({ level: 'silent' });
const run = randomUUID().slice(0, 8);
let pool: Pool;
const cookies = {} as Record<Role, string>;

/** Rows the fake Veco returns; tests change it to simulate Veco changing. */
let feed: Record<string, unknown>[] = [];
let vecoDown = false;
const fakeSource: SqlSource = {
  queryRows: async () => {
    if (vecoDown) throw new VecoSourceError('Veco MCP could not be reached');
    return feed;
  },
};

function newApp(source: SqlSource | null = fakeSource) {
  return createApp({ config, pool, logger, vecoSync: createVecoSyncRunner(pool, keys, source) });
}

async function signIn(role: Role): Promise<string> {
  const email = `${role}-ten-${run}@example.test`;
  await upsertUser(pool, { email, fullName: `Ten ${role}`, role, password: PASSWORD });
  const res = await request(newApp()).post('/api/auth/login').set(CSRF_HEADER, CSRF_HEADER_VALUE).send({ email, password: PASSWORD });
  const raw = res.headers['set-cookie'] as unknown as string[];
  return raw.find((c) => c.startsWith(`${SESSION_COOKIE}=`))!.split(';')[0]!;
}

const get = (path: string, role: Role) => request(newApp()).get(path).set('Cookie', cookies[role]);
const syncNow = (role: Role, body: object = {}, source?: SqlSource | null) =>
  request(newApp(source))
    .post('/api/tenancies/sync')
    .set('Cookie', cookies[role])
    .set(CSRF_HEADER, CSRF_HEADER_VALUE)
    .send(body);

beforeAll(async () => {
  pool = createPool({ databaseUrl: config.databaseUrl, hashKey: config.hashKey, max: 4 }, logger);
  await pool.query('TRUNCATE rent_schedules, tenancy_tenants, tenancies, tenants, property_units, properties, branches CASCADE');
  for (const role of ['admin', 'accounts', 'staff', 'readonly'] as const) cookies[role] = await signIn(role);
  feed = [...vecoRows(11), vecoRow(12, { tenantName: 'Zara Q Sample', ni: 'CE 12 34 56 D' })];
  const res = await syncNow('admin');
  expect(res.status).toBe(200);
});

afterAll(async () => {
  await pool?.end();
});

describe('search', () => {
  it('finds by exact TID (case-insensitive)', async () => {
    const res = await get('/api/tenancies?q=t9012', 'readonly');
    expect(res.status).toBe(200);
    expect(res.body.tenancies).toHaveLength(1);
    expect(res.body.tenancies[0]).toMatchObject({
      tid: 'T9012',
      status: 'active',
      tenantName: 'Zara Q Sample',
      niMasked: '•••••56D',
      propertyRef: 'P9001',
      unitRef: 'P9001-3',
      branchCode: 'TSA',
      rent: { amount: '650.00', frequency: 'monthly' },
    });
    expect(JSON.stringify(res.body)).not.toContain('CE123456D');
  });

  it('finds by full NI in any spacing, via the hash', async () => {
    const res = await get(`/api/tenancies?q=${encodeURIComponent('ce123456d')}`, 'staff');
    expect(res.body.tenancies.map((t: { tid: string }) => t.tid)).toEqual(['T9012']);
  });

  it('finds by name, room ref or postcode, escaping wildcards', async () => {
    expect((await get('/api/tenancies?q=zara', 'staff')).body.tenancies).toHaveLength(1);
    expect((await get('/api/tenancies?q=P9001-3', 'staff')).body.tenancies).toHaveLength(1);
    expect((await get('/api/tenancies?q=zz1%201', 'staff')).body.tenancies).toHaveLength(12);
    expect((await get('/api/tenancies?q=%25%25', 'staff')).body.tenancies).toHaveLength(0);
  });

  it('lists active tenancies with no query, and validates input', async () => {
    expect((await get('/api/tenancies', 'readonly')).body.tenancies).toHaveLength(12);
    expect((await get('/api/tenancies?q=z', 'staff')).status).toBe(400);
    expect((await get('/api/tenancies?status=bogus', 'staff')).status).toBe(400);
  });

  it('requires sign-in', async () => {
    expect((await request(newApp()).get('/api/tenancies')).status).toBe(401);
  });
});

describe('detail and NI visibility', () => {
  it('shows the full NI to admin and accounts only', async () => {
    for (const role of ['admin', 'accounts'] as const) {
      const res = await get('/api/tenancies/t9012', role);
      expect(res.status).toBe(200);
      expect(res.body.tenancy).toMatchObject({ tid: 'T9012', ni: 'CE123456D', niMasked: '•••••56D' });
    }
    for (const role of ['staff', 'readonly'] as const) {
      const res = await get('/api/tenancies/T9012', role);
      expect(res.status).toBe(200);
      expect(res.body.tenancy.ni).toBeUndefined();
      expect(JSON.stringify(res.body)).not.toContain('CE123456D');
    }
  });

  it('404s for an unknown TID', async () => {
    expect((await get('/api/tenancies/T0000', 'staff')).status).toBe(404);
  });
});

describe('POST /api/tenancies/sync', () => {
  it('is admin-only', async () => {
    for (const role of ['accounts', 'staff', 'readonly'] as const) {
      expect((await syncNow(role)).status).toBe(403);
    }
  });

  it('reports what changed and is audited as the admin', async () => {
    feed = [...vecoRows(11), vecoRow(12, { tenantName: 'Zara Q Sample', ni: 'CE123456D', rent: 700 })];
    const res = await syncNow('admin');
    expect(res.status).toBe(200);
    expect(res.body.summary).toMatchObject({ fetched: 12, rentChanges: 1, tenancies: { inserted: 0, ended: 0 } });
    const { rows } = await pool.query<{ n: number }>(
      "SELECT count(*)::int AS n FROM audit_log WHERE table_name = 'rent_schedules' AND changed_by = $1",
      [`admin-ten-${run}@example.test`],
    );
    expect(rows[0]!.n).toBeGreaterThanOrEqual(2);
  });

  it('dry run changes nothing', async () => {
    feed = vecoRows(10);
    const res = await syncNow('admin', { dryRun: true, force: true });
    expect(res.status).toBe(200);
    expect(res.body.summary).toMatchObject({ dryRun: true, tenancies: { ended: 2 } });
    expect((await get('/api/tenancies', 'staff')).body.tenancies).toHaveLength(12);
  });

  it('409 when the feed would end too many tenancies; 502 when Veco is down; 503 when not configured', async () => {
    feed = vecoRows(3);
    const refused = await syncNow('admin');
    expect(refused.status).toBe(409);
    expect(refused.body.error.code).toBe('sync_refused');

    vecoDown = true;
    const down = await syncNow('admin');
    vecoDown = false;
    expect(down.status).toBe(502);
    expect(down.body.error.code).toBe('veco_unavailable');

    const off = await syncNow('admin', {}, null);
    expect(off.status).toBe(503);
    expect(off.body.error.code).toBe('veco_not_configured');

    expect((await syncNow('admin', { unexpected: true })).status).toBe(400);
  });
});
