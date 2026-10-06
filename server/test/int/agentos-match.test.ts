/** agentOS intake matching: pure decision rules plus the upload path end to end. */
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
import { decideMatch, expectedTenantName, normaliseText, type MatchCandidate } from '../../src/domain/agentos/match.js';

const PASSWORD = 'correct-horse-battery';
const config = loadConfig();
const logger = createLogger({ level: 'silent' });
const run = randomUUID().slice(0, 8);
let pool: Pool;
const cookies = {} as Record<Role, string>;

const fixtureBytes = (name: string) => readFileSync(new URL(`../fixtures/agentos/${name}`, import.meta.url));
const app = () => createApp({ config, pool, logger });

async function signIn(role: Role): Promise<string> {
  const email = `${role}-aom-${run}@example.test`;
  await upsertUser(pool, { email, fullName: `Aom ${role}`, role, password: PASSWORD });
  const res = await request(app()).post('/api/auth/login').set(CSRF_HEADER, CSRF_HEADER_VALUE).send({ email, password: PASSWORD });
  return (res.headers['set-cookie'] as unknown as string[]).find((c) => c.startsWith(`${SESSION_COOKIE}=`))!.split(';')[0]!;
}

const post = (path: string, role: Role) =>
  request(app()).post(path).set('Cookie', cookies[role]).set(CSRF_HEADER, CSRF_HEADER_VALUE);
const get = (path: string, role: Role) => request(app()).get(path).set('Cookie', cookies[role]);
const uploadBytes = (role: Role, content: Buffer) => post('/api/agentos/intake', role).attach('file', content, 'match-lines.csv');

async function clean() {
  await pool.query('TRUNCATE agentos_intake_batches CASCADE');
  await pool.query('DELETE FROM agentos_tenants');
  await pool.query(
    "DELETE FROM audit_log WHERE table_name IN ('agentos_intake_lines', 'agentos_intake_batches', 'agentos_tenants')",
  );
}

let batchId = '';
const tenantId: Record<string, string> = {};

beforeAll(async () => {
  pool = createPool({ databaseUrl: config.databaseUrl, hashKey: config.hashKey, max: 4 }, logger);
  await clean();
  await seedAgentosTenants(pool, fixtureBytes('match-tenants.csv').toString('utf8'));
  const { rows } = await pool.query<{ id: string; tid: string }>('SELECT id, tid FROM agentos_tenants');
  for (const r of rows) tenantId[r.tid] = r.id;
  for (const role of ['admin', 'accounts', 'staff', 'readonly'] as const) cookies[role] = await signIn(role);
});

afterAll(async () => {
  await clean();
  await pool?.end();
});

const cand = (id: string, tid: string, forename: string, surname: string, depositTo = 'Acct A'): MatchCandidate => ({
  id, tid, forename, surname, depositTo, agentosRef: `ten-${id}`,
});

describe('decideMatch (pure)', () => {
  it('normalises text and the expected tenant name', () => {
    expect(normaliseText('  A \t B ')).toBe('a b');
    expect(expectedTenantName({ tid: '9202', forename: '9202 Mary  Jo', surname: "O'Testson" })).toBe("mary jo o'testson");
  });

  it('covers all four statuses', () => {
    const c = [cand('1', '9001', '9001 Ann', 'Lee')];
    expect(decideMatch({ tid: '9001', payerName: 'ann lee', depositTo: ' acct a ' }, c)).toEqual({ status: 'matched', tenantId: '1' });
    expect(decideMatch({ tid: '9001', payerName: 'ann lee', depositTo: 'Acct B' }, c)).toEqual({ status: 'deposit_mismatch', tenantId: '1' });
    expect(decideMatch({ tid: '9001', payerName: 'ann lea', depositTo: 'Acct A' }, c)).toEqual({ status: 'name_mismatch', tenantId: '1' });
    expect(decideMatch({ tid: '9002', payerName: 'ann lee', depositTo: 'Acct A' }, c)).toEqual({ status: 'unmatched', tenantId: null });
    expect(decideMatch({ tid: null, payerName: 'ann lee', depositTo: 'Acct A' }, c)).toEqual({ status: 'unmatched', tenantId: null });
  });

  it('name mismatch wins when both fail', () => {
    const c = [cand('1', '9001', '9001 Ann', 'Lee')];
    expect(decideMatch({ tid: '9001', payerName: 'zed', depositTo: 'Acct B' }, c).status).toBe('name_mismatch');
  });

  it('handles joint tenants', () => {
    const two = [cand('1', '9001', '9001 Ann', 'Lee'), cand('2', '9001', '9001 Bob', 'Lee')];
    expect(decideMatch({ tid: '9001', payerName: 'Bob Lee', depositTo: 'Acct A' }, two)).toEqual({ status: 'matched', tenantId: '2' });
    const both = [cand('1', '9001', '9001 Ann', 'Lee'), cand('2', '9001', '9001 Ann', 'Lee')];
    expect(decideMatch({ tid: '9001', payerName: 'Ann Lee', depositTo: 'Acct A' }, both)).toEqual({ status: 'name_mismatch', tenantId: null });
    expect(decideMatch({ tid: '9001', payerName: 'Zed Lee', depositTo: 'Acct A' }, two)).toEqual({ status: 'name_mismatch', tenantId: null });
  });
});

const EXPECTED: { lineNo: number; status: string; tid: string | null }[] = [
  { lineNo: 2, status: 'matched', tid: '9201' },
  { lineNo: 3, status: 'matched', tid: '9202' },
  { lineNo: 4, status: 'name_mismatch', tid: '9201' },
  { lineNo: 5, status: 'deposit_mismatch', tid: '9203' },
  { lineNo: 6, status: 'name_mismatch', tid: '9203' },
  { lineNo: 7, status: 'unmatched', tid: null },
  { lineNo: 8, status: 'unmatched', tid: null },
  { lineNo: 9, status: 'name_mismatch', tid: '9201' },
];
const expectedRows = () => EXPECTED.map((e) => ({ lineNo: e.lineNo, status: e.status, tenant: e.tid ? tenantId[e.tid]! : null }));

describe('intake matching end to end', () => {
  it('staff upload returns the match counts', async () => {
    const res = await uploadBytes('staff', fixtureBytes('match-lines.csv'));
    expect(res.status).toBe(201);
    expect(res.body.batch.rowsTotal).toBe(8);
    expect(res.body.batch.amountTotalPence).toBe(25600);
    expect(res.body.batch.matchCounts).toEqual({ matched: 2, name_mismatch: 3, deposit_mismatch: 1, unmatched: 2 });
    batchId = res.body.batch.batchId;
  });

  it('stores status and tenant per line, none pending, all not_ready', async () => {
    const { rows } = await pool.query<{ line_no: number; match_status: string; agentos_tenant_id: string | null; posting_status: string }>(
      'SELECT line_no, match_status, agentos_tenant_id, posting_status FROM agentos_intake_lines WHERE batch_id = $1 ORDER BY line_no',
      [batchId],
    );
    expect(rows.map((r) => ({ lineNo: r.line_no, status: r.match_status, tenant: r.agentos_tenant_id }))).toEqual(expectedRows());
    expect(rows.some((r) => r.match_status === 'pending')).toBe(false);
    expect(rows.every((r) => r.posting_status === 'not_ready')).toBe(true);
  });

  it('GET returns matchStatus and agentosTenantId in line order', async () => {
    const res = await get(`/api/agentos/intake/${batchId}`, 'readonly');
    expect(res.status).toBe(200);
    expect(
      res.body.lines.map((l: { lineNo: number; matchStatus: string; agentosTenantId: string | null }) => ({
        lineNo: l.lineNo, status: l.matchStatus, tenant: l.agentosTenantId,
      })),
    ).toEqual(expectedRows());
  });

  it('with no tenants every line is unmatched', async () => {
    await pool.query('DELETE FROM agentos_tenants');
    const res = await uploadBytes('staff', Buffer.concat([fixtureBytes('match-lines.csv'), Buffer.from('\n')]));
    expect(res.status).toBe(201);
    expect(res.body.batch.matchCounts).toEqual({ matched: 0, name_mismatch: 0, deposit_mismatch: 0, unmatched: 8 });
    const { rows } = await pool.query<{ match_status: string; agentos_tenant_id: string | null }>(
      'SELECT match_status, agentos_tenant_id FROM agentos_intake_lines WHERE batch_id = $1',
      [res.body.batch.batchId],
    );
    expect(rows).toHaveLength(8);
    expect(rows.every((r) => r.match_status === 'unmatched' && r.agentos_tenant_id === null)).toBe(true);
  });
});
