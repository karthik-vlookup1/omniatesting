/**
 * Bank CSV ingest end to end: default banks, uploads of all 7 synthetic layouts, re-upload and
 * overlap dedupe, rejected layouts/rows, profile versions and permissions.
 */
import { readFileSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createApp } from '../../src/api/app.js';
import { CSRF_HEADER, CSRF_HEADER_VALUE, SESSION_COOKIE } from '../../src/api/auth/middleware.js';
import { loadConfig } from '../../src/config/env.js';
import { createPool, type Pool } from '../../src/db/pool.js';
import { DEFAULT_BANKS } from '../../src/domain/ingest/profiles.js';
import { createLogger } from '../../src/lib/logger.js';
import { upsertUser, type Role } from '../../src/services/auth.service.js';

const PASSWORD = 'correct-horse-battery';
const config = loadConfig();
const logger = createLogger({ level: 'silent' });
const run = randomUUID().slice(0, 8);
let pool: Pool;
const cookies = {} as Record<Role, string>;
const bankIds: Record<string, string> = {};

const fixture = (name: string) => readFileSync(new URL(`../../../fixtures/banks/${name}`, import.meta.url));
const app = () => createApp({ config, pool, logger });

async function signIn(role: Role): Promise<string> {
  const email = `${role}-ing-${run}@example.test`;
  await upsertUser(pool, { email, fullName: `Ing ${role}`, role, password: PASSWORD });
  const res = await request(app()).post('/api/auth/login').set(CSRF_HEADER, CSRF_HEADER_VALUE).send({ email, password: PASSWORD });
  return (res.headers['set-cookie'] as unknown as string[]).find((c) => c.startsWith(`${SESSION_COOKIE}=`))!.split(';')[0]!;
}

const post = (path: string, role: Role) =>
  request(app()).post(path).set('Cookie', cookies[role]).set(CSRF_HEADER, CSRF_HEADER_VALUE);

function upload(role: Role, code: string, file: string, content?: Buffer | string) {
  return post('/api/imports', role)
    .field('bankAccountId', bankIds[code] ?? code)
    .attach('file', content === undefined ? fixture(file) : Buffer.from(content), file);
}

async function one<T>(sql: string, params: unknown[] = []): Promise<T> {
  const { rows } = await pool.query(sql, params);
  return rows[0] as T;
}

beforeAll(async () => {
  pool = createPool({ databaseUrl: config.databaseUrl, hashKey: config.hashKey, max: 4 }, logger);
  await pool.query('TRUNCATE match_suggestions, bank_transactions, import_batches, bank_csv_profiles, bank_accounts CASCADE');
  for (const role of ['admin', 'accounts', 'staff', 'readonly'] as const) cookies[role] = await signIn(role);
});

afterAll(async () => {
  await pool?.end();
});

describe('default banks', () => {
  it('admin installs the 7 banks with a profile each, idempotently', async () => {
    const first = await post('/api/bank-accounts/defaults', 'admin');
    expect(first.status).toBe(200);
    expect(first.body.created.sort()).toEqual(DEFAULT_BANKS.map((b) => b.code).sort());
    const again = await post('/api/bank-accounts/defaults', 'admin');
    expect(again.body.created).toEqual([]);

    const list = await request(app()).get('/api/bank-accounts').set('Cookie', cookies.readonly);
    expect(list.status).toBe(200);
    expect(list.body.bankAccounts).toHaveLength(7);
    for (const b of list.body.bankAccounts as { code: string; id: string; profile: { version: number } }[]) {
      expect(b.profile.version).toBe(1);
      bankIds[b.code] = b.id;
    }
  });

  it('only admin can install defaults or create bank accounts', async () => {
    expect((await post('/api/bank-accounts/defaults', 'accounts')).status).toBe(403);
    expect((await post('/api/bank-accounts', 'staff').send({ code: 'X1', bankName: 'X', accountName: 'X' })).status).toBe(403);
    const created = await post('/api/bank-accounts', 'admin').send({ code: 'extra_1', bankName: 'Extra', accountName: 'Extra rent' });
    expect(created.status).toBe(201);
    expect((await post('/api/bank-accounts', 'admin').send({ code: 'EXTRA_1', bankName: 'E', accountName: 'E' })).status).toBe(409);
    bankIds.EXTRA_1 = created.body.id as string;
  });
});

describe('importing the 7 synthetic layouts', () => {
  // [code, inserted, withTid, withNi, withPayerAccount, moneyOut]
  const cases: [string, number, number, number, number, number][] = [
    ['HSBC', 6, 2, 1, 0, 1],
    ['LLOYDS', 4, 1, 1, 0, 1],
    ['APOLLO_TW', 3, 1, 1, 0, 1],
    ['REDSTONE', 3, 1, 0, 3, 1],
    ['ARMY', 3, 2, 0, 0, 1],
    ['ISL', 3, 1, 0, 3, 1],
    ['OTHER', 3, 2, 0, 0, 1],
  ];
  it.each(cases)('%s: %i lines, %i TIDs, %i NIs, %i payer accounts, %i out', async (code, inserted, tid, ni, payer, out) => {
    const file = DEFAULT_BANKS.find((b) => b.code === code)!.fixture;
    const res = await upload('staff', code, file);
    expect(res.status).toBe(201);
    expect(res.body.import).toMatchObject({
      rowsTotal: inserted,
      rowsInserted: inserted,
      rowsDuplicate: 0,
      withTid: tid,
      withNi: ni,
      withPayerAccount: payer,
      moneyOut: out,
      moneyIn: inserted - out,
    });
  });

  it('extracts TIDs with the SQL extract_tid (incl. "T 9003", t9017 and a reference column)', async () => {
    const { rows } = await pool.query<{ extracted_tid: string }>(
      'SELECT extracted_tid FROM bank_transactions WHERE extracted_tid IS NOT NULL ORDER BY extracted_tid',
    );
    expect(rows.map((r) => r.extracted_tid)).toEqual([
      'T9001', 'T9003', 'T9006', 'T9008', 'T9011', 'T9012', 'T9013', 'T9015', 'T9016', 'T9017',
    ]);
  });

  it('stores the NI only as the same hash SQL secure_hash() gives, never in plain text', async () => {
    const r = await one<{ same: boolean; plain: number; masked: number }>(
      `SELECT (SELECT count(*) = 1 FROM bank_transactions WHERE extracted_ni_hash = secure_hash('AB100002C')) AS same,
              (SELECT count(*)::int FROM bank_transactions
                WHERE row_to_json(bank_transactions)::text ~* 'AB ?10 ?00 ?0[29] ?C|CE ?12 ?34 ?56 ?D') AS plain,
              (SELECT count(*)::int FROM bank_transactions WHERE description LIKE '%•••••02C%') AS masked`,
    );
    expect(r).toEqual({ same: true, plain: 0, masked: 1 });
  });

  it('stores payer accounts as hash + last 4 only, matching the TS/SQL hash', async () => {
    const r = await one<{ ok: boolean; plain: number }>(
      `SELECT (SELECT payer_account_hash = secure_hash('00001012340010') AND payer_account_last4 = '0010'
                 FROM bank_transactions WHERE payer_sort_code = '000010') AS ok,
              (SELECT count(*)::int FROM bank_transactions WHERE row_to_json(bank_transactions)::text LIKE '%12340010%') AS plain`,
    );
    expect(r).toEqual({ ok: true, plain: 0 });
  });

  it('keeps the masked raw row, the bank id and the profile used', async () => {
    const r = await one<{ raw: Record<string, string>; profile_ok: boolean; status: string }>(
      `SELECT bt.raw_row AS raw, bt.profile_id = p.id AS profile_ok, bt.status::text AS status
         FROM bank_transactions bt JOIN bank_csv_profiles p ON p.bank_account_id = bt.bank_account_id AND p.is_active
        WHERE bt.description = 'Received money from TEST TENANT8'`,
    );
    expect(r.raw).toMatchObject({ 'TransferWise ID': 'TRANSFER-900001', 'Payment Reference': 'T9008 SEPT' });
    expect(r.profile_ok).toBe(true);
    // Upload runs matching straight away (recon-202), so no line is left 'new'.
    expect(['matched', 'needs_review', 'yet_to_take']).toContain(r.status);
  });
});

describe('dedupe', () => {
  it('rejects the exact same file again, pointing at the earlier import', async () => {
    const res = await upload('staff', 'HSBC', 'hsbc-renamed.csv', fixture('hsbc.csv').toString());
    expect(res.status).toBe(409);
    expect(res.body.error.message).toContain('already imported (as "hsbc.csv"');
    expect(res.body.error.details.batchId).toMatch(/^[0-9a-f-]{36}$/);
  });

  it('an overlapping statement inserts only the new lines', async () => {
    const res = await upload('accounts', 'HSBC', 'hsbc_overlap.csv');
    expect(res.status).toBe(201);
    expect(res.body.import).toMatchObject({ rowsTotal: 4, rowsInserted: 2, rowsDuplicate: 2, withTid: 1 });
    const n = await one<{ n: number }>(
      "SELECT count(*)::int AS n FROM bank_transactions bt JOIN bank_accounts b ON b.id = bt.bank_account_id WHERE b.code = 'HSBC'",
    );
    expect(n.n).toBe(8);
  });

  it('a bank account without a CSV profile refuses uploads', async () => {
    const res = await upload('staff', 'EXTRA_1', 'x.csv', 'x');
    expect(res.status).toBe(400); // no profile yet
    expect(res.body.error.message).toContain('no CSV profile');
  });
});

describe('rejected files leave nothing behind', () => {
  it('an unknown layout names the missing fields', async () => {
    const before = await one<{ n: number }>('SELECT count(*)::int AS n FROM import_batches');
    const res = await upload('staff', 'HSBC', 'hsbc_wrong_layout.csv');
    expect(res.status).toBe(400);
    expect(res.body.error.details.reason).toBe('layout_mismatch');
    expect(res.body.error.details.missingFields).toEqual(expect.arrayContaining(['txn_date', 'description']));
    expect(res.body.error.message).toContain('Missing: ');
    expect((await one<{ n: number }>('SELECT count(*)::int AS n FROM import_batches')).n).toBe(before.n);
  });

  it('bad rows are listed by line and nothing is imported', async () => {
    const res = await upload('staff', 'HSBC', 'hsbc_bad_rows.csv');
    expect(res.status).toBe(400);
    expect(res.body.error.details.rowErrors).toHaveLength(3);
    expect((await one<{ n: number }>("SELECT count(*)::int AS n FROM bank_transactions WHERE description = 'OK LINE T9001'")).n).toBe(0);
  });

  it('validates the request', async () => {
    expect((await post('/api/imports', 'staff').field('bankAccountId', 'nope').attach('file', fixture('hsbc.csv'), 'a.csv')).status).toBe(400);
    expect((await post('/api/imports', 'staff').field('bankAccountId', bankIds.HSBC!)).status).toBe(400);
    expect((await upload('staff', randomUUID(), 'a.csv', 'Date\n')).status).toBe(404);
    expect((await upload('readonly', 'HSBC', 'hsbc_overlap.csv')).status).toBe(403);
    expect((await request(app()).post('/api/imports').set(CSRF_HEADER, CSRF_HEADER_VALUE)).status).toBe(401);
  });

  it('rejects files over 10 MB', async () => {
    const big = Buffer.alloc(10 * 1024 * 1024 + 1, 'a');
    const res = await upload('staff', 'HSBC', 'big.csv', big);
    expect(res.status).toBe(400);
    expect(res.body.error.message).toContain('larger than 10 MB');
  });
});

describe('profile versions', () => {
  it('a renamed bank header is fixed by a new profile version, no code change', async () => {
    const renamed = 'Txn Date,Details,Money received,Money sent,Balance\n06/09/2026,"COUNCIL HB T9020",650.00,,14550.16\n';
    expect((await upload('staff', 'HSBC', 'hsbc_v2.csv', renamed)).status).toBe(400);

    const res = await post(`/api/bank-accounts/${bankIds.HSBC}/profile`, 'accounts').send({
      headerAliases: {
        txn_date: ['Date', 'Txn Date'],
        description: ['Description', 'Details'],
        paid_in: ['Paid in', 'Money received'],
        paid_out: ['Paid out', 'Money sent'],
        balance: ['Balance'],
      },
      amountMode: 'split_in_out',
      dateFormat: 'DD/MM/YYYY',
      notes: 'HSBC renamed its export columns',
    });
    expect(res.status).toBe(201);
    expect(res.body.version).toBe(2);
    const active = await one<{ n: number; v: number }>(
      `SELECT count(*)::int AS n, max(version) AS v FROM bank_csv_profiles WHERE bank_account_id = $1 AND is_active`,
      [bankIds.HSBC],
    );
    expect(active).toEqual({ n: 1, v: 2 });

    const ok = await upload('staff', 'HSBC', 'hsbc_v2.csv', renamed);
    expect(ok.status).toBe(201);
    expect(ok.body.import).toMatchObject({ rowsInserted: 1, withTid: 1 });
  });

  it('rejects invalid profiles and non-accounts roles', async () => {
    const bad = await post(`/api/bank-accounts/${bankIds.LLOYDS}/profile`, 'admin').send({
      headerAliases: { description: ['Text'] },
      amountMode: 'signed',
      dateFormat: 'DD/MM/YYYY',
    });
    expect(bad.status).toBe(400);
    expect(bad.body.error.details.problems).toEqual(
      expect.arrayContaining(['txn_date needs at least one header alias', 'signed mode needs "amount" aliases']),
    );
    expect(
      (await post(`/api/bank-accounts/${bankIds.LLOYDS}/profile`, 'admin').send({ headerAliases: {}, amountMode: 'x', dateFormat: 'DD/MM/YYYY' }))
        .status,
    ).toBe(400);
    expect((await post(`/api/bank-accounts/${bankIds.LLOYDS}/profile`, 'staff').send({})).status).toBe(403);
    expect((await post(`/api/bank-accounts/${randomUUID()}/profile`, 'admin').send({
      headerAliases: { txn_date: ['D'], description: ['X'], amount: ['A'] },
      amountMode: 'signed',
      dateFormat: 'DD/MM/YYYY',
    })).status).toBe(404);
  });
});

describe('import history', () => {
  it('lists imports newest first with counts', async () => {
    const res = await request(app()).get('/api/imports').set('Cookie', cookies.readonly);
    expect(res.status).toBe(200);
    expect(res.body.imports).toHaveLength(9);
    expect(res.body.imports[0]).toMatchObject({ bankCode: 'HSBC', fileName: 'hsbc_v2.csv', rowsInserted: 1, uploadedBy: 'Ing staff' });
    expect(res.body.imports.find((i: { fileName: string }) => i.fileName === 'hsbc_overlap.csv')).toMatchObject({
      rowsTotal: 4,
      rowsInserted: 2,
      rowsDuplicate: 2,
      periodFrom: '2026-09-03',
      periodTo: '2026-09-05',
    });
  });
});

describe('senior-tester: explicit NI column and mid-insert rollback', () => {
  it('hashes an explicit NI column like SQL secure_hash(extract_ni()) and stores no plain NI', async () => {
    const saved = await post(`/api/bank-accounts/${bankIds.EXTRA_1}/profile`, 'accounts').send({
      headerAliases: { txn_date: ['Date'], description: ['Description'], amount: ['Amount'], ni_number: ['NI Number'] },
      amountMode: 'signed',
      dateFormat: 'DD/MM/YYYY',
    });
    expect(saved.status).toBe(201);
    const csv = 'Date,Description,Amount,NI Number\n01/09/2026,RENT SEPT,650.00,ab 10 00 21 c\n';
    const res = await upload('staff', 'EXTRA_1', 'extra_ni.csv', csv);
    expect(res.status).toBe(201);
    expect(res.body.import).toMatchObject({ rowsInserted: 1, withNi: 1 });
    const r = await one<{ same: boolean; plain: number }>(
      `SELECT bool_and(extracted_ni_hash = secure_hash(extract_ni('AB100021C'))) AS same,
              count(*) FILTER (WHERE row_to_json(bt)::text ~* 'AB ?10 ?00 ?21 ?C')::int AS plain
         FROM bank_transactions bt WHERE bank_account_id = $1`,
      [bankIds.EXTRA_1],
    );
    expect(r).toEqual({ same: true, plain: 0 });
  });

  it('a line the database refuses (amount too large for numeric(12,2)) rolls back the whole batch', async () => {
    const before = await one<{ b: number; t: number }>(
      'SELECT (SELECT count(*)::int FROM import_batches) AS b, (SELECT count(*)::int FROM bank_transactions) AS t',
    );
    const csv = 'Date,Description,Amount,NI Number\n02/09/2026,FIRST OK,1.00,\n03/09/2026,HUGE,10000000000.00,\n';
    const res = await upload('staff', 'EXTRA_1', 'extra_huge.csv', csv);
    expect(res.status).toBe(400);
    expect(res.body.error.details.rowErrors).toEqual([{ line: 3, error: 'amount "10000000000.00" is too large' }]);
    const after = await one<{ b: number; t: number }>(
      'SELECT (SELECT count(*)::int FROM import_batches) AS b, (SELECT count(*)::int FROM bank_transactions) AS t',
    );
    expect(after).toEqual(before);
  });
});

describe('concurrent uploads', () => {
  it('two uploads of the same file at once: one imports, the other gets 409 (never 500)', async () => {
    const csv = ['Date,Description,Paid in,Paid out,Balance', '07/09/2026,"RACE T9030",650.00,,1.00', ''].join('\n');
    const [a, b] = await Promise.all([
      upload('staff', 'HSBC', 'race-a.csv', csv),
      upload('staff', 'HSBC', 'race-b.csv', csv),
    ]);
    expect([a.status, b.status].sort()).toEqual([201, 409]);
    const n = await one<{ n: number }>("SELECT count(*)::int AS n FROM bank_transactions WHERE description = 'RACE T9030'");
    expect(n.n).toBe(1);
  });
});
