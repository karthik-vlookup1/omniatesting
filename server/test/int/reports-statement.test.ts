/**
 * Tenant rent statement end to end: opening/closing per payer, running balances, receipts and
 * reversals, LetMC opening balances, CSV layout and formula escaping, PDF output, download log and audit,
 * validation and roles. Tenancies come from synthetic Veco rows through the real sync.
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
import { BOM } from '../../src/services/export/statement-csv.js';
import { buildTenantStatementPdf } from '../../src/services/reports/statement-pdf.js';
import { TENANT_STATEMENT_HEADER } from '../../src/services/reports/statement-csv.js';
import { getTenantStatement, StatementQuery } from '../../src/services/reports/statement.service.js';
import { vecoRows } from '../fixtures/veco-rows.js';

const PASSWORD = 'correct-horse-battery';
const config = loadConfig();
const logger = createLogger({ level: 'silent' });
const keys = { hashKey: config.hashKey, encryptionKey: config.encryptionKey };
const run = randomUUID().slice(0, 8);
const RANGE = 'from=2026-04-01&to=2026-06-10';
let pool: Pool;
const cookies = {} as Record<Role, string>;
const emails = {} as Record<Role, string>;

const app = () => createApp({ config, pool, logger });

async function signIn(role: Role): Promise<string> {
  const email = `${role}-rstmt-${run}@example.test`;
  emails[role] = email;
  await upsertUser(pool, { email, fullName: `RStmt ${role}`, role, password: PASSWORD });
  const res = await request(app()).post('/api/auth/login').set(CSRF_HEADER, CSRF_HEADER_VALUE).send({ email, password: PASSWORD });
  return (res.headers['set-cookie'] as unknown as string[]).find((c) => c.startsWith(`${SESSION_COOKIE}=`))!.split(';')[0]!;
}

const get = (path: string, role: Role = 'staff') => request(app()).get(path).set('Cookie', cookies[role]);
const tenancyId = async (tid: string) => (await pool.query<{ id: string }>('SELECT id FROM tenancies WHERE tid = $1', [tid])).rows[0]!.id;

const binary = (path: string, role: Role = 'staff') =>
  get(path, role)
    .buffer(true)
    .parse((r, cb) => {
      const chunks: Buffer[] = [];
      r.on('data', (c: Buffer) => chunks.push(c));
      r.on('end', () => cb(null, Buffer.concat(chunks)));
    });

/** Minimal RFC 4180 parser (quotes, doubled quotes, CRLF inside quoted cells). */
function parseCsv(text: string): string[][] {
  const out: string[][] = [];
  let row: string[] = [];
  let cur = '';
  let q = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i]!;
    if (q) {
      if (ch === '"' && text[i + 1] === '"') {
        cur += '"';
        i++;
      } else if (ch === '"') q = false;
      else cur += ch;
    } else if (ch === '"') q = true;
    else if (ch === ',') {
      row.push(cur);
      cur = '';
    } else if (ch === '\r' && text[i + 1] === '\n') {
      row.push(cur);
      out.push(row);
      row = [];
      cur = '';
      i++;
    } else cur += ch;
  }
  return out;
}

async function charge(tenancy: string, payer: string, pence: number, due: string, source = 'manual'): Promise<void> {
  await pool.query(
    `INSERT INTO rent_charges (tenancy_id, payer, period_start, period_end, due_date, amount, source)
     VALUES ($1, $2::payer_type, $3::date, $3::date + 29, $3::date, ($4::bigint)::numeric / 100, $5::charge_source)`,
    [tenancy, payer, due, pence, source],
  );
}

/** The text drawn on an uncompressed PDF: pdfkit writes each string as hex pieces inside a TJ array. */
function pdfText(buf: Buffer): string {
  const out: string[] = [];
  for (const m of buf.toString('latin1').matchAll(/\[([^\]]*)\] TJ/g)) {
    out.push([...m[1]!.matchAll(/<([0-9a-f]*)>/g)].map((h) => Buffer.from(h[1]!, 'hex').toString('latin1')).join(''));
  }
  return out.join('\n');
}

const reportRows = async () => (await pool.query<{ n: number }>('SELECT count(*)::int AS n FROM report_downloads')).rows[0]!.n;

interface Stmt {
  tenancy: Record<string, unknown>;
  payers: { payer: string; label: string; openingPence: number; closingPence: number; lines: Record<string, unknown>[] }[];
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

  const X = await tenancyId('T9001');
  const W = await tenancyId('T9004');
  const Z = await tenancyId('T9003');
  await pool.query('UPDATE tenancies SET charges_from = $2::date WHERE id = ANY($1::uuid[])', [[X, W], '2026-02-01']);
  await pool.query('UPDATE tenancies SET charges_from = NULL WHERE id = $1', [Z]);

  const bank = (await pool.query<{ id: string }>("INSERT INTO bank_accounts (code, bank_name, account_name) VALUES ('RSA', 'Test Bank', 'RStmt A') RETURNING id")).rows[0]!.id;
  const b = (
    await pool.query<{ id: string }>(
      "INSERT INTO import_batches (source, bank_account_id, file_name, file_sha256, status) VALUES ('bank_csv', $1, 'x.csv', $2, 'parsed') RETURNING id",
      [bank, randomUUID()],
    )
  ).rows[0]!.id;
  const bt = (
    await pool.query<{ id: string }>(
      `INSERT INTO bank_transactions (bank_account_id, import_batch_id, txn_date, amount, description, raw_row, dedupe_key, status)
       VALUES ($1, $2, '2026-05-25', 150, 'RENT', '{}'::jsonb, $3, 'matched') RETURNING id`,
      [bank, b, randomUUID()],
    )
  ).rows[0]!.id;

  for (const due of ['2026-02-15', '2026-04-20', '2026-05-20', '2026-06-20']) await charge(X, 'tenant', 10000, due);
  await pool.query(
    `INSERT INTO receipts (bank_transaction_id, tenancy_id, payer, amount, received_on, matched_via)
     VALUES ($1, $2, 'tenant', 150, '2026-05-25', 'tid_in_reference')`,
    [bt, X],
  );
  await pool.query(
    `INSERT INTO receipts (tenancy_id, payer, amount, received_on, matched_via, status, reversed_reason, reversed_at)
     VALUES ($1, 'tenant', 500, '2026-05-01', 'manual', 'reversed', 'Paid in error', '2026-05-03 12:00+01')`,
    [X],
  );
  await charge(X, 'council_hb', 20000, '2026-01-10');
  await pool.query(
    "INSERT INTO adjustments (tenancy_id, payer, kind, amount, effective_on, reason) VALUES ($1, 'council_hb', 'write_off', -50, '2026-02-01', 'Test write-off')",
    [X],
  );

  // W: LetMC opening balance charge, an opening credit, and a formula-looking adjustment reason.
  await charge(W, 'other_third_party', 30000, '2026-03-31', 'opening_balance');
  await pool.query(
    `INSERT INTO adjustments (tenancy_id, payer, kind, amount, effective_on, reason) VALUES
       ($1, 'dwp_uc', 'opening_balance', -25, '2026-03-31', 'LetMC opening credit'),
       ($1, 'dwp_uc', 'correction', 10, '2026-04-15', '=1+1')`,
    [W],
  );
});

afterAll(async () => {
  await pool?.end();
});

describe('tenant statement (JSON)', () => {
  it('1: opening, lines with running balance, reversal, closing per payer, in payer order', async () => {
    const res = await get(`/api/reports/statement/T9001?${RANGE}`);
    expect(res.status).toBe(200);
    const s = res.body as Stmt;
    expect(s.tenancy).toMatchObject({ tid: 'T9001', chargesFrom: '2026-02-01' });
    expect(s.tenancy.tenant).toBeTruthy();
    expect(s.tenancy.propertyRef).toBeTruthy();
    expect(s.tenancy.branch).toBeTruthy();
    expect(s.payers.map((p) => p.payer)).toEqual(['tenant', 'council_hb']);

    const t = s.payers[0]!;
    expect(t).toMatchObject({ label: 'Tenant', openingPence: 10000, closingPence: 15000 });
    expect(t.lines.map((l) => [l.date, l.type, l.balancePence])).toEqual([
      ['2026-04-20', 'Rent charge', 20000],
      ['2026-05-01', 'Payment', -30000],
      ['2026-05-03', 'Reversal', 20000],
      ['2026-05-20', 'Rent charge', 30000],
      ['2026-05-25', 'Payment', 15000],
    ]);
    expect(t.lines[0]).toMatchObject({ description: 'Rent 2026-04-20 to 2026-05-19', debitPence: 10000, creditPence: null });
    expect(t.lines[1]).toMatchObject({ description: 'Payment received', debitPence: null, creditPence: 50000 });
    expect(t.lines[2]).toMatchObject({ description: 'Payment reversed: Paid in error', debitPence: 50000 });
    expect(t.lines[4]).toMatchObject({ description: 'Payment received (RSA 2026-05-25)', creditPence: 15000 });

    const c = s.payers[1]!;
    expect(c).toMatchObject({ label: 'Council (HB)', openingPence: 15000, closingPence: 15000 });
    expect(c.lines).toEqual([]);
  });

  it('2: the closing balance equals the dashboard balance for the same day', async () => {
    const s = (await get(`/api/reports/statement/T9001?${RANGE}`)).body as Stmt;
    const d = (await get('/api/reports/dashboard?date=2026-06-10')).body as { balances: { payer: string; arrearsPence: number }[] };
    expect(d.balances.find((r) => r.payer === 'tenant')!.arrearsPence).toBe(s.payers[0]!.closingPence);
  });

  it('3: opening balances from LetMC are described as such; a `from` before the charges starts at zero', async () => {
    const s = (await get('/api/reports/statement/T9004?from=2026-01-01&to=2026-06-10')).body as Stmt;
    const other = s.payers.find((p) => p.payer === 'other_third_party')!;
    expect(other).toMatchObject({ openingPence: 0, closingPence: 30000 });
    expect(other.lines[0]).toMatchObject({ description: 'Opening balance from LetMC', debitPence: 30000 });
    const dwp = s.payers.find((p) => p.payer === 'dwp_uc')!;
    expect(dwp.lines.map((l) => [l.description, l.balancePence])).toEqual([
      ['Opening credit from LetMC', -2500],
      ['correction: =1+1', -1500],
    ]);
  });

  it('4: a payer whose events are all after `to` is left out', async () => {
    const s = (await get('/api/reports/statement/T9001?from=2026-01-01&to=2026-01-31')).body as Stmt;
    expect(s.payers.map((p) => p.payer)).toEqual(['council_hb']);
  });

  it('5: JSON previews write nothing to the download log', async () => {
    const before = await reportRows();
    await get(`/api/reports/statement/T9001?${RANGE}`);
    expect(await reportRows()).toBe(before);
  });
});

describe('tenant statement (CSV)', () => {
  it('6: BOM, header, CRLF, Opening and Closing rows, escaped formulas, exact money', async () => {
    const res = await binary(`/api/reports/statement/T9004/csv?from=2026-03-01&to=2026-06-10`);
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toContain('text/csv');
    expect(res.headers['content-disposition']).toBe('attachment; filename="rent_statement_T9004_2026-03-01_2026-06-10.csv"');
    const text = (res.body as Buffer).toString('utf8');
    expect(text.charAt(0)).toBe(BOM);
    expect(text.endsWith('\r\n')).toBe(true);
    const rows = parseCsv(text.slice(1));
    expect(rows[0]).toEqual([...TENANT_STATEMENT_HEADER]);
    const dwp = rows.filter((r) => r[3] === 'DWP (UC)');
    expect(dwp.map((r) => r[5])).toEqual(['Opening balance', 'Adjustment', 'Adjustment', 'Closing balance']);
    expect(dwp[1]!.slice(4)).toEqual(['2026-03-31', 'Adjustment', 'Opening credit from LetMC', '', '25.00', '-25.00']);
    expect(dwp[2]![6]).toBe('correction: =1+1');
    expect(dwp[3]![9]).toBe('-15.00');
    expect(res.headers['x-statement-rows']).toBe(String(rows.filter((r) => ['Adjustment', 'Rent charge', 'Payment', 'Reversal'].includes(r[5]!)).length));
  });

  it('7: a tenant name or property that starts with a formula character is neutralised; payments are credits', async () => {
    await pool.query(
      "UPDATE tenants SET first_name = '=EVIL()', last_name = '' WHERE id = (SELECT tenant_id FROM tenancy_tenants WHERE tenancy_id = $1 AND is_lead AND left_on IS NULL)",
      [await tenancyId('T9004')],
    );
    const w = ((await binary('/api/reports/statement/T9004/csv?from=2026-03-01&to=2026-06-10')).body as Buffer).toString('utf8');
    expect(parseCsv(w.slice(1))[1]![1]).toBe("'=EVIL()");
    const t = ((await binary(`/api/reports/statement/T9001/csv?${RANGE}`)).body as Buffer).toString('utf8');
    const rows = parseCsv(t.slice(1));
    expect(rows.find((r) => r[5] === 'Payment')![8]).toBe('500.00');
    expect(rows.find((r) => r[5] === 'Reversal')![7]).toBe('500.00');
  });
});

describe('tenant statement (PDF)', () => {
  it('8: starts with %PDF-, ends with %%EOF and carries the title', async () => {
    const res = await binary(`/api/reports/statement/T9001/pdf?${RANGE}`);
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toBe('application/pdf');
    expect(res.headers['content-disposition']).toBe('attachment; filename="rent_statement_T9001_2026-04-01_2026-06-10.pdf"');
    const buf = res.body as Buffer;
    expect(buf.subarray(0, 5).toString('latin1')).toBe('%PDF-');
    expect(buf.subarray(-8).toString('latin1')).toContain('%%EOF');
    const text = buf.toString('latin1');
    const title = 'Rent statement T9001 2026-04-01 to 2026-06-10';
    const hex = Buffer.from('﻿' + title, 'utf16le').swap16().toString('hex');
    expect(text.includes(title) || text.toLowerCase().includes(hex)).toBe(true);
  });

  it('9: an uncompressed build contains the statement text, and many lines make several pages', async () => {
    const s = await getTenantStatement(pool, 'T9001', StatementQuery.parse({ from: '2026-04-01', to: '2026-06-10' }));
    const plain = pdfText(await buildTenantStatementPdf(s, { compress: false }));
    for (const t of ['T9001', 'Opening balance', 'Closing balance', 'Payment reversed: Paid in error', 'by Omnia Recon']) expect(plain).toContain(t);
    expect(plain).toContain('\xa3150.00'); // the pound sign in WinAnsi

    const lines = Array.from({ length: 120 }, (_, i) => ({
      date: '2026-05-01', type: 'Rent charge' as const, description: `Line ${i}`, debitPence: 100, creditPence: null, balancePence: 100 * (i + 1),
    }));
    const big = { ...s, payers: [{ ...s.payers[0]!, lines }] };
    const pages = (await buildTenantStatementPdf(big, { compress: false })).toString('latin1').match(/\/Type \/Page\b/g) ?? [];
    expect(pages.length).toBeGreaterThanOrEqual(3);
  });
});

describe('download log and permissions', () => {
  it('10: each CSV and PDF download writes one report_downloads row and an audit row', async () => {
    const before = await reportRows();
    const csv = await binary(`/api/reports/statement/T9001/csv?${RANGE}`);
    expect(csv.headers['x-statement-rows']).toBe('5');
    expect(await reportRows()).toBe(before + 1);
    await binary(`/api/reports/statement/T9001/pdf?${RANGE}`);
    expect(await reportRows()).toBe(before + 2);
    const rows = (
      await pool.query<{ id: string; format: string; row_count: number; requested_by: string; tid: string; date_from: string }>(
        "SELECT id, format, row_count, requested_by, tid, to_char(date_from, 'YYYY-MM-DD') AS date_from FROM report_downloads ORDER BY created_at DESC LIMIT 2",
      )
    ).rows;
    expect(rows.map((r) => r.format).sort()).toEqual(['csv', 'pdf']);
    for (const r of rows) expect(r).toMatchObject({ row_count: 5, requested_by: emails.staff, tid: 'T9001', date_from: '2026-04-01' });
    const audit = await pool.query<{ changed_by: string; action: string }>(
      "SELECT changed_by, action FROM audit_log WHERE table_name = 'report_downloads' AND row_id = ANY($1::uuid[])",
      [rows.map((r) => r.id)],
    );
    expect(audit.rows).toEqual([
      { changed_by: emails.staff, action: 'INSERT' },
      { changed_by: emails.staff, action: 'INSERT' },
    ]);
  });

  it('11: unknown TID 404, no rent account 409, bad ranges 400', async () => {
    const before = await reportRows();
    const unknown = await get(`/api/reports/statement/T0000?${RANGE}`);
    expect(unknown.status).toBe(404);
    expect(unknown.body.error.message).toBe('Unknown TID T0000');
    const none = await get(`/api/reports/statement/T9003?${RANGE}`);
    expect(none.status).toBe(409);
    expect(none.body.error.message).toBe('T9003 has no rent account yet; set its rent first');
    for (const qs of [
      'from=2026-06-10&to=2026-04-01',
      'from=2026-04-01&to=2999-01-01',
      'from=2020-01-01&to=2025-01-02', // 1828 days
      'from=2026-04-01',
      'to=2026-06-10',
      'from=2026-02-30&to=2026-06-10',
      `${RANGE}&extra=1`,
    ]) {
      for (const suffix of ['', '/csv', '/pdf']) expect((await get(`/api/reports/statement/T9001${suffix}?${qs}`)).status, qs + suffix).toBe(400);
    }
    expect((await get('/api/reports/statement/T9001?from=2020-01-01&to=2025-01-01')).status).toBe(200); // 1827 days
    expect(await reportRows()).toBe(before);
  });

  it('12: unauthenticated is 401 and read-only is 403 on all three routes; accounts and admin are allowed', async () => {
    for (const suffix of ['', '/csv', '/pdf']) {
      expect((await request(app()).get(`/api/reports/statement/T9001${suffix}?${RANGE}`)).status).toBe(401);
      expect((await get(`/api/reports/statement/T9001${suffix}?${RANGE}`, 'readonly')).status).toBe(403);
    }
    expect((await get(`/api/reports/statement/T9001?${RANGE}`, 'accounts')).status).toBe(200);
    expect((await get(`/api/reports/statement/T9001?${RANGE}`, 'admin')).status).toBe(200);
  });

  it('13: no NI, sort code or account number appears in the statement', async () => {
    const text = ((await binary(`/api/reports/statement/T9001/csv?${RANGE}`)).body as Buffer).toString('utf8');
    expect(text).not.toMatch(/AB\d{6}C/);
    expect(JSON.stringify((await get(`/api/reports/statement/T9001?${RANGE}`)).body)).not.toMatch(/AB\d{6}C|sort|hash|last4/i);
  });
});
