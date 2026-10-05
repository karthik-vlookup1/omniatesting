/**
 * Receipt operations end to end: split a bank line, pin allocations by hand (and keep the pin across a
 * rent refresh), reverse receipts under each Xero/Vico state, write-offs and refunds, permissions and
 * audit. Tenancies come from synthetic Veco rows through the real sync.
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
import { vecoRows } from '../fixtures/veco-rows.js';

const PASSWORD = 'correct-horse-battery';
const config = loadConfig();
const logger = createLogger({ level: 'silent' });
const keys = { hashKey: config.hashKey, encryptionKey: config.encryptionKey };
const run = randomUUID().slice(0, 8);
let pool: Pool;
let bankId = '';
const cookies = {} as Record<Role, string>;
const emails = {} as Record<Role, string>;

const app = () => createApp({ config, pool, logger });

async function signIn(role: Role): Promise<string> {
  const email = `${role}-rcp-${run}@example.test`;
  emails[role] = email;
  await upsertUser(pool, { email, fullName: `Rcp ${role}`, role, password: PASSWORD });
  const res = await request(app()).post('/api/auth/login').set(CSRF_HEADER, CSRF_HEADER_VALUE).send({ email, password: PASSWORD });
  return (res.headers['set-cookie'] as unknown as string[]).find((c) => c.startsWith(`${SESSION_COOKIE}=`))!.split(';')[0]!;
}

const get = (path: string, role: Role = 'accounts') => request(app()).get(path).set('Cookie', cookies[role]);
const send = (method: 'post' | 'put' | 'delete', path: string, body: object | undefined, role: Role = 'accounts', csrf = true) => {
  let req = request(app())[method](path).set('Cookie', cookies[role]);
  if (csrf) req = req.set(CSRF_HEADER, CSRF_HEADER_VALUE);
  return body === undefined ? req : req.send(body);
};

const tenancyId = async (tid: string) => (await pool.query<{ id: string }>('SELECT id FROM tenancies WHERE tid = $1', [tid])).rows[0]!.id;

/** A money-in bank line of `pence`, as an import would leave it. */
async function seedLine(pence: number, description: string): Promise<string> {
  const batch = await pool.query<{ id: string }>(
    `INSERT INTO import_batches (source, bank_account_id, file_name, file_sha256, status)
     VALUES ('bank_csv', $1, $2, $3, 'parsed') RETURNING id`,
    [bankId, `${description}.csv`, randomUUID()],
  );
  const line = await pool.query<{ id: string }>(
    `INSERT INTO bank_transactions (bank_account_id, import_batch_id, txn_date, amount, description, raw_row, dedupe_key, status)
     VALUES ($1, $2, current_date, ($3::bigint)::numeric / 100, $4, '{}'::jsonb, $5, 'needs_review') RETURNING id`,
    [bankId, batch.rows[0]!.id, pence, description, randomUUID()],
  );
  return line.rows[0]!.id;
}

/** A whole-line receipt for one tenancy, made the way confirm_match makes them. */
async function receiptFor(tid: string, pence: number, payer = 'tenant'): Promise<{ id: string; lineId: string }> {
  const lineId = await seedLine(pence, `RCPT ${tid} ${randomUUID().slice(0, 6)}`);
  const r = await pool.query<{ id: string }>("SELECT confirm_match($1, $2, $3::payer_type, 'manual', false, NULL, NULL) AS id", [
    lineId,
    await tenancyId(tid),
    payer,
  ]);
  return { id: r.rows[0]!.id, lineId };
}

async function manualCharge(tid: string, pence: number, periodStart: string, payer = 'tenant'): Promise<string> {
  const r = await pool.query<{ id: string }>(
    `INSERT INTO rent_charges (tenancy_id, payer, period_start, period_end, due_date, amount, source)
     VALUES ($1, $2::payer_type, $3::date, $3::date + 6, $3::date, ($4::bigint)::numeric / 100, 'manual') RETURNING id`,
    [await tenancyId(tid), payer, periodStart, pence],
  );
  return r.rows[0]!.id;
}

const dayOffset = async (base: string, n: number): Promise<string> =>
  (await pool.query<{ d: string }>('SELECT ($1::date + $2::int)::text AS d', [base, n])).rows[0]!.d;

const count = async (sql: string, params: unknown[] = []) =>
  Number(((await pool.query<{ n: string }>(`SELECT count(*) AS n FROM ${sql}`, params)).rows[0] as { n: string }).n);

interface Detail {
  id: string;
  status: string;
  allocationMode: string;
  allocatedPence: number;
  xeroState: string;
  externalCorrection: string | null;
  allocations: { rentChargeId: string; periodStart: string; amountPence: number; allocatedBy: string }[];
  openCharges: { id: string; periodStart: string; outstandingPence: number }[];
}
const receipt = async (id: string): Promise<Detail> => (await get(`/api/receipts/${id}`)).body.receipt as Detail;
const lineStatus = async (id: string) =>
  (await pool.query<{ status: string; resolved_tenancy_id: string | null }>('SELECT status::text AS status, resolved_tenancy_id FROM bank_transactions WHERE id = $1', [id])).rows[0]!;

beforeAll(async () => {
  pool = createPool({ databaseUrl: config.databaseUrl, hashKey: config.hashKey, max: 4 }, logger);
  await pool.query(
    `TRUNCATE allocations, receipts, remittance_lines, remittance_advices, sync_outbox, external_refs, adjustments,
              match_suggestions, payer_bank_accounts, payment_references, bank_transactions, import_batches,
              bank_csv_profiles, bank_accounts, rent_charge_dirty, rent_charges, rent_schedules, tenancy_tenants,
              tenancies, tenants, property_units, properties, branches CASCADE`,
  );
  await syncTenancies(pool, vecoRows(30), { keys, force: true });
  for (const role of ['admin', 'accounts', 'staff', 'readonly'] as const) cookies[role] = await signIn(role);
  bankId = (await pool.query<{ id: string }>("INSERT INTO bank_accounts (code, bank_name, account_name) VALUES ('RCPT', 'Test Bank', 'Receipts test') RETURNING id")).rows[0]!.id;
});

afterAll(async () => {
  await pool?.end();
});

describe('split a bank line', () => {
  it('1: three parts that add up exactly make three receipts and match the line; 1p off or a repeat writes nothing', async () => {
    const lineId = await seedLine(100000, 'SPLIT ME');
    const parts = [
      { tid: 'T9001', payer: 'tenant', amountPence: 30000 },
      { tid: 'T9002', payer: 'council_hb', amountPence: 50000 },
      { tid: 'T9003', payer: 'tenant', amountPence: 20000 },
    ];
    const off = await send('post', '/api/receipts/split', { bankTransactionId: lineId, parts: [{ ...parts[0], amountPence: 29999 }, parts[1], parts[2]] });
    expect(off.status).toBe(400);
    expect(off.body.error.message).toBe('Parts add up to £999.99 but £1000.00 is left on this bank line');
    const repeat = await send('post', '/api/receipts/split', {
      bankTransactionId: lineId,
      parts: [parts[0], { ...parts[0], amountPence: 70000 }],
    });
    expect(repeat.status).toBe(400);
    const unknown = await send('post', '/api/receipts/split', { bankTransactionId: lineId, parts: [{ ...parts[0], tid: 'T9777' }, parts[1]] });
    expect(unknown.status).toBe(400);
    expect(unknown.body.error.message).toBe('Unknown TID T9777');
    expect(await count('receipts WHERE bank_transaction_id = $1', [lineId])).toBe(0);
    expect((await lineStatus(lineId)).status).toBe('needs_review');

    const ok = await send('post', '/api/receipts/split', { bankTransactionId: lineId, parts });
    expect(ok.status).toBe(200);
    expect(ok.body.line).toMatchObject({ status: 'matched', remainingPence: 0 });
    expect(ok.body.line.receipts).toHaveLength(3);
    expect(await count("receipts WHERE bank_transaction_id = $1 AND status = 'active'", [lineId])).toBe(3);
    expect((await lineStatus(lineId)).status).toBe('matched');
  });

  const two = (a: string, b: string, x: number, y: number) => [
    { tid: a, payer: 'tenant', amountPence: x },
    { tid: b, payer: 'tenant', amountPence: y },
  ];

  it('9: refuses an unknown, excluded or outgoing line and malformed parts; only what is left on a part-matched line can be split', async () => {
    const split = (bankTransactionId: string, parts: unknown) => send('post', '/api/receipts/split', { bankTransactionId, parts });
    expect((await split(randomUUID(), two('T9011', 'T9012', 1, 1))).status).toBe(404);
    const excluded = await seedLine(1000, 'EXCLUDED LINE');
    await pool.query("UPDATE bank_transactions SET status = 'excluded', exclusion_reason = 'not rent' WHERE id = $1", [excluded]);
    expect((await split(excluded, two('T9011', 'T9012', 500, 500))).status).toBe(409);
    const outgoing = await seedLine(-1000, 'MONEY OUT');
    expect((await split(outgoing, two('T9011', 'T9012', 500, 500))).status).toBe(409);

    const line = await seedLine(10000, 'MALFORMED PARTS');
    expect((await split(line, [{ tid: 'T9011', payer: 'tenant', amountPence: 10000 }])).status).toBe(400);
    expect((await split(line, two('T9011', 'T9012', 0, 10000))).status).toBe(400);
    expect((await split(line, two('T9011', 'T9012', -5, 10005))).status).toBe(400);
    expect((await split(line, two('T9011', 'T9012', 5000.5, 4999.5))).status).toBe(400);
    expect((await split(line, [{ tid: 'T9011', payer: 'landlord', amountPence: 5000 }, ...two('T9012', 'T9013', 1, 1)])).status).toBe(400);
    expect((await split(line, [...two('T9011', 'T9012', 5000, 5000), { tid: 'T9013', payer: 'tenant', amountPence: 1, extra: true }])).status).toBe(400);
    expect(await count('receipts WHERE bank_transaction_id = ANY($1::uuid[])', [[excluded, outgoing, line]])).toBe(0);

    // 40.00 already matched: only the 60.00 that is left can be split.
    const part = await seedLine(10000, 'PART MATCHED LINE');
    await pool.query("SELECT confirm_match($1, $2, 'tenant'::payer_type, 'manual', false, NULL, 40.00)", [part, await tenancyId('T9011')]);
    expect((await lineStatus(part)).status).toBe('partially_matched');
    const short = await split(part, two('T9012', 'T9013', 2000, 3000));
    expect(short.status).toBe(400);
    expect(short.body.error.message).toBe('Parts add up to £50.00 but £60.00 is left on this bank line');
    const whole = await split(part, two('T9012', 'T9013', 5000, 5000));
    expect(whole.status).toBe(400);
    expect(await count('receipts WHERE bank_transaction_id = $1', [part])).toBe(1);
    const ok = await split(part, two('T9012', 'T9013', 3000, 3000));
    expect(ok.status).toBe(200);
    expect(ok.body.line).toMatchObject({ status: 'matched', remainingPence: 0 });
    expect(ok.body.line.receipts.map((r: { amountPence: number }) => r.amountPence).sort((x: number, y: number) => x - y)).toEqual([3000, 3000, 4000]);

    // Nothing is left on a matched line: any further split is refused and writes nothing.
    const again = await split(part, two('T9012', 'T9013', 1, 1));
    expect(again.status).toBe(400);
    expect(again.body.error.message).toBe('Parts add up to £0.02 but £0.00 is left on this bank line');
    expect(await count("receipts WHERE bank_transaction_id = $1 AND status = 'active'", [part])).toBe(3);
  });

  it('9b: a part for a tenancy that ended before the payment is an ended overpayment', async () => {
    await pool.query("UPDATE tenancies SET end_date = current_date - 30 WHERE tid = 'T9014'");
    const line = await seedLine(5000, 'ENDED TENANCY PART');
    const res = await send('post', '/api/receipts/split', { bankTransactionId: line, parts: two('T9014', 'T9013', 2000, 3000) });
    expect(res.status).toBe(200);
    const { rows } = await pool.query<{ tid: string; category: string }>(
      'SELECT t.tid, r.category::text AS category FROM receipts r JOIN tenancies t ON t.id = r.tenancy_id WHERE r.bank_transaction_id = $1 ORDER BY t.tid',
      [line],
    );
    expect(rows).toEqual([
      { tid: 'T9013', category: 'regular' },
      { tid: 'T9014', category: 'ended_overpayment' },
    ]);
  });

  it('9c: two splits of the same line at once make one set of receipts, never more money than the line', async () => {
    const line = await seedLine(10000, 'RACE LINE');
    const body = { bankTransactionId: line, parts: two('T9011', 'T9012', 6000, 4000) };
    const results = await Promise.all([send('post', '/api/receipts/split', body), send('post', '/api/receipts/split', body)]);
    expect(results.map((r) => r.status).sort()).toEqual([200, 400]);
    expect(await count("receipts WHERE bank_transaction_id = $1 AND status = 'active'", [line])).toBe(2);
    const sum = (await pool.query<{ s: string }>("SELECT (sum(amount) * 100)::bigint AS s FROM receipts WHERE bank_transaction_id = $1 AND status = 'active'", [line])).rows[0]!.s;
    expect(Number(sum)).toBe(10000);
  });
});

describe('allocation override', () => {
  it('2: pins charges by hand, refuses bad pins, keeps the pin across a rent refresh, and resets to oldest first', async () => {
    const tid = 'T9004';
    const today = (await pool.query<{ d: string }>('SELECT current_date::text AS d')).rows[0]!.d;
    const D = await dayOffset(today, -27);
    const rent = await send('post', `/api/rent/${tid}/schedules`, { amountPence: 10000, frequency: 'weekly', effectiveFrom: D });
    expect(rent.status).toBe(201);
    const { id } = await receiptFor(tid, 15000);
    const before = await receipt(id);
    expect(before.allocationMode).toBe('auto');
    expect(before.allocations.map((a) => a.amountPence)).toEqual([10000, 5000]);
    const charges = before.openCharges;
    expect(charges.length).toBeGreaterThanOrEqual(4);
    const [c1, , c3, c4] = [charges[0]!, charges[1]!, charges[2]!, charges[3]!];

    const pin = await send('put', `/api/receipts/${id}/allocations`, {
      allocations: [
        { rentChargeId: c3.id, amountPence: 10000 },
        { rentChargeId: c4.id, amountPence: 5000 },
      ],
    });
    expect(pin.status).toBe(200);
    expect(pin.body.receipt.allocationMode).toBe('manual');
    const pinned = (await receipt(id)).allocations;
    expect(pinned.map((a) => [a.periodStart, a.amountPence, a.allocatedBy])).toEqual([
      [c3.periodStart, 10000, emails.accounts],
      [c4.periodStart, 5000, emails.accounts],
    ]);

    const tooMuch = await send('put', `/api/receipts/${id}/allocations`, {
      allocations: [
        { rentChargeId: c1.id, amountPence: 10000 },
        { rentChargeId: c3.id, amountPence: 10000 },
      ],
    });
    expect(tooMuch.status).toBe(400);
    expect(tooMuch.body.error.message).toBe('Allocations £200.00 exceed the receipt £150.00');
    const overCharge = await send('put', `/api/receipts/${id}/allocations`, { allocations: [{ rentChargeId: c1.id, amountPence: 10001 }] });
    expect(overCharge.status).toBe(400);
    expect(overCharge.body.error.message).toContain('outstanding on that charge');
    const otherPayer = await manualCharge(tid, 5000, await dayOffset(D, -60), 'council_hb');
    const wrongPayer = await send('put', `/api/receipts/${id}/allocations`, { allocations: [{ rentChargeId: otherPayer, amountPence: 5000 }] });
    expect(wrongPayer.status).toBe(400);
    expect((await receipt(id)).allocations).toHaveLength(2);

    // A rent refresh regenerates the schedule charges but re-applies the pin to the same periods.
    await pool.query('UPDATE tenancies SET charges_from = $2::date - 7 WHERE tid = $1', [tid, D]);
    await pool.query('SELECT refresh_rent_charges(id) FROM tenancies WHERE tid = $1', [tid]);
    const kept = await receipt(id);
    expect(kept.allocationMode).toBe('manual');
    expect(kept.allocations.map((a) => [a.periodStart, a.amountPence])).toEqual([
      [c3.periodStart, 10000],
      [c4.periodStart, 5000],
    ]);

    const reset = await send('delete', `/api/receipts/${id}/allocations`, undefined);
    expect(reset.status).toBe(200);
    const auto = await receipt(id);
    expect(auto.allocationMode).toBe('auto');
    expect(auto.allocatedPence).toBe(15000);
    expect(auto.allocations[0]!.periodStart < c1.periodStart).toBe(true);  // the refresh added an earlier period; oldest first takes it
    expect(auto.allocations[0]!.allocatedBy).toBe('auto_oldest_first');
  });

  /** No receipt carries more than its amount and no charge more than its amount, anywhere. */
  const noOverAllocation = async () => {
    expect(await count('receipts r WHERE r.amount < coalesce((SELECT sum(a.amount) FROM allocations a WHERE a.receipt_id = r.id), 0)')).toBe(0);
    expect(await count('rent_charges c WHERE c.amount < coalesce((SELECT sum(a.amount) FROM allocations a WHERE a.rent_charge_id = c.id), 0)')).toBe(0);
  };

  it('10: allocations never exceed a receipt or a charge; automatic allocation skips a manual receipt; reversed receipts cannot be pinned', async () => {
    const tid = 'T9015';
    const today = (await pool.query<{ d: string }>('SELECT current_date::text AS d')).rows[0]!.d;
    const charge = await manualCharge(tid, 10000, today);
    const a = await receiptFor(tid, 8000);
    const b = await receiptFor(tid, 6000);
    expect((await receipt(a.id)).allocatedPence).toBe(8000);
    expect((await receipt(b.id)).allocatedPence).toBe(2000);

    // b may hold at most what is free on the charge once a's share is excluded: 2000.
    const over = await send('put', `/api/receipts/${b.id}/allocations`, { allocations: [{ rentChargeId: charge, amountPence: 5000 }] });
    expect(over.status).toBe(400);
    expect(over.body.error.message).toContain('outstanding on that charge');
    expect((await receipt(b.id)).allocatedPence).toBe(2000);
    expect((await send('put', `/api/receipts/${b.id}/allocations`, { allocations: [{ rentChargeId: charge, amountPence: 2000 }] })).status).toBe(200);

    // Malformed pins are refused and change nothing.
    const dup = { allocations: [{ rentChargeId: charge, amountPence: 1000 }, { rentChargeId: charge, amountPence: 1000 }] };
    expect((await send('put', `/api/receipts/${b.id}/allocations`, dup)).status).toBe(400);
    expect((await send('put', `/api/receipts/${b.id}/allocations`, { allocations: [{ rentChargeId: randomUUID(), amountPence: 100 }] })).status).toBe(400);
    expect((await send('put', `/api/receipts/${b.id}/allocations`, { allocations: [{ rentChargeId: charge, amountPence: 0 }] })).status).toBe(400);
    expect((await send('put', `/api/receipts/${b.id}/allocations`, { allocations: [{ rentChargeId: charge, amountPence: 10.5 }] })).status).toBe(400);
    expect((await send('put', `/api/receipts/${b.id}/allocations`, { allocations: [], extra: 1 })).status).toBe(400);
    expect((await send('put', `/api/receipts/${randomUUID()}/allocations`, { allocations: [] })).status).toBe(404);
    expect((await receipt(b.id)).allocatedPence).toBe(2000);

    // "No allocation" pin on a: it is manual with nothing allocated, and automatic allocation leaves it alone.
    expect((await send('put', `/api/receipts/${a.id}/allocations`, { allocations: [] })).status).toBe(200);
    expect(await receipt(a.id)).toMatchObject({ allocationMode: 'manual', allocatedPence: 0, allocations: [] });
    const c = await receiptFor(tid, 3000);
    expect((await receipt(c.id)).allocatedPence).toBe(3000);
    await pool.query('SELECT reallocate_tenancy($1)', [await tenancyId(tid)]);
    expect(await receipt(a.id)).toMatchObject({ allocationMode: 'manual', allocatedPence: 0 });
    await noOverAllocation();

    // Back to automatic: a takes only what is still free (10000 - 2000 - 3000), never more.
    expect((await send('delete', `/api/receipts/${a.id}/allocations`, undefined)).status).toBe(200);
    expect(await receipt(a.id)).toMatchObject({ allocationMode: 'auto', allocatedPence: 5000 });
    await noOverAllocation();

    // A reversed receipt can be neither pinned nor reset.
    expect((await send('post', `/api/receipts/${c.id}/reverse`, { reason: 'Wrong tenancy' })).status).toBe(200);
    expect((await send('put', `/api/receipts/${c.id}/allocations`, { allocations: [] })).status).toBe(409);
    expect((await send('delete', `/api/receipts/${c.id}/allocations`, undefined)).status).toBe(409);
    expect((await send('delete', `/api/receipts/${randomUUID()}/allocations`, undefined)).status).toBe(404);
    await noOverAllocation();
  });

  it('11: a rent refresh keeps a pin but never above what is now outstanding; a pin on a vanished period leaves the money unallocated', async () => {
    const tid = 'T9016';
    const today = (await pool.query<{ d: string }>('SELECT current_date::text AS d')).rows[0]!.d;
    const D = await dayOffset(today, -27);
    expect((await send('post', `/api/rent/${tid}/schedules`, { amountPence: 10000, frequency: 'weekly', effectiveFrom: D })).status).toBe(201);
    const { id } = await receiptFor(tid, 15000);
    const charges = (await receipt(id)).openCharges;
    expect(charges.length).toBeGreaterThanOrEqual(4);
    const [c3, c4] = [charges[2]!, charges[3]!];
    const pin = await send('put', `/api/receipts/${id}/allocations`, {
      allocations: [
        { rentChargeId: c3.id, amountPence: 10000 },
        { rentChargeId: c4.id, amountPence: 5000 },
      ],
    });
    expect(pin.status).toBe(200);

    // Rent drops to 60.00 a week: the pin on c3 shrinks to the new charge, the 50.00 on c4 still fits.
    await pool.query('UPDATE rent_schedules SET amount = 60.00 WHERE tenancy_id = $1', [await tenancyId(tid)]);
    await pool.query('SELECT refresh_rent_charges($1)', [await tenancyId(tid)]);
    const capped = await receipt(id);
    expect(capped.allocationMode).toBe('manual');
    expect(capped.allocations.map((x) => [x.periodStart, x.amountPence])).toEqual([
      [c3.periodStart, 6000],
      [c4.periodStart, 5000],
    ]);
    await noOverAllocation();

    // The schedule now stops before c3: those periods are gone, the pin has no successor and the money stays unallocated.
    await pool.query('UPDATE rent_schedules SET effective_to = $2::date + 13 WHERE tenancy_id = $1 AND effective_from = $2::date', [await tenancyId(tid), D]);
    await pool.query('SELECT refresh_rent_charges($1)', [await tenancyId(tid)]);
    const gone = await receipt(id);
    expect(gone.allocationMode).toBe('manual');
    expect(gone.allocations.filter((x) => x.periodStart >= c3.periodStart)).toEqual([]);
    expect(gone.allocatedPence).toBeLessThan(15000);
    await noOverAllocation();
  });
});

describe('reversal', () => {
  it('3: reversing a queued receipt frees its charge for another receipt and puts the line back for review; twice is a 409', async () => {
    const tid = 'T9005';
    const today = (await pool.query<{ d: string }>('SELECT current_date::text AS d')).rows[0]!.d;
    const charge = await manualCharge(tid, 30000, today);
    const lineId = await seedLine(50000, 'REVERSE ME');
    const split = await send('post', '/api/receipts/split', {
      bankTransactionId: lineId,
      parts: [
        { tid, payer: 'tenant', amountPence: 30000 },
        { tid: 'T9006', payer: 'tenant', amountPence: 20000 },
      ],
    });
    expect(split.status).toBe(200);
    const sorted = (split.body.line.receipts as { id: string; tid: string }[]).sort((x, y) => x.tid.localeCompare(y.tid));
    const a = sorted[0]!;
    const c = sorted[1]!;
    const b = await pool.query<{ id: string }>(
      "INSERT INTO receipts (tenancy_id, payer, amount, received_on, matched_via) VALUES ($1, 'tenant', 200.00, current_date, 'manual') RETURNING id",
      [await tenancyId(tid)],
    );
    await pool.query('SELECT reallocate_tenancy($1)', [await tenancyId(tid)]);
    expect((await receipt(b.rows[0]!.id)).allocatedPence).toBe(0);
    expect((await receipt(a.id)).allocations).toEqual([expect.objectContaining({ rentChargeId: charge, amountPence: 30000 })]);

    const rev = await send('post', `/api/receipts/${a.id}/reverse`, { reason: 'Paid to the wrong tenancy' });
    expect(rev.status).toBe(200);
    expect(rev.body.receipt).toMatchObject({ status: 'reversed', allocations: [] });
    expect((await receipt(b.rows[0]!.id)).allocations).toEqual([expect.objectContaining({ rentChargeId: charge, amountPence: 20000 })]);
    expect((await lineStatus(lineId)).status).toBe('partially_matched');
    expect((await lineStatus(lineId)).resolved_tenancy_id).toBe(await tenancyId('T9006')); // the remaining active receipt
    const row = (await pool.query('SELECT reversed_by, reversed_at, reversed_reason FROM receipts WHERE id = $1', [a.id])).rows[0];
    expect(row.reversed_by).not.toBeNull();
    expect(row.reversed_at).not.toBeNull();
    expect(row.reversed_reason).toBe('Paid to the wrong tenancy');

    const again = await send('post', `/api/receipts/${a.id}/reverse`, { reason: 'Paid to the wrong tenancy' });
    expect(again.status).toBe(409);

    expect((await send('post', `/api/receipts/${c.id}/reverse`, { reason: 'Remainder returned too' })).status).toBe(200);
    expect(await lineStatus(lineId)).toEqual({ status: 'needs_review', resolved_tenancy_id: null });
  });

  async function claimInXero(receiptId: string, status: 'pending' | 'failed' | 'in_flight' | 'dead' | 'done', batch: string) {
    await pool.query(
      `INSERT INTO external_refs (system, entity_type, entity_id, external_id, external_key2, last_synced_at)
       VALUES ('xero', 'receipt', $1, $2, $3, now())`,
      [receiptId, `${batch}:${receiptId}`, batch],
    );
    await pool.query(
      `INSERT INTO sync_outbox (system, entity_type, entity_id, op, payload, idempotency_key, status)
       VALUES ('xero', 'invoice', $1, 'upsert', '{}'::jsonb, $2, $3::sync_status)`,
      [randomUUID(), `recon-inv:${batch}`, status],
    );
  }

  it('4: Xero and Vico states decide whether a reversal needs a recorded correction', async () => {
    const sent = await receiptFor('T9007', 10000);
    await claimInXero(sent.id, 'done', `b-${run}-sent`);
    expect((await receipt(sent.id)).xeroState).toBe('sent');
    const noRef = await send('post', `/api/receipts/${sent.id}/reverse`, { reason: 'Duplicate payment' });
    expect(noRef.status).toBe(409);
    expect((await receipt(sent.id)).status).toBe('active');
    const withRef = await send('post', `/api/receipts/${sent.id}/reverse`, { reason: 'Duplicate payment', xeroCreditRef: 'CN-0042' });
    expect(withRef.status).toBe(200);
    expect(withRef.body.receipt.externalCorrection).toBe('Xero credit note CN-0042');

    const sending = await receiptFor('T9008', 10000);
    await claimInXero(sending.id, 'in_flight', `b-${run}-fly`);
    const fly = await send('post', `/api/receipts/${sending.id}/reverse`, { reason: 'Duplicate payment', xeroCreditRef: 'CN-1' });
    expect(fly.status).toBe(409);
    expect(fly.body.error.message).toContain('being sent to Xero');

    const stuck = await receiptFor('T9009', 10000);
    await claimInXero(stuck.id, 'dead', `b-${run}-dead`);
    expect((await send('post', `/api/receipts/${stuck.id}/reverse`, { reason: 'Duplicate payment' })).status).toBe(409);

    const queued = await receiptFor('T9010', 10000);
    await claimInXero(queued.id, 'pending', `b-${run}-queued`);
    expect((await receipt(queued.id)).xeroState).toBe('queued');
    expect((await send('post', `/api/receipts/${queued.id}/reverse`, { reason: 'Duplicate payment' })).status).toBe(200);

    const vico = await receiptFor('T9001', 10000);
    await pool.query(
      "INSERT INTO external_refs (system, entity_type, entity_id, external_id, external_key2, last_synced_at) VALUES ('vico', 'receipt', $1, $2, 'x1', now())",
      [vico.id, `x1:${vico.id}`],
    );
    expect((await send('post', `/api/receipts/${vico.id}/reverse`, { reason: 'Duplicate payment' })).status).toBe(409);
    const withNote = await send('post', `/api/receipts/${vico.id}/reverse`, { reason: 'Duplicate payment', vicoNote: 'Negative row keyed in Vico' });
    expect(withNote.status).toBe(200);
    expect(withNote.body.receipt.externalCorrection).toBe('Vico: Negative row keyed in Vico');
  });

  it('12: failed and unstaged receipts reverse freely and reset the line; a receipt in Xero and Vico needs both corrections; refusals change nothing', async () => {
    const failed = await receiptFor('T9017', 10000);
    await claimInXero(failed.id, 'failed', `b-${run}-failed`);
    expect((await receipt(failed.id)).xeroState).toBe('queued');
    const free = await receiptFor('T9017', 5000);
    expect(await receipt(free.id)).toMatchObject({ xeroState: 'none', vicoExported: false });
    for (const r of [failed, free]) {
      const res = await send('post', `/api/receipts/${r.id}/reverse`, { reason: 'Duplicate payment' });
      expect(res.status).toBe(200);
      expect(res.body.receipt.externalCorrection).toBeNull();
      expect((await lineStatus(r.lineId)).status).toBe('needs_review');
    }
    const note = await pool.query<{ note: string; resolved_via: string | null }>('SELECT note, resolved_via FROM bank_transactions WHERE id = $1', [failed.lineId]);
    expect(note.rows[0]).toEqual({ note: 'Receipt reversed', resolved_via: null });

    const both = await receiptFor('T9018', 10000);
    await claimInXero(both.id, 'done', `b-${run}-both`);
    await pool.query(
      "INSERT INTO external_refs (system, entity_type, entity_id, external_id, external_key2, last_synced_at) VALUES ('vico', 'receipt', $1, $2, 'x2', now())",
      [both.id, `x2:${both.id}`],
    );
    expect(await receipt(both.id)).toMatchObject({ xeroState: 'sent', vicoExported: true });
    const before = await receipt(both.id);
    const url = `/api/receipts/${both.id}/reverse`;
    expect((await send('post', url, { reason: 'Duplicate payment' })).status).toBe(409);
    expect((await send('post', url, { reason: 'Duplicate payment', xeroCreditRef: 'CN-9' })).status).toBe(409);
    expect((await send('post', url, { reason: 'Duplicate payment', vicoNote: 'Keyed negative' })).status).toBe(409);
    // Malformed bodies are refused before anything happens.
    expect((await send('post', url, { reason: 'ab', xeroCreditRef: 'CN-9', vicoNote: 'Keyed negative' })).status).toBe(400);
    expect((await send('post', url, { reason: 'Duplicate payment', xeroCreditRef: 'C'.repeat(51), vicoNote: 'Keyed negative' })).status).toBe(400);
    expect((await send('post', url, { reason: 'Duplicate payment', xeroCreditRef: 'CN-9', vicoNote: 'V'.repeat(201) })).status).toBe(400);
    expect((await send('post', url, { reason: 'Duplicate payment', xeroCreditRef: 'CN-9', vicoNote: 'ok', extra: 1 })).status).toBe(400);
    expect((await send('post', `/api/receipts/${randomUUID()}/reverse`, { reason: 'Duplicate payment' })).status).toBe(404);
    expect(await receipt(both.id)).toEqual(before);
    expect((await lineStatus(both.lineId)).status).toBe('matched');

    const done = await send('post', url, { reason: 'Duplicate payment', xeroCreditRef: 'CN-9', vicoNote: 'Keyed negative' });
    expect(done.status).toBe(200);
    expect(done.body.receipt).toMatchObject({ status: 'reversed', externalCorrection: 'Xero credit note CN-9; Vico: Keyed negative', allocations: [] });

    // A dead batch is stuck whatever corrections are offered.
    const stuck = await receiptFor('T9019', 10000);
    await claimInXero(stuck.id, 'dead', `b-${run}-stuck`);
    const refused = await send('post', `/api/receipts/${stuck.id}/reverse`, { reason: 'Duplicate payment', xeroCreditRef: 'CN-1', vicoNote: 'n/a' });
    expect(refused.status).toBe(409);
    expect(refused.body.error.message).toContain('Xero page');
    expect((await receipt(stuck.id)).status).toBe('active');
  });

  it('13: a receipt with no bank line reverses; two simultaneous reversals reverse it once', async () => {
    const tid = 'T9020';
    const tenancy = await tenancyId(tid);
    const legacy = await pool.query<{ id: string }>(
      "INSERT INTO receipts (tenancy_id, payer, amount, received_on, matched_via) VALUES ($1, 'tenant', 50.00, current_date, 'manual') RETURNING id",
      [tenancy],
    );
    const res = await send('post', `/api/receipts/${legacy.rows[0]!.id}/reverse`, { reason: 'Keyed in error' });
    expect(res.status).toBe(200);
    expect(res.body.receipt).toMatchObject({ status: 'reversed', bankLine: null });

    const { id } = await receiptFor(tid, 7000);
    const body = { reason: 'Duplicate payment' };
    const results = await Promise.all([send('post', `/api/receipts/${id}/reverse`, body), send('post', `/api/receipts/${id}/reverse`, body)]);
    expect(results.map((r) => r.status).sort()).toEqual([200, 409]);
    expect(await count("audit_log WHERE table_name = 'receipts' AND action = 'UPDATE' AND row_id = $1 AND new_row->>'status' = 'reversed'", [id])).toBe(1);
  });
});

describe('write-offs and refunds', () => {
  const balance = async (tid: string, payer = 'tenant') =>
    ((await get(`/api/adjustments?tid=${tid}`)).body.balances as { payer: string; balancePence: number }[]).find((b) => b.payer === payer)?.balancePence ?? 0;

  it('5: a write-off is capped at the arrears, a refund at the credit, and each can be reversed once', async () => {
    const tid = 'T9002';
    const past = await dayOffset((await pool.query<{ d: string }>('SELECT current_date::text AS d')).rows[0]!.d, -10);
    await manualCharge(tid, 30000, past, 'dwp_uc');
    expect(await balance(tid, 'dwp_uc')).toBe(30000);

    const tooBig = await send('post', '/api/adjustments', { tid, payer: 'dwp_uc', kind: 'write_off', amountPence: 30001, reason: 'Uncollectable' });
    expect(tooBig.status).toBe(400);
    expect(tooBig.body.error.message).toBe('Write-off is more than the arrears (£300.00)');
    const ok = await send('post', '/api/adjustments', { tid, payer: 'dwp_uc', kind: 'write_off', amountPence: 10000, reason: 'Uncollectable' });
    expect(ok.status).toBe(201);
    expect(await balance(tid, 'dwp_uc')).toBe(20000);
    const noCredit = await send('post', '/api/adjustments', { tid, payer: 'dwp_uc', kind: 'refund', amountPence: 100, reason: 'Refund to payer' });
    expect(noCredit.status).toBe(400);
    expect(noCredit.body.error.message).toBe('Refund is more than the credit (£0.00)');

    const writeOff = (ok.body.adjustments as { id: string; kind: string; amountPence: number }[]).find((a) => a.kind === 'write_off')!;
    expect(writeOff.amountPence).toBe(-10000);
    const rev = await send('post', `/api/adjustments/${writeOff.id}/reverse`, { reason: 'Entered in error' });
    expect(rev.status).toBe(200);
    expect(await balance(tid, 'dwp_uc')).toBe(30000);
    expect((await send('post', `/api/adjustments/${writeOff.id}/reverse`, { reason: 'Entered in error' })).status).toBe(409);

    await receiptFor('T9003', 5000, 'other_third_party');
    expect(await balance('T9003', 'other_third_party')).toBe(-5000);
    const refund = await send('post', '/api/adjustments', { tid: 'T9003', payer: 'other_third_party', kind: 'refund', amountPence: 3000, reason: 'Refund to payer' });
    expect(refund.status).toBe(201);
    expect(await balance('T9003', 'other_third_party')).toBe(-2000);
    expect((await send('post', '/api/adjustments', { tid: 'T9003', payer: 'other_third_party', kind: 'refund', amountPence: 2001, reason: 'Refund to payer' })).status).toBe(400);
  });

  const adjustmentsOf = (tid: string) => count('adjustments a JOIN tenancies t ON t.id = a.tenancy_id WHERE t.tid = $1', [tid]);
  const history = async (tid: string) =>
    (await get(`/api/adjustments?tid=${tid}`)).body.adjustments as { id: string; kind: string; amountPence: number; effectiveOn: string; reversesAdjustmentId: string | null }[];

  it('14: write-offs stop exactly at the arrears of that payer, are serialised, and only due charges count', async () => {
    const tid = 'T9021';
    const today = (await pool.query<{ d: string }>('SELECT current_date::text AS d')).rows[0]!.d;
    const body = { tid, payer: 'tenant', kind: 'write_off', amountPence: 1, reason: 'Uncollectable' };
    const refused = await send('post', '/api/adjustments', body);
    expect(refused.status).toBe(400);
    expect(refused.body.error.message).toBe('Write-off is more than the arrears (£0.00)');
    await manualCharge(tid, 10000, await dayOffset(today, 3));            // not due yet: not arrears
    expect((await send('post', '/api/adjustments', body)).status).toBe(400);
    await manualCharge(tid, 20000, await dayOffset(today, -10));
    expect(await balance(tid)).toBe(20000);
    expect((await send('post', '/api/adjustments', { ...body, payer: 'dwp_uc' })).status).toBe(400);   // arrears are per payer

    // Two write-offs of the whole arrears at once: the tenancy lock lets exactly one through.
    const full = { ...body, amountPence: 20000 };
    const results = await Promise.all([send('post', '/api/adjustments', full), send('post', '/api/adjustments', full)]);
    expect(results.map((r) => r.status).sort()).toEqual([201, 400]);
    expect(await balance(tid)).toBe(0);
    expect(await adjustmentsOf(tid)).toBe(1);
    expect((await send('post', '/api/adjustments', body)).status).toBe(400);

    // Reversing it restores the arrears; the reversal itself cannot be reversed.
    const writeOff = (await history(tid)).find((a) => a.kind === 'write_off')!;
    expect((await send('post', `/api/adjustments/${writeOff.id}/reverse`, { reason: 'Entered in error' })).status).toBe(200);
    expect(await balance(tid)).toBe(20000);
    const correction = (await history(tid)).find((a) => a.kind === 'correction')!;
    expect(correction).toMatchObject({ amountPence: 20000, reversesAdjustmentId: writeOff.id });
    expect((await send('post', `/api/adjustments/${correction.id}/reverse`, { reason: 'Entered in error' })).status).toBe(409);
    expect((await send('post', `/api/adjustments/${randomUUID()}/reverse`, { reason: 'Entered in error' })).status).toBe(404);
    expect((await send('post', '/api/adjustments/not-a-uuid/reverse', { reason: 'Entered in error' })).status).toBe(404);
    expect((await send('post', `/api/adjustments/${writeOff.id}/reverse`, { reason: 'ab' })).status).toBe(400);
    expect(await adjustmentsOf(tid)).toBe(2);
  });

  it('15b: a date that does not exist (2026-02-30) is a 400, not a server error', async () => {
    const res = await send('post', '/api/adjustments', { tid: 'T9023', payer: 'tenant', kind: 'write_off', amountPence: 1, reason: 'Uncollectable', effectiveOn: '2026-02-30' });
    expect(res.status).toBe(400);
    for (const d of ['2025-02-29', '2026-1-5', '2026-13-01', '2026-04-31']) {
      const r = await send('post', '/api/adjustments', { tid: 'T9023', payer: 'tenant', kind: 'write_off', amountPence: 1, reason: 'Uncollectable', effectiveOn: d });
      expect(r.status, d).toBe(400);
    }
  });

  it('15: a refund stops exactly at the credit and can be reversed once; malformed adjustments write nothing', async () => {
    const tid = 'T9022';
    await receiptFor(tid, 5000);
    expect(await balance(tid)).toBe(-5000);
    const refund = { tid, payer: 'tenant', kind: 'refund', amountPence: 5000, reason: 'Refund to payer' };
    const bad: [string, object][] = [
      ['zero amount', { ...refund, amountPence: 0 }],
      ['fractional pence', { ...refund, amountPence: 10.5 }],
      ['internal kind', { ...refund, kind: 'refund_paid' }],
      ['short reason', { ...refund, reason: 'ab' }],
      ['extra key', { ...refund, approvedBy: 'x' }],
      ['future date', { ...refund, effectiveOn: '2999-01-01' }],
      ['not a date', { ...refund, effectiveOn: 'tomorrow' }],
      ['unknown payer', { ...refund, payer: 'landlord' }],
    ];
    for (const [label, b] of bad) expect((await send('post', '/api/adjustments', b)).status, label).toBe(400);
    expect((await send('post', '/api/adjustments', { ...refund, tid: 'T9777' })).status).toBe(404);
    expect((await get('/api/adjustments?tid=T9777')).status).toBe(404);
    expect((await get('/api/adjustments')).status).toBe(400);
    expect(await adjustmentsOf(tid)).toBe(0);
    expect((await send('post', '/api/adjustments', { ...refund, amountPence: 5001 })).status).toBe(400);

    const yesterday = await dayOffset((await pool.query<{ d: string }>('SELECT current_date::text AS d')).rows[0]!.d, -1);
    expect((await send('post', '/api/adjustments', { ...refund, effectiveOn: yesterday })).status).toBe(201);
    expect((await history(tid))[0]).toMatchObject({ kind: 'refund_paid', amountPence: 5000, effectiveOn: yesterday });
    expect(await balance(tid)).toBe(0);
    expect((await send('post', '/api/adjustments', { ...refund, amountPence: 1 })).status).toBe(400);

    const row = (await history(tid)).find((a) => a.kind === 'refund_paid')!;
    expect((await send('post', `/api/adjustments/${row.id}/reverse`, { reason: 'Refund bounced' })).status).toBe(200);
    expect(await balance(tid)).toBe(-5000);
    expect((await send('post', `/api/adjustments/${row.id}/reverse`, { reason: 'Refund bounced' })).status).toBe(409);
    expect(await adjustmentsOf(tid)).toBe(2);
    expect(await count("audit_log WHERE table_name = 'adjustments' AND action = 'INSERT' AND changed_by = $1 AND new_row->>'tenancy_id' = $2", [emails.accounts, await tenancyId(tid)])).toBe(2);
  });
});

describe('permissions and audit', () => {
  it('6: staff and read-only users cannot write, a write needs the CSRF header, and every change is audited to the accounts user', async () => {
    const { id, lineId } = await receiptFor('T9006', 7000);
    const writes: [string, string, object | undefined][] = [
      ['post', '/api/receipts/split', { bankTransactionId: lineId, parts: [{ tid: 'T9001', payer: 'tenant', amountPence: 1 }, { tid: 'T9002', payer: 'tenant', amountPence: 2 }] }],
      ['put', `/api/receipts/${id}/allocations`, { allocations: [] }],
      ['delete', `/api/receipts/${id}/allocations`, undefined],
      ['post', `/api/receipts/${id}/reverse`, { reason: 'Not allowed' }],
      ['post', '/api/adjustments', { tid: 'T9006', payer: 'tenant', kind: 'write_off', amountPence: 1, reason: 'Not allowed' }],
    ];
    for (const role of ['staff', 'readonly'] as const) {
      for (const [m, p, b] of writes) expect((await send(m as 'post', p, b, role)).status, `${role} ${m} ${p}`).toBe(403);
    }
    for (const [m, p, b] of writes) expect((await send(m as 'post', p, b, 'accounts', false)).status, `no csrf ${m} ${p}`).toBe(403);
    expect((await get('/api/receipts', 'readonly')).status).toBe(200);
    expect((await get(`/api/receipts/${id}`, 'staff')).status).toBe(200);
    expect((await get('/api/receipts/not-a-uuid')).status).toBe(404);

    const today = (await pool.query<{ d: string }>('SELECT current_date::text AS d')).rows[0]!.d;
    const charge = await manualCharge('T9006', 7000, today);
    expect((await send('put', `/api/receipts/${id}/allocations`, { allocations: [{ rentChargeId: charge, amountPence: 7000 }] })).status).toBe(200);
    expect((await send('post', `/api/receipts/${id}/reverse`, { reason: 'Audited reversal' })).status).toBe(200);
    expect((await send('post', '/api/adjustments', { tid: 'T9006', payer: 'tenant', kind: 'write_off', amountPence: 100, reason: 'Audited write-off' })).status).toBe(201);

    const audited = async (table: string, action: string) =>
      count('audit_log WHERE table_name = $1 AND action = $2 AND changed_by = $3', [table, action, emails.accounts]);
    expect(await audited('receipts', 'UPDATE')).toBeGreaterThanOrEqual(1);
    expect(await audited('allocations', 'INSERT')).toBeGreaterThanOrEqual(1);
    expect(await audited('allocations', 'DELETE')).toBeGreaterThanOrEqual(1);
    expect(await audited('adjustments', 'INSERT')).toBeGreaterThanOrEqual(1);
  });
});
