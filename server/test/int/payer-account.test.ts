/**
 * Known payer accounts: staff link hash + last 4 to a tenancy or landlord, and matching reads the same rows.
 * Tenancies come from synthetic Veco rows through the real sync.
 */
import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createApp } from '../../src/api/app.js';
import { CSRF_HEADER, CSRF_HEADER_VALUE, SESSION_COOKIE } from '../../src/api/auth/middleware.js';
import { loadConfig } from '../../src/config/env.js';
import { createPool, type Pool } from '../../src/db/pool.js';
import { syncTenancies } from '../../src/jobs/veco-sync/sync.js';
import { createLogger } from '../../src/lib/logger.js';
import { upsertUser, type Role } from '../../src/services/auth.service.js';
import type { BankLine } from '../../src/services/matching/matching.service.js';
import { vecoRows } from '../fixtures/veco-rows.js';

const PASSWORD = 'correct-horse-battery';
const config = loadConfig();
const logger = createLogger({ level: 'silent' });
const run = randomUUID().slice(0, 8);
let pool: Pool;
const cookies = {} as Record<Role, string>;
const emails = {} as Record<Role, string>;
const bankIds: Record<string, string> = {};
let firstId = '';
let landlordId = '';

const app = () => createApp({ config, pool, logger });

async function signIn(role: Role): Promise<string> {
  const email = `${role}-pa-${run}@example.test`;
  emails[role] = email;
  await upsertUser(pool, { email, fullName: `PA ${role}`, role, password: PASSWORD });
  const res = await request(app()).post('/api/auth/login').set(CSRF_HEADER, CSRF_HEADER_VALUE).send({ email, password: PASSWORD });
  return (res.headers['set-cookie'] as unknown as string[]).find((c) => c.startsWith(`${SESSION_COOKIE}=`))!.split(';')[0]!;
}

const get = (path: string, role: Role = 'readonly') => request(app()).get(path).set('Cookie', cookies[role]);
const send = (method: 'post' | 'patch', path: string, role: Role = 'staff') =>
  request(app())[method](path).set('Cookie', cookies[role]).set(CSRF_HEADER, CSRF_HEADER_VALUE);
const post = (path: string, role: Role = 'staff') => send('post', path, role);
const link = (body: object, role: Role = 'staff') => post('/api/payer-accounts', role).send(body);

const HEADER = 'Posting Date,Reference,Narrative,Amount,Counterparty Sort Code,Counterparty Account\n';
const upload = (name: string, rows: string) =>
  post('/api/imports').field('bankAccountId', bankIds.REDSTONE!).attach('file', Buffer.from(HEADER + rows), name);

async function lineBy(description: string): Promise<BankLine> {
  const { rows } = await pool.query<{ id: string }>('SELECT id FROM bank_transactions WHERE description = $1', [description]);
  if (rows.length !== 1) throw new Error(`expected one line "${description}", found ${rows.length}`);
  return (await get(`/api/matching/lines/${rows[0]!.id}`)).body.line as BankLine;
}

const suggestions = async (description: string) =>
  (
    await pool.query<{ method: string; status: string; reason: string; tid: string }>(
      `SELECT ms.method::text, ms.status::text, ms.reason, t.tid
         FROM match_suggestions ms JOIN bank_transactions bt ON bt.id = ms.bank_transaction_id
         JOIN tenancies t ON t.id = ms.tenancy_id WHERE bt.description = $1 ORDER BY t.tid`,
      [description],
    )
  ).rows;

beforeAll(async () => {
  pool = createPool({ databaseUrl: config.databaseUrl, hashKey: config.hashKey, max: 4 }, logger);
  await pool.query(
    `TRUNCATE allocations, receipts, match_suggestions, payer_bank_accounts, payment_references, bank_transactions,
              import_batches, bank_csv_profiles, bank_accounts,
              rent_schedules, tenancy_tenants, tenancies, tenants, property_units, properties, branches CASCADE`,
  );
  await syncTenancies(pool, vecoRows(20), { keys: { hashKey: config.hashKey, encryptionKey: config.encryptionKey }, force: true });
  for (const role of ['admin', 'accounts', 'staff', 'readonly'] as const) cookies[role] = await signIn(role);
  await post('/api/bank-accounts/defaults', 'admin');
  const banks = (await get('/api/bank-accounts')).body.bankAccounts as { code: string; id: string }[];
  for (const b of banks) bankIds[b.code] = b.id;
});

afterAll(async () => {
  await pool?.end();
});

describe('payer accounts', () => {
  it('1: staff adds an account; only hash + last 4 are stored and nothing sensitive comes back', async () => {
    const res = await link({ tid: 'T9010', sortCode: '00-00-10', accountNumber: '12340010', holderType: 'tenant' });
    expect(res.status).toBe(201);
    firstId = res.body.payerAccount.id as string;
    const { rows } = await pool.query<{ ok: boolean; last4: string; sort_code: string | null }>(
      `SELECT account_hash = secure_hash('00001012340010') AS ok, account_last4 AS last4, sort_code
         FROM payer_bank_accounts WHERE id = $1`,
      [firstId],
    );
    expect(rows[0]).toEqual({ ok: true, last4: '0010', sort_code: null });
    const text = JSON.stringify(res.body);
    expect(text).not.toContain('12340010');
    expect(text).not.toContain('000010');
  });

  it('2: the list masks the account and never exposes the hash or sort code', async () => {
    const res = await get('/api/payer-accounts?tid=t9010');
    expect(res.status).toBe(200);
    const accounts = res.body.payerAccounts as Record<string, unknown>[];
    expect(accounts).toHaveLength(1);
    expect(accounts[0]).toMatchObject({ account: '****0010', tid: 'T9010', source: 'manual', isActive: true });
    expect(accounts[0]).not.toHaveProperty('accountHash');
    expect(accounts[0]).not.toHaveProperty('sortCode');
    expect(JSON.stringify(res.body)).not.toMatch(/hash|12340010/i);
  });

  it('3: a duplicate is a conflict; deactivate then add again reactivates the same row', async () => {
    const body = { tid: 'T9010', sortCode: '00-00-10', accountNumber: '12340010', holderType: 'tenant' };
    expect((await link(body)).status).toBe(409);
    const off = await send('patch', `/api/payer-accounts/${firstId}`).send({ isActive: false });
    expect(off.status).toBe(200);
    expect(off.body.payerAccount.isActive).toBe(false);
    const again = await link(body);
    expect(again.status).toBe(200);
    expect(again.body.payerAccount).toMatchObject({ id: firstId, isActive: true });
  });

  it('4: a bank line from the account is auto-matched through payer_account (hash parity with ingest)', async () => {
    const res = await upload('pa4.csv', `2026-09-01,RENT-${run},"PA TEST FOUR ${run}",650.00,00-00-10,12340010\n`);
    expect(res.status).toBe(201);
    expect(res.body.matching).toMatchObject({ lines: 1, autoMatched: 1 });
    const { rows } = await pool.query<{ tid: string }>(
      `SELECT t.tid FROM receipts r JOIN tenancies t ON t.id = r.tenancy_id
         JOIN bank_transactions bt ON bt.id = r.bank_transaction_id WHERE bt.description = $1`,
      [`PA TEST FOUR ${run}`],
    );
    expect(rows.map((r) => r.tid)).toEqual(['T9010']);
    expect((await suggestions(`PA TEST FOUR ${run}`)).map((s) => s.method)).toContain('payer_account');
  });

  it('5: a relative account shows in the matching reason', async () => {
    const res = await link({ tid: 'T9011', sortCode: '00-00-11', accountNumber: '12340011', holderType: 'relative', holderName: 'Jane Relative' });
    expect(res.status).toBe(201);
    await upload('pa5.csv', `2026-09-02,REL-${run},"PA TEST FIVE ${run}",650.00,00-00-11,12340011\n`);
    const s = await suggestions(`PA TEST FIVE ${run}`);
    expect(s.some((x) => x.reason.startsWith('Paid from known relative account (Jane Relative) ending'))).toBe(true);
  });

  it('6: a landlord account suggests every tenancy of that landlord, never auto-matching', async () => {
    const created = await post('/api/landlords').send({ name: `PA Landlord ${run}` });
    expect(created.status).toBe(201);
    landlordId = created.body.id as string;
    // The synthetic rows put T9010-T9019 in one property, so move T9013 next to T9020 (alone in its own).
    await pool.query(
      `UPDATE tenancies SET property_id = (SELECT property_id FROM tenancies WHERE tid = 'T9020') WHERE tid = 'T9013'`,
    );
    await pool.query(
      `UPDATE properties SET landlord_id = $1 WHERE id = (SELECT property_id FROM tenancies WHERE tid = 'T9020')`,
      [landlordId],
    );
    const res = await link({ landlordId, sortCode: '00-00-12', accountNumber: '12340012', holderType: 'landlord' });
    expect(res.status).toBe(201);
    const up = await upload('pa6.csv', `2026-09-03,LL-${run},"PA TEST SIX ${run}",650.00,00-00-12,12340012\n`);
    expect(up.body.matching).toMatchObject({ lines: 1, autoMatched: 0 });
    const s = (await suggestions(`PA TEST SIX ${run}`)).filter((x) => x.method === 'payer_account' && x.status === 'open');
    expect(s.map((x) => x.tid)).toEqual(['T9013', 'T9020']);
  });

  it('7: an account learned through confirm(remember) has no sort code and is listed as learned', async () => {
    await upload('pa7.csv', `2026-09-04,SEVEN-${run},"PA TEST SEVEN ${run}",650.00,00-00-13,12340013\n`);
    const line = await lineBy(`PA TEST SEVEN ${run}`);
    const res = await post(`/api/matching/lines/${line.id}/confirm`).send({ tid: 'T9014', payer: 'other_third_party', remember: true });
    expect(res.status).toBe(200);
    const { rows } = await pool.query<{ sort_code: string | null }>(
      "SELECT sort_code FROM payer_bank_accounts WHERE account_last4 = '0013' AND learned_from_txn IS NOT NULL",
    );
    expect(rows).toEqual([{ sort_code: null }]);
    const list = await get('/api/payer-accounts?tid=T9014');
    expect(list.body.payerAccounts).toEqual([expect.objectContaining({ account: '****0013', source: 'learned' })]);
  });

  it('8: invalid input is a 400 that never echoes the digits', async () => {
    const ok = { tid: 'T9015', sortCode: '00-00-15', accountNumber: '12340015', holderType: 'tenant' };
    const cases: [object, string?][] = [
      [{ ...ok, sortCode: '12-34' }],
      [{ ...ok, accountNumber: '123' }],
      [{ ...ok, landlordId: randomUUID() }],
      [{ sortCode: '00-00-15', accountNumber: '12340015', holderType: 'tenant' }],
      [{ ...ok, tid: 'T9999' }, 'Unknown tenancy'],
      [{ tid: undefined, landlordId: randomUUID(), sortCode: '00-00-15', accountNumber: '12340015', holderType: 'tenant' }, 'Unknown landlord'],
    ];
    for (const [body, message] of cases) {
      const res = await link(body);
      expect(res.status).toBe(400);
      if (message) expect(res.body.error.message).toBe(message);
      const text = JSON.stringify(res.body);
      expect(text).not.toContain('12340015');
      expect(text).not.toContain('000015');
    }
  });

  it('9: readonly cannot write, unknown ids are 404, and CSRF is enforced', async () => {
    const body = { tid: 'T9015', sortCode: '00-00-15', accountNumber: '12340015', holderType: 'tenant' };
    expect((await link(body, 'readonly')).status).toBe(403);
    expect((await send('patch', `/api/payer-accounts/${firstId}`, 'readonly').send({ isActive: false })).status).toBe(403);
    expect((await get('/api/payer-accounts', 'readonly')).status).toBe(200);
    expect((await send('patch', `/api/payer-accounts/${randomUUID()}`).send({ isActive: false })).status).toBe(404);
    const noCsrf = await request(app()).post('/api/payer-accounts').set('Cookie', cookies.staff).send(body);
    expect(noCsrf.status).toBe(403);
  });

  it('10: the audit log records the INSERT as the staff user', async () => {
    const { rows } = await pool.query<{ changed_by: string }>(
      "SELECT changed_by FROM audit_log WHERE table_name = 'payer_bank_accounts' AND row_id = $1 AND action = 'INSERT'",
      [firstId],
    );
    expect(rows).toHaveLength(1);
    expect(rows[0]!.changed_by).toBe(emails.staff);
  });

  it('11: no payer account row keeps a sort code', async () => {
    const { rows } = await pool.query<{ n: number }>('SELECT count(*)::int AS n FROM payer_bank_accounts WHERE sort_code IS NOT NULL');
    expect(rows[0]!.n).toBe(0);
  });
});

describe('payer accounts: hashing, validation, trigger, landlord fan-out (review additions)', () => {
  const hashOk = (id: string, sc: string, acc: string) =>
    pool.query<{ ok: boolean; last4: string; sort_code: string | null }>(
      `SELECT account_hash = secure_hash(regexp_replace($2::text, '\\D', '', 'g') || $3::text) AS ok, account_last4 AS last4, sort_code
         FROM payer_bank_accounts WHERE id = $1`,
      [id, sc, acc],
    );

  it('12: hash matches SQL secure_hash for 6, 7 and 10 digit accounts and dashed/spaced/plain sort codes', async () => {
    const cases = [
      { tid: 'T9002', sc: '20-30-40', acc: '123456' },
      { tid: 'T9003', sc: '20 30 40', acc: '1234567' },
      { tid: 'T9004', sc: '203040', acc: '1234567890' },
      { tid: 'T9005', sc: '20-30 40', acc: '1234 5678' },
    ];
    for (const c of cases) {
      const res = await link({ tid: c.tid, sortCode: c.sc, accountNumber: c.acc, holderType: 'tenant' });
      expect(res.status).toBe(201);
      const digits = c.acc.replace(/\s/g, '');
      const { rows } = await hashOk(res.body.payerAccount.id as string, c.sc, digits);
      expect(rows[0]).toEqual({ ok: true, last4: digits.slice(-4), sort_code: null });
      expect(res.body.payerAccount.account).toBe(`****${digits.slice(-4)}`);
      expect(JSON.stringify(res.body)).not.toContain(digits);
    }
  });

  it('13: a differently formatted sort code for the same account is the same account (409)', async () => {
    const res = await link({ tid: 't9002', sortCode: '203040', accountNumber: '123456', holderType: 'tenant' });
    expect(res.status).toBe(409);
    expect(JSON.stringify(res.body)).not.toMatch(/123456|203040|20-30-40/);
  });

  it('14: malformed numbers are rejected, store nothing and never echo the input', async () => {
    const before = (await pool.query<{ n: number }>('SELECT count(*)::int AS n FROM payer_bank_accounts')).rows[0]!.n;
    const ok = { tid: 'T9006', sortCode: '55-66-77', accountNumber: '98765432', holderType: 'tenant' };
    const bad: object[] = [
      { ...ok, accountNumber: '12345' },
      { ...ok, accountNumber: '12345678901' },
      { ...ok, accountNumber: '9876-5432' },
      { ...ok, accountNumber: '9876543A' },
      { ...ok, accountNumber: '' },
      { ...ok, accountNumber: 98765432 },
      { ...ok, sortCode: '55-66-7' },
      { ...ok, sortCode: '55-66-777' },
      { ...ok, sortCode: '5566-77x' },
      { ...ok, sortCode: '' },
      { ...ok, holderType: 'council' },
      { ...ok, payer: 'bogus' },
      { ...ok, tid: 'X9006' },
      { ...ok, landlordId: 'not-a-uuid', tid: undefined },
      { ...ok, extra: 'x' },
    ];
    for (const body of bad) {
      const res = await link(body);
      expect(res.status, JSON.stringify(body)).toBe(400);
      const text = JSON.stringify(res.body);
      for (const secret of ['98765432', '556677', '55-66-77', '9876-5432', '9876543A', '12345678901']) {
        expect(text).not.toContain(secret);
      }
    }
    const after = (await pool.query<{ n: number }>('SELECT count(*)::int AS n FROM payer_bank_accounts')).rows[0]!.n;
    expect(after).toBe(before);
  });

  it('15: PATCH rejects unknown keys (no sort code or hash edits), empty bodies and bad values', async () => {
    for (const body of [{}, { sortCode: '11-22-33' }, { accountHash: 'x' }, { accountNumber: '12345678' }, { isActive: 'yes' }, { payer: 'bogus' }]) {
      expect((await send('patch', `/api/payer-accounts/${firstId}`).send(body)).status, JSON.stringify(body)).toBe(400);
    }
    expect((await send('patch', '/api/payer-accounts/not-a-uuid').send({ isActive: false })).status).toBe(404);
    const edit = await send('patch', `/api/payer-accounts/${firstId}`).send({ holderName: 'Renamed', payer: 'council_hb' });
    expect(edit.status).toBe(200);
    expect(edit.body.payerAccount).toMatchObject({ holderName: 'Renamed', payer: 'council_hb' });
  });

  it('16: accounts role can write; GET filters reject bad ids; anonymous is 401', async () => {
    const res = await link({ tid: 'T9007', sortCode: '10-20-30', accountNumber: '55550007', holderType: 'tenant' }, 'accounts');
    expect([200, 201]).toContain(res.status);
    expect((await get('/api/payer-accounts?tid=bad')).status).toBe(400);
    expect((await get('/api/payer-accounts?landlordId=bad')).status).toBe(400);
    expect((await request(app()).get('/api/payer-accounts')).status).toBe(401);
    expect((await request(app()).post('/api/payer-accounts').set(CSRF_HEADER, CSRF_HEADER_VALUE).send({})).status).toBe(401);
  });

  it('17: the trigger nulls a sort code on direct INSERT and UPDATE', async () => {
    const t = (await pool.query<{ id: string }>("SELECT id FROM tenancies WHERE tid = 'T9008'")).rows[0]!.id;
    const ins = await pool.query<{ id: string; sort_code: string | null }>(
      `INSERT INTO payer_bank_accounts (account_hash, sort_code, account_last4, holder_type, tenancy_id, payer)
       VALUES (secure_hash('999999' || '88880008'), '99-99-99', '0008', 'tenant', $1, 'tenant') RETURNING id, sort_code`,
      [t],
    );
    expect(ins.rows[0]!.sort_code).toBeNull();
    const upd = await pool.query<{ sort_code: string | null }>(
      "UPDATE payer_bank_accounts SET sort_code = '88-88-88' WHERE id = $1 RETURNING sort_code",
      [ins.rows[0]!.id],
    );
    expect(upd.rows[0]!.sort_code).toBeNull();
    expect((await pool.query('SELECT 1 FROM payer_bank_accounts WHERE sort_code IS NOT NULL')).rowCount).toBe(0);
  });

  it('18: audit rows hold no sort code or full account number', async () => {
    const { rows } = await pool.query<{ t: string }>(
      "SELECT coalesce(old_row::text, '') || coalesce(new_row::text, '') AS t FROM audit_log WHERE table_name = 'payer_bank_accounts'",
    );
    expect(rows.length).toBeGreaterThan(0);
    for (const r of rows) {
      expect(r.t).not.toMatch(/12340010|12340011|98765432|1234567890|"sort_code": "\d/);
    }
  });

  it('19: a learned row can be edited and deactivated; a deactivated landlord link re-activates (200) with new holder data', async () => {
    const learned = (await get('/api/payer-accounts?tid=T9014')).body.payerAccounts[0] as { id: string };
    const edit = await send('patch', `/api/payer-accounts/${learned.id}`).send({ holderName: 'Learned Edit', isActive: false });
    expect(edit.status).toBe(200);
    expect(edit.body.payerAccount).toMatchObject({ holderName: 'Learned Edit', isActive: false, source: 'learned' });
    const { rows } = await pool.query<{ sort_code: string | null }>('SELECT sort_code FROM payer_bank_accounts WHERE id = $1', [learned.id]);
    expect(rows[0]!.sort_code).toBeNull();

    const body = { landlordId, sortCode: '00-00-12', accountNumber: '12340012', holderType: 'landlord' };
    expect((await link(body)).status).toBe(409);
    const row = (await get(`/api/payer-accounts?landlordId=${landlordId}`)).body.payerAccounts[0] as { id: string; tid: string | null };
    expect(row.tid).toBeNull();
    expect((await send('patch', `/api/payer-accounts/${row.id}`).send({ isActive: false })).status).toBe(200);
    const again = await link({ ...body, holderType: 'relative', holderName: 'Back On' });
    expect(again.status).toBe(200);
    expect(again.body.payerAccount).toMatchObject({ id: row.id, isActive: true, holderType: 'relative', holderName: 'Back On' });
  });

  it('20: a landlord with several properties fans out to every live tenancy; a shared account reports sharedWith', async () => {
    const l2 = (await post('/api/landlords').send({ name: `PA Landlord2 ${run}` })).body.id as string;
    await pool.query(
      `UPDATE properties SET landlord_id = $1 WHERE id IN (SELECT property_id FROM tenancies WHERE tid IN ('T9001', 'T9010'))`,
      [l2],
    );
    const expected = (
      await pool.query<{ tid: string }>(
        `SELECT t.tid FROM tenancies t JOIN properties p ON p.id = t.property_id WHERE p.landlord_id = $1 ORDER BY t.tid`,
        [l2],
      )
    ).rows.map((r) => r.tid);
    expect(expected.length).toBeGreaterThan(10);
    expect((await link({ landlordId: l2, sortCode: '00-00-21', accountNumber: '12340021', holderType: 'landlord' })).status).toBe(201);
    const second = await link({ tid: 'T9016', sortCode: '00-00-21', accountNumber: '12340021', holderType: 'tenant' });
    expect(second.status).toBe(201);
    expect(second.body.payerAccount.sharedWith).toBe(1);
    const up = await upload('pa20.csv', `2026-09-05,LL2-${run},"PA TEST TWENTY ${run}",650.00,00-00-21,12340021\n`);
    expect(up.body.matching).toMatchObject({ lines: 1, autoMatched: 0 });
    const s = (await suggestions(`PA TEST TWENTY ${run}`)).filter((x) => x.method === 'payer_account');
    expect([...new Set(s.map((x) => x.tid))].sort()).toEqual(expected);
    expect(s.every((x) => x.status === 'open')).toBe(true);
  });
});
