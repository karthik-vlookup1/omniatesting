/**
 * LetMC import, second line of defence: preview == commit, preview writes nothing, all-or-nothing under an
 * injected failure, advisory-lock serialisation, Veco-wins, per-type idempotence, CSV edge cases, roles and
 * NI/e-mail never appearing in a response. Synthetic data only; Veco side from the real sync.
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
const csv = (...lines: string[]) => Buffer.from(lines.join('\n') + '\n', 'utf8');

async function signIn(role: Role): Promise<string> {
  const email = `${role}-lme-${run}@example.test`;
  emails[role] = email;
  await upsertUser(pool, { email, fullName: `LME ${role}`, role, password: PASSWORD });
  const res = await request(app()).post('/api/auth/login').set(CSRF_HEADER, CSRF_HEADER_VALUE).send({ email, password: PASSWORD });
  return (res.headers['set-cookie'] as unknown as string[]).find((c) => c.startsWith(`${SESSION_COOKIE}=`))!.split(';')[0]!;
}

interface Opts {
  role?: Role | null;
  cutover?: string;
  previewSha256?: string;
  csrf?: boolean;
}
function send(kind: 'preview' | 'commit', type: string, name: string, content: Buffer, o: Opts = {}) {
  let req = request(app()).post(`/api/imports/letmc/${kind}`);
  if (o.role !== null) req = req.set('Cookie', cookies[o.role ?? 'accounts']);
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
  dryRun: boolean;
  counts: { rows: number; create: number; update: number; unchanged: number; duplicate: number; rejected: number };
  rows: { line: number; key: string; action: string; changes: string[]; warnings: string[] }[];
  errors: { line: number; key: string; field: string; reason: string }[];
}

/** Everything the import can write, for "nothing changed" assertions. */
const footprint = async () => ({
  landlords: await count('landlords'),
  properties: await count('properties'),
  tenants: await count('tenants'),
  tenancies: await count('tenancies'),
  external_refs: await count('external_refs'),
  charges: await count('rent_charges'),
  adjustments: await count('adjustments'),
  opening: await count('letmc_opening_balances'),
  runs: await count('letmc_import_runs'),
  chargesFrom: await count('tenancies WHERE charges_from IS NOT NULL'),
});

beforeAll(async () => {
  pool = createPool({ databaseUrl: config.databaseUrl, hashKey: config.hashKey, max: 6 }, logger);
  await pool.query(
    `TRUNCATE allocations, receipts, match_suggestions, payer_bank_accounts, payment_references, bank_transactions,
              import_batches, letmc_opening_balances, letmc_import_runs, external_refs, adjustments, rent_charges,
              rent_schedules, tenancy_tenants, tenancies, tenants, property_units, properties, landlords, branches CASCADE`,
  );
  await syncTenancies(pool, vecoRows(3), { keys, force: true });
  for (const role of ['admin', 'accounts', 'staff', 'readonly'] as const) cookies[role] = await signIn(role);
});

afterAll(async () => {
  // audit_log is not truncated between files; leave no letmc rows behind for letmc-import.test.ts's audit count.
  await pool?.query("DELETE FROM audit_log WHERE table_name IN ('letmc_opening_balances', 'letmc_import_runs')");
  await pool?.end();
});

describe('LetMC import: CSV edge cases', () => {
  it('accepts a BOM, CRLF, blank lines, quoted commas and header aliases, and stores the quoted name intact', async () => {
    const body = Buffer.from(
      '﻿landlordid, NAME ,E-Mail,mobile\r\n\r\nL7001,"Smith, Jones & Co",l7001@example.test,01234 567001\r\n\r\nL7002,Plain Name,,\r\n',
      'utf8',
    );
    const pv = await preview('landlords', 'edge.csv', body);
    expect(pv.status).toBe(200);
    expect((pv.body.report as Report).counts).toMatchObject({ rows: 2, create: 2, rejected: 0 });
    expect((await commit('landlords', 'edge.csv', body)).status).toBe(201);
    const { rows } = await pool.query<{ name: string }>("SELECT name FROM landlords WHERE landlord_ref = 'L7001'");
    expect(rows[0]!.name).toBe('Smith, Jones & Co');
  });

  it('refuses an empty file, a header-only file, a missing file, wrong encoding, an unterminated quote and 5001 rows with 400', async () => {
    const before = await footprint();
    expect((await preview('landlords', 'e.csv', Buffer.alloc(0))).status).toBe(400);
    expect((await preview('landlords', 'e.csv', csv('Landlord Ref,Landlord Name'))).status).toBe(400);
    const none = await request(app())
      .post('/api/imports/letmc/preview')
      .set('Cookie', cookies.accounts)
      .set(CSRF_HEADER, CSRF_HEADER_VALUE)
      .field('entityType', 'landlords');
    expect(none.status).toBe(400);
    expect((await preview('landlords', 'e.csv', csv('Landlord Ref,Landlord Name', 'L7101,"open'))).status).toBe(400);
    expect((await preview('landlords', 'e.csv', Buffer.from([0xff, 0xfe, 0x00, 0x01, 0x02]))).status).toBe(400);
    const many = csv('Landlord Ref,Landlord Name', ...Array.from({ length: 5001 }, (_, i) => `L9${i},N${i}`));
    const res = await preview('landlords', 'many.csv', many);
    expect(res.status).toBe(400);
    expect(res.body.error.message).toContain('5000');
    expect(await footprint()).toEqual(before);
  });

  it('survives a Latin-1 encoded file without a server error', async () => {
    const body = Buffer.concat([Buffer.from('Landlord Ref,Landlord Name\nL7102,Pound '), Buffer.from([0xa3]), Buffer.from(' Ltd\n')]);
    const res = await preview('landlords', 'latin1.csv', body);
    expect(res.status).toBeLessThan(500);
  });
});

describe('LetMC import: preview == commit, nothing written by a preview', () => {
  it('a preview writes no rows, runs or audit entries, and the commit reports exactly what the preview did', async () => {
    const body = csv(
      'Landlord Ref,Landlord Name,Email,Phone',
      'L7001,Smith Jones Other,other@example.test,01234 567999', // existing: name+email differ, phone differs
      'L7002,Plain Name,fill@example.test,01234 567002', // existing: fills blank email and phone
      'L7003,Brand New,,',
      'L7003,Brand New,,', // identical duplicate
      'L7004,Another New,l7004@example.test,',
    );
    const before = await footprint();
    const auditBefore = await count('audit_log');
    const pv = await preview('landlords', 'mix.csv', body);
    expect(pv.status).toBe(200);
    expect(pv.body.report.dryRun).toBe(true);
    expect(await footprint()).toEqual(before);
    expect(await count('audit_log')).toBe(auditBefore);

    const cm = await commit('landlords', 'mix.csv', body);
    expect(cm.status).toBe(201);
    const p = pv.body.report as Report;
    const c = cm.body.report as Report;
    expect(c.dryRun).toBe(false);
    expect(c.counts).toEqual(p.counts);
    expect(c.rows).toEqual(p.rows);
    expect(c.errors).toEqual(p.errors);
    expect(c.counts).toEqual({ rows: 5, create: 2, update: 1, unchanged: 1, duplicate: 1, rejected: 0 });
    expect(await count('landlords')).toBe(before.landlords + 2);
  });

  it('Veco-wins: existing values are never overwritten, blanks are filled, conflicts are warned', async () => {
    const { rows } = await pool.query<{ landlord_ref: string; name: string; email: string | null; phone: string | null }>(
      "SELECT landlord_ref, name, email, phone FROM landlords WHERE landlord_ref IN ('L7001', 'L7002') ORDER BY landlord_ref",
    );
    expect(rows[0]).toEqual({ landlord_ref: 'L7001', name: 'Smith, Jones & Co', email: 'l7001@example.test', phone: '01234 567001' });
    expect(rows[1]).toEqual({ landlord_ref: 'L7002', name: 'Plain Name', email: 'fill@example.test', phone: '01234 567002' });
    const again = await preview(
      'landlords',
      'w.csv',
      csv('Landlord Ref,Landlord Name,Email', 'L7001,Smith Jones Other,other@example.test'),
    );
    const row = (again.body.report as Report).rows[0]!;
    expect(row.action).toBe('unchanged');
    expect(row.warnings.join('|')).toMatch(/Email differs[\s\S]*Landlord Name differs|Landlord Name differs[\s\S]*Email differs/);
  });

  it('a tenancies preview with cutover writes nothing at all (no charges_from, charges, runs)', async () => {
    const before = await footprint();
    const pv = await preview('tenancies', 'tenancies-clean.csv', fixture('tenancies-clean.csv'), { cutover: CUTOVER });
    // properties/tenants are not imported yet, so T8001/T8002 reject; the Veco rows would apply
    expect(pv.status).toBe(200);
    expect(await footprint()).toEqual(before);
  });
});

describe('LetMC import: all-or-nothing', () => {
  it('an injected database failure on the last landlord row leaves none of the batch persisted', async () => {
    await pool.query(`CREATE FUNCTION letmc_test_boom() RETURNS trigger LANGUAGE plpgsql AS $$
      BEGIN IF NEW.name = 'Boom Ltd' THEN RAISE EXCEPTION 'injected failure'; END IF; RETURN NEW; END $$`);
    await pool.query('CREATE TRIGGER letmc_test_boom BEFORE INSERT ON landlords FOR EACH ROW EXECUTE FUNCTION letmc_test_boom()');
    try {
      const body = csv('Landlord Ref,Landlord Name', 'L7201,Good One', 'L7202,Good Two', 'L7203,Boom Ltd');
      const before = await footprint();
      const res = await commit('landlords', 'boom.csv', body);
      expect(res.status).toBeGreaterThanOrEqual(400);
      expect(res.status).not.toBe(201);
      expect(await count("landlords WHERE landlord_ref LIKE 'L72%'")).toBe(0);
      expect(await footprint()).toEqual(before);
    } finally {
      await pool.query('DROP TRIGGER letmc_test_boom ON landlords');
      await pool.query('DROP FUNCTION letmc_test_boom()');
    }
  });

  it('a commit with a rejected row writes nothing, and a changed file or missing checksum is refused', async () => {
    const body = csv('Landlord Ref,Landlord Name,Email', 'L7301,Fine,', 'L7302,Bad,not-an-email');
    const before = await footprint();
    const rejected = await commit('landlords', 'r.csv', body);
    expect(rejected.status).toBe(409);
    const good = csv('Landlord Ref,Landlord Name', 'L7301,Fine');
    const changed = await commit('landlords', 'g.csv', good, { previewSha256: sha(csv('Landlord Ref,Landlord Name', 'L7301,Fine edited')) });
    expect(changed.status).toBe(409);
    const noSha = await send('commit', 'landlords', 'g.csv', good);
    expect(noSha.status).toBe(400);
    expect(await footprint()).toEqual(before);
  });
});

describe('LetMC import: advisory lock', () => {
  it('a commit waits while another import holds the lock, then completes', async () => {
    const holder = await pool.connect();
    try {
      await holder.query('BEGIN');
      await holder.query("SELECT pg_advisory_xact_lock(hashtext('letmc-import'))");
      let settled = false;
      const pending = Promise.resolve(commit('landlords', 'lock.csv', csv('Landlord Ref,Landlord Name', 'L7401,Locked Landlord'))).then((r) => {
        settled = true;
        return r;
      });
      await new Promise((r) => setTimeout(r, 1500));
      expect(settled).toBe(false);
      expect(await count("landlords WHERE landlord_ref = 'L7401'")).toBe(0);
      await holder.query('COMMIT');
      const res = await pending;
      expect(res.status).toBe(201);
      expect(await count("landlords WHERE landlord_ref = 'L7401'")).toBe(1);
    } finally {
      await holder.query('ROLLBACK').catch(() => undefined);
      holder.release();
    }
  });
});

describe('LetMC import: roles, CSRF, audit', () => {
  it('only admin and accounts may commit; others and anonymous callers change nothing', async () => {
    const body = csv('Landlord Ref,Landlord Name', 'L7501,Role Test');
    const before = await footprint();
    expect((await commit('landlords', 'x.csv', body, { role: 'staff' })).status).toBe(403);
    expect((await commit('landlords', 'x.csv', body, { role: 'readonly' })).status).toBe(403);
    expect((await commit('landlords', 'x.csv', body, { role: null })).status).toBe(401);
    expect((await commit('landlords', 'x.csv', body, { csrf: false })).status).toBe(403);
    expect(await footprint()).toEqual(before);
    expect((await commit('landlords', 'x.csv', body, { role: 'admin' })).status).toBe(201);
  });

  it('records the import run under the signed-in user in the audit log', async () => {
    const { rows } = await pool.query<{ changed_by: string }>(
      `SELECT changed_by FROM audit_log WHERE table_name = 'letmc_import_runs' AND action = 'INSERT'`,
    );
    expect(rows.length).toBeGreaterThan(0);
    expect(new Set(rows.map((r) => r.changed_by))).toEqual(new Set([emails.accounts, emails.admin]));
  });
});

describe('LetMC import: per-type idempotence, Veco-wins on properties, NI privacy', () => {
  it('re-running properties and tenants creates nothing and links nothing new', async () => {
    expect((await commit('landlords', 'landlords-clean.csv')).status).toBe(201);
    for (const [type, file] of [
      ['properties', 'properties-clean.csv'],
      ['tenants', 'tenants-clean.csv'],
    ] as const) {
      expect((await commit(type, file)).status).toBe(201);
      const after = await footprint();
      const again = await commit(type, file);
      expect(again.status).toBe(201);
      const counts = (again.body.report as Report).counts;
      expect(counts.create).toBe(0);
      expect(counts.update).toBe(0);
      expect(await footprint()).toEqual({ ...after, runs: after.runs + 1 });
    }
  });

  it('a differing LetMC address/postcode/town for a Veco property is kept out and only warned about', async () => {
    const before = (await pool.query('SELECT address_line1, postcode, town, branch_id FROM properties WHERE property_ref = $1', ['P9000'])).rows[0];
    const body = csv(
      'Property Ref,Branch,Address 1,Town,Postcode',
      'P9000,TSA,99 Different Road,Elsewhere,ZZ9 9ZZ',
    );
    const res = await commit('properties', 'v.csv', body);
    expect(res.status).toBe(201);
    const row = (res.body.report as Report).rows[0]!;
    expect(row.action).toBe('unchanged');
    expect(row.warnings.length).toBeGreaterThanOrEqual(2);
    const after = (await pool.query('SELECT address_line1, postcode, town, branch_id FROM properties WHERE property_ref = $1', ['P9000'])).rows[0];
    expect(after).toEqual(before);
  });

  it('never returns an NI number or rejected e-mail value; a repeated or already-linked NI is rejected by field only', async () => {
    const body = csv(
      'Tenant Ref,First Name,Surname,Email,NI Number',
      'LT7001,Pat,Nine,leakme-bad-email,QQ123456Z', // bad email + bad NI
      'LT7002,Sam,Ten,,AB300001C',
      'LT7003,Kim,Eleven,,AB300001C', // same NI as LT7002 in the file
      'LT7004,Lee,Twelve,,AB200001C', // NI already linked to LetMC tenant LT8001
    );
    const res = await preview('tenants', 't.csv', body);
    expect(res.status).toBe(200);
    const report = res.body.report as Report;
    expect(report.counts.rejected).toBe(3);
    expect(report.errors.filter((e) => e.field === 'NI Number')).toHaveLength(3);
    const json = JSON.stringify(res.body);
    for (const secret of ['QQ123456Z', 'AB300001C', 'AB200001C', 'leakme-bad-email']) expect(json).not.toContain(secret);
    const committed = await commit('tenants', 't.csv', body);
    expect(committed.status).toBe(409);
    expect(JSON.stringify(committed.body)).not.toMatch(/AB300001C|AB200001C|QQ123456Z/);
  });
});

describe('LetMC import: tenancies and opening balances in integer pence', () => {
  it('a rejected file is refused, an injected failure on the 2nd row rolls back the 1st, and nothing is persisted', async () => {
    const before = await footprint();
    const rejected = await commit('tenancies', 'tenancies.csv', fixture('tenancies.csv'), { cutover: CUTOVER });
    expect(rejected.status).toBe(409);
    expect(await footprint()).toEqual(before);

    await pool.query(`CREATE FUNCTION letmc_test_boom2() RETURNS trigger LANGUAGE plpgsql AS $$
      BEGIN IF NEW.amount_pence = -4500 THEN RAISE EXCEPTION 'injected failure'; END IF; RETURN NEW; END $$`);
    await pool.query(
      'CREATE TRIGGER letmc_test_boom2 BEFORE INSERT ON letmc_opening_balances FOR EACH ROW EXECUTE FUNCTION letmc_test_boom2()',
    );
    try {
      const res = await commit('tenancies', 'tenancies-clean.csv', fixture('tenancies-clean.csv'), { cutover: CUTOVER });
      expect(res.status).toBeGreaterThanOrEqual(400);
      expect(await count("tenancies WHERE tid = 'T8001'")).toBe(0);
      expect(await footprint()).toEqual(before);
    } finally {
      await pool.query('DROP TRIGGER letmc_test_boom2 ON letmc_opening_balances');
      await pool.query('DROP FUNCTION letmc_test_boom2()');
    }
  });

  it('today or a missing end date for an unknown TID is rejected; bad cutover formats are refused', async () => {
    const today = (await pool.query<{ d: string }>("SELECT to_char(current_date, 'YYYY-MM-DD') AS d")).rows[0]!.d;
    const body = csv(
      'Tenancy Ref,Property Ref,Tenant Ref,Management Type,Start Date,End Date,Balance',
      `T7001,P8001,LT8001,RG,2024-01-01,${today},10.00`,
      'T7002,P8001,LT8001,RG,2024-01-01,,10.00',
    );
    const res = await preview('tenancies', 'a.csv', body, { cutover: CUTOVER });
    expect(res.status).toBe(200);
    const errors = (res.body.report as Report).errors;
    expect(errors.filter((e) => e.field === 'End Date').map((e) => e.key)).toEqual(['T7001', 'T7002']);
    expect(errors[0]!.reason).toContain('Veco owns active tenancies');
    for (const bad of ['01/04/2026', '2026-13-45', '1999-12-31', 'not-a-date']) {
      expect((await preview('tenancies', 'a.csv', body, { cutover: bad })).status).toBe(400);
    }
  });

  it('£1,234.50 arrears and (0.29) credit land as exact charges/adjustments dated cutover-1; refresh keeps them', async () => {
    const body = csv(
      'Tenancy Ref,Balance',
      'T9001,"£1,234.50"',
      'T9002,(0.29)',
    );
    const pv = await preview('tenancies', 'money.csv', body, { cutover: CUTOVER });
    expect(pv.status).toBe(200);
    expect((pv.body.report as Report).counts).toMatchObject({ update: 2, rejected: 0 });
    expect(pv.body.report.openingBalances).toEqual({ charges: { count: 1, totalPence: 123450 }, credits: { count: 1, totalPence: -29 } });
    expect(await count('letmc_opening_balances')).toBe(0);

    const res = await commit('tenancies', 'money.csv', body, { cutover: CUTOVER });
    expect(res.status).toBe(201);
    const charge = (
      await pool.query(
        `SELECT rc.amount::text AS amount, to_char(rc.due_date, 'YYYY-MM-DD') AS due, to_char(rc.period_start, 'YYYY-MM-DD') AS ps
           FROM rent_charges rc JOIN tenancies t ON t.id = rc.tenancy_id WHERE t.tid = 'T9001' AND rc.source = 'opening_balance'`,
      )
    ).rows;
    expect(charge).toEqual([{ amount: '1234.50', due: '2026-03-31', ps: '2026-03-31' }]);
    const credit = (
      await pool.query(
        `SELECT a.amount::text AS amount, to_char(a.effective_on, 'YYYY-MM-DD') AS eff FROM adjustments a
           JOIN tenancies t ON t.id = a.tenancy_id WHERE t.tid = 'T9002' AND a.kind = 'opening_balance'`,
      )
    ).rows;
    expect(credit).toEqual([{ amount: '-0.29', eff: '2026-03-31' }]);
    const stored = (await pool.query<{ amount_pence: string }>('SELECT amount_pence::text FROM letmc_opening_balances ORDER BY amount_pence::bigint')).rows;
    expect(stored.map((r) => r.amount_pence)).toEqual(['-29', '123450']);

    await pool.query(`SELECT refresh_rent_charges(id) FROM tenancies WHERE tid IN ('T9001', 'T9002')`);
    expect(await count("rent_charges WHERE source = 'opening_balance'")).toBe(1);
    expect(await count("adjustments WHERE kind = 'opening_balance'")).toBe(1);
    expect(
      await count(
        `rent_charges rc JOIN tenancies t ON t.id = rc.tenancy_id WHERE t.tid IN ('T9001','T9002') AND rc.source <> 'opening_balance' AND rc.period_end < $1::date`,
        [CUTOVER],
      ),
    ).toBe(0);

    // same file again: idempotent; different amount: rejected with a reason; different cutover: 400
    const again = await commit('tenancies', 'money.csv', body, { cutover: CUTOVER });
    expect((again.body.report as Report).counts).toMatchObject({ create: 0, update: 0, unchanged: 2 });
    expect(await count('letmc_opening_balances')).toBe(2);
    const diff = await preview('tenancies', 'money2.csv', csv('Tenancy Ref,Balance', 'T9001,1234.51'), { cutover: CUTOVER });
    expect((diff.body.report as Report).errors[0]!.reason).toContain('Opening balance already imported');
    expect((await preview('tenancies', 'money.csv', body, { cutover: '2026-04-02' })).status).toBe(400);
  });
});
