/** WP1 charge generator v2: anchored periods, straddle skip, pro-rated pieces, rent day kept, re-anchoring. */
import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { loadConfig } from '../../src/config/env.js';
import { createPool, type Pool } from '../../src/db/pool.js';
import { createLogger } from '../../src/lib/logger.js';

const config = loadConfig();
const run = randomUUID().slice(0, 8);
let pool: Pool;
let propertyId = '';
let branchId = '';
const tenancyIds: string[] = [];
let seq = 0;

type Charge = { payer: string; period_start: string; period_end: string; due_date: string; amount: string };

async function tenancy(): Promise<string> {
  const r = await pool.query<{ id: string }>(
    "INSERT INTO tenancies (tid, property_id, management_type, start_date) VALUES ($1, $2, 'RG', '2025-01-01') RETURNING id",
    [`TW1${run}${++seq}`, propertyId],
  );
  tenancyIds.push(r.rows[0]!.id);
  return r.rows[0]!.id;
}
const schedule = (id: string, amount: string, freq: string, from: string, to: string | null = null) =>
  pool.query('INSERT INTO rent_schedules (tenancy_id, amount, frequency, effective_from, effective_to) VALUES ($1,$2,$3,$4,$5)', [id, amount, freq, from, to]);
const generate = async (id: string, until: string, from = '-infinity'): Promise<number> =>
  (await pool.query<{ n: number }>('SELECT generate_rent_charges($1, $2::date, $3::date) AS n', [id, until, from])).rows[0]!.n;
const charges = async (id: string): Promise<Charge[]> =>
  (
    await pool.query<Charge>(
      `SELECT payer, period_start::text, period_end::text, due_date::text, amount::text
         FROM rent_charges WHERE tenancy_id = $1 ORDER BY period_start, payer`,
      [id],
    )
  ).rows;

beforeAll(async () => {
  pool = createPool({ databaseUrl: config.databaseUrl, hashKey: config.hashKey, max: 2 }, createLogger({ level: 'silent' }));
  const b = await pool.query<{ id: string }>("INSERT INTO branches (code, name) VALUES ($1, 'WP1 test') RETURNING id", [`W1-${run}`]);
  branchId = b.rows[0]!.id;
  const p = await pool.query<{ id: string }>(
    "INSERT INTO properties (property_ref, branch_id, address_line1, postcode) VALUES ($1, $2, '1 Test St', 'AB1 2CD') RETURNING id",
    [`W1-${run}`, branchId],
  );
  propertyId = p.rows[0]!.id;
});

afterAll(async () => {
  if (pool) {
    if (tenancyIds.length) {
      await pool.query('DELETE FROM rent_charges WHERE tenancy_id = ANY($1)', [tenancyIds]);
      await pool.query('DELETE FROM tenancies WHERE id = ANY($1)', [tenancyIds]);
    }
    await pool.query('DELETE FROM properties WHERE id = $1', [propertyId]);
    await pool.query('DELETE FROM branches WHERE id = $1', [branchId]);
    await pool.end();
  }
});

describe('charge generator v2', () => {
  it('straddle: the period running across the cutover is the old system; the next one is charged in full', async () => {
    const id = await tenancy();
    await schedule(id, '600.00', 'monthly', '2025-09-15');
    await generate(id, '2025-10-31', '2025-10-01');
    const rows = await charges(id);
    expect(rows.map((r) => [r.period_start, r.amount])).toEqual([['2025-10-15', '600.00']]);
    expect(rows[0]!.due_date).toBe('2025-10-15');
  });

  it('rent change mid-period keeps the rent day: 270.97 + 356.45 both due 1 Mar, then 650.00 on 1 Apr', async () => {
    const id = await tenancy();
    await schedule(id, '600.00', 'monthly', '2026-01-01', '2026-03-14');
    await schedule(id, '650.00', 'monthly', '2026-03-15');
    const anchors = await pool.query<{ a: string }>("SELECT DISTINCT anchor_date::text AS a FROM rent_schedules WHERE tenancy_id = $1", [id]);
    expect(anchors.rows.map((r) => r.a)).toEqual(['2026-01-01']);
    await generate(id, '2026-04-01');
    const rows = await charges(id);
    const mar = rows.filter((r) => r.due_date === '2026-03-01');
    expect(mar.map((r) => [r.period_start, r.period_end, r.amount])).toEqual([
      ['2026-03-01', '2026-03-14', '270.97'],
      ['2026-03-15', '2026-03-31', '356.45'],
    ]);
    expect(rows.filter((r) => r.due_date === '2026-04-01').map((r) => r.amount)).toEqual(['650.00']);
    expect(rows.filter((r) => r.due_date === '2026-01-01').map((r) => r.amount)).toEqual(['600.00']);
  });

  it('a housing benefit split from 15 Mar on 600.00: council 219.35, tenant 380.65, pieces sum to the rent', async () => {
    const id = await tenancy();
    await schedule(id, '600.00', 'monthly', '2026-01-01');
    await pool.query("INSERT INTO payer_splits (tenancy_id, payer, fixed_amount, effective_from) VALUES ($1, 'council_hb', 400, '2026-03-15')", [id]);
    await generate(id, '2026-03-31');
    const mar = (await charges(id)).filter((r) => r.due_date === '2026-03-01');
    const sum = (payer: string) => mar.filter((r) => r.payer === payer).reduce((a, r) => a + Math.round(Number(r.amount) * 100), 0);
    expect(sum('council_hb')).toBe(21935);
    expect(sum('tenant')).toBe(38065);
    expect(sum('council_hb') + sum('tenant')).toBe(60000);
  });

  it('a frequency change re-anchors; running twice creates nothing', async () => {
    const id = await tenancy();
    await schedule(id, '100.00', 'weekly', '2026-01-05', '2026-02-01');
    await schedule(id, '430.00', 'monthly', '2026-02-02');
    const a = await pool.query<{ f: string; a: string }>('SELECT frequency AS f, anchor_date::text AS a FROM rent_schedules WHERE tenancy_id = $1 ORDER BY effective_from', [id]);
    expect(a.rows).toEqual([
      { f: 'weekly', a: '2026-01-05' },
      { f: 'monthly', a: '2026-02-02' },
    ]);
    expect(await generate(id, '2026-03-02')).toBe(6); // 4 weekly + 2 monthly
    expect((await charges(id)).filter((r) => r.period_start >= '2026-02-02').map((r) => [r.period_start, r.amount])).toEqual([
      ['2026-02-02', '430.00'],
      ['2026-03-02', '430.00'],
    ]);
    expect(await generate(id, '2026-03-02')).toBe(0);
    expect(await generate(id, '2026-03-02')).toBe(0);
  });
});

describe('charge generator v2 edge cases', () => {
  const cents = (rows: Charge[]) => rows.reduce((a, r) => a + Math.round(Number(r.amount) * 100), 0);

  it('zero rent creates no charges and does not fail', async () => {
    const id = await tenancy();
    await schedule(id, '0.00', 'monthly', '2026-01-01');
    await pool.query("INSERT INTO payer_splits (tenancy_id, payer, fixed_amount, effective_from) VALUES ($1, 'council_hb', 100, '2026-01-01')", [id]);
    expect(await generate(id, '2026-03-31')).toBe(0);
    expect(await charges(id)).toEqual([]);
  });

  it('an ended tenancy is pro-rated to its end date (14 of 28 days = 300.00) and charged nothing after', async () => {
    const id = await tenancy();
    await schedule(id, '600.00', 'monthly', '2026-01-01');
    await pool.query("UPDATE tenancies SET end_date = '2026-02-14' WHERE id = $1", [id]);
    await generate(id, '2026-06-30');
    expect((await charges(id)).map((r) => [r.period_start, r.period_end, r.amount])).toEqual([
      ['2026-01-01', '2026-01-31', '600.00'],
      ['2026-02-01', '2026-02-14', '300.00'],
    ]);
  });

  it('weekly: 4 charges of 100.00 on a 7-day rhythm; four-weekly: 3 charges on a 28-day rhythm', async () => {
    const w = await tenancy();
    await schedule(w, '100.00', 'weekly', '2026-01-05');
    expect(await generate(w, '2026-01-26')).toBe(4);
    expect((await charges(w)).map((r) => [r.period_start, r.period_end, r.amount])).toEqual([
      ['2026-01-05', '2026-01-11', '100.00'],
      ['2026-01-12', '2026-01-18', '100.00'],
      ['2026-01-19', '2026-01-25', '100.00'],
      ['2026-01-26', '2026-02-01', '100.00'],
    ]);
    const f = await tenancy();
    await schedule(f, '280.00', 'four_weekly', '2026-01-05');
    expect(await generate(f, '2026-03-02')).toBe(3);
    expect((await charges(f)).map((r) => r.period_start)).toEqual(['2026-01-05', '2026-02-02', '2026-03-02']);
  });

  it('weekly rent change mid-week keeps the weekday and sums to 7 days of rent', async () => {
    const id = await tenancy();
    await schedule(id, '70.00', 'weekly', '2026-01-05', '2026-01-09');
    await schedule(id, '140.00', 'weekly', '2026-01-10');
    await generate(id, '2026-01-12');
    const rows = await charges(id);
    expect(rows.map((r) => [r.period_start, r.period_end, r.due_date, r.amount])).toEqual([
      ['2026-01-05', '2026-01-09', '2026-01-05', '50.00'], // 5 of 7 days of 70
      ['2026-01-10', '2026-01-11', '2026-01-05', '40.00'], // 2 of 7 days of 140
      ['2026-01-12', '2026-01-18', '2026-01-12', '140.00'],
    ]);
  });

  it('Feb pro-rata uses real month length: 28 days in 2026, 29 in 2028 (leap)', async () => {
    const a = await tenancy();
    await schedule(a, '600.00', 'monthly', '2026-02-01', '2026-02-10');
    await schedule(a, '700.00', 'monthly', '2026-02-11');
    await generate(a, '2026-02-28');
    expect((await charges(a)).map((r) => [r.period_start, r.period_end, r.amount])).toEqual([
      ['2026-02-01', '2026-02-10', '214.29'], // 600*10/28
      ['2026-02-11', '2026-02-28', '450.00'], // 700*18/28
    ]);
    const b = await tenancy();
    await schedule(b, '600.00', 'monthly', '2028-02-01', '2028-02-10');
    await schedule(b, '700.00', 'monthly', '2028-02-11');
    await generate(b, '2028-02-29');
    expect((await charges(b)).map((r) => [r.period_start, r.period_end, r.amount])).toEqual([
      ['2028-02-01', '2028-02-10', '206.90'], // 600*10/29
      ['2028-02-11', '2028-02-29', '458.62'], // 700*19/29
    ]);
  });

  it('a month-end rent day (31 Jan) gives periods starting 31 Jan, 28 Feb, 31 Mar with no gap or overlap', async () => {
    const id = await tenancy();
    await schedule(id, '500.00', 'monthly', '2026-01-31');
    await generate(id, '2026-03-31');
    const rows = await charges(id);
    expect(rows.map((r) => r.period_start)).toEqual(['2026-01-31', '2026-02-28', '2026-03-31']);
    expect(rows[0]!.period_end).toBe('2026-02-27');
    expect(rows[1]!.period_end).toBe('2026-03-30');
  });

  it('awkward pennies: split pieces always sum exactly to the segment rent, per period', async () => {
    const id = await tenancy();
    await schedule(id, '1000.01', 'monthly', '2026-01-01', '2026-03-16');
    await schedule(id, '777.77', 'monthly', '2026-03-17');
    await pool.query("INSERT INTO payer_splits (tenancy_id, payer, share_percent, effective_from, effective_to) VALUES ($1, 'council_hb', 33.33, '2026-01-01', '2026-03-24')", [id]);
    await pool.query("INSERT INTO payer_splits (tenancy_id, payer, fixed_amount, effective_from) VALUES ($1, 'council_hb', 123.45, '2026-03-25')", [id]);
    await generate(id, '2026-03-31');
    const rows = (await charges(id)).filter((r) => r.due_date === '2026-03-01');
    const seg1 = Math.round((100001 * 16) / 31); // 1-16 Mar at 1000.01
    const seg2 = Math.round((77777 * 15) / 31); // 17-31 Mar at 777.77
    expect(cents(rows.filter((r) => r.period_start <= '2026-03-16'))).toBe(seg1);
    expect(cents(rows.filter((r) => r.period_start >= '2026-03-17'))).toBe(seg2);
    expect(cents(rows.filter((r) => r.period_start >= '2026-03-25'))).toBeLessThan(seg2);
    expect(rows.every((r) => Number(r.amount) > 0)).toBe(true);
  });

  it('p_from exactly on a rent day keeps that period; one day later skips it', async () => {
    const id = await tenancy();
    await schedule(id, '600.00', 'monthly', '2026-01-01');
    await generate(id, '2026-03-31', '2026-02-01');
    expect((await charges(id)).map((r) => r.period_start)).toEqual(['2026-02-01', '2026-03-01']);
    const id2 = await tenancy();
    await schedule(id2, '600.00', 'monthly', '2026-01-01');
    await generate(id2, '2026-03-31', '2026-02-02');
    expect((await charges(id2)).map((r) => r.period_start)).toEqual(['2026-03-01']);
  });
});
