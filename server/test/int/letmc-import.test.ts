/**
 * LetMC import end to end: landlords, properties, tenants, tenancies + opening balances, with dry-run
 * preview, all-or-nothing commit and idempotent re-commit, against a real database. Fixtures are the
 * synthetic CSVs in fixtures/letmc; the Veco side comes from the real sync over synthetic rows.
 */
import { createHash, randomUUID } from 'node:crypto';
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
import { vecoRows } from '../fixtures/veco-rows.js';

const PASSWORD = 'correct-horse-battery';
const CUTOVER = '2026-04-01';
const config = loadConfig();
const logger = createLogger({ level: 'silent' });
const keys = { hashKey: config.hashKey, encryptionKey: config.encryptionKey };
const run = randomUUID().slice(0, 8);
let pool: Pool;
const cookies = {} as Record<Role, string>;
const emails = {} as Record<Role, string>;

const app = () => createApp({ config, pool, logger });
const fixture = (name: string): Buffer => readFileSync(new URL(`../../../fixtures/letmc/${name}`, import.meta.url));
const sha = (b: Buffer) => createHash('sha256').update(b).digest('hex');

async function signIn(role: Role): Promise<string> {
  const email = `${role}-lm-${run}@example.test`;
  emails[role] = email;
  await upsertUser(pool, { email, fullName: `LM ${role}`, role, password: PASSWORD });
  const res = await request(app()).post('/api/auth/login').set(CSRF_HEADER, CSRF_HEADER_VALUE).send({ email, password: PASSWORD });
  return (res.headers['set-cookie'] as unknown as string[]).find((c) => c.startsWith(`${SESSION_COOKIE}=`))!.split(';')[0]!;
}

const get = (path: string, role: Role = 'accounts') => request(app()).get(path).set('Cookie', cookies[role]);

interface Opts {
  role?: Role;
  cutover?: string;
  previewSha256?: string;
  csrf?: boolean;
}
function send(kind: 'preview' | 'commit', type: string, name: string, content: Buffer, o: Opts = {}) {
  let req = request(app()).post(`/api/imports/letmc/${kind}`).set('Cookie', cookies[o.role ?? 'accounts']);
  if (o.csrf !== false) req = req.set(CSRF_HEADER, CSRF_HEADER_VALUE);
  req = req.field('entityType', type);
  if (o.cutover) req = req.field('cutoverDate', o.cutover);
  if (o.previewSha256) req = req.field('previewSha256', o.previewSha256);
  return req.attach('file', content, name);
}
const preview = (type: string, name: string, content: Buffer = fixture(name), o: Opts = {}) => send('preview', type, name, content, o);
const commit = (type: string, name: string, content: Buffer = fixture(name), o: Opts = {}) =>
  send('commit', type, name, content, { previewSha256: sha(content), ...o });

const count = async (sql: string, params: unknown[] = []) =>
  Number(((await pool.query<{ n: string }>(`SELECT count(*) AS n FROM ${sql}`, params)).rows[0] as { n: string }).n);

interface Report {
  counts: { rows: number; create: number; update: number; unchanged: number; duplicate: number; rejected: number };
  rows: { key: string; action: string; changes: string[]; warnings: string[] }[];
  errors: { line: number; key: string; field: string; reason: string }[];
}

beforeAll(async () => {
  pool = createPool({ databaseUrl: config.databaseUrl, hashKey: config.hashKey, max: 4 }, logger);
  await pool.query(
    `TRUNCATE allocations, receipts, match_suggestions, payer_bank_accounts, payment_references, bank_transactions,
              import_batches, letmc_opening_balances, letmc_import_runs, external_refs, adjustments, rent_charges,
              rent_schedules, tenancy_tenants, tenancies, tenants, property_units, properties, landlords, branches CASCADE`,
  );
  await syncTenancies(pool, vecoRows(3), { keys, force: true });
  for (const role of ['admin', 'accounts', 'staff', 'readonly'] as const) cookies[role] = await signIn(role);
});

afterAll(async () => {
  await pool?.end();
});

describe('LetMC import', () => {
  it('1: a mixed landlords file previews per-row results and errors with file line numbers, writing nothing', async () => {
    const res = await preview('landlords', 'landlords.csv');
    expect(res.status).toBe(200);
    const report = res.body.report as Report;
    expect(report.counts).toEqual({ rows: 6, create: 3, update: 0, unchanged: 0, duplicate: 1, rejected: 2 });
    expect(report.errors).toEqual([
      expect.objectContaining({ line: 6, key: 'L8004', field: 'Email' }),
      expect.objectContaining({ line: 7, key: 'L8005', field: 'Landlord Name' }),
    ]);
    expect(await count("landlords WHERE landlord_ref LIKE 'L80%'")).toBe(0);
    expect(await count('letmc_import_runs')).toBe(0);
  });

  it('2: a file with rejected rows cannot be committed; the clean file commits, and committing it again changes nothing', async () => {
    const bad = await commit('landlords', 'landlords.csv');
    expect(bad.status).toBe(409);
    expect(bad.body.error.message).toContain('2 rows were rejected');
    expect(await count("landlords WHERE landlord_ref LIKE 'L80%'")).toBe(0);

    const first = await commit('landlords', 'landlords-clean.csv');
    expect(first.status).toBe(201);
    expect((first.body.report as Report).counts).toMatchObject({ create: 3, rejected: 0 });
    const again = await commit('landlords', 'landlords-clean.csv');
    expect(again.status).toBe(201);
    expect((again.body.report as Report).counts).toMatchObject({ create: 0, update: 0, unchanged: 3 });
    expect(await count("landlords WHERE landlord_ref LIKE 'L80%'")).toBe(3);
  });

  it('3: a commit whose checksum is not the previewed file is refused', async () => {
    const res = await commit('landlords', 'landlords-clean.csv', fixture('landlords-clean.csv'), { previewSha256: sha(Buffer.from('other')) });
    expect(res.status).toBe(409);
    expect(res.body.error.message).toContain('changed since the preview');
  });

  it('4: properties fill blanks on a Veco property but never overwrite it, and the Veco sync keeps the fill', async () => {
    const before = (await pool.query('SELECT address_line1, postcode, branch_id FROM properties WHERE property_ref = $1', ['P9000'])).rows[0];
    const res = await commit('properties', 'properties-clean.csv');
    expect(res.status).toBe(201);
    const report = res.body.report as Report;
    expect(report.counts).toMatchObject({ create: 2, update: 1 });
    const p9000 = report.rows.find((r) => r.key === 'P9000')!;
    expect(p9000.action).toBe('update');
    expect(p9000.changes).toEqual(expect.arrayContaining(['town', 'landlord']));
    expect(p9000.changes).not.toContain('address line 1');
    const after = (await pool.query('SELECT address_line1, postcode, branch_id FROM properties WHERE property_ref = $1', ['P9000'])).rows[0];
    expect(after).toEqual(before);

    await syncTenancies(pool, vecoRows(3), { keys, force: true });
    const kept = (
      await pool.query<{ town: string; ref: string }>(
        'SELECT p.town, l.landlord_ref AS ref FROM properties p JOIN landlords l ON l.id = p.landlord_id WHERE p.property_ref = $1',
        ['P9000'],
      )
    ).rows[0];
    expect(kept).toEqual({ town: 'Testville', ref: 'L8003' });

    const mixed = await preview('properties', 'properties.csv');
    expect(mixed.status).toBe(200);
    expect((mixed.body.report as Report).counts.rejected).toBe(3);
    expect((mixed.body.report as Report).errors.map((e) => e.field).sort()).toEqual(['Branch', 'Landlord Ref', 'Postcode']);
  });

  it('5: tenants link by NI hash to an existing tenant and never leak NI numbers', async () => {
    const res = await commit('tenants', 'tenants-clean.csv');
    expect(res.status).toBe(201);
    const report = res.body.report as Report;
    expect(report.counts).toMatchObject({ create: 3, duplicate: 1, rejected: 0 });
    expect(report.rows.find((r) => r.key === 'LT8004')!.action).toBe('duplicate');
    const json = JSON.stringify(res.body);
    expect(json).not.toContain('AB2000');
    expect(json).not.toContain('AB1000');
    const linked = await pool.query<{ tenant_ref: string }>(
      `SELECT t.tenant_ref FROM external_refs e JOIN tenants t ON t.id = e.entity_id
        WHERE e.system = 'letmc' AND e.entity_type = 'tenant' AND e.external_id = 'LT8004'`,
    );
    expect(linked.rows[0]!.tenant_ref).toMatch(/^veco:/);
    expect(await count("tenants WHERE tenant_ref LIKE 'letmc:%'")).toBe(3);

    const mixed = await preview('tenants', 'tenants.csv');
    const m = mixed.body.report as Report;
    expect(m.counts.rejected).toBe(2);
    expect(m.errors.map((e) => e.field).sort()).toEqual(['NI Number', 'Surname']);
    expect(JSON.stringify(mixed.body)).not.toContain('XX12');
  });

  it('6: tenancies need a valid cutover date; the mixed file shows its four rejects', async () => {
    expect((await preview('tenancies', 'tenancies.csv')).status).toBe(400);
    expect((await preview('tenancies', 'tenancies.csv', fixture('tenancies.csv'), { cutover: '2999-01-01' })).status).toBe(400);
    const res = await preview('tenancies', 'tenancies.csv', fixture('tenancies.csv'), { cutover: CUTOVER });
    expect(res.status).toBe(200);
    const report = res.body.report as Report;
    expect(report.counts.rejected).toBe(4);
    expect(report.errors.map((e) => e.field).sort()).toEqual(['Balance', 'Balance Payer', 'End Date', 'Property Ref']);
    expect(await count('letmc_opening_balances')).toBe(0);
  });

  it('7: the clean tenancies commit creates ended tenancies and opening balances, and starts the rent account for Veco ones', async () => {
    const veco = (await pool.query<{ start: string; ref: string }>(
      `SELECT to_char(t.start_date, 'YYYY-MM-DD') AS start, p.property_ref AS ref
         FROM tenancies t JOIN properties p ON p.id = t.property_id WHERE t.tid = 'T9001'`,
    )).rows[0];
    const res = await commit('tenancies', 'tenancies-clean.csv', fixture('tenancies-clean.csv'), { cutover: CUTOVER });
    expect(res.status).toBe(201);
    const report = res.body.report as Report & { openingBalances: Record<string, { count: number; totalPence: number }> };
    expect(report.counts).toMatchObject({ create: 2, update: 2, rejected: 0 });
    expect(report.openingBalances.charges).toEqual({ count: 2, totalPence: 42050 });
    expect(report.openingBalances.credits).toEqual({ count: 1, totalPence: -4500 });

    const t8001 = (await pool.query(`SELECT status::text AS status, to_char(end_date, 'YYYY-MM-DD') AS end_date FROM tenancies WHERE tid = 'T8001'`)).rows[0];
    expect(t8001).toEqual({ status: 'ended', end_date: '2025-03-31' });
    const charge = (
      await pool.query(
        `SELECT rc.amount::text AS amount, to_char(rc.due_date, 'YYYY-MM-DD') AS due FROM rent_charges rc
           JOIN tenancies t ON t.id = rc.tenancy_id WHERE t.tid = 'T8001' AND rc.source = 'opening_balance'`,
      )
    ).rows;
    expect(charge).toEqual([{ amount: '120.50', due: '2026-03-31' }]);
    const credit = (
      await pool.query(
        `SELECT a.amount::text AS amount, a.kind::text AS kind FROM adjustments a JOIN tenancies t ON t.id = a.tenancy_id WHERE t.tid = 'T8002'`,
      )
    ).rows;
    expect(credit).toEqual([{ amount: '-45.00', kind: 'opening_balance' }]);
    const balances = (
      await pool.query<{ tid: string; balance: string }>(
        `SELECT tid, balance::text FROM v_tenancy_balance WHERE tid IN ('T8001', 'T8002') AND payer = 'tenant' ORDER BY tid`,
      )
    ).rows;
    expect(balances).toEqual([
      { tid: 'T8001', balance: '120.50' },
      { tid: 'T8002', balance: '-45.00' },
    ]);

    const t9001 = (
      await pool.query(
        `SELECT to_char(t.charges_from, 'YYYY-MM-DD') AS cf, to_char(t.start_date, 'YYYY-MM-DD') AS start, p.property_ref AS ref
           FROM tenancies t JOIN properties p ON p.id = t.property_id WHERE t.tid = 'T9001'`,
      )
    ).rows[0];
    expect(t9001).toEqual({ cf: CUTOVER, start: veco!.start, ref: veco!.ref });
    const open9001 = (
      await pool.query(`SELECT rc.amount::text AS amount FROM rent_charges rc JOIN tenancies t ON t.id = rc.tenancy_id
                         WHERE t.tid = 'T9001' AND rc.source = 'opening_balance'`)
    ).rows;
    expect(open9001).toEqual([{ amount: '300.00' }]);
    expect(
      await count(
        `rent_charges rc JOIN tenancies t ON t.id = rc.tenancy_id WHERE t.tid = 'T9001' AND rc.source = 'schedule' AND rc.period_end < $1::date`,
        [CUTOVER],
      ),
    ).toBe(0);

    const t9002 = (await pool.query(`SELECT to_char(charges_from, 'YYYY-MM-DD') AS cf FROM tenancies WHERE tid = 'T9002'`)).rows[0];
    expect(t9002).toEqual({ cf: CUTOVER });
    expect(
      await count(
        `rent_charges rc JOIN tenancies t ON t.id = rc.tenancy_id WHERE t.tid = 'T9002' AND rc.source = 'opening_balance'`,
      ),
    ).toBe(0);
  });

  it('8: committing the same tenancies file again adds no charges, adjustments or balances', async () => {
    const charges = await count('rent_charges');
    const adjustments = await count('adjustments');
    const res = await commit('tenancies', 'tenancies-clean.csv', fixture('tenancies-clean.csv'), { cutover: CUTOVER });
    expect(res.status).toBe(201);
    expect((res.body.report as Report).counts).toMatchObject({ create: 0, update: 0, unchanged: 4, rejected: 0 });
    expect(await count('rent_charges')).toBe(charges);
    expect(await count('adjustments')).toBe(adjustments);
    expect(await count('letmc_opening_balances')).toBe(3);
  });

  it('9: a changed opening balance is rejected, and a different cutover date is refused', async () => {
    const changed = Buffer.from(fixture('tenancies-clean.csv').toString('utf8').replace('120.50', '130.50'));
    const res = await preview('tenancies', 'changed.csv', changed, { cutover: CUTOVER });
    expect(res.status).toBe(200);
    const errors = (res.body.report as Report).errors;
    expect(errors).toHaveLength(1);
    expect(errors[0]).toMatchObject({ key: 'T8001', field: 'Balance' });
    expect(errors[0]!.reason).toContain('Opening balance already imported');
    const other = await preview('tenancies', 'tenancies-clean.csv', fixture('tenancies-clean.csv'), { cutover: '2026-05-01' });
    expect(other.status).toBe(400);
    expect(other.body.error.message).toContain('Cutover date already set to 2026-04-01');
  });

  it('10: a later Veco sync is not refused and leaves the LetMC tenancies and opening balances alone', async () => {
    const summary = await syncTenancies(pool, vecoRows(3), { keys });
    expect(summary.dryRun).toBe(false);
    const t8001 = (await pool.query(`SELECT status::text AS status FROM tenancies WHERE tid = 'T8001'`)).rows[0];
    expect(t8001).toEqual({ status: 'ended' });
    const t9001 = (
      await pool.query(
        `SELECT to_char(t.charges_from, 'YYYY-MM-DD') AS cf,
                (SELECT count(*)::int FROM rent_charges rc WHERE rc.tenancy_id = t.id AND rc.source = 'opening_balance') AS opening
           FROM tenancies t WHERE t.tid = 'T9001'`,
      )
    ).rows[0];
    expect(t9001).toEqual({ cf: CUTOVER, opening: 1 });
  });

  it('11: roles, CSRF, missing columns and oversized files', async () => {
    const clean = fixture('landlords-clean.csv');
    expect((await preview('landlords', 'x.csv', clean, { role: 'readonly' })).status).toBe(403);
    expect((await preview('landlords', 'x.csv', clean, { role: 'staff' })).status).toBe(403);
    expect((await preview('landlords', 'x.csv', clean, { role: 'accounts' })).status).toBe(200);
    expect((await get('/api/imports/letmc/runs', 'staff')).status).toBe(403);
    expect((await get('/api/imports/letmc/runs', 'accounts')).status).toBe(200);
    expect((await get('/api/imports/letmc/layout', 'readonly')).status).toBe(200);
    expect((await preview('landlords', 'x.csv', clean, { csrf: false })).status).toBe(403);

    const noTid = Buffer.from('Property Ref,Start Date\nP8001,01/04/2024\n');
    const missing = await preview('tenancies', 'x.csv', noTid, { cutover: CUTOVER });
    expect(missing.status).toBe(400);
    expect(missing.body.error.message).toContain('Tenancy Ref');

    const big = await preview('landlords', 'big.csv', Buffer.alloc(11 * 1024 * 1024, 'a'));
    expect(big.status).toBe(400);
  });

  it('12: opening balances are audited under the accounts user', async () => {
    const { rows } = await pool.query<{ changed_by: string }>(
      `SELECT changed_by FROM audit_log WHERE table_name = 'letmc_opening_balances' AND action = 'INSERT'`,
    );
    expect(rows).toHaveLength(3);
    expect(new Set(rows.map((r) => r.changed_by))).toEqual(new Set([emails.accounts]));
  });
});
