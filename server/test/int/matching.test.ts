/**
 * Matching end to end: upload -> auto_match -> summary, then the review actions (confirm,
 * remember, reject, manual TID, split, exclude/include) and their permissions.
 * Tenancies come from synthetic Veco rows through the real sync.
 */
import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
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
const bankIds: Record<string, string> = {};
const batches: Record<string, string> = {};

const fixture = (name: string) => readFileSync(new URL(`../../../fixtures/banks/${name}`, import.meta.url));
const app = () => createApp({ config, pool, logger });

async function signIn(role: Role): Promise<string> {
  const email = `${role}-mat-${run}@example.test`;
  await upsertUser(pool, { email, fullName: `Mat ${role}`, role, password: PASSWORD });
  const res = await request(app()).post('/api/auth/login').set(CSRF_HEADER, CSRF_HEADER_VALUE).send({ email, password: PASSWORD });
  return (res.headers['set-cookie'] as unknown as string[]).find((c) => c.startsWith(`${SESSION_COOKIE}=`))!.split(';')[0]!;
}

const get = (path: string, role: Role = 'readonly') => request(app()).get(path).set('Cookie', cookies[role]);
const post = (path: string, role: Role = 'staff') =>
  request(app()).post(path).set('Cookie', cookies[role]).set(CSRF_HEADER, CSRF_HEADER_VALUE);
const upload = (code: string, name: string, content?: string) =>
  post('/api/imports')
    .field('bankAccountId', bankIds[code]!)
    .attach('file', content === undefined ? fixture(name) : Buffer.from(content), name);

async function lineBy(description: string, extra: { amount?: string; reference?: string } = {}): Promise<BankLine> {
  const { rows } = await pool.query<{ id: string }>(
    `SELECT id FROM bank_transactions WHERE description = $1
        AND ($2::numeric IS NULL OR amount = $2) AND ($3::text IS NULL OR reference = $3)`,
    [description, extra.amount ?? null, extra.reference ?? null],
  );
  if (rows.length !== 1) throw new Error(`expected one line "${description}", found ${rows.length}`);
  return (await get(`/api/matching/lines/${rows[0]!.id}`)).body.line as BankLine;
}

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

describe('upload runs matching and reports a summary', () => {
  it('HSBC: TID and NI lines match automatically, money out is excluded, unknown payers are yet to take', async () => {
    const res = await upload('HSBC', 'hsbc.csv');
    expect(res.status).toBe(201);
    batches.HSBC = res.body.import.batchId as string;
    expect(res.body.matching).toEqual({
      lines: 6,
      autoMatched: 3,
      matched: 3,
      partiallyMatched: 0,
      needsReview: 0,
      yetToTake: 2,
      excluded: 1,
      unprocessed: 0,
    });
  });

  it('auto matches create one receipt each, with the ledger code for the tenancy type and no user', async () => {
    const { rows } = await pool.query<{ tid: string; payer: string; amount: string; ledger_code: string; via: string; by: string | null }>(
      `SELECT t.tid, r.payer::text, r.amount::text, r.ledger_code, r.matched_via::text AS via, r.matched_by AS by
         FROM receipts r JOIN tenancies t ON t.id = r.tenancy_id ORDER BY t.tid`,
    );
    expect(rows).toEqual([
      { tid: 'T9001', payer: 'council_hb', amount: '650.00', ledger_code: '001', via: 'tid_in_reference', by: null },
      { tid: 'T9002', payer: 'tenant', amount: '650.00', ledger_code: '001', via: 'ni_in_reference', by: null },
      { tid: 'T9003', payer: 'council_hb', amount: '346.15', ledger_code: '001G', via: 'tid_in_reference', by: null },
    ]);
  });

  it('the summary for an import can be fetched again', async () => {
    const res = await get(`/api/matching/imports/${batches.HSBC}/summary`);
    expect(res.body.summary).toMatchObject({ lines: 6, autoMatched: 3, yetToTake: 2, excluded: 1 });
    expect((await get(`/api/matching/imports/${randomUUID()}/summary`)).status).toBe(404);
    expect((await get('/api/matching/imports/not-a-uuid/summary')).status).toBe(404);
  });

  it('the other layouts match by their TID column / references too', async () => {
    const other = await upload('OTHER', 'other_recon_format.csv');
    expect(other.body.matching).toMatchObject({ lines: 3, autoMatched: 2, excluded: 1 });
    const army = await upload('ARMY', 'army.csv');
    expect(army.body.matching).toMatchObject({ lines: 3, autoMatched: 2, excluded: 1 });
  });
});

describe('fuzzy name + amount (needs the 004 rent fallback)', () => {
  it('a payer name that looks like a tenant, paying their rent, is suggested for review, not auto-matched', async () => {
    const res = await upload('HSBC', 'hsbc_overlap.csv');
    expect(res.body.matching).toMatchObject({ lines: 2, autoMatched: 1, needsReview: 1 });
    const line = await lineBy('STANDING ORDER TEST TENANT5', { amount: '650' });
    expect(line.status).toBe('needs_review');
    expect(line.suggestions[0]).toMatchObject({ tid: 'T9005', method: 'name_fuzzy', status: 'open', payer: 'tenant' });
    expect(line.suggestions[0]!.confidence).toBeLessThanOrEqual(0.6);
    expect(line.suggestions[0]!.reason).toContain('amount close to expected 650.00');
  });

  it('a name match is not suggested when the amount is far from the rent', async () => {
    const csv = 'Date,Description,Paid in,Paid out,Balance\n08/09/2026,"STANDING ORDER TEST TENANT5",90.00,,1.00\n';
    const res = await upload('HSBC', 'small.csv', csv);
    expect(res.body.matching).toMatchObject({ lines: 1, yetToTake: 1 });
  });
});

describe('migration 004: expected_payment() falls back to the rent schedule', () => {
  const expected = async (tid: string, on: string) =>
    (
      await pool.query<{ e: string | null }>(
        "SELECT expected_payment(t.id, 'tenant', $2::date)::text AS e FROM tenancies t WHERE t.tid = $1",
        [tid, on],
      )
    ).rows[0]!.e;

  it('uses the rent in force on the date, nothing before the tenancy starts', async () => {
    expect(await expected('T9014', '2026-09-15')).toBe('650.00');
    expect(await expected('T9014', '2025-01-01')).toBeNull();
  });

  it('does not guess the full rent when a council/DWP split shares it', async () => {
    await pool.query(
      `INSERT INTO payer_splits (tenancy_id, payer, share_percent, effective_from)
       SELECT id, 'council_hb', 50, '2025-04-01' FROM tenancies WHERE tid = 'T9014'`,
    );
    expect(await expected('T9014', '2026-09-15')).toBeNull();
  });
});

describe('review actions', () => {
  it('confirming a suggestion creates a receipt by the user and closes the other suggestions', async () => {
    const line = await lineBy('STANDING ORDER TEST TENANT5', { amount: '650' });
    const res = await post(`/api/matching/lines/${line.id}/confirm`).send({ suggestionId: line.suggestions[0]!.id });
    expect(res.status).toBe(200);
    expect(res.body.line).toMatchObject({ status: 'matched', remaining: '0.00' });
    expect(res.body.line.receipts).toEqual([
      expect.objectContaining({ tid: 'T9005', payer: 'tenant', amount: '650.00', matchedVia: 'name_fuzzy', matchedBy: 'Mat staff' }),
    ]);
    expect(res.body.line.suggestions.every((s: { status: string }) => s.status !== 'open')).toBe(true);
    expect((await post(`/api/matching/lines/${line.id}/confirm`).send({ tid: 'T9006' })).status).toBe(409);
  });

  it('"remember" learns a payer account, so the next payment from it matches automatically', async () => {
    await upload('REDSTONE', 'redstone.csv');
    const line = await lineBy('FASTER PAYMENT RECEIVED', { reference: 'RENT' });
    expect(line.status).toBe('yet_to_take');
    const res = await post(`/api/matching/lines/${line.id}/confirm`).send({ tid: 't9010', payer: 'other_third_party', remember: true });
    expect(res.status).toBe(200);
    expect(res.body.line.receipts[0]).toMatchObject({ tid: 'T9010', payer: 'other_third_party', matchedVia: 'manual' });

    const next = 'Posting Date,Reference,Narrative,Amount,Counterparty Sort Code,Counterparty Account\n' +
      '2026-10-01,OCT,"FASTER PAYMENT IN",650.00,00-00-10,12340010\n';
    const again = await upload('REDSTONE', 'redstone_oct.csv', next);
    expect(again.body.matching).toMatchObject({ lines: 1, autoMatched: 1 });
  });

  it('rejecting the last suggestion moves the line to yet to take', async () => {
    const csv = 'Date,Description,Paid in,Paid out,Balance\n09/09/2026,"BACS TEST TENANT7",650.00,,1.00\n';
    await upload('HSBC', 'reject.csv', csv);
    let line = await lineBy('BACS TEST TENANT7');
    expect(line.status).toBe('needs_review');
    for (const s of line.suggestions.filter((x) => x.status === 'open')) {
      const res = await post(`/api/matching/lines/${line.id}/suggestions/${s.id}/reject`);
      expect(res.status).toBe(200);
    }
    line = await lineBy('BACS TEST TENANT7');
    expect(line).toMatchObject({ status: 'yet_to_take', note: 'Yet to take' });
    expect(line.suggestions.every((s) => s.status === 'rejected')).toBe(true);
    const again = await post(`/api/matching/lines/${line.id}/suggestions/${line.suggestions[0]!.id}/reject`);
    expect(again.status).toBe(404);
  });

  it('a bulk council payment can be split across tenancies by amount', async () => {
    const csv = 'Date,Description,Paid in,Paid out,Balance\n10/09/2026,"COUNCIL BULK PAYMENT SEP",1300.00,,1.00\n';
    await upload('HSBC', 'bulk.csv', csv);
    const line = await lineBy('COUNCIL BULK PAYMENT SEP');
    const first = await post(`/api/matching/lines/${line.id}/confirm`).send({ tid: 'T9012', payer: 'council_hb', amount: '650.00' });
    expect(first.body.line).toMatchObject({ status: 'partially_matched', remaining: '650.00' });
    const tooMuch = await post(`/api/matching/lines/${line.id}/confirm`).send({ tid: 'T9013', payer: 'council_hb', amount: '700.00' });
    expect(tooMuch.status).toBe(400);
    expect(tooMuch.body.error.message).toContain('not available on this bank line');
    const second = await post(`/api/matching/lines/${line.id}/confirm`).send({ tid: 'T9013', payer: 'council_hb' });
    expect(second.body.line).toMatchObject({ status: 'matched', remaining: '0.00' });
    expect(second.body.line.receipts.map((r: { tid: string }) => r.tid)).toEqual(['T9012', 'T9013']);
  });

  it('exclude (not rent) and include again', async () => {
    const [unknown] = (await get(`/api/matching/lines?status=yet_to_take&batchId=${batches.HSBC}`)).body.lines as BankLine[];
    const ex = await post(`/api/matching/lines/${unknown!.id}/exclude`).send({ reason: 'internal transfer' });
    expect(ex.body.line).toMatchObject({ status: 'excluded', exclusionReason: 'internal transfer' });
    expect((await post(`/api/matching/lines/${unknown!.id}/confirm`).send({ tid: 'T9001' })).status).toBe(409);
    const inc = await post(`/api/matching/lines/${unknown!.id}/include`);
    expect(inc.body.line).toMatchObject({ status: 'yet_to_take', exclusionReason: null });
    expect((await post(`/api/matching/lines/${unknown!.id}/include`)).status).toBe(409);
  });

  it('money out cannot be matched or included; matched lines cannot be excluded', async () => {
    const out = await lineBy('BT GROUP PLC DD');
    expect(out).toMatchObject({ status: 'excluded', exclusionReason: 'money_out' });
    expect((await post(`/api/matching/lines/${out.id}/include`)).status).toBe(400);
    const matched = await lineBy('COUNCIL HB T9001 SEP RENT');
    expect((await post(`/api/matching/lines/${matched.id}/exclude`).send({ reason: 'oops' })).status).toBe(409);
  });

  it('validates input', async () => {
    const line = await lineBy('BACS TEST TENANT7');
    expect((await post(`/api/matching/lines/${line.id}/confirm`).send({})).status).toBe(400);
    expect((await post(`/api/matching/lines/${line.id}/confirm`).send({ tid: 'T9001', suggestionId: randomUUID() })).status).toBe(400);
    expect((await post(`/api/matching/lines/${line.id}/confirm`).send({ tid: 'T0000' })).status).toBe(400);
    expect((await post(`/api/matching/lines/${line.id}/confirm`).send({ tid: 'T9001', amount: '-5' })).status).toBe(400);
    expect((await post(`/api/matching/lines/${line.id}/confirm`).send({ suggestionId: randomUUID() })).status).toBe(404);
    expect((await post(`/api/matching/lines/${line.id}/exclude`).send({ reason: '' })).status).toBe(400);
    expect((await get('/api/matching/lines/nope')).status).toBe(404);
    expect((await get('/api/matching/lines?status=bogus')).status).toBe(400);
  });
});

describe('queue and permissions', () => {
  it('lists open lines (review, yet to take, partial) with total, oldest first', async () => {
    const res = await get('/api/matching/lines?status=open&limit=2');
    expect(res.status).toBe(200);
    expect(res.body.total).toBeGreaterThanOrEqual(3);
    expect(res.body.lines).toHaveLength(2);
    expect(res.body.lines[0].txnDate <= res.body.lines[1].txnDate).toBe(true);
    const byBank = await get(`/api/matching/lines?status=open&bankAccountId=${bankIds.REDSTONE}`);
    expect(byBank.body.lines.every((l: BankLine) => l.bankCode === 'REDSTONE')).toBe(true);
  });

  it('read-only users can look but not act; anonymous users get nothing', async () => {
    const line = await lineBy('BACS TEST TENANT7');
    expect((await post(`/api/matching/lines/${line.id}/confirm`, 'readonly').send({ tid: 'T9007' })).status).toBe(403);
    expect((await post(`/api/matching/lines/${line.id}/exclude`, 'readonly').send({ reason: 'x y' })).status).toBe(403);
    expect((await post('/api/matching/run', 'readonly').send({})).status).toBe(403);
    expect((await request(app()).get('/api/matching/lines')).status).toBe(401);
  });

  it('run re-processes lines left new (e.g. matching failed after an import)', async () => {
    await pool.query("UPDATE bank_transactions SET status = 'new' WHERE description = 'UNKNOWN PAYER RENT' AND status = 'yet_to_take'");
    const res = await post('/api/matching/run').send({ batchId: batches.HSBC });
    expect(res.status).toBe(200);
    expect(res.body.processed).toBe(2); // both unknown-payer lines (one was excluded and included earlier)
    expect(res.body.summary.unprocessed).toBe(0);
  });

  it('every review action is audited as the user who took it', async () => {
    const { rows } = await pool.query<{ table_name: string; n: number }>(
      `SELECT table_name, count(*)::int AS n FROM audit_log WHERE changed_by = $1
        AND table_name IN ('receipts', 'bank_transactions') GROUP BY table_name ORDER BY table_name`,
      [`staff-mat-${run}@example.test`],
    );
    const counts = Object.fromEntries(rows.map((r) => [r.table_name, r.n]));
    expect(counts.receipts).toBeGreaterThanOrEqual(4);
    // exclude + include (and the confirms) changed bank lines as this user
    expect(counts.bank_transactions).toBeGreaterThanOrEqual(6);
  });
});
