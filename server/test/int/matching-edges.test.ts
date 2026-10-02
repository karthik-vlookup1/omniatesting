/**
 * Matching edge cases (senior-tester, recon-202): matching failing after import, concurrent
 * runs / confirms, suggestion ownership, reference learning, and exclude -> include.
 * Synthetic data only; tenancies come from the synthetic Veco rows through the real sync.
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
const bankIds: Record<string, string> = {};

const app = (cfg = config) => createApp({ config: cfg, pool, logger });
const HSBC = 'Date,Description,Paid in,Paid out,Balance\n';
const REDSTONE = 'Posting Date,Reference,Narrative,Amount,Counterparty Sort Code,Counterparty Account\n';

async function signIn(role: Role): Promise<string> {
  const email = `${role}-edge-${run}@example.test`;
  await upsertUser(pool, { email, fullName: `Edge ${role}`, role, password: PASSWORD });
  const res = await request(app()).post('/api/auth/login').set(CSRF_HEADER, CSRF_HEADER_VALUE).send({ email, password: PASSWORD });
  return (res.headers['set-cookie'] as unknown as string[]).find((c) => c.startsWith(`${SESSION_COOKIE}=`))!.split(';')[0]!;
}

const get = (path: string) => request(app()).get(path).set('Cookie', cookies.readonly);
const post = (path: string, a = app()) =>
  request(a).post(path).set('Cookie', cookies.staff).set(CSRF_HEADER, CSRF_HEADER_VALUE);
const upload = (code: string, content: string, a = app()) =>
  post('/api/imports', a).field('bankAccountId', bankIds[code]!).attach('file', Buffer.from(content), `${randomUUID()}.csv`);

async function lineBy(description: string): Promise<BankLine> {
  const { rows } = await pool.query<{ id: string }>('SELECT id FROM bank_transactions WHERE description = $1', [description]);
  if (rows.length !== 1) throw new Error(`expected one line "${description}", found ${rows.length}`);
  return (await get(`/api/matching/lines/${rows[0]!.id}`)).body.line as BankLine;
}

beforeAll(async () => {
  pool = createPool({ databaseUrl: config.databaseUrl, hashKey: config.hashKey, max: 6 }, logger);
  await pool.query(
    `TRUNCATE allocations, receipts, match_suggestions, payer_bank_accounts, payment_references, bank_transactions,
              import_batches, bank_csv_profiles, bank_accounts,
              rent_schedules, tenancy_tenants, tenancies, tenants, property_units, properties, branches CASCADE`,
  );
  await syncTenancies(pool, vecoRows(20), { keys: { hashKey: config.hashKey, encryptionKey: config.encryptionKey }, force: true });
  for (const role of ['admin', 'staff', 'readonly'] as const) cookies[role] = await signIn(role);
  await request(app()).post('/api/bank-accounts/defaults').set('Cookie', cookies.admin).set(CSRF_HEADER, CSRF_HEADER_VALUE);
  const banks = (await get('/api/bank-accounts')).body.bankAccounts as { code: string; id: string }[];
  for (const b of banks) bankIds[b.code] = b.id;
});

afterAll(async () => {
  await pool?.end();
});

describe('matching failing after the import', () => {
  let batchId: string;

  it('still answers 201 with matching: null and leaves the lines new', async () => {
    const broken = app({ ...config, autoMatchThreshold: 'not-a-number' as unknown as number });
    const csv = `${HSBC}01/09/2026,"EDGE HB T9001 SEP",650.00,,1.00\n01/09/2026,"EDGE HB T9002 SEP",650.00,,2.00\n01/09/2026,"EDGE HB T9003 SEP",650.00,,3.00\n`;
    const res = await upload('HSBC', csv, broken);
    expect(res.status).toBe(201);
    expect(res.body.matching).toBeNull();
    batchId = res.body.import.batchId as string;
    const s = (await get(`/api/matching/imports/${batchId}/summary`)).body.summary;
    expect(s).toMatchObject({ lines: 3, unprocessed: 3, matched: 0 });
  });

  it('two concurrent runs process each line once (SKIP LOCKED): one receipt per line', async () => {
    const [a, b] = await Promise.all([
      post('/api/matching/run').send({ batchId }),
      post('/api/matching/run').send({ batchId }),
    ]);
    expect([a.status, b.status]).toEqual([200, 200]);
    expect(a.body.processed + b.body.processed).toBe(3);
    const { rows } = await pool.query<{ n: number }>(
      `SELECT count(*)::int AS n FROM receipts r JOIN bank_transactions bt ON bt.id = r.bank_transaction_id
        WHERE bt.import_batch_id = $1`,
      [batchId],
    );
    expect(rows[0]!.n).toBe(3);
    expect((await get(`/api/matching/imports/${batchId}/summary`)).body.summary).toMatchObject({ autoMatched: 3, unprocessed: 0 });
  });
});

describe('confirm rules', () => {
  it('a suggestion from another line is 404; an already-decided suggestion is 409', async () => {
    await upload('HSBC', `${HSBC}05/09/2026,"BACS TEST TENANT8",650.00,,1.00\n05/09/2026,"BACS TEST TENANT9",650.00,,2.00\n`);
    const a = await lineBy('BACS TEST TENANT8');
    const b = await lineBy('BACS TEST TENANT9');
    expect(a.status).toBe('needs_review');
    expect(b.status).toBe('needs_review');
    expect((await post(`/api/matching/lines/${a.id}/confirm`).send({ suggestionId: b.suggestions[0]!.id })).status).toBe(404);

    const s = a.suggestions[1]!;
    expect((await post(`/api/matching/lines/${a.id}/suggestions/${s.id}/reject`)).status).toBe(200);
    expect((await post(`/api/matching/lines/${a.id}/confirm`).send({ suggestionId: s.id })).status).toBe(409);
  });

  it('two people confirming the same line at once: one wins, the other gets 409, one receipt', async () => {
    const line = await lineBy('BACS TEST TENANT9');
    const sid = line.suggestions[0]!.id;
    const results = await Promise.all([
      post(`/api/matching/lines/${line.id}/confirm`).send({ suggestionId: sid }),
      post(`/api/matching/lines/${line.id}/confirm`).send({ suggestionId: sid }),
    ]);
    expect(results.map((r) => r.status).sort()).toEqual([200, 409]);
    const { rows } = await pool.query<{ n: number }>('SELECT count(*)::int AS n FROM receipts WHERE bank_transaction_id = $1', [line.id]);
    expect(rows[0]!.n).toBe(1);
  });

  it('racing partial amounts that together exceed the line: one 200, one 400, never 500', async () => {
    await upload('HSBC', `${HSBC}06/09/2026,"COUNCIL BULK EDGE",1000.00,,1.00\n`);
    const line = await lineBy('COUNCIL BULK EDGE');
    const results = await Promise.all([
      post(`/api/matching/lines/${line.id}/confirm`).send({ tid: 'T9015', payer: 'council_hb', amount: '600.00' }),
      post(`/api/matching/lines/${line.id}/confirm`).send({ tid: 'T9016', payer: 'council_hb', amount: '600.00' }),
    ]);
    expect(results.map((r) => r.status).sort()).toEqual([200, 400]);
    expect((await lineBy('COUNCIL BULK EDGE')).remaining).toBe('400.00');
  });

  it('zero amount is 400; money out cannot be confirmed', async () => {
    const line = await lineBy('COUNCIL BULK EDGE');
    expect((await post(`/api/matching/lines/${line.id}/confirm`).send({ tid: 'T9017', amount: '0.00' })).status).toBe(400);
    await upload('HSBC', `${HSBC}06/09/2026,"EDGE DD OUT",,12.00,1.00\n`);
    const out = await lineBy('EDGE DD OUT');
    expect((await post(`/api/matching/lines/${out.id}/confirm`).send({ tid: 'T9017' })).status).toBe(409);
  });
});

describe('remember', () => {
  it('without a payer account, remember learns the reference and the next payment auto-matches', async () => {
    await upload('REDSTONE', `${REDSTONE}2026-09-04,FLAT NINE EDGE,"EDGE PAYMENT A",640.00,,\n`);
    const line = await lineBy('EDGE PAYMENT A');
    expect(line.payerAccountLast4).toBeNull();
    const res = await post(`/api/matching/lines/${line.id}/confirm`).send({ tid: 'T9018', remember: true });
    expect(res.status).toBe(200);
    const again = await upload('REDSTONE', `${REDSTONE}2026-10-04,flat  nine edge,"EDGE PAYMENT B",640.00,,\n`);
    expect(again.body.matching).toMatchObject({ lines: 1, autoMatched: 1 });
  });
});

describe('exclude -> include', () => {
  it('a line with suggestions, excluded by mistake and included again, is back for review with open suggestions', async () => {
    await upload('HSBC', `${HSBC}07/09/2026,"BACS TEST TENANT11",650.00,,1.00\n`);
    const before = await lineBy('BACS TEST TENANT11');
    expect(before.status).toBe('needs_review');
    await post(`/api/matching/lines/${before.id}/exclude`).send({ reason: 'not rent' });
    const inc = await post(`/api/matching/lines/${before.id}/include`);
    expect(inc.status).toBe(200);
    expect(inc.body.line.status).toBe('needs_review');
    expect(inc.body.line.suggestions.some((s: { status: string }) => s.status === 'open')).toBe(true);
  });
});
