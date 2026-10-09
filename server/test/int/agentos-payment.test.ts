/** agentOS single Take a Payment + Omnia ledger: idempotency, validation, roles, ledger rules, export bytes, audit. */
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
import { TAKE_PAYMENT_HEADER } from '../../src/services/agentos/export.service.js';
import { BOM } from '../../src/services/export/statement-csv.js';

const PASSWORD = 'correct-horse-battery';
const config = loadConfig();
const logger = createLogger({ level: 'silent' });
const run = randomUUID().slice(0, 8);
const BANK = `TSTPAY_${run.toUpperCase()}`;
const BANK_OFF = `TSTOFF_${run.toUpperCase()}`;
let pool: Pool;
const cookies = {} as Record<Role, string>;

const fixtureBytes = (name: string) => readFileSync(new URL(`../fixtures/agentos/${name}`, import.meta.url));
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
const getCsv = (path: string) =>
  get(path, 'readonly')
    .buffer(true)
    .parse((res, cb) => {
      const b: Buffer[] = [];
      res.on('data', (c: Buffer) => b.push(c));
      res.on('end', () => cb(null, Buffer.concat(b)));
    });

async function clean() {
  await pool.query('DELETE FROM agentos_payments');
  await pool.query("DELETE FROM agentos_exports WHERE source = 'manual'");
  await pool.query('TRUNCATE ledger_postings, ledger_transactions CASCADE');
  await pool.query('DELETE FROM bank_accounts WHERE code = ANY($1)', [[BANK, BANK_OFF]]);
  await pool.query('DELETE FROM agentos_tenants');
  await pool.query(
    "DELETE FROM audit_log WHERE table_name IN ('agentos_payments', 'agentos_exports', 'ledger_transactions', 'ledger_postings', 'agentos_tenants', 'bank_accounts')",
  );
}

const count = async (sql: string) => Number((await pool.query<{ n: string }>(sql)).rows[0]!.n);
let tenantId = '';
let tenant2Id = '';
let noTidId = '';
const body = (over: Record<string, unknown> = {}) => ({
  clientRequestId: randomUUID(),
  agentosTenantId: tenantId,
  depositAccountCode: BANK,
  paymentType: 'CARD',
  amountPence: 12345,
  description: 'Deposit, part 1',
  cardAuthCode: ' AB12cd ',
  ...over,
});

beforeAll(async () => {
  pool = createPool({ databaseUrl: config.databaseUrl, hashKey: config.hashKey, max: 8 }, logger);
  await clean();
  await seedAgentosTenants(pool, fixtureBytes('match-tenants.csv').toString('utf8'));
  await pool.query(
    `INSERT INTO bank_accounts (code, bank_name, account_name, is_active) VALUES ($1, 'Test Bank', 'Test Client Account', true), ($2, 'Test Bank', 'Off Account', false)`,
    [BANK, BANK_OFF],
  );
  tenantId = (await pool.query<{ id: string }>("SELECT id FROM agentos_tenants WHERE tid = '9201'")).rows[0]!.id;
  tenant2Id = (await pool.query<{ id: string }>("SELECT id FROM agentos_tenants WHERE tid = '9202'")).rows[0]!.id;
  noTidId = (
    await pool.query<{ id: string }>(
      `INSERT INTO agentos_tenants (source, agentos_oid, tid, forename, surname, managed_by, residence, tenancy_descriptor, deposit_to)
       VALUES ('api', $1, NULL, 'No Tid', 'Person', 'b', 'r', 't', 'd') RETURNING id`,
      [`${run.slice(0, 4)}-${run.slice(4, 8)}-aaaa-bbbb`],
    )
  ).rows[0]!.id;
  for (const role of ['admin', 'accounts', 'staff', 'readonly'] as const) cookies[role] = await signIn(role);
});

afterAll(async () => {
  await clean();
  await pool?.end();
});

describe('take a payment', () => {
  let first: ReturnType<typeof body>;
  let paymentId = '';
  beforeAll(() => {
    first = body();
  });

  it('options list the active deposit accounts and the Card type', async () => {
    const res = await get('/api/agentos/payments/options', 'readonly');
    expect(res.status).toBe(200);
    expect(res.body.paymentTypes).toEqual([{ code: 'CARD', label: 'Card' }]);
    const codes = res.body.depositAccounts.map((a: { code: string }) => a.code);
    expect(codes).toContain(BANK);
    expect(codes).not.toContain(BANK_OFF);
  });

  it('accounts creates a payment: 201, two zero-sum postings, balance returned', async () => {
    const res = await post('/api/agentos/payments', 'accounts').send(first);
    expect(res.status).toBe(201);
    expect(res.body.balancePence).toBe(12345);
    const p = res.body.payment;
    paymentId = p.id;
    expect(p).toMatchObject({
      tid: '9201',
      paymentFrom: '9201 Alex Testperson',
      depositTo: 'Test Client Account',
      cardAuthCode: 'AB12cd',
      postingStatus: 'not_exported',
    });
    const postings = await pool.query<{ account_kind: string; account_ref: string; amount_pence: string }>(
      `SELECT p.account_kind, p.account_ref, p.amount_pence FROM ledger_postings p
         JOIN ledger_transactions t ON t.id = p.transaction_id WHERE t.source_id = $1 ORDER BY p.amount_pence DESC`,
      [paymentId],
    );
    expect(postings.rows.map((r) => [r.account_kind, r.account_ref, Number(r.amount_pence)])).toEqual([
      ['tenant', '9201', 12345],
      ['bank', BANK, -12345],
    ]);
  });

  it('the same clientRequestId replays with 200 and creates nothing new', async () => {
    const res = await post('/api/agentos/payments', 'accounts').send({ ...first, cardAuthCode: 'AB12cd' });
    expect(res.status).toBe(200);
    expect(res.body.payment.id).toBe(paymentId);
    expect(res.body.balancePence).toBe(12345);
    expect(await count('SELECT count(*) AS n FROM agentos_payments')).toBe(1);
    expect(await count('SELECT count(*) AS n FROM ledger_transactions')).toBe(1);
  });

  it('the same clientRequestId with different details is a 409', async () => {
    for (const over of [{ amountPence: 1 }, { agentosTenantId: tenant2Id }, { description: 'other' }, { cardAuthCode: undefined }]) {
      const res = await post('/api/agentos/payments', 'accounts').send({ ...first, ...over });
      expect(res.status).toBe(409);
    }
    expect(await count('SELECT count(*) AS n FROM agentos_payments')).toBe(1);
  });

  it('concurrent double click gives one payment', async () => {
    const b = body({ amountPence: 500 });
    const rs = await Promise.all([post('/api/agentos/payments', 'accounts').send(b), post('/api/agentos/payments', 'accounts').send(b)]);
    expect(rs.map((r) => r.status).sort()).toEqual([200, 201]);
    expect(await count('SELECT count(*) AS n FROM agentos_payments')).toBe(2);
    expect(await count('SELECT count(*) AS n FROM ledger_transactions')).toBe(2);
  });

  it('bad input is a 400 and leaves no rows', async () => {
    const before = [
      await count('SELECT count(*) AS n FROM agentos_payments'),
      await count('SELECT count(*) AS n FROM ledger_transactions'),
    ];
    const bad: Record<string, unknown>[] = [
      { clientRequestId: 'nope' },
      { agentosTenantId: 'nope' },
      { agentosTenantId: randomUUID() },
      { agentosTenantId: noTidId },
      { depositAccountCode: '' },
      { depositAccountCode: 'NO_SUCH_BANK' },
      { depositAccountCode: BANK_OFF },
      { paymentType: 'CASH' },
      { amountPence: 0 },
      { amountPence: -5 },
      { amountPence: 1.5 },
      { amountPence: 10000000000 },
      { description: 'x'.repeat(501) },
      { cardAuthCode: 'bad code!' },
      { cardAuthCode: 'x'.repeat(21) },
    ];
    for (const over of bad) {
      const res = await post('/api/agentos/payments', 'accounts').send(body(over));
      expect(res.status, JSON.stringify(over)).toBe(400);
    }
    const noTid = await post('/api/agentos/payments', 'accounts').send(body({ agentosTenantId: noTidId }));
    expect(JSON.stringify(noTid.body)).toContain('no TID');
    const badAmount = await post('/api/agentos/payments', 'accounts').send(body({ amountPence: 0 }));
    expect(JSON.stringify(badAmount.body)).toContain('Invalid amountPence');
    expect([
      await count('SELECT count(*) AS n FROM agentos_payments'),
      await count('SELECT count(*) AS n FROM ledger_transactions'),
    ]).toEqual(before);
  });

  it('card auth code is optional and a blank one is dropped', async () => {
    const res = await post('/api/agentos/payments', 'accounts').send(body({ cardAuthCode: '   ', description: '', amountPence: 100 }));
    expect(res.status).toBe(201);
    expect(res.body.payment.cardAuthCode).toBeNull();
    const none = await post('/api/agentos/payments', 'accounts').send(body({ cardAuthCode: undefined, description: '', amountPence: 100 }));
    expect(none.status).toBe(201);
    // 12345 + 500 + 100 + 100
    expect(none.body.balancePence).toBe(13045);
  });

  it('only accounts and admin may post; staff and readonly get 403; signed out gets 401', async () => {
    for (const role of ['staff', 'readonly'] as const) {
      expect((await post('/api/agentos/payments', role).send(body())).status).toBe(403);
      expect((await post('/api/agentos/payments/exports', role)).status).toBe(403);
      expect((await post(`/api/agentos/payments/${paymentId}/posted`, role)).status).toBe(403);
    }
    const anon = await request(app()).post('/api/agentos/payments').set(CSRF_HEADER, CSRF_HEADER_VALUE).send(body());
    expect(anon.status).toBe(401);
    expect((await request(app()).get('/api/agentos/payments')).status).toBe(401);
    expect((await request(app()).get('/api/agentos/ledger/9201')).status).toBe(401);
    expect((await post('/api/agentos/payments', 'admin').send(body({ amountPence: 100 }))).status).toBe(201);
    expect((await get('/api/agentos/payments', 'readonly')).status).toBe(200);
  });
});

describe('ledger', () => {
  it('shows the balance and postings for a tid', async () => {
    const res = await get('/api/agentos/ledger/9201', 'readonly');
    expect(res.status).toBe(200);
    expect(res.body.tid).toBe('9201');
    const sum = res.body.postings.reduce((s: number, p: { amountPence: number }) => s + p.amountPence, 0);
    expect(res.body.balancePence).toBe(sum);
    expect(res.body.postings[0]).toMatchObject({ kind: 'take_payment' });
    expect(res.body.postings[0].description).toMatch(/^Take a Payment \(Card\)/);
    expect((await get('/api/agentos/ledger/12', 'readonly')).status).toBe(404);
    expect((await get('/api/agentos/ledger/abcd', 'readonly')).status).toBe(404);
    expect((await get('/api/agentos/ledger/9299', 'readonly')).body).toMatchObject({ balancePence: 0, postings: [] });
    const view = await pool.query<{ balance_pence: string }>(
      "SELECT balance_pence FROM ledger_balances WHERE account_kind = 'tenant' AND account_ref = '9201'",
    );
    expect(Number(view.rows[0]!.balance_pence)).toBe(res.body.balancePence);
  });

  it('every transaction balances to 0', async () => {
    const bad = await count(
      `SELECT count(*) AS n FROM (SELECT transaction_id FROM ledger_postings GROUP BY transaction_id
         HAVING sum(amount_pence) <> 0 OR count(*) < 2) x`,
    );
    expect(bad).toBe(0);
  });

  it('the database refuses UPDATE and DELETE of ledger rows', async () => {
    await expect(pool.query('UPDATE ledger_postings SET amount_pence = amount_pence + 1')).rejects.toThrow(/append-only/);
    await expect(pool.query('DELETE FROM ledger_postings')).rejects.toThrow(/append-only/);
    await expect(pool.query("UPDATE ledger_transactions SET description = 'x'")).rejects.toThrow(/append-only/);
    await expect(pool.query('DELETE FROM ledger_transactions')).rejects.toThrow(/append-only/);
  });

  it('the database refuses an unbalanced or posting-less transaction and a duplicate idempotency key', async () => {
    const u = (await pool.query<{ id: string }>('SELECT id FROM app_users LIMIT 1')).rows[0]!.id;
    const attempt = async (postings: number[], key?: string) => {
      const c = await pool.connect();
      try {
        await c.query('BEGIN');
        const src = randomUUID();
        const t = await c.query<{ id: string }>(
          `INSERT INTO ledger_transactions (kind, source_id, idempotency_key, description, created_by)
           VALUES ('take_payment', $1, $2, 'd', $3) RETURNING id`,
          [src, key ?? `take_payment:${src}`, u],
        );
        for (const a of postings) {
          await c.query(
            `INSERT INTO ledger_postings (transaction_id, account_kind, account_ref, amount_pence) VALUES ($1, 'tenant', '9201', $2)`,
            [t.rows[0]!.id, a],
          );
        }
        await c.query('COMMIT');
      } finally {
        await c.query('ROLLBACK').catch(() => {});
        c.release();
      }
    };
    await expect(attempt([100])).rejects.toThrow(/summing to 0/);
    await expect(attempt([100, -90])).rejects.toThrow(/summing to 0/);
    await expect(attempt([])).rejects.toThrow(/summing to 0/);
    await expect(attempt([100, -100], 'take_payment:not-the-source')).rejects.toThrow(/violates check constraint/);
  });
});

describe('payment export and posting', () => {
  let exportId = '';
  const ids: string[] = [];

  it('exports every not-exported payment once with the exact CSV bytes', async () => {
    await pool.query('DELETE FROM agentos_payments');
    await pool.query("DELETE FROM agentos_exports WHERE source = 'manual'");
    const a = await post('/api/agentos/payments', 'accounts').send(body({ amountPence: 12345 }));
    const b = await post('/api/agentos/payments', 'accounts').send(
      body({ agentosTenantId: tenant2Id, amountPence: 250, description: '', cardAuthCode: undefined }),
    );
    expect([a.status, b.status]).toEqual([201, 201]);
    ids.push(a.body.payment.id, b.body.payment.id);
    const res = await post('/api/agentos/payments/exports', 'accounts');
    expect(res.status).toBe(201);
    expect(res.body.export).toMatchObject({ rowsTotal: 2, amountTotalPence: 12595 });
    exportId = res.body.export.id;
    const csv = await getCsv(`/api/agentos/exports/${exportId}.csv`);
    expect(csv.status).toBe(200);
    expect(csv.headers['content-type']).toContain('text/csv');
    const expected =
      BOM +
      [
        TAKE_PAYMENT_HEADER.join(','),
        `9201,9201 Alex Testperson,Test Client Account,Card,123.45,"Deposit, part 1 | Auth AB12cd | Recon ${ids[0]}"`,
        `9202,9202 Mary Jo O'Testson,Test Client Account,Card,2.50,Recon ${ids[1]}`,
      ].join('\r\n') +
      '\r\n';
    expect(Buffer.isBuffer(csv.body) && (csv.body as Buffer).equals(Buffer.from(expected, 'utf8'))).toBe(true);
    const row = await pool.query<{ batch_id: string | null; source: string }>('SELECT batch_id, source FROM agentos_exports WHERE id = $1', [
      exportId,
    ]);
    expect(row.rows[0]).toEqual({ batch_id: null, source: 'manual' });
  });

  it('a second export is header-only', async () => {
    const res = await post('/api/agentos/payments/exports', 'accounts');
    expect(res.status).toBe(201);
    expect(res.body.export.rowsTotal).toBe(0);
    const csv = await getCsv(`/api/agentos/exports/${res.body.export.id}.csv`);
    expect((csv.body as Buffer).toString('utf8')).toBe(`${BOM}${TAKE_PAYMENT_HEADER.join(',')}\r\n`);
  });

  it('an intake batch export does not pick up manual payments', async () => {
    const p = await post('/api/agentos/payments', 'accounts').send(body({ amountPence: 77 }));
    expect(p.status).toBe(201);
    const batchId = (
      await pool.query<{ id: string }>(
        `INSERT INTO agentos_intake_batches (file_name, file_sha256, rows_total, amount_total_pence, period_from, period_to, uploaded_by)
         SELECT 'manual-test.csv', $1, 1, 1, current_date, current_date, id FROM app_users LIMIT 1 RETURNING id`,
        [randomUUID().replace(/-/g, '').padEnd(64, '0')],
      )
    ).rows[0]!.id;
    const res = await post('/api/agentos/exports', 'staff').send({ batchId });
    expect(res.status).toBe(201);
    expect(res.body.export.rowsTotal).toBe(0);
    await pool.query('DELETE FROM agentos_exports WHERE batch_id = $1', [batchId]);
    await pool.query('DELETE FROM agentos_intake_batches WHERE id = $1', [batchId]);
    const st = await pool.query<{ posting_status: string }>('SELECT posting_status FROM agentos_payments WHERE id = $1', [p.body.payment.id]);
    expect(st.rows[0]!.posting_status).toBe('not_exported');
    ids.push(p.body.payment.id);
  });

  it('mark posted: not-exported is 409, exported works once, then 409; unknown is 404', async () => {
    expect((await post(`/api/agentos/payments/${ids[2]}/posted`, 'accounts')).status).toBe(409);
    const ok = await post(`/api/agentos/payments/${ids[0]}/posted`, 'accounts');
    expect(ok.status).toBe(200);
    expect(ok.body.payment.postingStatus).toBe('posted');
    expect((await post(`/api/agentos/payments/${ids[0]}/posted`, 'accounts')).status).toBe(409);
    expect((await post(`/api/agentos/payments/${randomUUID()}/posted`, 'accounts')).status).toBe(404);
    expect((await post('/api/agentos/payments/nope/posted', 'accounts')).status).toBe(404);
  });

  it('two concurrent exports split the pending payments exactly once', async () => {
    const [a, b] = await Promise.all([post('/api/agentos/payments/exports', 'accounts'), post('/api/agentos/payments/exports', 'admin')]);
    expect(a.status).toBe(201);
    expect(b.status).toBe(201);
    expect([a.body.export.rowsTotal, b.body.export.rowsTotal].sort()).toEqual([0, 1]);
  });

  it('writes audit rows', async () => {
    const n = (table: string, action: string) =>
      count(`SELECT count(*) AS n FROM audit_log WHERE table_name = '${table}' AND action = '${action}'`);
    expect(await n('agentos_payments', 'INSERT')).toBeGreaterThanOrEqual(1);
    expect(await n('agentos_payments', 'UPDATE')).toBeGreaterThanOrEqual(1);
    expect(await n('ledger_transactions', 'INSERT')).toBeGreaterThanOrEqual(1);
    expect(await n('ledger_postings', 'INSERT')).toBeGreaterThanOrEqual(2);
  });
});
