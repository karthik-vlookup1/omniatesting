/**
 * Dashboard end to end: imports per bank (London upload day, auto-match rate), review backlog,
 * balances per payer type and balance-forward arrears ageing, for rent accounts only.
 * Tenancies come from synthetic Veco rows through the real sync; ledger rows are inserted directly.
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
import { londonToday } from '../../src/services/reports/dates.js';
import { vecoRows } from '../fixtures/veco-rows.js';

const PASSWORD = 'correct-horse-battery';
const config = loadConfig();
const logger = createLogger({ level: 'silent' });
const keys = { hashKey: config.hashKey, encryptionKey: config.encryptionKey };
const run = randomUUID().slice(0, 8);
const D = '2026-06-10';
let pool: Pool;
const cookies = {} as Record<Role, string>;
let staffId = '';
let bankA = '';
let bankB = '';

const app = () => createApp({ config, pool, logger });

async function signIn(role: Role): Promise<string> {
  const email = `${role}-dash-${run}@example.test`;
  await upsertUser(pool, { email, fullName: `Dash ${role}`, role, password: PASSWORD });
  const res = await request(app()).post('/api/auth/login').set(CSRF_HEADER, CSRF_HEADER_VALUE).send({ email, password: PASSWORD });
  return (res.headers['set-cookie'] as unknown as string[]).find((c) => c.startsWith(`${SESSION_COOKIE}=`))!.split(';')[0]!;
}

const get = (path: string, role: Role = 'staff') => request(app()).get(path).set('Cookie', cookies[role]);
const tenancyId = async (tid: string) => (await pool.query<{ id: string }>('SELECT id FROM tenancies WHERE tid = $1', [tid])).rows[0]!.id;

async function batch(bank: string, uploadedAt: string, status = 'parsed'): Promise<string> {
  return (
    await pool.query<{ id: string }>(
      `INSERT INTO import_batches (source, bank_account_id, file_name, file_sha256, status, uploaded_at)
       VALUES ('bank_csv', $1, $2, $3, $4::import_status, $5::timestamptz) RETURNING id`,
      [bank, `${randomUUID()}.csv`, randomUUID(), status, uploadedAt],
    )
  ).rows[0]!.id;
}

async function line(bank: string, batchId: string, date: string, pence: number, status: string, description: string): Promise<string> {
  return (
    await pool.query<{ id: string }>(
      `INSERT INTO bank_transactions (bank_account_id, import_batch_id, txn_date, amount, description, raw_row, dedupe_key, status, exclusion_reason)
       VALUES ($1, $2, $3::date, ($4::bigint)::numeric / 100, $5, '{}'::jsonb, $6, $7::txn_status, $8) RETURNING id`,
      [bank, batchId, date, pence, description, randomUUID(), status, status === 'excluded' ? 'money_out' : null],
    )
  ).rows[0]!.id;
}

async function receipt(
  tenancy: string,
  payer: string,
  pence: number,
  receivedOn: string,
  opts: { line?: string; via?: string; by?: string | null; reversed?: boolean } = {},
): Promise<void> {
  await pool.query(
    `INSERT INTO receipts (bank_transaction_id, tenancy_id, payer, amount, received_on, matched_via, matched_by, status, reversed_reason, reversed_at)
     VALUES ($1, $2, $3::payer_type, ($4::bigint)::numeric / 100, $5::date, $6::match_method, $7, $8::receipt_status, $9, $10::timestamptz)`,
    [
      opts.line ?? null, tenancy, payer, pence, receivedOn, opts.via ?? 'manual', opts.by ?? null,
      opts.reversed ? 'reversed' : 'active', opts.reversed ? 'Paid in error' : null, opts.reversed ? '2026-05-03 12:00+01' : null,
    ],
  );
}

async function charge(tenancy: string, payer: string, pence: number, due: string): Promise<void> {
  await pool.query(
    `INSERT INTO rent_charges (tenancy_id, payer, period_start, period_end, due_date, amount, source)
     VALUES ($1, $2::payer_type, $3::date, $3::date + 29, $3::date, ($4::bigint)::numeric / 100, 'manual')`,
    [tenancy, payer, due, pence],
  );
}

beforeAll(async () => {
  pool = createPool({ databaseUrl: config.databaseUrl, hashKey: config.hashKey, max: 4 }, logger);
  await pool.query(
    `TRUNCATE allocations, receipts, remittance_lines, remittance_advices, sync_outbox, external_refs, adjustments,
              match_suggestions, payer_bank_accounts, payment_references, bank_transactions, import_batches,
              bank_csv_profiles, bank_accounts, rent_charge_dirty, rent_charges, rent_schedules, tenancy_tenants,
              tenancies, tenants, property_units, properties, branches, report_downloads CASCADE`,
  );
  await syncTenancies(pool, vecoRows(6), { keys, force: true });
  for (const role of ['admin', 'accounts', 'staff', 'readonly'] as const) cookies[role] = await signIn(role);
  staffId = (await pool.query<{ id: string }>('SELECT id FROM app_users WHERE email = $1', [`staff-dash-${run}@example.test`])).rows[0]!.id;

  bankA = (await pool.query<{ id: string }>("INSERT INTO bank_accounts (code, bank_name, account_name) VALUES ('DBA', 'Test Bank', 'Dash A') RETURNING id")).rows[0]!.id;
  bankB = (await pool.query<{ id: string }>("INSERT INTO bank_accounts (code, bank_name, account_name) VALUES ('DBB', 'Test Bank', 'Dash B') RETURNING id")).rows[0]!.id;
  await pool.query("INSERT INTO bank_accounts (code, bank_name, account_name, is_active) VALUES ('DBC', 'Test Bank', 'Dash C', false)");

  const X = await tenancyId('T9001');
  const Y = await tenancyId('T9002');
  const Z = await tenancyId('T9003');
  await pool.query('UPDATE tenancies SET charges_from = $2::date WHERE id = ANY($1::uuid[])', [[X, Y], '2026-02-01']);
  await pool.query('UPDATE tenancies SET charges_from = NULL WHERE id = $1', [Z]);

  // Bank A: (a) counts, (b) 00:30 London on D counts, (c) next London day, (d) rolled back.
  const a = await batch(bankA, '2026-06-10 08:00+01');
  const l1 = await line(bankA, a, '2026-06-08', 10000, 'matched', 'AUTO ONE');
  await receipt(Z, 'tenant', 10000, '2026-06-08', { line: l1, via: 'tid_in_reference' });
  const l2 = await line(bankA, a, '2026-06-08', 5000, 'matched', 'MANUAL ONE');
  await receipt(Z, 'tenant', 5000, '2026-06-08', { line: l2, via: 'manual', by: staffId });
  await line(bankA, a, '2026-06-01', 7000, 'needs_review', 'REVIEW ONE');
  await line(bankA, a, '2026-06-08', -2000, 'excluded', 'OUTGOING ONE');
  const b = await batch(bankA, '2026-06-09 23:30+00');
  const l5 = await line(bankA, b, '2026-06-09', 4000, 'matched', 'AUTO TWO');
  await receipt(Z, 'tenant', 4000, '2026-06-09', { line: l5, via: 'tid_in_reference' });
  const c = await batch(bankA, '2026-06-10 23:30+00');
  await line(bankA, c, '2026-06-10', 9900, 'matched', 'NEXT DAY');
  const d = await batch(bankA, '2026-06-10 09:00+01', 'rolled_back');
  await line(bankA, d, '2026-06-10', 8800, 'matched', 'ROLLED BACK');

  // Bank B: backlog from an earlier day.
  const old = await batch(bankB, '2026-05-02 10:00+01');
  await line(bankB, old, '2026-05-01', 3000, 'partially_matched', 'PARTIAL');
  await line(bankB, old, '2026-05-02', 3100, 'yet_to_take', 'YET TO TAKE');

  // Rent: X tenant 3 charges due by D (+ a future one), an active receipt and a reversed one; council charge + write-off.
  for (const due of ['2026-02-15', '2026-04-20', '2026-05-20', '2026-06-20']) await charge(X, 'tenant', 10000, due);
  await receipt(X, 'tenant', 15000, '2026-05-25');
  await receipt(X, 'tenant', 50000, '2026-05-01', { reversed: true });
  await charge(X, 'council_hb', 20000, '2026-01-10');
  await pool.query(
    "INSERT INTO adjustments (tenancy_id, payer, kind, amount, effective_on, reason) VALUES ($1, 'council_hb', 'write_off', -50, '2026-02-01', 'Test write-off')",
    [X],
  );
  await receipt(Y, 'tenant', 8000, '2026-05-10');
  await charge(Z, 'tenant', 99900, '2026-03-01');
});

afterAll(async () => {
  await pool?.end();
});

interface Body {
  date: string;
  imports: { banks: Record<string, unknown>[]; total: Record<string, unknown> };
  backlog: Record<string, unknown> & { banks: Record<string, unknown>[] };
  balances: Record<string, unknown>[];
  ageing: Record<string, unknown>[];
}
const dash = async (qs = `date=${D}`, role: Role = 'staff'): Promise<Body> => {
  const res = await get(`/api/reports/dashboard?${qs}`, role);
  expect(res.status).toBe(200);
  return res.body as Body;
};

describe('dashboard', () => {
  it('1: imports per bank use the London upload day; rolled back and next-day batches do not count', async () => {
    const body = await dash();
    expect(body.date).toBe(D);
    const codes = body.imports.banks.map((r) => r.code);
    expect(codes).toEqual(['DBA', 'DBB']); // DBC is inactive with no batch on D
    expect(body.imports.banks[0]).toMatchObject({ files: 2, lines: 5, incoming: 4, autoMatched: 2, ratePct: 50, lastUpload: '08:00' });
    expect(body.imports.banks[1]).toMatchObject({ files: 0, lines: 0, incoming: 0, autoMatched: 0, ratePct: null, lastUpload: null });
    expect(body.imports.total).toMatchObject({ files: 2, lines: 5, incoming: 4, autoMatched: 2, ratePct: 50 });
  });

  it('2: the review backlog counts incoming lines per status and the age of the oldest', async () => {
    const { backlog } = await dash();
    expect(backlog).toMatchObject({ new: 0, needsReview: 1, partiallyMatched: 1, yetToTake: 1, backlog: 2, oldestDays: 40 });
    expect(backlog.banks).toEqual([
      expect.objectContaining({ code: 'DBA', needsReview: 1, backlog: 1, oldestDays: 9 }),
      expect.objectContaining({ code: 'DBB', partiallyMatched: 1, yetToTake: 1, backlog: 1, oldestDays: 40 }),
    ]);
  });

  it('3: balances per payer type cover rent accounts only, as at D', async () => {
    const { balances } = await dash();
    expect(balances.map((r) => r.payer)).toEqual(['tenant', 'council_hb', 'dwp_uc', 'other_third_party', 'total']);
    expect(balances[0]).toMatchObject({ accounts: 2, arrearsPence: 15000, creditPence: 8000, netPence: 7000 });
    expect(balances[1]).toMatchObject({ accounts: 1, arrearsPence: 15000, creditPence: 0, netPence: 15000 });
    expect(balances[2]).toMatchObject({ accounts: 0, arrearsPence: 0, creditPence: 0, netPence: 0 });
    expect(balances[4]).toMatchObject({ accounts: 3, arrearsPence: 30000, creditPence: 8000, netPence: 22000 });
  });

  it('4: ageing is balance-forward, newest debit first, and its total equals the arrears', async () => {
    const { ageing, balances } = await dash();
    expect(ageing[0]).toMatchObject({ payer: 'tenant', d0_30: 10000, d31_60: 5000, d61_90: 0, d91Plus: 0, totalPence: 15000, accountsInArrears: 1 });
    expect(ageing[1]).toMatchObject({ payer: 'council_hb', d0_30: 0, d91Plus: 15000, totalPence: 15000, accountsInArrears: 1 });
    expect(ageing[4]).toMatchObject({ payer: 'total', totalPence: 30000, accountsInArrears: 2 });
    for (let i = 0; i < 5; i++) expect(ageing[i]!.totalPence).toBe(balances[i]!.arrearsPence);
  });

  it('5: with no date it is London today, from the database clock', async () => {
    const body = await dash('');
    expect(body.date).toBe(await londonToday(pool));
  });

  it('6: a day with no rent activity lists the four payer types as zeros', async () => {
    const { balances, ageing } = await dash('date=2020-01-01');
    expect(balances.map((r) => [r.payer, r.accounts, r.netPence])).toEqual([
      ['tenant', 0, 0], ['council_hb', 0, 0], ['dwp_uc', 0, 0], ['other_third_party', 0, 0], ['total', 0, 0],
    ]);
    expect(ageing[4]).toMatchObject({ totalPence: 0, accountsInArrears: 0 });
  });

  it('7: a future or malformed date is 400', async () => {
    expect((await get('/api/reports/dashboard?date=2999-01-01')).status).toBe(400);
    expect((await get('/api/reports/dashboard?date=x')).status).toBe(400);
    expect((await get('/api/reports/dashboard?date=2026-02-30')).status).toBe(400);
  });

  it('8: unauthenticated is 401 and a read-only user may read it', async () => {
    expect((await request(app()).get('/api/reports/dashboard')).status).toBe(401);
    expect((await get(`/api/reports/dashboard?date=${D}`, 'readonly')).status).toBe(200);
  });

  it('9: the payload carries no names or account details', async () => {
    const text = JSON.stringify(await dash());
    for (const word of ['Test Tenant', 'T9001', 'AUTO ONE', 'Example Street']) expect(text).not.toContain(word);
  });
});
