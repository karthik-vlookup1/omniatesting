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
import { decideMatch, expectedTenantName, normaliseText, payerTypeFor, type MatchCandidate } from '../../src/domain/agentos/match.js';

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

const cand = (id: string, tid: string, forename: string, surname: string, tenancyOid: string | null = null, isHeadTenant = true): MatchCandidate => ({
  id, tid, forename, surname, agentosRef: `ten-${id}`, tenancyOid, isHeadTenant,
});
const un = { status: 'unmatched', tenantId: null };

describe('decideMatch (pure)', () => {
  it('normalises text and the expected tenant name', () => {
    expect(normaliseText('  A 	 B ')).toBe('a b');
    expect(expectedTenantName({ tid: '9202', forename: '9202 Mary  Jo', surname: "O'Testson" })).toBe("mary jo o'testson");
  });

  it('rule 1: no kind or no TIDs is unmatched', () => {
    const c = [cand('1', '9001', '9001 Ann', 'Lee')];
    expect(decideMatch({ kind: null, tids: ['9001'], preferredNames: [] }, c)).toEqual(un);
    expect(decideMatch({ kind: 'tid', tids: [], preferredNames: [] }, c)).toEqual(un);
  });

  it('rule 2: more than one distinct TID is ambiguous', () => {
    const c = [cand('1', '9001', '9001 Ann', 'Lee'), cand('2', '9002', '9002 Bob', 'Lee')];
    expect(decideMatch({ kind: 'ni', tids: ['9001', '9002'], preferredNames: [] }, c)).toEqual({ status: 'ambiguous', tenantId: null });
    expect(decideMatch({ kind: 'ni', tids: ['9001', '9001'], preferredNames: [] }, c).status).toBe('matched');
  });

  it('rule 3: a TID with no agentOS tenant is unmatched', () => {
    expect(decideMatch({ kind: 'tid', tids: ['9009'], preferredNames: [] }, [cand('1', '9001', '9001 Ann', 'Lee')])).toEqual(un);
  });

  it('rule 4: a reference picks the joint tenant core named', () => {
    const two = [cand('1', '9001', '9001 Ann', 'Lee', 'o1'), cand('2', '9001', '9001 Bob', 'Lee', 'o1', false)];
    expect(decideMatch({ kind: 'ni', tids: ['9001'], preferredNames: ['bob  LEE'] }, two)).toEqual({ status: 'matched', tenantId: '2' });
    expect(decideMatch({ kind: 'account', tids: ['9001'], preferredNames: ['Zed Lee'] }, two)).toEqual({ status: 'matched', tenantId: '1' });
    expect(decideMatch({ kind: 'tid', tids: ['9001'], preferredNames: ['Bob Lee'] }, two)).toEqual({ status: 'matched', tenantId: '1' });
  });

  it('rule 5: one candidate, or one tenancy, goes to the lead; otherwise ambiguous', () => {
    expect(decideMatch({ kind: 'tid', tids: ['9001'], preferredNames: [] }, [cand('1', '9001', '9001 Ann', 'Lee')])).toEqual({ status: 'matched', tenantId: '1' });
    const same = [cand('2', '9001', '9001 Bob', 'Lee', 'o1', false), cand('1', '9001', '9001 Ann', 'Lee', 'o1')];
    expect(decideMatch({ kind: 'tid', tids: ['9001'], preferredNames: [] }, same)).toEqual({ status: 'matched', tenantId: '1' });
    const diff = [cand('1', '9001', '9001 Ann', 'Lee', 'o1'), cand('2', '9001', '9001 Bob', 'Lee', 'o2')];
    expect(decideMatch({ kind: 'tid', tids: ['9001'], preferredNames: [] }, diff)).toEqual({ status: 'ambiguous', tenantId: null });
    const none = [cand('1', '9001', '9001 Ann', 'Lee'), cand('2', '9001', '9001 Bob', 'Lee')];
    expect(decideMatch({ kind: 'tid', tids: ['9001'], preferredNames: [] }, none).status).toBe('ambiguous');
  });

  it('payer type follows the kind', () => {
    expect(payerTypeFor('tid')).toBe('third_party');
    expect(payerTypeFor('ni')).toBe('tenant');
    expect(payerTypeFor('account')).toBe('tenant');
    expect(payerTypeFor(null)).toBeNull();
  });
});

const EXPECTED: { lineNo: number; status: string; tid: string | null }[] = [
  { lineNo: 2, status: 'matched', tid: '9201' },
  { lineNo: 3, status: 'matched', tid: '9202' },
  { lineNo: 4, status: 'matched', tid: '9201' },
  { lineNo: 5, status: 'matched', tid: '9203' },
  { lineNo: 6, status: 'matched', tid: '9203' },
  { lineNo: 7, status: 'unmatched', tid: null },
  { lineNo: 8, status: 'unmatched', tid: null },
  { lineNo: 9, status: 'matched', tid: '9201' },
];
const expectedRows = () => EXPECTED.map((e) => ({ lineNo: e.lineNo, status: e.status, tenant: e.tid ? tenantId[e.tid]! : null }));

describe('intake matching end to end', () => {
  it('staff upload returns the match counts', async () => {
    const res = await uploadBytes('staff', fixtureBytes('match-lines.csv'));
    expect(res.status).toBe(201);
    expect(res.body.batch.rowsTotal).toBe(8);
    expect(res.body.batch.amountTotalPence).toBe(25600);
    expect(res.body.batch.matchCounts).toEqual({ matched: 6, ambiguous: 0, unmatched: 2 });
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
    const { rows: pt } = await pool.query<{ payer_type: string | null; match_status: string }>(
      'SELECT payer_type, match_status FROM agentos_intake_lines WHERE batch_id = $1', [batchId]);
    expect(pt.every((r) => (r.match_status === 'matched' ? r.payer_type === 'third_party' : r.payer_type === null))).toBe(true);
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

  it('a T-prefixed TID is normalised and ends up matched', async () => {
    const csv = [
      'Date,TID,Payer Name,Amount,Type,Will deposit to,Description',
      '01/09/2026,T9201,Alex Testperson,10.00,Cash,Test Lettings - Client Account,t prefix',
      '01/09/2026,t9202,Mary Jo O\'Testson,10.00,Cash,Test Lettings - Client Account,lower t',
    ].join('\n');
    const res = await uploadBytes('staff', Buffer.from(csv));
    expect(res.status).toBe(201);
    expect(res.body.batch.matchCounts).toEqual({ matched: 2, ambiguous: 0, unmatched: 0 });
    const { rows } = await pool.query<{ tid_raw: string; match_status: string; agentos_tenant_id: string }>(
      'SELECT tid_raw, match_status, agentos_tenant_id FROM agentos_intake_lines WHERE batch_id = $1 ORDER BY line_no',
      [res.body.batch.batchId],
    );
    expect(rows.map((r) => [r.tid_raw, r.match_status, r.agentos_tenant_id])).toEqual([
      ['9201', 'matched', tenantId['9201']],
      ['9202', 'matched', tenantId['9202']],
    ]);
  });

  it('with no tenants every line is unmatched', async () => {
    await pool.query('DELETE FROM agentos_tenants');
    const res = await uploadBytes('staff', Buffer.concat([fixtureBytes('match-lines.csv'), Buffer.from('\n')]));
    expect(res.status).toBe(201);
    expect(res.body.batch.matchCounts).toEqual({ matched: 0, ambiguous: 0, unmatched: 8 });
    const { rows } = await pool.query<{ match_status: string; agentos_tenant_id: string | null }>(
      'SELECT match_status, agentos_tenant_id FROM agentos_intake_lines WHERE batch_id = $1',
      [res.body.batch.batchId],
    );
    expect(rows).toHaveLength(8);
    expect(rows.every((r) => r.match_status === 'unmatched' && r.agentos_tenant_id === null)).toBe(true);
  });
});
