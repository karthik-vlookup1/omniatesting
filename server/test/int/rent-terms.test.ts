/**
 * Rent terms end to end: rent, benefit awards, payer splits, generated charges and the rent
 * account, against a real database. Dates are relative to today; D = today - 27 gives exactly four
 * weekly periods (D, D+7, D+14, D+21) due on or before today.
 */
import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createApp } from '../../src/api/app.js';
import { CSRF_HEADER, CSRF_HEADER_VALUE, SESSION_COOKIE } from '../../src/api/auth/middleware.js';
import { loadConfig } from '../../src/config/env.js';
import { createPool, type Pool } from '../../src/db/pool.js';
import { runChargeGeneration } from '../../src/jobs/generate-charges.js';
import { syncTenancies } from '../../src/jobs/veco-sync/sync.js';
import { createLogger } from '../../src/lib/logger.js';
import { upsertUser, type Role } from '../../src/services/auth.service.js';
import { vecoRows } from '../fixtures/veco-rows.js';

const PASSWORD = 'correct-horse-battery';
const config = loadConfig();
const keys = { hashKey: config.hashKey, encryptionKey: config.encryptionKey };
const logger = createLogger({ level: 'silent' });
const run = randomUUID().slice(0, 8);
let pool: Pool;
const cookies = {} as Record<Role, string>;
const emails = {} as Record<Role, string>;
let today = '';
let D = '';

const app = () => createApp({ config, pool, logger });

async function signIn(role: Role): Promise<string> {
  const email = `${role}-rent-${run}@example.test`;
  emails[role] = email;
  await upsertUser(pool, { email, fullName: `Rent ${role}`, role, password: PASSWORD });
  const res = await request(app()).post('/api/auth/login').set(CSRF_HEADER, CSRF_HEADER_VALUE).send({ email, password: PASSWORD });
  const raw = res.headers['set-cookie'] as unknown as string[];
  return raw.find((c) => c.startsWith(`${SESSION_COOKIE}=`))!.split(';')[0]!;
}

const get = (path: string, role: Role = 'staff') => request(app()).get(path).set('Cookie', cookies[role]);
const post = (path: string, body: object, role: Role = 'staff') =>
  request(app()).post(path).set('Cookie', cookies[role]).set(CSRF_HEADER, CSRF_HEADER_VALUE).send(body);

const dayOffset = async (base: string, n: number): Promise<string> =>
  (await pool.query<{ d: string }>('SELECT ($1::date + $2::int)::text AS d', [base, n])).rows[0]!.d;

const setRent = (tid: string, amountPence: number, frequency: string, effectiveFrom: string, role: Role = 'staff') =>
  post(`/api/rent/${tid}/schedules`, { amountPence, frequency, effectiveFrom }, role);
const addAward = (tid: string, awardPence: number, awardFrequency: string, paidTo: string, effectiveFrom: string, benefit = 'HB') =>
  post(`/api/rent/${tid}/benefit-awards`, { benefit, payingBody: 'Test Council', claimReference: 'CL-1', awardPence, awardFrequency, paidTo, effectiveFrom });

const account = async (tid: string) => (await get(`/api/rent/${tid}`)).body.account;
const balanceOf = (acc: { payers: { payer: string; balancePence: number }[] }, payer: string) =>
  acc.payers.find((p) => p.payer === payer)?.balancePence;

let next = 0;
/** A TID not used by an earlier test (T9001..T9030 are seeded). */
const freshTid = () => `T9${String(++next).padStart(3, '0')}`;

beforeAll(async () => {
  pool = createPool({ databaseUrl: config.databaseUrl, hashKey: config.hashKey, max: 4 }, logger);
  await pool.query('TRUNCATE rent_schedules, tenancy_tenants, tenancies, tenants, property_units, properties, branches CASCADE');
  for (const role of ['admin', 'staff', 'readonly'] as const) cookies[role] = await signIn(role);
  await syncTenancies(pool, vecoRows(30), { keys, force: true });
  today = (await pool.query<{ d: string }>('SELECT current_date::text AS d')).rows[0]!.d;
  D = await dayOffset(today, -27);
});

afterAll(async () => {
  await pool?.end();
});

describe('charges per period per payer', () => {
  it('1: weekly rent for four periods is all the tenant and builds a running balance', async () => {
    const tid = freshTid();
    const res = await setRent(tid, 10000, 'weekly', D);
    expect(res.status).toBe(201);
    const acc = res.body.account;
    expect(acc.periods).toHaveLength(4);
    for (const p of acc.periods) expect(p.byPayer).toEqual({ tenant: 10000 });
    expect(balanceOf(acc, 'tenant')).toBe(40000);
    expect(acc.tenancy.chargesFrom).toBe(D);
  });

  it('2: a landlord-direct HB award becomes a fixed payer split', async () => {
    const tid = freshTid();
    await setRent(tid, 10000, 'weekly', D);
    const res = await addAward(tid, 6000, 'weekly', 'landlord_direct', D);
    expect(res.status).toBe(201);
    const acc = res.body.account;
    expect(acc.splits).toHaveLength(1);
    expect(acc.splits[0]).toMatchObject({ payer: 'council_hb', fixedPence: 6000, benefitAwardId: acc.awards[0].id });
    for (const p of acc.periods) expect(p.byPayer).toEqual({ tenant: 4000, council_hb: 6000 });
    expect(balanceOf(acc, 'tenant')).toBe(16000);
    expect(balanceOf(acc, 'council_hb')).toBe(24000);
  });

  it('3: a manual receipt reduces the tenant balance and matches v_tenancy_balance', async () => {
    const tid = freshTid();
    await setRent(tid, 10000, 'weekly', D);
    await addAward(tid, 6000, 'weekly', 'landlord_direct', D);
    const t = (await pool.query<{ id: string }>('SELECT id FROM tenancies WHERE tid = $1', [tid])).rows[0]!;
    await pool.query(
      `INSERT INTO receipts (tenancy_id, payer, amount, received_on, matched_via) VALUES ($1, 'tenant', 40.00, $2, 'manual')`,
      [t.id, today],
    );
    await pool.query('SELECT reallocate_tenancy($1)', [t.id]);
    const acc = await account(tid);
    expect(balanceOf(acc, 'tenant')).toBe(12000);
    const tenant = acc.payers.find((p: { payer: string }) => p.payer === 'tenant');
    expect(tenant.receivedPence).toBe(4000);
    expect(tenant.lines.at(-1).balancePence).toBe(12000);
    const view = await pool.query<{ balance: string }>(`SELECT (balance*100)::int AS balance FROM v_tenancy_balance WHERE tenancy_id = $1 AND payer = 'tenant'`, [t.id]);
    expect(Number(view.rows[0]!.balance)).toBe(12000);
  });

  it('4: a weekly award on a monthly rent is restated per month (216.67)', async () => {
    const tid = freshTid();
    await setRent(tid, 100000, 'monthly', D);
    const res = await addAward(tid, 5000, 'weekly', 'landlord_direct', D);
    expect(res.body.account.splits[0].fixedPence).toBe(21667);
    expect(res.body.account.periods[0].byPayer).toEqual({ tenant: 100000 - 21667, council_hb: 21667 });
  });

  it('5: an ended tenancy pro-rates the last period and the shares still sum to the rent', async () => {
    const tid = freshTid();
    await setRent(tid, 10000, 'weekly', D);
    await addAward(tid, 6000, 'weekly', 'landlord_direct', D);
    const lastStart = await dayOffset(D, 21);
    await pool.query('UPDATE tenancies SET end_date = $2::date + 2 WHERE tid = $1', [tid, lastStart]);
    await pool.query('SELECT refresh_rent_charges(id) FROM tenancies WHERE tid = $1', [tid]);
    const acc = await account(tid);
    expect(acc.periods[0].periodStart).toBe(lastStart);
    expect(acc.periods[0].byPayer).toEqual({ tenant: 1714, council_hb: 2572 });
    expect(acc.periods[0].totalPence).toBe(4286);
  });

  it('6: a cycle change restates the award split and regenerates only charges from that date', async () => {
    const tid = freshTid();
    await setRent(tid, 10000, 'weekly', D);
    await addAward(tid, 6000, 'weekly', 'landlord_direct', D);
    const before = (
      await pool.query<{ id: string }>(
        `SELECT rc.id FROM rent_charges rc JOIN tenancies t ON t.id = rc.tenancy_id
          WHERE t.tid = $1 AND rc.period_end < $2::date - 1 ORDER BY rc.id`,
        [tid, today],
      )
    ).rows;
    expect(before.length).toBeGreaterThan(0);

    const res = await setRent(tid, 20000, 'fortnightly', today);
    expect(res.status).toBe(201);
    const acc = res.body.account;
    const hb = acc.splits.filter((s: { payer: string }) => s.payer === 'council_hb');
    expect(hb).toHaveLength(2);
    expect(hb.map((s: { fixedPence: number }) => s.fixedPence).sort((a: number, b: number) => a - b)).toEqual([6000, 12000]);
    const newest = acc.periods[0];
    expect(newest.periodStart).toBe(today);
    expect(newest.byPayer).toEqual({ tenant: 8000, council_hb: 12000 });

    const after = (
      await pool.query<{ id: string }>(
        `SELECT rc.id FROM rent_charges rc JOIN tenancies t ON t.id = rc.tenancy_id
          WHERE t.tid = $1 AND rc.period_end < $2::date - 1 ORDER BY rc.id`,
        [tid, today],
      )
    ).rows;
    expect(after).toEqual(before);
  });

  it('7: refreshing twice creates nothing the second time', async () => {
    const tid = freshTid();
    await setRent(tid, 10000, 'weekly', D);
    const first = await pool.query<{ n: number }>('SELECT refresh_rent_charges(id) AS n FROM tenancies WHERE tid = $1', [tid]);
    const second = await pool.query<{ n: number }>('SELECT refresh_rent_charges(id) AS n FROM tenancies WHERE tid = $1', [tid]);
    expect(first.rows[0]!.n).toBe(0);
    expect(second.rows[0]!.n).toBe(0);
    expect((await account(tid)).periods).toHaveLength(4);
  });

  it('8: the nightly job only touches tenancies with a rent account', async () => {
    const optedIn = Number((await pool.query<{ n: string }>('SELECT count(*) AS n FROM tenancies WHERE charges_from IS NOT NULL')).rows[0]!.n);
    const summary = await runChargeGeneration(pool);
    expect(summary).toEqual({ tenancies: optedIn, created: 0, failed: 0 });
    const none = await pool.query(
      `SELECT 1 FROM rent_charges rc JOIN tenancies t ON t.id = rc.tenancy_id WHERE t.charges_from IS NULL`,
    );
    expect(none.rowCount).toBe(0);

    // A Veco-style rent change on an opted-in tenancy is picked up by the job.
    const tid = freshTid();
    await setRent(tid, 10000, 'weekly', D);
    await pool.query(
      'UPDATE rent_schedules SET amount = 120.00 WHERE tenancy_id = (SELECT id FROM tenancies WHERE tid = $1) AND effective_to IS NULL',
      [tid],
    );
    const again = await runChargeGeneration(pool);
    expect(again.failed).toBe(0);
    expect((await account(tid)).periods[0].totalPence).toBe(12000);
  });
});

describe('API rules', () => {
  it('9: read-only users can read but not write; bad input is rejected', async () => {
    const tid = freshTid();
    expect((await setRent(tid, 10000, 'weekly', D, 'readonly')).status).toBe(403);
    expect((await get(`/api/rent/${tid}`, 'readonly')).status).toBe(200);
    expect((await get('/api/rent/T0000', 'staff')).status).toBe(404);
    expect((await setRent(tid, 10000, 'weekly', '2025-03-01')).status).toBe(400);
    expect((await setRent(tid, 10000, 'weekly', 'not-a-date')).status).toBe(400);
    expect((await get(`/api/rent/${tid}`)).body.account.tenancy.chargesFrom).toBeNull();

    await pool.query('DELETE FROM rent_schedules WHERE tenancy_id = (SELECT id FROM tenancies WHERE tid = $1)', [tid]);
    const res = await addAward(tid, 6000, 'weekly', 'landlord_direct', D);
    expect(res.status).toBe(400);
    expect(res.body.error.message).toBe('Set the rent first');
    expect((await post('/api/rent/generate', {}, 'staff')).status).toBe(403);
    expect((await post('/api/rent/generate', {}, 'admin')).status).toBe(200);
  });

  it('10: overlapping manual splits for the same payer conflict', async () => {
    const tid = freshTid();
    await setRent(tid, 10000, 'weekly', D);
    const body = { payer: 'other_third_party', sharePercent: 25, effectiveFrom: D };
    expect((await post(`/api/rent/${tid}/payer-splits`, body)).status).toBe(201);
    const dup = await post(`/api/rent/${tid}/payer-splits`, body);
    expect(dup.status).toBe(409);
    expect(dup.body.error.message).toBe('Overlaps an existing payer split');
    const both = await post(`/api/rent/${tid}/payer-splits`, { payer: 'dwp_uc', sharePercent: 10, fixedAmountPence: 100, effectiveFrom: D });
    expect(both.status).toBe(400);
  });

  it('11: writes are audited as the signed-in staff member', async () => {
    const tid = freshTid();
    await setRent(tid, 10000, 'weekly', D);
    await addAward(tid, 6000, 'weekly', 'landlord_direct', D);
    const res = await post(`/api/rent/${tid}/payment-methods`, { payer: 'tenant', method: 'standing_order', expectedPence: 4000, expectedFrequency: 'weekly', effectiveFrom: D });
    expect(res.status).toBe(201);
    const rows = await pool.query<{ table_name: string; changed_by: string }>(
      `SELECT DISTINCT table_name, changed_by FROM audit_log
        WHERE table_name IN ('rent_schedules', 'benefit_awards', 'payer_splits', 'payment_methods') AND changed_by = $1`,
      [emails.staff],
    );
    expect(rows.rows.map((r) => r.table_name).sort()).toEqual(['benefit_awards', 'payer_splits', 'payment_methods', 'rent_schedules']);

    const award = res.body.account.paymentMethods[0];
    const ended = await post(`/api/rent/payment-methods/${award.id}/end`, { effectiveTo: today });
    expect(ended.status).toBe(201);
    const acc = await account(tid);
    const aw = acc.awards[0];
    expect((await post(`/api/rent/benefit-awards/${aw.id}/end`, { effectiveTo: today })).status).toBe(201);
    expect((await post(`/api/rent/benefit-awards/${aw.id}/end`, { effectiveTo: today })).status).toBe(400);
  });
});

describe('edge cases and money invariants', () => {
  const sumOf = (p: { byPayer: Record<string, number> }) => Object.values(p.byPayer).reduce((a, b) => a + b, 0);

  it('12: a backdated award applies from its start date, pro-rated by days within the period', async () => {
    const tid = freshTid();
    await setRent(tid, 10000, 'weekly', D);
    const res = await addAward(tid, 6000, 'weekly', 'landlord_direct', await dayOffset(D, 3));
    const periods = res.body.account.periods; // newest first
    expect(periods).toHaveLength(5); // the first week is cut at the award start: 3 days + 4 days
    const byStart = (d: string) => periods.find((p: { periodStart: string }) => p.periodStart === d);
    expect(byStart(D).byPayer).toEqual({ tenant: 4286 });
    expect(byStart(await dayOffset(D, 3)).byPayer).toEqual({ tenant: 2286, council_hb: 3428 });
    for (const p of periods.filter((x: { dueDate: string }) => x.dueDate !== D)) expect(p.byPayer).toEqual({ tenant: 4000, council_hb: 6000 });
  });

  it('13: an award at or above the rent leaves no tenant row, and is capped at the rent', async () => {
    const tid = freshTid();
    await setRent(tid, 10000, 'weekly', D);
    const res = await addAward(tid, 15000, 'weekly', 'landlord_direct', D);
    for (const p of res.body.account.periods) expect(p.byPayer).toEqual({ council_hb: 10000 });
    expect(balanceOf(res.body.account, 'tenant')).toBeUndefined();
    expect(balanceOf(res.body.account, 'council_hb')).toBe(40000);
  });

  it('14: zero rent is accepted and creates no charges', async () => {
    const tid = freshTid();
    const res = await setRent(tid, 0, 'weekly', D);
    expect(res.status).toBe(201);
    expect(res.body.account.periods).toHaveLength(0);
    expect(res.body.account.payers).toHaveLength(0);
  });

  it('15: percent shares round to the penny, never exceed the rent, and the payers sum to the rent', async () => {
    const tid = freshTid();
    await setRent(tid, 10001, 'weekly', D);
    expect((await post(`/api/rent/${tid}/payer-splits`, { payer: 'other_third_party', sharePercent: 33.33, effectiveFrom: D })).status).toBe(201);
    let acc = await account(tid);
    for (const p of acc.periods) {
      expect(p.byPayer.other_third_party).toBe(3333);
      expect(p.byPayer.tenant).toBe(6668);
      expect(sumOf(p)).toBe(10001);
    }
    // Shares adding to more than 100%: the later one is capped at what is left.
    const res = await post(`/api/rent/${tid}/payer-splits`, { payer: 'dwp_uc', sharePercent: 90, effectiveFrom: D });
    expect(res.status).toBe(201);
    acc = res.body.account;
    for (const p of acc.periods) {
      expect(sumOf(p)).toBe(10001);
      expect(Object.values(p.byPayer).every((v) => Number.isInteger(v) && (v as number) > 0)).toBe(true);
    }
  });

  it('16: charges_from is opt-in: nothing is charged for periods starting before it', async () => {
    const tid = freshTid();
    const from = await dayOffset(today, -13);
    const none = await pool.query('SELECT 1 FROM rent_charges rc JOIN tenancies t ON t.id = rc.tenancy_id WHERE t.tid = $1', [tid]);
    expect(none.rowCount).toBe(0);
    await pool.query('UPDATE tenancies SET charges_from = $2 WHERE tid = $1', [tid, from]);
    await pool.query('SELECT refresh_rent_charges(id) FROM tenancies WHERE tid = $1', [tid]);
    const r = await pool.query<{ n: string; first_start: string }>(
      `SELECT count(*) AS n, min(rc.period_start)::text AS first_start FROM rent_charges rc JOIN tenancies t ON t.id = rc.tenancy_id WHERE t.tid = $1`,
      [tid],
    );
    expect(Number(r.rows[0]!.n)).toBeGreaterThan(0);
    expect(r.rows[0]!.first_start >= from).toBe(true);
  });

  it('17: running the nightly job twice after a rent change creates charges once, then nothing', async () => {
    const tid = freshTid();
    await setRent(tid, 10000, 'weekly', D);
    await pool.query('UPDATE rent_schedules SET amount = 120.00 WHERE tenancy_id = (SELECT id FROM tenancies WHERE tid = $1) AND effective_to IS NULL', [tid]);
    const ids = async () =>
      (await pool.query<{ id: string }>('SELECT rc.id FROM rent_charges rc JOIN tenancies t ON t.id = rc.tenancy_id WHERE t.tid = $1 ORDER BY rc.id', [tid])).rows;
    const first = await runChargeGeneration(pool);
    expect(first.failed).toBe(0);
    expect(first.created).toBe(4);
    const afterFirst = await ids();
    const second = await runChargeGeneration(pool);
    expect(second).toMatchObject({ created: 0, failed: 0 });
    expect(await ids()).toEqual(afterFirst);
    expect(afterFirst).toHaveLength(4);
  });

  it('18: a later rent change leaves older charges and their allocations untouched', async () => {
    const tid = freshTid();
    await setRent(tid, 10000, 'weekly', D);
    const t = (await pool.query<{ id: string }>('SELECT id FROM tenancies WHERE tid = $1', [tid])).rows[0]!;
    await pool.query(`INSERT INTO receipts (tenancy_id, payer, amount, received_on, matched_via) VALUES ($1, 'tenant', 150.00, $2, 'manual')`, [t.id, today]);
    await pool.query('SELECT reallocate_tenancy($1)', [t.id]);
    const snapshot = async () =>
      (
        await pool.query<{ cid: string; aid: string; amt: number }>(
          `SELECT rc.id AS cid, a.id AS aid, (a.amount*100)::int AS amt FROM rent_charges rc JOIN allocations a ON a.rent_charge_id = rc.id
            WHERE rc.tenancy_id = $1 AND rc.period_start = $2`,
          [t.id, D],
        )
      ).rows;
    const first = await snapshot();
    expect(first).toHaveLength(1);
    expect(first[0]!.amt).toBe(10000);

    const res = await setRent(tid, 12000, 'weekly', await dayOffset(D, 14));
    expect(res.status).toBe(201);
    expect(await snapshot()).toEqual(first);
    const acc = res.body.account;
    expect(acc.periods[0].byPayer).toEqual({ tenant: 12000 });
    expect(acc.periods[3].byPayer).toEqual({ tenant: 10000 });
    expect(balanceOf(acc, 'tenant')).toBe(10000 + 10000 + 12000 + 12000 - 15000);
  });

  it('6b: the part period straddling a cycle change is regenerated pro-rata and still sums to the rent', async () => {
    const tid = freshTid();
    await setRent(tid, 10000, 'weekly', D);
    await addAward(tid, 6000, 'weekly', 'landlord_direct', D);
    const res = await setRent(tid, 20000, 'fortnightly', today);
    const start = await dayOffset(D, 21);
    const straddle = res.body.account.periods.find((p: { periodStart: string }) => p.periodStart === start);
    expect(straddle.periodEnd).toBe(await dayOffset(today, -1));
    // 6 of 7 days: 100.00 * 6/7 = 85.71; HB 60.00 * 85.71 / 100.00 = 51.43; tenant 34.28.
    expect(straddle.byPayer).toEqual({ tenant: 3428, council_hb: 5143 });
    expect(sumOf(straddle)).toBe(8571);
  });

  it('19: an award paid to the tenant is a record only', async () => {
    const tid = freshTid();
    await setRent(tid, 10000, 'weekly', D);
    const res = await addAward(tid, 6000, 'weekly', 'tenant', D);
    expect(res.status).toBe(201);
    expect(res.body.account.awards).toHaveLength(1);
    expect(res.body.account.splits).toHaveLength(0);
    for (const p of res.body.account.periods) expect(p.byPayer).toEqual({ tenant: 10000 });
  });

  it('20: ending an award drops later restated splits, closes the rest and rejects bad ends', async () => {
    const tid = freshTid();
    await setRent(tid, 10000, 'weekly', D);
    await addAward(tid, 6000, 'weekly', 'landlord_direct', D);
    await setRent(tid, 20000, 'fortnightly', today);
    let acc = await account(tid);
    const award = acc.awards[0];
    const split = acc.splits.find((s: { benefitAwardId: string }) => s.benefitAwardId === award.id);
    expect((await post(`/api/rent/payer-splits/${split.id}/end`, { effectiveTo: today })).status).toBe(400);
    expect((await post(`/api/rent/benefit-awards/${award.id}/end`, { effectiveTo: await dayOffset(D, -1) })).status).toBe(400);

    const end = await dayOffset(D, 10);
    const res = await post(`/api/rent/benefit-awards/${award.id}/end`, { effectiveTo: end });
    expect(res.status).toBe(201);
    acc = res.body.account;
    expect(acc.splits).toHaveLength(1);
    expect(acc.splits[0].effectiveTo).toBe(end);
    const d7 = await dayOffset(D, 7);
    const d14 = await dayOffset(D, 14);
    const byStart = (d: string) => acc.periods.find((p: { periodStart: string }) => p.periodStart === d);
    expect(byStart(d7).byPayer).toEqual({ tenant: 2286, council_hb: 3428 }); // award ends D+10: 4 of 7 days
    expect(byStart(await dayOffset(D, 11)).byPayer).toEqual({ tenant: 4286 });
    expect(byStart(d14).byPayer).toEqual({ tenant: 10000 });
  });

  it('21: write guards: CSRF header, session, case-sensitive TID, strict bodies, no earlier-than-open rent', async () => {
    const tid = freshTid();
    const noCsrf = await request(app())
      .post(`/api/rent/${tid}/schedules`)
      .set('Cookie', cookies.staff)
      .send({ amountPence: 10000, frequency: 'weekly', effectiveFrom: D });
    expect(noCsrf.status).toBe(403);
    expect((await request(app()).get(`/api/rent/${tid}`)).status).toBe(401);
    expect((await get(`/api/rent/${tid.toLowerCase()}`)).status).toBe(404);
    expect((await post(`/api/rent/${tid}/schedules`, { amountPence: 10000, frequency: 'weekly', effectiveFrom: D, extra: 1 })).status).toBe(400);
    expect((await post(`/api/rent/${tid}/schedules`, { amountPence: 100.5, frequency: 'weekly', effectiveFrom: D })).status).toBe(400);
    expect((await post(`/api/rent/${tid}/schedules`, { amountPence: -1, frequency: 'weekly', effectiveFrom: D })).status).toBe(400);
    expect((await get(`/api/rent/${tid}`)).body.account.tenancy.chargesFrom).toBeNull();
    expect((await setRent(tid, 10000, 'weekly', D)).status).toBe(201);
    expect((await setRent(tid, 9000, 'weekly', await dayOffset(D, -7))).status).toBe(400);
  });
});
