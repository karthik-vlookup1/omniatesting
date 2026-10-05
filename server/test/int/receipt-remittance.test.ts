/**
 * Council remittance import end to end: preview (dry run, nothing written), commit (one receipt per row,
 * all-or-nothing), idempotent re-commit and the refusals. Fixtures are the synthetic CSVs in
 * fixtures/remittance; tenancies come from synthetic Veco rows.
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
const config = loadConfig();
const logger = createLogger({ level: 'silent' });
const keys = { hashKey: config.hashKey, encryptionKey: config.encryptionKey };
const run = randomUUID().slice(0, 8);
let pool: Pool;
let bankId = '';
const cookies = {} as Record<Role, string>;
const emails = {} as Record<Role, string>;

const app = () => createApp({ config, pool, logger });
const fixture = (name: string): Buffer => readFileSync(new URL(`../fixtures/remittance/${name}`, import.meta.url));
const sha = (b: Buffer) => createHash('sha256').update(b).digest('hex');

async function signIn(role: Role): Promise<string> {
  const email = `${role}-rem-${run}@example.test`;
  emails[role] = email;
  await upsertUser(pool, { email, fullName: `Rem ${role}`, role, password: PASSWORD });
  const res = await request(app()).post('/api/auth/login').set(CSRF_HEADER, CSRF_HEADER_VALUE).send({ email, password: PASSWORD });
  return (res.headers['set-cookie'] as unknown as string[]).find((c) => c.startsWith(`${SESSION_COOKIE}=`))!.split(';')[0]!;
}

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

interface Opts {
  role?: Role;
  previewSha256?: string;
  csrf?: boolean;
  /** Form fields to change; an undefined value leaves the field out. */
  fields?: Record<string, string | undefined>;
  noFile?: boolean;
}
function sendFile(kind: 'preview' | 'commit', lineId: string, name: string, content: Buffer, o: Opts = {}) {
  let req = request(app()).post(`/api/remittances/${kind}`).set('Cookie', cookies[o.role ?? 'accounts']);
  if (o.csrf !== false) req = req.set(CSRF_HEADER, CSRF_HEADER_VALUE);
  const fields: Record<string, string | undefined> = {
    bankTransactionId: lineId,
    payer: 'council_hb',
    payingBody: 'Test City Council',
    remittanceRef: 'REM-1',
    remittanceDate: '2026-09-30',
    previewSha256: o.previewSha256,
    ...o.fields,
  };
  for (const [k, v] of Object.entries(fields)) if (v !== undefined) req = req.field(k, v);
  return o.noFile ? req : req.attach('file', content, name);
}
const preview = (lineId: string, name = 'remittance.csv', content: Buffer = fixture(name), o: Opts = {}) => sendFile('preview', lineId, name, content, o);
const commit = (lineId: string, name = 'remittance.csv', content: Buffer = fixture(name), o: Opts = {}) =>
  sendFile('commit', lineId, name, content, { previewSha256: sha(content), ...o });

const count = async (sql: string, params: unknown[] = []) =>
  Number(((await pool.query<{ n: string }>(`SELECT count(*) AS n FROM ${sql}`, params)).rows[0] as { n: string }).n);

interface Report {
  counts: { rows: number; matched: number; rejected: number };
  totalPence: number;
  linePence: number;
  totalMismatch: boolean;
  rows: { line: number; tenancyTid: string }[];
  errors: { line: number; key: string; field: string; reason: string }[];
}

beforeAll(async () => {
  pool = createPool({ databaseUrl: config.databaseUrl, hashKey: config.hashKey, max: 4 }, logger);
  await pool.query(
    `TRUNCATE allocations, receipts, remittance_lines, remittance_advices, sync_outbox, external_refs, adjustments,
              match_suggestions, payer_bank_accounts, payment_references, bank_transactions, import_batches,
              bank_csv_profiles, bank_accounts, rent_charge_dirty, rent_charges, rent_schedules, benefit_awards,
              tenancy_tenants, tenancies, tenants, property_units, properties, branches CASCADE`,
  );
  await syncTenancies(pool, vecoRows(4), { keys, force: true });
  for (const role of ['admin', 'accounts', 'staff', 'readonly'] as const) cookies[role] = await signIn(role);
  bankId = (await pool.query<{ id: string }>("INSERT INTO bank_accounts (code, bank_name, account_name) VALUES ('REMT', 'Test Bank', 'Remittance test') RETURNING id")).rows[0]!.id;
  await pool.query(
    `INSERT INTO benefit_awards (tenant_id, tenancy_id, benefit, paying_body, claim_reference, award_amount, award_frequency, paid_to, effective_from)
     SELECT tt.tenant_id, t.id, 'HB', 'Test City Council', 'hbc-77001', 100.00, 'weekly', 'landlord_direct', '2020-01-01'
       FROM tenancies t JOIN tenancy_tenants tt ON tt.tenancy_id = t.id WHERE t.tid = 'T9003' LIMIT 1`,
  );
});

afterAll(async () => {
  await pool?.end();
});

describe('remittance import', () => {
  it('7: previewing a clean file matches all 3 rows and writes nothing; a bad file reports 3 errors with line numbers', async () => {
    const lineId = await seedLine(45000, 'COUNCIL BULK PREVIEW');
    const res = await preview(lineId);
    expect(res.status).toBe(200);
    const report = res.body.report as Report;
    expect(report.counts).toEqual({ rows: 3, matched: 3, rejected: 0 });
    expect(report).toMatchObject({ totalPence: 45000, linePence: 45000, totalMismatch: false });
    expect(report.rows.map((r) => r.tenancyTid)).toEqual(['T9001', 'T9002', 'T9003']);
    expect(await count('receipts')).toBe(0);
    expect(await count('remittance_advices')).toBe(0);
    expect(await count("import_batches WHERE source = 'remittance'")).toBe(0);

    const bad = await preview(lineId, 'remittance-bad.csv');
    expect(bad.status).toBe(200);
    const badReport = bad.body.report as Report;
    expect(badReport.counts).toEqual({ rows: 6, matched: 3, rejected: 3 });
    expect(badReport.errors).toEqual([
      expect.objectContaining({ line: 5, key: 'T9999', field: 'TID', reason: 'Unknown TID' }),
      expect.objectContaining({ line: 6, key: 'T9003', field: 'Amount' }),
      expect.objectContaining({ line: 7, key: '', field: 'TID' }),
    ]);
    expect(await count('receipts')).toBe(0);
  });

  it('8: commit makes 3 receipts and matches the line; the same file again changes nothing; every refusal is a 409', async () => {
    const lineId = await seedLine(45000, 'COUNCIL BULK');
    const file = fixture('remittance.csv');

    const wrongSha = await commit(lineId, 'remittance.csv', file, { previewSha256: sha(Buffer.from('other')) });
    expect(wrongSha.status).toBe(409);
    expect(wrongSha.body.error.message).toContain('changed since the preview');
    const bad = await commit(lineId, 'remittance-bad.csv');
    expect(bad.status).toBe(409);
    expect(bad.body.error.message).toContain('3 rows were rejected');
    expect(await count('receipts')).toBe(0);

    const ok = await commit(lineId);
    expect(ok.status).toBe(201);
    const remittanceId = ok.body.remittanceId as string;
    const { rows } = await pool.query<{ tid: string; amount: string; via: string; linked: boolean; payer: string }>(
      `SELECT t.tid, r.amount::text, r.matched_via::text AS via, r.remittance_line_id IS NOT NULL AS linked, r.payer::text AS payer
         FROM receipts r JOIN tenancies t ON t.id = r.tenancy_id WHERE r.bank_transaction_id = $1 ORDER BY t.tid`,
      [lineId],
    );
    expect(rows).toEqual([
      { tid: 'T9001', amount: '200.00', via: 'remittance_line', linked: true, payer: 'council_hb' },
      { tid: 'T9002', amount: '150.00', via: 'remittance_line', linked: true, payer: 'council_hb' },
      { tid: 'T9003', amount: '100.00', via: 'remittance_line', linked: true, payer: 'council_hb' },
    ]);
    expect((await pool.query('SELECT status::text AS status FROM bank_transactions WHERE id = $1', [lineId])).rows[0].status).toBe('matched');
    const detail = await request(app()).get(`/api/remittances/${remittanceId}`).set('Cookie', cookies.readonly);
    expect(detail.status).toBe(200);
    expect(detail.body.remittance).toMatchObject({ totalPence: 45000, payingBody: 'Test City Council', bankTransactionId: lineId });
    expect(detail.body.remittance.lines).toHaveLength(3);
    expect(
      await count("audit_log WHERE table_name = 'remittance_advices' AND action = 'INSERT' AND changed_by = $1", [emails.accounts]),
    ).toBe(1);

    const again = await commit(lineId);
    expect(again.status).toBe(200);
    expect(again.body).toEqual({ alreadyImported: true, remittanceId });
    expect(await count('receipts WHERE bank_transaction_id = $1', [lineId])).toBe(3);
    expect(await count('remittance_advices')).toBe(1);

    const otherLine = await seedLine(45000, 'COUNCIL BULK OTHER');
    const elsewhere = await commit(otherLine);
    expect(elsewhere.status).toBe(409);
    expect(elsewhere.body.error.message).toContain('another bank line');

    const bigger = Buffer.from(file.toString('utf8').replace('200.00', '250.00'));
    const mismatch = await commit(otherLine, 'remittance-bigger.csv', bigger);
    expect(mismatch.status).toBe(409);
    expect(mismatch.body.error.message).toBe('Remittance total £500.00 does not equal the bank line £450.00');
    expect(await count('receipts WHERE bank_transaction_id = $1', [otherLine])).toBe(0);

    const withReceipts = await commit(lineId, 'remittance-smaller.csv', Buffer.from(file.toString('utf8').replace('200.00', '199.00')));
    expect(withReceipts.status).toBe(409);
    expect(withReceipts.body.error.message).toBe('This line already has receipts; reverse them first');

    expect((await commit(otherLine, 'remittance.csv', file, { role: 'staff' })).status).toBe(403);
    expect((await commit(otherLine, 'remittance.csv', file, { csrf: false })).status).toBe(403);
    expect((await preview(otherLine, 'remittance.csv', file, { role: 'readonly' })).status).toBe(403);
  });
});

const HEADER = 'TID,Claim Ref,Tenant Name,Period From,Period To,Amount';
const csv = (...rows: string[]) => Buffer.from([HEADER, ...rows].join('\n') + '\n');

async function addAward(tid: string, claim: string, from: string, to: string | null): Promise<void> {
  await pool.query(
    `INSERT INTO benefit_awards (tenant_id, tenancy_id, benefit, paying_body, claim_reference, award_amount, award_frequency, paid_to, effective_from, effective_to)
     SELECT tt.tenant_id, t.id, 'HB', 'Test City Council', $2, 100.00, 'weekly', 'landlord_direct', $3::date, $4::date
       FROM tenancies t JOIN tenancy_tenants tt ON tt.tenancy_id = t.id WHERE t.tid = $1 LIMIT 1`,
    [tid, claim, from, to],
  );
}

/** Row counts of everything a remittance could write; a refused or previewed request must leave it unchanged. */
const snapshot = async () => ({
  receipts: await count('receipts'),
  allocations: await count('allocations'),
  advices: await count('remittance_advices'),
  lines: await count('remittance_lines'),
  batches: await count("import_batches WHERE source = 'remittance'"),
  matchedLines: await count("bank_transactions WHERE status = 'matched'"),
});

describe('remittance refusals and edge cases', () => {
  beforeAll(async () => {
    await addAward('T9001', 'HBC-88001', '2020-01-01', null); // the same claim on two tenancies
    await addAward('T9002', 'HBC-88001', '2020-01-01', null);
    await addAward('T9004', 'HBC-99001', '2020-01-01', '2026-06-30'); // ended before the remittance date
    await addAward('T9004', 'HBC-99002', '2026-10-15', null); // not yet in force
  });

  it('9: a file that is unreadable as a whole is a 400 and writes nothing', async () => {
    const line = await seedLine(10000, 'FILE LEVEL REFUSALS');
    const before = await snapshot();
    const bad: [string, Buffer, string][] = [
      ['no Amount column', Buffer.from('TID,Claim Ref\nT9001,\n'), 'Missing columns: Amount'],
      ['no TID or Claim Ref column', Buffer.from('Amount,Tenant Name\n5.00,X\n'), 'TID or Claim Ref'],
      ['header only', Buffer.from(`${HEADER}\n`), 'no data rows'],
      ['not a CSV', Buffer.from('TID,Amount\n"T9001,5.00\n'), 'not a readable CSV'],
      ['over 2000 rows', csv(...Array.from({ length: 2001 }, (_, i) => `T9001,,N${i},,,1.00`)), 'more than 2000 rows'],
    ];
    for (const [label, content, message] of bad) {
      const res = await preview(line, 'bad.csv', content);
      expect(res.status, label).toBe(400);
      expect(res.body.error.message, label).toContain(message);
    }
    expect((await preview(line, 'empty.csv', Buffer.alloc(0))).status).toBe(400);
    expect((await preview(line, 'x.csv', Buffer.alloc(0), { noFile: true })).status).toBe(400);
    expect(await snapshot()).toEqual(before);
  });

  it('9b: form fields are validated: id, payer, paying body, date, checksum; unknown, excluded and outgoing lines are refused', async () => {
    const line = await seedLine(5000, 'FIELD REFUSALS');
    const before = await snapshot();
    const file = csv('T9001,,A,,,50.00');
    const cases: [string, Opts][] = [
      ['bad line id', { fields: { bankTransactionId: 'not-a-uuid' } }],
      ['tenant payer', { fields: { payer: 'tenant' } }],
      ['no paying body', { fields: { payingBody: undefined } }],
      ['paying body too long', { fields: { payingBody: 'B'.repeat(101) } }],
      ['UK date format', { fields: { remittanceDate: '30/09/2026' } }],
      ['no date', { fields: { remittanceDate: undefined } }],
      ['unexpected field', { fields: { surprise: 'x' } }],
    ];
    for (const [label, o] of cases) expect((await preview(line, 'f.csv', file, o)).status, label).toBe(400);
    expect((await commit(line, 'f.csv', file, { fields: { previewSha256: undefined } })).status).toBe(400);
    expect((await commit(line, 'f.csv', file, { fields: { previewSha256: 'abc' } })).status).toBe(400);
    expect((await preview(randomUUID(), 'f.csv', file)).status).toBe(404);
    expect((await commit(randomUUID(), 'f.csv', file)).status).toBe(404);
    await pool.query("UPDATE bank_transactions SET status = 'excluded', exclusion_reason = 'not rent' WHERE id = $1", [line]);
    expect((await preview(line, 'f.csv', file)).status).toBe(409);
    expect((await commit(line, 'f.csv', file)).status).toBe(409);
    const out = await seedLine(-5000, 'MONEY OUT');
    expect((await preview(out, 'f.csv', file)).status).toBe(409);
    expect(await snapshot()).toEqual(before);
  });

  it('9c: a date that does not exist (2026-02-30) is a 400, not a server error', async () => {
    const line = await seedLine(5000, 'IMPOSSIBLE DATE');
    const res = await preview(line, 'f.csv', csv('T9001,,A,,,50.00'), { fields: { remittanceDate: '2026-02-30' } });
    expect(res.status).toBe(400);
  });

  it('10: every bad row is rejected with its own line number and reason; good rows still match; a claim ref uses the award in force on the remittance date', async () => {
    const line = await seedLine(45000, 'ROW LEVEL REFUSALS');
    const before = await snapshot();
    const file = csv(
      't9001,,Lower case TID,01/09/2026,28/09/2026,10.00', // line 2: fine, TID is case-insensitive
      'T9001,,Lower case TID,01/09/2026,28/09/2026,10.00', // line 3: identical to line 2
      'T9002,,Zero,01/09/2026,28/09/2026,0.00', // line 4
      'T9002,,Negative,01/09/2026,28/09/2026,-5.00', // line 5
      'T9002,,Backwards,28/09/2026,01/09/2026,5.00', // line 6
      'T9002,,No such day,31/02/2026,28/09/2026,5.00', // line 7
      ',HBC-00000,Nobody,,,5.00', // line 8: no award has this claim
      ',HBC-99001,Ended award,,,5.00', // line 9: ended before 30/09/2026
      ',HBC-99002,Future award,,,5.00', // line 10: starts after 30/09/2026
      ',HBC-88001,Two tenancies,,,5.00', // line 11
      'T9001,HBC-77001,Mismatch,,,5.00', // line 12: the claim belongs to T9003
      'T9003,hbc-77001,Agrees,,,5.00', // line 13: TID and claim agree
      'T9002,,Bad amount,,,five', // line 14
      'TX1,,Bad TID,,,5.00', // line 15
    );
    const res = await preview(line, 'rows.csv', file);
    expect(res.status).toBe(200);
    const report = res.body.report as Report;
    expect(report.counts).toEqual({ rows: 14, matched: 2, rejected: 12 });
    expect(report.rows.map((r) => [r.line, r.tenancyTid])).toEqual([
      [2, 'T9001'],
      [13, 'T9003'],
    ]);
    expect(report).toMatchObject({ totalPence: 1500, linePence: 45000, totalMismatch: true });
    const byLine = new Map<number, Report['errors']>();
    for (const e of report.errors) byLine.set(e.line, [...(byLine.get(e.line) ?? []), e]);
    expect([...byLine.keys()]).toEqual([3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 14, 15]);
    for (const [ln, errs] of byLine) expect(errs, `line ${ln}`).toHaveLength(1);
    expect(byLine.get(3)![0]).toMatchObject({ field: 'Amount', reason: 'Same as row 2' });
    expect(byLine.get(4)![0]).toMatchObject({ field: 'Amount', reason: 'must be more than zero' });
    expect(byLine.get(5)![0]!.field).toBe('Amount');
    expect(byLine.get(6)![0]).toMatchObject({ field: 'Period To', reason: 'is before Period From' });
    expect(byLine.get(7)![0]!.field).toBe('Period From');
    for (const ln of [8, 9, 10]) expect(byLine.get(ln)![0]).toMatchObject({ field: 'Claim Ref', reason: 'No tenancy for claim ref' });
    expect(byLine.get(11)![0]).toMatchObject({ field: 'Claim Ref', reason: 'Claim ref matches several tenancies' });
    expect(byLine.get(12)![0]).toMatchObject({ field: 'Claim Ref', reason: 'TID and claim ref point to different tenancies' });
    expect(byLine.get(14)![0]!.field).toBe('Amount');
    expect(byLine.get(15)![0]!.field).toBe('TID');

    // The same claim is in force on an earlier remittance date, and the preview says so.
    const earlier = await preview(line, 'earlier.csv', csv(',HBC-99001,Ended award,,,5.00'), { fields: { remittanceDate: '2026-05-01' } });
    expect(earlier.status).toBe(200);
    expect((earlier.body.report as Report).rows.map((r) => r.tenancyTid)).toEqual(['T9004']);
    expect(await snapshot()).toEqual(before);
  });

  it('11: BOM and alias headers are read; a National Insurance column is ignored and never stored or returned; commit writes the audit trail', async () => {
    const ni = 'QQ123456C';
    const line = await seedLine(30000, 'ALIAS AND NI');
    const file = Buffer.concat([
      Buffer.from('﻿'),
      Buffer.from(`Tenancy Ref,HB Ref,Claimant,National Insurance,Paid\nT9001,,Test Tenant1,${ni},100.00\nt9002,,Test Tenant2,${ni},200.00\n`),
    ]);
    const prev = await preview(line, 'alias.csv', file);
    expect(prev.status).toBe(200);
    expect((prev.body.report as Report).counts).toEqual({ rows: 2, matched: 2, rejected: 0 });
    expect(JSON.stringify(prev.body)).not.toContain(ni);

    const res = await commit(line, 'alias.csv', file, { fields: { payer: 'dwp_uc' } });
    expect(res.status).toBe(201);
    expect(JSON.stringify(res.body)).not.toContain(ni);
    const remittanceId = res.body.remittanceId as string;
    const detail = await request(app()).get(`/api/remittances/${remittanceId}`).set('Cookie', cookies.staff);
    expect(detail.status).toBe(200);
    expect(JSON.stringify(detail.body)).not.toContain(ni);
    expect(await count('remittance_lines WHERE raw_row::text LIKE $1', [`%${ni}%`])).toBe(0);
    expect(
      await count(
        'remittance_lines WHERE ni_hash IS NOT NULL',
      ),
    ).toBe(0);

    const { rows } = await pool.query<{ tid: string; payer: string; line_tid: string; amount: string }>(
      `SELECT t.tid, r.payer::text AS payer, lt.tid AS line_tid, r.amount::text AS amount
         FROM receipts r JOIN tenancies t ON t.id = r.tenancy_id
         JOIN remittance_lines l ON l.id = r.remittance_line_id JOIN tenancies lt ON lt.id = l.matched_tenancy_id
        WHERE r.bank_transaction_id = $1 ORDER BY t.tid`,
      [line],
    );
    expect(rows).toEqual([
      { tid: 'T9001', payer: 'dwp_uc', line_tid: 'T9001', amount: '100.00' },
      { tid: 'T9002', payer: 'dwp_uc', line_tid: 'T9002', amount: '200.00' },
    ]);
    const batch = await pool.query<{ source: string; file_sha256: string; file_name: string; bank_account_id: string }>(
      'SELECT b.source::text AS source, b.file_sha256, b.file_name, b.bank_account_id FROM remittance_advices ra JOIN import_batches b ON b.id = ra.import_batch_id WHERE ra.id = $1',
      [remittanceId],
    );
    expect(batch.rows[0]).toEqual({ source: 'remittance', file_sha256: sha(file), file_name: 'alias.csv', bank_account_id: bankId });
    expect(await count("audit_log WHERE table_name = 'remittance_lines' AND action = 'INSERT' AND changed_by = $1", [emails.accounts])).toBeGreaterThanOrEqual(2);
    expect(await count("audit_log WHERE table_name = 'receipts' AND action = 'INSERT' AND changed_by = $1", [emails.accounts])).toBeGreaterThanOrEqual(2);
  });

  it('12: two commits of one file at once import it once; a different file for a line that has receipts is refused', async () => {
    const line = await seedLine(20000, 'RACE LINE');
    const file = csv('T9001,,A,,,120.00', 'T9002,,B,,,80.00');
    const results = await Promise.all([commit(line, 'race.csv', file), commit(line, 'race.csv', file)]);
    expect(results.map((r) => r.status).sort()).toEqual([200, 201]);
    const ok = results.find((r) => r.status === 201)!;
    expect(results.find((r) => r.status === 200)!.body).toEqual({ alreadyImported: true, remittanceId: ok.body.remittanceId });
    expect(await count("receipts WHERE bank_transaction_id = $1 AND status = 'active'", [line])).toBe(2);
    expect(await count('remittance_advices WHERE bank_transaction_id = $1', [line])).toBe(1);

    const other = csv('T9001,,A,,,119.00', 'T9002,,B,,,81.00');
    const refused = await commit(line, 'other.csv', other);
    expect(refused.status).toBe(409);
    expect(refused.body.error.message).toBe('This line already has receipts; reverse them first');
    expect((await preview(line, 'other.csv', other)).status).toBe(409);
    expect(await count("receipts WHERE bank_transaction_id = $1 AND status = 'active'", [line])).toBe(2);
  });

  it('13: remittance receipts keep every allocation within their amount and the line stays exactly covered', async () => {
    const line = await seedLine(25000, 'COVERAGE');
    const today = (await pool.query<{ d: string }>('SELECT current_date::text AS d')).rows[0]!.d;
    await pool.query(
      `INSERT INTO rent_charges (tenancy_id, payer, period_start, period_end, due_date, amount, source)
       SELECT id, 'council_hb', $1::date, $1::date + 6, $1::date, 80.00, 'manual' FROM tenancies WHERE tid = 'T9004'`,
      [today],
    );
    const res = await commit(line, 'coverage.csv', csv('T9004,,A,,,100.00', 'T9003,,B,,,150.00'));
    expect(res.status).toBe(201);
    const allocated = await pool.query<{ allocated: string }>(
      'SELECT (coalesce(sum(a.amount), 0) * 100)::bigint AS allocated FROM allocations a JOIN receipts r ON r.id = a.receipt_id WHERE r.bank_transaction_id = $1',
      [line],
    );
    expect(Number(allocated.rows[0]!.allocated)).toBe(8000); // only the 80.00 charge exists; the other 20.00 is credit
    expect(await count('receipts r WHERE r.amount < coalesce((SELECT sum(a.amount) FROM allocations a WHERE a.receipt_id = r.id), 0)')).toBe(0);
    const covered = await pool.query<{ s: string }>("SELECT (sum(amount) * 100)::bigint AS s FROM receipts WHERE bank_transaction_id = $1 AND status = 'active'", [line]);
    expect(Number(covered.rows[0]!.s)).toBe(25000);
    expect((await pool.query('SELECT status::text AS status FROM bank_transactions WHERE id = $1', [line])).rows[0].status).toBe('matched');
  });

  it('14: after every receipt of a remittance is reversed, the same file or another can be uploaded to that line', async () => {
    const line = await seedLine(30000, 'REUPLOAD');
    const file = csv('T9001,,A,,,200.00', 'T9002,,B,,,100.00');
    const first = await commit(line, 'again.csv', file);
    expect(first.status).toBe(201);
    const ids = (await pool.query<{ id: string }>("SELECT id FROM receipts WHERE bank_transaction_id = $1 AND status = 'active'", [line])).rows;
    expect(ids).toHaveLength(2);
    for (const { id } of ids) {
      const rev = await request(app())
        .post(`/api/receipts/${id}/reverse`)
        .set('Cookie', cookies.accounts)
        .set(CSRF_HEADER, CSRF_HEADER_VALUE)
        .send({ reason: 'Wrong remittance' });
      expect(rev.status).toBe(200);
    }
    const again = await commit(line, 'again.csv', file);
    expect(again.status).toBe(201);
    expect(again.body.alreadyImported).toBe(false);
    expect(again.body.remittanceId).not.toBe(first.body.remittanceId);
    const sum = await pool.query<{ s: string }>("SELECT (sum(amount) * 100)::bigint AS s FROM receipts WHERE bank_transaction_id = $1 AND status = 'active'", [line]);
    expect(Number(sum.rows[0]!.s)).toBe(30000);
    expect(await count("receipts WHERE bank_transaction_id = $1 AND status = 'active'", [line])).toBe(2);
    // Same file again now is the idempotent answer for the new advice.
    const third = await commit(line, 'again.csv', file);
    expect(third.status).toBe(200);
    expect(third.body).toEqual({ alreadyImported: true, remittanceId: again.body.remittanceId });
  });

  const reverseAll = async (line: string) => {
    const ids = (await pool.query<{ id: string }>("SELECT id FROM receipts WHERE bank_transaction_id = $1 AND status = 'active'", [line])).rows;
    for (const { id } of ids) {
      const rev = await request(app()).post(`/api/receipts/${id}/reverse`).set('Cookie', cookies.accounts).set(CSRF_HEADER, CSRF_HEADER_VALUE).send({ reason: 'Wrong remittance' });
      expect(rev.status).toBe(200);
    }
    return ids.map((r) => r.id);
  };
  const advices = (line: string, where = '') => count(`remittance_advices WHERE bank_transaction_id = $1 ${where}`, [line]);

  it('15: a partial reversal keeps the advice in force; a full one supersedes it and frees the file for another line', async () => {
    const lineA = await seedLine(30000, 'SUPERSEDE A');
    const file = csv('T9001,,A,,,210.00', 'T9002,,B,,,90.00');
    const first = await commit(lineA, 'sup.csv', file);
    expect(first.status).toBe(201);
    const ids = (await pool.query<{ id: string }>("SELECT id FROM receipts WHERE bank_transaction_id = $1 ORDER BY amount DESC", [lineA])).rows;
    const one = await request(app()).post(`/api/receipts/${ids[0]!.id}/reverse`).set('Cookie', cookies.accounts).set(CSRF_HEADER, CSRF_HEADER_VALUE).send({ reason: 'Wrong remittance' });
    expect(one.status).toBe(200);
    expect(await advices(lineA, 'AND superseded_at IS NULL')).toBe(1);
    expect((await commit(lineA, 'sup.csv', file)).body).toEqual({ alreadyImported: true, remittanceId: first.body.remittanceId });
    const lineB = await seedLine(30000, 'SUPERSEDE B');
    expect((await commit(lineB, 'sup.csv', file)).status).toBe(409);   // still in force on line A

    await reverseAll(lineA);
    expect(await advices(lineA, 'AND superseded_at IS NOT NULL')).toBe(1);
    expect(await advices(lineA, 'AND superseded_at IS NULL')).toBe(0);
    const moved = await commit(lineB, 'sup.csv', file);
    expect(moved.status).toBe(201);
    expect(await count("receipts WHERE bank_transaction_id = $1 AND status = 'active'", [lineB])).toBe(2);
    expect(await count("receipts WHERE bank_transaction_id = $1 AND status = 'active'", [lineA])).toBe(0);
    // Line A's old advice is not offered any more.
    const detail = await request(app()).get(`/api/receipts/bank-lines/${lineA}`).set('Cookie', cookies.accounts);
    expect(detail.body.line.remittance).toBeNull();
  });

  it('16: after a full reversal and a hand split the line has receipts, so a remittance is refused; two re-uploads at once import once', async () => {
    const line = await seedLine(30000, 'RESPLIT');
    const file = csv('T9001,,A,,,220.00', 'T9002,,B,,,80.00');
    expect((await commit(line, 'resplit.csv', file)).status).toBe(201);
    await reverseAll(line);
    const split = await request(app())
      .post('/api/receipts/split')
      .set('Cookie', cookies.accounts)
      .set(CSRF_HEADER, CSRF_HEADER_VALUE)
      .send({ bankTransactionId: line, parts: [{ tid: 'T9003', payer: 'tenant', amountPence: 10000 }, { tid: 'T9004', payer: 'tenant', amountPence: 20000 }] });
    expect(split.status).toBe(200);
    const refused = await commit(line, 'resplit.csv', file);
    expect(refused.status).toBe(409);
    expect(refused.body.error.message).toBe('This line already has receipts; reverse them first');
    expect(await advices(line, 'AND superseded_at IS NULL')).toBe(0);
    // Reversing the hand receipts must not disturb the already-superseded advice.
    await reverseAll(line);
    expect(await advices(line)).toBe(1);

    const race = await Promise.all([commit(line, 'resplit.csv', file), commit(line, 'resplit.csv', file)]);
    expect(race.map((r) => r.status).sort()).toEqual([200, 201]);
    expect(await advices(line, 'AND superseded_at IS NULL')).toBe(1);
    expect(await count("receipts WHERE bank_transaction_id = $1 AND status = 'active'", [line])).toBe(2);
  });

  it('17: remittanceDate must be a real calendar date: a leap day is fine, 2025-02-29, 2026-1-5 and 2026-13-01 are 400', async () => {
    const line = await seedLine(5000, 'DATES');
    const file = csv('T9001,,A,,,50.00');
    expect((await preview(line, 'd.csv', file, { fields: { remittanceDate: '2024-02-29' } })).status).toBe(200);
    for (const d of ['2025-02-29', '2026-1-5', '2026-13-01', '2026-04-31', '2026-00-10', '']) {
      expect((await preview(line, 'd.csv', file, { fields: { remittanceDate: d } })).status, d).toBe(400);
    }
  });
});
