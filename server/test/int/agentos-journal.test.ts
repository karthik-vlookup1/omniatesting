/** agentOS Journal Transfer: zero-sum entries, validation, export-once CSV bytes, mark posted, audit. */
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
import { JOURNAL_HEADER } from '../../src/services/agentos/journal.service.js';
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
  const email = `${role}-aoj-${run}@example.test`;
  await upsertUser(pool, { email, fullName: `Aoj ${role}`, role, password: PASSWORD });
  const res = await request(app()).post('/api/auth/login').set(CSRF_HEADER, CSRF_HEADER_VALUE).send({ email, password: PASSWORD });
  return (res.headers['set-cookie'] as unknown as string[]).find((c) => c.startsWith(`${SESSION_COOKIE}=`))!.split(';')[0]!;
}

const post = (path: string, role: Role) =>
  request(app()).post(path).set('Cookie', cookies[role]).set(CSRF_HEADER, CSRF_HEADER_VALUE);
const get = (path: string, role: Role) => request(app()).get(path).set('Cookie', cookies[role]);
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
  await pool.query('DELETE FROM agentos_tenants');
  await pool.query(
    "DELETE FROM audit_log WHERE table_name IN ('agentos_journal_exports', 'agentos_journal_transfers', 'agentos_journal_entries', 'agentos_tenants')",
  );
}

const valid = {
  fromTid: '9201',
  toTid: '9202',
  amountPence: 12345,
  description: '=SUM(A1) moved',
  nominalCode: '1100',
  accountType: ' Rent ',
};
const count = async (sql: string) => Number((await pool.query<{ n: string }>(sql)).rows[0]!.n);

let transferId = '';

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

describe('journal transfers', () => {
  it('accounts creates a transfer with two zero-sum entries and a trimmed account type', async () => {
    const res = await post('/api/agentos/journal/transfers', 'accounts').send(valid);
    expect(res.status).toBe(201);
    const t = res.body.transfer;
    transferId = t.id;
    expect(t.accountType).toBe('Rent');
    expect(t.postingStatus).toBe('not_exported');
    expect(t.entries.map((e: { side: string; amountPence: number }) => [e.side, e.amountPence])).toEqual([
      ['from', -12345],
      ['to', 12345],
    ]);
    expect(t.entries.reduce((s: number, e: { amountPence: number }) => s + e.amountPence, 0)).toBe(0);
    expect(t.entries.map((e: { person: string }) => e.person)).toEqual(['9201 Alex Testperson', "9202 Mary Jo O'Testson"]);
    const stored = await pool.query<{ account_type: string }>('SELECT account_type FROM agentos_journal_transfers WHERE id = $1', [transferId]);
    expect(stored.rows[0]!.account_type).toBe('Rent');
  });

  it('the database refuses a transfer whose entries do not sum to 0', async () => {
    const c = await pool.connect();
    try {
      await c.query('BEGIN');
      const u = (await c.query<{ id: string }>('SELECT id FROM app_users LIMIT 1')).rows[0]!.id;
      const t = await c.query<{ id: string }>(
        `INSERT INTO agentos_journal_transfers (from_tid, to_tid, amount_pence, description, nominal_code, account_type, created_by)
         VALUES ('9201', '9202', 100, 'd', 'n', 'a', $1) RETURNING id`,
        [u],
      );
      await c.query(
        `INSERT INTO agentos_journal_entries (transfer_id, side, tid, person, branch, property, amount_pence)
         VALUES ($1, 'from', '9201', 'p', 'b', 'r', -100)`,
        [t.rows[0]!.id],
      );
      await expect(c.query('COMMIT')).rejects.toThrow(/summing to 0/);
    } finally {
      await c.query('ROLLBACK').catch(() => {});
      c.release();
    }
  });

  it('rejects bad input without leaving rows', async () => {
    const before = await count('SELECT count(*) AS n FROM agentos_journal_transfers');
    const same = await post('/api/agentos/journal/transfers', 'accounts').send({ ...valid, toTid: '9201' });
    expect(same.status).toBe(400);
    const unknown = await post('/api/agentos/journal/transfers', 'accounts').send({ ...valid, toTid: '9299' });
    expect(unknown.status).toBe(400);
    expect(unknown.body.error?.message ?? unknown.body.message ?? JSON.stringify(unknown.body)).toContain('No agentOS tenant has TID 9299');
    for (const amountPence of [0, -5, 1.5]) {
      expect((await post('/api/agentos/journal/transfers', 'accounts').send({ ...valid, amountPence })).status).toBe(400);
    }
    expect((await post('/api/agentos/journal/transfers', 'accounts').send({ ...valid, description: '   ' })).status).toBe(400);
    expect((await post('/api/agentos/journal/transfers', 'accounts').send({ ...valid, nominalCode: 'x'.repeat(51) })).status).toBe(400);
    expect(await count('SELECT count(*) AS n FROM agentos_journal_transfers')).toBe(before);
  });

  it('enforces roles', async () => {
    const anonGet = await request(app()).get('/api/agentos/journal/transfers');
    expect(anonGet.status).toBe(401);
    const anonPost = await request(app()).post('/api/agentos/journal/transfers').set(CSRF_HEADER, CSRF_HEADER_VALUE).send(valid);
    expect(anonPost.status).toBe(401);
    const list = await get('/api/agentos/journal/transfers', 'readonly');
    expect(list.status).toBe(200);
    expect(list.body.transfers).toHaveLength(1);
    expect((await post('/api/agentos/journal/transfers', 'readonly').send(valid)).status).toBe(403);
    expect((await post('/api/agentos/journal/exports', 'readonly')).status).toBe(403);
    expect((await post(`/api/agentos/journal/transfers/${transferId}/posted`, 'readonly')).status).toBe(403);
  });
});

describe('journal export and posting', () => {
  let exportId = '';

  it('marking a not-exported transfer posted is a 409', async () => {
    expect((await post(`/api/agentos/journal/transfers/${transferId}/posted`, 'accounts')).status).toBe(409);
  });

  it('export returns the exact CSV bytes', async () => {
    const res = await post('/api/agentos/journal/exports', 'accounts');
    expect(res.status).toBe(201);
    expect(res.body.export.transfersTotal).toBe(1);
    expect(res.body.export.amountTotalPence).toBe(12345);
    exportId = res.body.export.id;
    const csv = await getCsv(`/api/agentos/journal/exports/${exportId}.csv`);
    expect(csv.status).toBe(200);
    expect(csv.headers['content-type']).toContain('text/csv');
    expect(csv.headers['content-disposition']).toContain('agentos-journal-transfer-');
    expect(csv.headers['content-disposition']).toContain(`-${exportId.slice(0, 8)}.csv"`);
    const { rows } = await pool.query<{ tid: string; person: string; branch: string; property: string }>(
      `SELECT t.tid, t.forename, t.surname, t.managed_by AS branch, t.residence AS property,
              CASE WHEN t.tid = '9201' THEN '9201 Alex Testperson' ELSE '9202 Mary Jo O''Testson' END AS person
         FROM agentos_tenants t WHERE t.tid IN ('9201', '9202') ORDER BY t.tid`,
    );
    const q = (v: string) => (/[",\r\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v);
    const desc = `'=SUM(A1) moved | Recon ${transferId}`;
    const line = (r: (typeof rows)[number], amount: string) =>
      [desc, '1100', q(r.branch), q(r.person), q(r.property), 'Rent', '', amount].join(',');
    const expected = BOM + [JOURNAL_HEADER.join(','), line(rows[0]!, '-123.45'), line(rows[1]!, '123.45')].join('\r\n') + '\r\n';
    expect(Buffer.isBuffer(csv.body) && (csv.body as Buffer).equals(Buffer.from(expected, 'utf8'))).toBe(true);
  });

  it('a second export is header-only', async () => {
    const res = await post('/api/agentos/journal/exports', 'accounts');
    expect(res.status).toBe(201);
    expect(res.body.export.transfersTotal).toBe(0);
    const csv = await getCsv(`/api/agentos/journal/exports/${res.body.export.id}.csv`);
    expect((csv.body as Buffer).toString('utf8')).toBe(`${BOM}${JOURNAL_HEADER.join(',')}\r\n`);
    expect((await get(`/api/agentos/journal/exports/${randomUUID()}.csv`, 'readonly')).status).toBe(404);
    expect((await get('/api/agentos/journal/exports/nope.csv', 'readonly')).status).toBe(404);
  });

  it('mark posted works once, then 409, and unknown ids are 404', async () => {
    const ok = await post(`/api/agentos/journal/transfers/${transferId}/posted`, 'accounts');
    expect(ok.status).toBe(200);
    expect(ok.body.transfer.postingStatus).toBe('posted');
    const { rows } = await pool.query<{ posted_at: Date | null; posted_by: string | null }>(
      'SELECT posted_at, posted_by FROM agentos_journal_transfers WHERE id = $1',
      [transferId],
    );
    expect(rows[0]!.posted_at).not.toBeNull();
    expect(rows[0]!.posted_by).not.toBeNull();
    expect((await post(`/api/agentos/journal/transfers/${transferId}/posted`, 'accounts')).status).toBe(409);
    expect((await post(`/api/agentos/journal/transfers/${randomUUID()}/posted`, 'accounts')).status).toBe(404);
    expect((await post('/api/agentos/journal/transfers/nope/posted', 'accounts')).status).toBe(404);
  });

  it('two concurrent exports split a new transfer exactly once', async () => {
    expect((await post('/api/agentos/journal/transfers', 'accounts').send(valid)).status).toBe(201);
    const [a, b] = await Promise.all([post('/api/agentos/journal/exports', 'accounts'), post('/api/agentos/journal/exports', 'accounts')]);
    expect(a.status).toBe(201);
    expect(b.status).toBe(201);
    expect([a.body.export.transfersTotal, b.body.export.transfersTotal].sort()).toEqual([0, 1]);
  });

  it('writes audit rows', async () => {
    const n = (table: string, action: string) =>
      count(`SELECT count(*) AS n FROM audit_log WHERE table_name = '${table}' AND action = '${action}'`);
    expect(await n('agentos_journal_transfers', 'INSERT')).toBeGreaterThanOrEqual(1);
    expect(await n('agentos_journal_entries', 'INSERT')).toBeGreaterThanOrEqual(2);
    expect(await n('agentos_journal_exports', 'INSERT')).toBeGreaterThanOrEqual(1);
    expect(await n('agentos_journal_transfers', 'UPDATE')).toBeGreaterThanOrEqual(1);
  });
});

describe('multi-row journal transfers on the Omnia ledger', () => {
  const T = '/api/agentos/journal/transfers';
  const ids: Record<string, string> = {};
  const row = (tid: string, accountType: string, amountPence: number) => ({ agentosTenantId: ids[tid]!, accountType, amountPence });
  const body = (entries: ReturnType<typeof row>[], extra: Record<string, unknown> = {}) => ({
    clientRequestId: randomUUID(),
    description: 'Split',
    nominalCode: '1100',
    entries,
    ...extra,
  });
  const ledgerTx = (id: string) =>
    count(`SELECT count(*) AS n FROM ledger_transactions WHERE kind = 'journal_transfer' AND source_id = '${id}'`);

  beforeAll(async () => {
    const { rows } = await pool.query<{ id: string; tid: string }>("SELECT id, tid FROM agentos_tenants WHERE tid IN ('9201','9202','9203')");
    for (const r of rows) ids[r.tid] = r.id;
    const noTid = await pool.query<{ id: string }>(
      `INSERT INTO agentos_tenants (source, agentos_oid, forename, surname, managed_by, residence, tenancy_descriptor)
       VALUES ('api', 'aaaa-bbbb-cccc-dddd', 'No', 'Tid', 'Test Lettings', 'Nowhere', 'None') RETURNING id`,
    );
    ids['none'] = noTid.rows[0]!.id;
  });

  it('a 3-entry transfer posts 3 ledger postings summing to 0 and moves balances', async () => {
    const res = await post(T, 'accounts').send(body([row('9201', 'Rent', -10000), row('9202', 'Rent', 6000), row('9203', 'Rent', 4000)]));
    expect(res.status).toBe(201);
    const t = res.body.transfer;
    expect(t.fromTid).toBeNull();
    expect(t.toTid).toBeNull();
    expect(t.amountPence).toBe(10000);
    expect(t.entries.map((e: { lineNo: number }) => e.lineNo)).toEqual([1, 2, 3]);
    const p = await pool.query<{ amount_pence: string }>(
      `SELECT p.amount_pence FROM ledger_postings p JOIN ledger_transactions x ON x.id = p.transaction_id WHERE x.source_id = $1`,
      [t.id],
    );
    expect(p.rows).toHaveLength(3);
    expect(p.rows.reduce((s, r) => s + Number(r.amount_pence), 0)).toBe(0);
    const bal = await get('/api/agentos/ledger/9202', 'readonly');
    expect(bal.status).toBe(200);
    expect(bal.body.balancePence).toBeGreaterThanOrEqual(6000);
  });

  it('two account types on one TID are allowed', async () => {
    const res = await post(T, 'accounts').send(body([row('9201', 'Rent', -50), row('9201', 'Deposit', 50)]));
    expect(res.status).toBe(201);
    expect(res.body.transfer.accountType).toBeNull();
  });

  it('every transfer has exactly one ledger transaction', async () => {
    const { rows } = await pool.query<{ id: string }>('SELECT id FROM agentos_journal_transfers');
    expect(rows.length).toBeGreaterThan(0);
    for (const r of rows) expect(await ledgerTx(r.id)).toBe(1);
  });

  it('rejects unbalanced, duplicate, no-TID, unknown tenant and 21 entries with no rows', async () => {
    const before = await count('SELECT count(*) AS n FROM agentos_journal_transfers');
    const txBefore = await count('SELECT count(*) AS n FROM ledger_transactions');
    const unbalanced = await post(T, 'accounts').send(body([row('9201', 'Rent', -100), row('9202', 'Rent', 99)]));
    expect(unbalanced.status).toBe(400);
    expect(JSON.stringify(unbalanced.body)).toContain('Entries must add up to');
    const dup = await post(T, 'accounts').send(body([row('9201', 'Rent', -100), row('9201', ' rent', 100)]));
    expect(dup.status).toBe(400);
    expect(JSON.stringify(dup.body)).toContain('Entry 2');
    const noTid = await post(T, 'accounts').send(body([row('9201', 'Rent', -100), row('none', 'Rent', 100)]));
    expect(noTid.status).toBe(400);
    expect(JSON.stringify(noTid.body)).toContain('Entry 2: tenant has no TID');
    const ghost = await post(T, 'accounts').send(
      body([row('9201', 'Rent', -100), { ...row('9202', 'Rent', 100), agentosTenantId: randomUUID() }]),
    );
    expect(ghost.status).toBe(400);
    expect(JSON.stringify(ghost.body)).toContain('Entry 2: no such agentOS tenant');
    const many = Array.from({ length: 21 }, (_, i) => row(i % 2 ? '9202' : '9201', `T${i}`, i % 2 ? 1 : -1));
    expect((await post(T, 'accounts').send(body(many))).status).toBe(400);
    const zero = await post(T, 'accounts').send(body([row('9201', 'Rent', 0), row('9202', 'Rent', 0)]));
    expect(zero.status).toBe(400);
    expect(JSON.stringify(zero.body)).toContain('entries.0.amountPence');
    expect(await count('SELECT count(*) AS n FROM agentos_journal_transfers')).toBe(before);
    expect(await count('SELECT count(*) AS n FROM ledger_transactions')).toBe(txBefore);
  });

  it('a replay gives 200 with one ledger tx; a changed body gives 409', async () => {
    const b = body([row('9201', 'Rent', -300), row('9202', 'Rent', 100), row('9203', 'Rent', 200)]);
    const first = await post(T, 'accounts').send(b);
    expect(first.status).toBe(201);
    const again = await post(T, 'accounts').send(b);
    expect(again.status).toBe(200);
    expect(again.body.transfer.id).toBe(first.body.transfer.id);
    expect(await ledgerTx(first.body.transfer.id)).toBe(1);
    const changed = await post(T, 'accounts').send({
      ...b,
      entries: [row('9201', 'Rent', -301), row('9202', 'Rent', 101), row('9203', 'Rent', 200)],
    });
    expect(changed.status).toBe(409);
  });

  it('a legacy transfer posts to the ledger and a 3-entry export writes 3 rows in line order', async () => {
    const exp0 = await post('/api/agentos/journal/exports', 'accounts');
    expect(exp0.status).toBe(201);
    const legacy = await post(T, 'accounts').send(valid);
    expect(legacy.status).toBe(201);
    expect(await ledgerTx(legacy.body.transfer.id)).toBe(1);
    const three = await post(T, 'accounts').send(body([row('9203', 'Deposit', -900), row('9201', 'Rent', 500), row('9202', 'Fees', 400)]));
    expect(three.status).toBe(201);
    const exp = await post('/api/agentos/journal/exports', 'accounts');
    expect(exp.status).toBe(201);
    expect(exp.body.export.transfersTotal).toBe(2);
    const csv = ((await getCsv(`/api/agentos/journal/exports/${exp.body.export.id}.csv`)).body as Buffer).toString('utf8');
    const lines = csv.trim().split('\r\n').slice(1);
    expect(lines).toHaveLength(5);
    expect(lines.slice(2).map((l) => l.split(',').slice(-3)[0])).toEqual(['Deposit', 'Rent', 'Fees']);
    expect(lines.slice(2).map((l) => l.split(',').pop())).toEqual(['-9.00', '5.00', '4.00']);
  });

  it('only accounts and admin may post; anonymous is 401', async () => {
    const b = body([row('9201', 'Rent', -1), row('9202', 'Rent', 1)]);
    expect((await post(T, 'staff').send(b)).status).toBe(403);
    expect((await post(T, 'readonly').send(b)).status).toBe(403);
    expect((await request(app()).post(T).set(CSRF_HEADER, CSRF_HEADER_VALUE).send(b)).status).toBe(401);
    expect((await post(T, 'admin').send(b)).status).toBe(201);
  });

  it('staff cannot export or mark posted (403); accounts can export', async () => {
    expect((await post('/api/agentos/journal/exports', 'staff')).status).toBe(403);
    expect((await post(`/api/agentos/journal/transfers/${transferId}/posted`, 'staff')).status).toBe(403);
    expect((await post('/api/agentos/journal/exports', 'accounts')).status).toBe(201);
  });

  it('two concurrent posts with one clientRequestId give one 201, one 200 and one ledger transaction', async () => {
    const b = body([row('9201', 'Rent', -700), row('9202', 'Rent', 700)]);
    const [x, y] = await Promise.all([post(T, 'accounts').send(b), post(T, 'accounts').send(b)]);
    expect([x.status, y.status].sort()).toEqual([200, 201]);
    expect(x.body.transfer.id).toBe(y.body.transfer.id);
    expect(await ledgerTx(x.body.transfer.id)).toBe(1);
    expect(await count(`SELECT count(*) AS n FROM agentos_journal_transfers WHERE client_request_id = '${b.clientRequestId}'`)).toBe(1);
  });
});
