/**
 * Dashboard + statement consistency for the paths the other two report suites keep out of the balances:
 * a matched BANK-LINE receipt (and its reversal) on an opted-in tenancy, ageing boundary days, London
 * upload-day edges across BST/GMT changes, auto-match definition corners, backlog corners, and statement
 * reversal-date corners. Tenancies come from synthetic Veco rows; ledger rows are inserted directly.
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
import { buildTenantStatementPdf } from '../../src/services/reports/statement-pdf.js';
import { getTenantStatement, StatementQuery } from '../../src/services/reports/statement.service.js';
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
let bankK = '';
let lineK = '';
let receiptK = '';
const ids = {} as Record<string, string>;

const app = () => createApp({ config, pool, logger });

async function signIn(role: Role): Promise<string> {
  const email = `${role}-cons-${run}@example.test`;
  await upsertUser(pool, { email, fullName: `Cons ${role}`, role, password: PASSWORD });
  const res = await request(app()).post('/api/auth/login').set(CSRF_HEADER, CSRF_HEADER_VALUE).send({ email, password: PASSWORD });
  return (res.headers['set-cookie'] as unknown as string[]).find((c) => c.startsWith(`${SESSION_COOKIE}=`))!.split(';')[0]!;
}

const get = (path: string, role: Role = 'staff') => request(app()).get(path).set('Cookie', cookies[role]);
const binary = (path: string) =>
  get(path)
    .buffer(true)
    .parse((r, cb) => {
      const chunks: Buffer[] = [];
      r.on('data', (c: Buffer) => chunks.push(c));
      r.on('end', () => cb(null, Buffer.concat(chunks)));
    });

interface Dash {
  imports: { banks: { code: string; files: number; lines: number; incoming: number; autoMatched: number; ratePct: number | null; lastUpload: string | null }[] };
  backlog: Record<string, number | null>;
  balances: { payer: string; accounts: number; arrearsPence: number; creditPence: number; netPence: number }[];
  ageing: { payer: string; d0_30: number; d31_60: number; d61_90: number; d91Plus: number; totalPence: number; accountsInArrears: number }[];
}
const dash = async (date: string): Promise<Dash> => {
  const res = await get(`/api/reports/dashboard?date=${date}`);
  expect(res.status).toBe(200);
  return res.body as Dash;
};
interface Stmt {
  payers: { payer: string; openingPence: number; closingPence: number; lines: { date: string; type: string; description: string; balancePence: number }[] }[];
}
const stmt = async (tid: string, from: string, to: string): Promise<Stmt> => {
  const res = await get(`/api/reports/statement/${tid}?from=${from}&to=${to}`);
  expect(res.status).toBe(200);
  return res.body as Stmt;
};

async function batch(bank: string, uploadedAt: string, status = 'parsed', source = 'bank_csv'): Promise<string> {
  return (
    await pool.query<{ id: string }>(
      `INSERT INTO import_batches (source, bank_account_id, file_name, file_sha256, status, uploaded_at)
       VALUES ($6::import_source, $1, $2, $3, $4::import_status, $5::timestamptz) RETURNING id`,
      [bank, `${randomUUID()}.csv`, randomUUID(), status, uploadedAt, source],
    )
  ).rows[0]!.id;
}
async function line(bank: string, batchId: string, date: string, pence: number, status: string): Promise<string> {
  return (
    await pool.query<{ id: string }>(
      `INSERT INTO bank_transactions (bank_account_id, import_batch_id, txn_date, amount, description, raw_row, dedupe_key, status, exclusion_reason)
       VALUES ($1, $2, $3::date, ($4::bigint)::numeric / 100, 'CONS LINE', '{}'::jsonb, $5, $6::txn_status, $7) RETURNING id`,
      [bank, batchId, date, pence, randomUUID(), status, status === 'excluded' ? 'money_out' : null],
    )
  ).rows[0]!.id;
}
async function receipt(
  tenancy: string,
  payer: string,
  pence: number,
  receivedOn: string,
  o: { line?: string; via?: string; by?: string; reversed?: boolean } = {},
): Promise<string> {
  return (
    await pool.query<{ id: string }>(
      `INSERT INTO receipts (bank_transaction_id, tenancy_id, payer, amount, received_on, matched_via, matched_by, status, reversed_reason, reversed_at)
       VALUES ($1, $2, $3::payer_type, ($4::bigint)::numeric / 100, $5::date, $6::match_method, $7, $8::receipt_status, $9, $10::timestamptz) RETURNING id`,
      [o.line ?? null, tenancy, payer, pence, receivedOn, o.via ?? 'manual', o.by ?? null, o.reversed ? 'reversed' : 'active', o.reversed ? 'Bounced' : null, o.reversed ? '2026-06-08 10:00+01' : null],
    )
  ).rows[0]!.id;
}
async function charge(tenancy: string, payer: string, pence: number, due: string): Promise<void> {
  await pool.query(
    `INSERT INTO rent_charges (tenancy_id, payer, period_start, period_end, due_date, amount, source)
     VALUES ($1, $2::payer_type, $3::date, $3::date + 29, $3::date, ($4::bigint)::numeric / 100, 'manual')`,
    [tenancy, payer, due, pence],
  );
}
const daysBefore = (day: string, n: number): string => new Date(Date.parse(`${day}T00:00:00Z`) - n * 86_400_000).toISOString().slice(0, 10);

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
  staffId = (await pool.query<{ id: string }>('SELECT id FROM app_users WHERE email = $1', [`staff-cons-${run}@example.test`])).rows[0]!.id;
  for (const tid of ['T9001', 'T9002', 'T9003', 'T9004', 'T9005']) {
    ids[tid] = (await pool.query<{ id: string }>('SELECT id FROM tenancies WHERE tid = $1', [tid])).rows[0]!.id;
  }
  await pool.query('UPDATE tenancies SET charges_from = $2::date WHERE id = ANY($1::uuid[])', [[ids.T9001, ids.T9002, ids.T9003, ids.T9004], '2025-01-01']);
  await pool.query('UPDATE tenancies SET charges_from = NULL WHERE id = $1', [ids.T9005]);

  bankK = (await pool.query<{ id: string }>("INSERT INTO bank_accounts (code, bank_name, account_name) VALUES ('CKA', 'Test Bank', 'Cons K') RETURNING id")).rows[0]!.id;

  // T9001: tenant charges 100 (05-01) + 100 (06-01); an auto-matched BANK-LINE receipt of 150 on 06-05 -> balance 50.
  await charge(ids.T9001!, 'tenant', 10000, '2026-05-01');
  await charge(ids.T9001!, 'tenant', 10000, '2026-06-01');
  const b = await batch(bankK, '2026-06-05 09:00+01');
  lineK = await line(bankK, b, '2026-06-05', 15000, 'matched');
  receiptK = await receipt(ids.T9001!, 'tenant', 15000, '2026-06-05', { line: lineK, via: 'tid_in_reference' });

  // T9002 (dwp_uc): one debit on each side of every ageing boundary, relative to D.
  const boundary: [number, number][] = [[0, 50], [30, 100], [31, 200], [60, 400], [61, 800], [90, 1600], [91, 3200]];
  for (const [age, pounds] of boundary) await charge(ids.T9002!, 'dwp_uc', pounds * 100, daysBefore(D, age));
  // T9003 (council_hb): charge 100 five days ago and a -30 adjustment (a credit, never aged) -> balance 70.
  await charge(ids.T9003!, 'council_hb', 10000, daysBefore(D, 5));
  await pool.query(
    "INSERT INTO adjustments (tenancy_id, payer, kind, amount, effective_on, reason) VALUES ($1, 'council_hb', 'write_off', -30, $2::date, 'Cons credit')",
    [ids.T9003, daysBefore(D, 3)],
  );
  // T9004 (other_third_party): ended tenancy still counts; 100 debit at D-100 and D-10, receipt of 150 -> balance 50 (newest first).
  await charge(ids.T9004!, 'other_third_party', 10000, daysBefore(D, 100));
  await charge(ids.T9004!, 'other_third_party', 10000, daysBefore(D, 10));
  await receipt(ids.T9004!, 'other_third_party', 15000, daysBefore(D, 2));
  await pool.query("UPDATE tenancies SET status = 'ended', end_date = $2::date WHERE id = $1", [ids.T9004, daysBefore(D, 1)]);
});

afterAll(async () => {
  await pool?.end();
});

describe('bank-line receipt on an opted-in tenancy moves balance, ageing and statement together', () => {
  const reverse = (when: string) =>
    pool.query("UPDATE receipts SET status = 'reversed', reversed_reason = 'Bounced', reversed_at = $2::timestamptz WHERE id = $1", [receiptK, when]);
  const restore = () => pool.query("UPDATE receipts SET status = 'active', reversed_reason = NULL, reversed_at = NULL WHERE id = $1", [receiptK]);

  it('1: active matched receipt reduces the tenant balance to 50.00, ages only the newest debit, and the statement closes at the same figure', async () => {
    const d = await dash(D);
    const tenant = d.balances.find((r) => r.payer === 'tenant')!;
    expect(tenant).toMatchObject({ accounts: 1, arrearsPence: 5000, creditPence: 0, netPence: 5000 });
    expect(d.ageing.find((r) => r.payer === 'tenant')).toMatchObject({ d0_30: 5000, d31_60: 0, d61_90: 0, d91Plus: 0, totalPence: 5000, accountsInArrears: 1 });

    const s = await stmt('T9001', '2026-05-01', D);
    const t = s.payers.find((p) => p.payer === 'tenant')!;
    expect(t).toMatchObject({ openingPence: 0, closingPence: 5000 });
    expect(t.lines.map((l) => [l.date, l.type, l.balancePence])).toEqual([
      ['2026-05-01', 'Rent charge', 10000],
      ['2026-06-01', 'Rent charge', 20000],
      ['2026-06-05', 'Payment', 5000],
    ]);
    expect(t.lines[2]!.description).toBe('Payment received (CKA 2026-06-05)');
    expect(t.closingPence).toBe(tenant.netPence);
  });

  it('2: the same receipt is in the auto-match rate on its upload day', async () => {
    const k = (await dash('2026-06-05')).imports.banks.find((r) => r.code === 'CKA')!;
    expect(k).toMatchObject({ files: 1, lines: 1, incoming: 1, autoMatched: 1, ratePct: 100 });
  });

  it('3: reversing it puts the balance back to 200.00, re-ages both debits, and the statement shows payment then reversal', async () => {
    await reverse('2026-06-08 10:00+01');
    try {
      const d = await dash(D);
      expect(d.balances.find((r) => r.payer === 'tenant')).toMatchObject({ accounts: 1, arrearsPence: 20000, creditPence: 0, netPence: 20000 });
      expect(d.ageing.find((r) => r.payer === 'tenant')).toMatchObject({ d0_30: 10000, d31_60: 10000, d61_90: 0, d91Plus: 0, totalPence: 20000 });

      const t = (await stmt('T9001', '2026-05-01', D)).payers.find((p) => p.payer === 'tenant')!;
      expect(t.lines.map((l) => [l.date, l.type, l.balancePence])).toEqual([
        ['2026-05-01', 'Rent charge', 10000],
        ['2026-06-01', 'Rent charge', 20000],
        ['2026-06-05', 'Payment', 5000],
        ['2026-06-08', 'Reversal', 20000],
      ]);
      expect(t.lines[3]!.description).toBe('Payment reversed: Bounced');
      expect(t.closingPence).toBe(20000);

      // A reversed receipt still counts as auto-matched for the rate (either status).
      expect((await dash('2026-06-05')).imports.banks.find((r) => r.code === 'CKA')).toMatchObject({ autoMatched: 1, ratePct: 100 });

      // Statement ending before the reversal still shows the payment as paid; the reversal is left out.
      const before = (await stmt('T9001', '2026-05-01', '2026-06-07')).payers.find((p) => p.payer === 'tenant')!;
      expect(before.lines.map((l) => l.type)).toEqual(['Rent charge', 'Rent charge', 'Payment']);
      expect(before.closingPence).toBe(5000);
      // Statement starting after the reversal folds both events into the opening balance.
      const after = (await stmt('T9001', '2026-06-09', D)).payers.find((p) => p.payer === 'tenant')!;
      expect(after).toMatchObject({ openingPence: 20000, closingPence: 20000, lines: [] });
    } finally {
      await restore();
    }
  });

  it('4: CSV for the bank-line receipt shows a 150.00 credit with the bank code and date, and a 50.00 closing balance', async () => {
    const text = ((await binary(`/api/reports/statement/T9001/csv?from=2026-05-01&to=${D}`)).body as Buffer).toString('utf8');
    expect(text).toContain('Payment received (CKA 2026-06-05)');
    expect(text).toContain(',150.00,50.00\r\n');
    expect(text.trimEnd().split('\r\n').pop()!.endsWith(',Closing balance,,,,50.00')).toBe(true);
  });

  it('5: for every payer, the dashboard net equals the sum of statement closings over the opted-in tenancies (to = D)', async () => {
    const d = await dash(D);
    const sums: Record<string, number> = {};
    for (const tid of ['T9001', 'T9002', 'T9003', 'T9004']) {
      for (const p of (await stmt(tid, '2025-01-01', D)).payers) sums[p.payer] = (sums[p.payer] ?? 0) + p.closingPence;
    }
    expect(sums.tenant).toBe(5000);
    expect(sums.dwp_uc).toBe(635000);
    expect(sums.council_hb).toBe(7000);
    expect(sums.other_third_party).toBe(5000);
    for (const [payer, closing] of Object.entries(sums)) expect(d.balances.find((r) => r.payer === payer)!.netPence, payer).toBe(closing);
  });
});

describe('ageing boundaries', () => {
  it('6: days 0/30 fall in 0-30, 31/60 in 31-60, 61/90 in 61-90 and 91 in 91+; buckets sum to the arrears', async () => {
    const d = await dash(D);
    expect(d.ageing.find((r) => r.payer === 'dwp_uc')).toMatchObject({
      d0_30: 5000 + 10000,
      d31_60: 20000 + 40000,
      d61_90: 80000 + 160000,
      d91Plus: 320000,
      totalPence: 635000,
      accountsInArrears: 1,
    });
    expect(d.balances.find((r) => r.payer === 'dwp_uc')!.arrearsPence).toBe(635000);
  });

  it('7: one day later, ages become 1/31/32/61/62/91/92 and the charges re-bucket accordingly', async () => {
    const d = await dash('2026-06-11');
    expect(d.ageing.find((r) => r.payer === 'dwp_uc')).toMatchObject({
      d0_30: 5000, // age 1
      d31_60: 10000 + 20000, // ages 31, 32
      d61_90: 40000 + 80000, // ages 61, 62
      d91Plus: 160000 + 320000, // ages 91, 92
      totalPence: 635000,
    });
  });

  it('8: a credit adjustment is never aged; the remaining balance ages the newest debit first; ended tenancies count', async () => {
    const d = await dash(D);
    expect(d.ageing.find((r) => r.payer === 'council_hb')).toMatchObject({ d0_30: 7000, totalPence: 7000, accountsInArrears: 1 });
    expect(d.balances.find((r) => r.payer === 'council_hb')).toMatchObject({ accounts: 1, arrearsPence: 7000, creditPence: 0 });
    expect(d.ageing.find((r) => r.payer === 'other_third_party')).toMatchObject({ d0_30: 5000, d91Plus: 0, totalPence: 5000 });
    const s = await stmt('T9004', '2025-01-01', D);
    expect(s.payers[0]!.closingPence).toBe(5000);
  });
});

describe('London upload day edges', () => {
  let bankE = '';
  beforeAll(async () => {
    bankE = (await pool.query<{ id: string }>("INSERT INTO bank_accounts (code, bank_name, account_name) VALUES ('CKE', 'Test Bank', 'Cons Edge') RETURNING id")).rows[0]!.id;
    for (const at of [
      // GMT -> BST on 2025-03-30 (01:00 UTC)
      '2025-03-29 23:30+00', '2025-03-30 00:30+00', '2025-03-30 22:59+00', '2025-03-30 23:30+00',
      // BST -> GMT on 2025-10-26 (01:00 UTC)
      '2025-10-25 22:59+00', '2025-10-25 23:30+00', '2025-10-26 00:30+00', '2025-10-26 23:30+00', '2025-10-27 00:00+00',
    ]) {
      const b = await batch(bankE, at);
      await line(bankE, b, '2025-01-01', 1000, 'matched');
    }
  });
  const edge = async (day: string) => (await dash(day)).imports.banks.find((r) => r.code === 'CKE')!;

  it('9: spring change day: 00:30 GMT and 23:59 BST are 30 March; 23:30 UTC on the 30th is 00:30 BST on the 31st', async () => {
    expect(await edge('2025-03-29')).toMatchObject({ files: 1, lastUpload: '23:30' });
    expect(await edge('2025-03-30')).toMatchObject({ files: 2, lines: 2, lastUpload: '23:59' });
    expect(await edge('2025-03-31')).toMatchObject({ files: 1, lastUpload: '00:30' });
  });

  it('10: autumn change day: 23:59 BST is 25 Oct; 00:30 BST on the 26th counts; 23:30 GMT on the 26th counts; 00:00 GMT is the 27th', async () => {
    expect(await edge('2025-10-25')).toMatchObject({ files: 1, lastUpload: '23:59' });
    expect(await edge('2025-10-26')).toMatchObject({ files: 3, lines: 3, lastUpload: '23:30' });
    expect(await edge('2025-10-27')).toMatchObject({ files: 1, lastUpload: '00:00' });
  });
});

describe('auto-match definition and import filters', () => {
  const AD = '2025-08-15';
  beforeAll(async () => {
    const bankA = (await pool.query<{ id: string }>("INSERT INTO bank_accounts (code, bank_name, account_name) VALUES ('CKF', 'Test Bank', 'Cons F') RETURNING id")).rows[0]!.id;
    const bankI = (await pool.query<{ id: string }>("INSERT INTO bank_accounts (code, bank_name, account_name, is_active) VALUES ('CKI', 'Test Bank', 'Cons Inactive', false) RETURNING id")).rows[0]!.id;
    await pool.query("INSERT INTO bank_accounts (code, bank_name, account_name, is_active) VALUES ('CKQ', 'Test Bank', 'Cons Quiet', false)");
    const b = await batch(bankA, `${AD} 10:00+01`);
    const auto = await line(bankA, b, AD, 1000, 'matched'); // auto, later reversed: counts
    await receipt(ids.T9005!, 'tenant', 1000, AD, { line: auto, via: 'tid_in_reference', reversed: true });
    const byUser = await line(bankA, b, AD, 2000, 'matched'); // non-manual method but a user accepted it: not auto
    await receipt(ids.T9005!, 'tenant', 2000, AD, { line: byUser, via: 'name_fuzzy', by: staffId });
    await line(bankA, b, AD, 3000, 'matched'); // no receipt at all: not auto
    const failed = await batch(bankA, `${AD} 11:00+01`, 'failed');
    const f = await line(bankA, failed, AD, 4000, 'matched');
    await receipt(ids.T9005!, 'tenant', 4000, AD, { line: f, via: 'tid_in_reference' });
    const other = await batch(bankA, `${AD} 12:00+01`, 'parsed', 'remittance');
    await line(bankA, other, AD, 5000, 'matched');
    const bi = await batch(bankI, `${AD} 08:15+01`);
    await line(bankI, bi, AD, 6000, 'matched');
  });
  const banks = async () => (await dash(AD)).imports;

  it('11: auto = system-matched incoming lines of either receipt status; user-accepted, manual and unmatched lines are not', async () => {
    const f = (await banks()).banks.find((r) => r.code === 'CKF')!;
    expect(f).toMatchObject({ files: 1, lines: 3, incoming: 3, autoMatched: 1, ratePct: 33.3, lastUpload: '10:00' });
  });

  it('12: failed batches and non-bank_csv batches are not counted', async () => {
    const f = (await banks()).banks.find((r) => r.code === 'CKF')!;
    expect(f.files).toBe(1);
    expect(f.lines).toBe(3);
  });

  it('13: a deactivated bank appears only when it had a batch that day, with a 0.0 rate (not null)', async () => {
    const { banks: rows } = await banks();
    expect(rows.find((r) => r.code === 'CKI')).toMatchObject({ files: 1, lines: 1, incoming: 1, autoMatched: 0, ratePct: 0, lastUpload: '08:15' });
    expect(rows.find((r) => r.code === 'CKQ')).toBeUndefined();
    expect(rows.map((r) => r.code)).toEqual([...rows.map((r) => r.code)].sort());
    expect(rows.map((r) => r.code)).toContain('CKF');
  });
});

describe('backlog corners', () => {
  it('14: only incoming lines in new / needs_review / partially_matched count; yet_to_take is separate and does not set the oldest age', async () => {
    const bankB = (await pool.query<{ id: string }>("INSERT INTO bank_accounts (code, bank_name, account_name) VALUES ('CKB', 'Test Bank', 'Cons B') RETURNING id")).rows[0]!.id;
    const b = await batch(bankB, '2026-05-02 10:00+01');
    await line(bankB, b, '2026-06-01', 1000, 'new');
    await line(bankB, b, '2026-04-01', -500, 'new'); // outgoing: ignored
    await line(bankB, b, '2026-01-01', 1500, 'yet_to_take'); // oldest of all, but yet_to_take
    await line(bankB, b, '2026-02-01', 800, 'matched'); // matched: ignored
    const { backlog } = await dash(D);
    expect(backlog).toMatchObject({ new: 1, needsReview: 0, partiallyMatched: 0, yetToTake: 1, backlog: 1, oldestDays: 9 });
    const { backlog: onDay } = await dash('2026-06-01');
    expect(onDay).toMatchObject({ backlog: 1, oldestDays: 0 });
  });
});

describe('statement privacy in the PDF', () => {
  it('15: neither the compressed nor the uncompressed PDF contains an NI number or sort code text', async () => {
    const s = await getTenantStatement(pool, 'T9001', StatementQuery.parse({ from: '2026-05-01', to: D }));
    for (const compress of [true, false]) {
      const text = (await buildTenantStatementPdf(s, { compress })).toString('latin1');
      expect(text).not.toMatch(/AB\d{6}C/);
      expect(text.toLowerCase()).not.toContain('sort code');
    }
  });
});
