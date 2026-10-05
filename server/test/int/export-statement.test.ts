/**
 * Filled-in bank statement download end to end: CSV layout, one row per receipt (splits and reversals),
 * filters, formula escaping, privacy, Xero/Vico state, permissions, validation, row cap, audit.
 * Tenancies come from synthetic Veco rows through the real sync.
 */
import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createApp } from '../../src/api/app.js';
import { CSRF_HEADER, CSRF_HEADER_VALUE, SESSION_COOKIE } from '../../src/api/auth/middleware.js';
import { loadConfig } from '../../src/config/env.js';
import { actorDb } from '../../src/db/context.js';
import { createPool, type Pool } from '../../src/db/pool.js';
import { syncTenancies } from '../../src/jobs/veco-sync/sync.js';
import { createLogger } from '../../src/lib/logger.js';
import { upsertUser, type Role } from '../../src/services/auth.service.js';
import { BOM, STATEMENT_HEADER } from '../../src/services/export/statement-csv.js';
import { buildStatement, StatementFilter } from '../../src/services/export/statement.service.js';
import { vecoRows } from '../fixtures/veco-rows.js';

const PASSWORD = 'correct-horse-battery';
const config = loadConfig();
const logger = createLogger({ level: 'silent' });
const keys = { hashKey: config.hashKey, encryptionKey: config.encryptionKey };
const run = randomUUID().slice(0, 8);
let pool: Pool;
const cookies = {} as Record<Role, string>;
const emails = {} as Record<Role, string>;
let bankA = '';
let bankB = '';
const lines: Record<string, string> = {};
const RANGE = 'from=2026-03-01&to=2026-03-31';

const app = () => createApp({ config, pool, logger });

async function signIn(role: Role): Promise<string> {
  const email = `${role}-stmt-${run}@example.test`;
  emails[role] = email;
  await upsertUser(pool, { email, fullName: `Stmt ${role}`, role, password: PASSWORD });
  const res = await request(app()).post('/api/auth/login').set(CSRF_HEADER, CSRF_HEADER_VALUE).send({ email, password: PASSWORD });
  return (res.headers['set-cookie'] as unknown as string[]).find((c) => c.startsWith(`${SESSION_COOKIE}=`))!.split(';')[0]!;
}

const get = (path: string, role: Role = 'staff') => request(app()).get(path).set('Cookie', cookies[role]);
const post = (path: string, body: object, role: Role = 'accounts') =>
  request(app()).post(path).set('Cookie', cookies[role]).set(CSRF_HEADER, CSRF_HEADER_VALUE).send(body);
const tenancyId = async (tid: string) => (await pool.query<{ id: string }>('SELECT id FROM tenancies WHERE tid = $1', [tid])).rows[0]!.id;

async function seedLine(
  bank: string,
  date: string,
  pence: number,
  description: string,
  status: string,
  extra: { reason?: string; note?: string; last4?: string; sort?: string; hash?: string; niHash?: string; raw?: object } = {},
): Promise<string> {
  const batch = await pool.query<{ id: string }>(
    `INSERT INTO import_batches (source, bank_account_id, file_name, file_sha256, status)
     VALUES ('bank_csv', $1, $2, $3, 'parsed') RETURNING id`,
    [bank, `${randomUUID()}.csv`, randomUUID()],
  );
  const line = await pool.query<{ id: string }>(
    `INSERT INTO bank_transactions (bank_account_id, import_batch_id, txn_date, amount, description, raw_row, dedupe_key, status,
                                    exclusion_reason, note, payer_account_last4, payer_sort_code, payer_account_hash, extracted_ni_hash)
     VALUES ($1, $2, $3::date, ($4::bigint)::numeric / 100, $5, $6::jsonb, $7, $8::txn_status, $9, $10, $11, $12, $13, $14) RETURNING id`,
    [
      bank, batch.rows[0]!.id, date, pence, description, JSON.stringify(extra.raw ?? {}), randomUUID(), status,
      extra.reason ?? null, extra.note ?? null, extra.last4 ?? null, extra.sort ?? null, extra.hash ?? null, extra.niHash ?? null,
    ],
  );
  return line.rows[0]!.id;
}

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

type Rec = Record<(typeof STATEMENT_HEADER)[number], string>;
function records(text: string): Rec[] {
  const [, ...body] = parseCsv(text.slice(1));
  return body.map((r) => Object.fromEntries(STATEMENT_HEADER.map((h, i) => [h, r[i] ?? ''])) as Rec);
}
const csv = async (qs: string, role: Role = 'staff') => {
  const res = await get(`/api/export/statement.csv?${qs}`, role).buffer(true).parse((r, cb) => {
    let d = '';
    r.setEncoding('utf8');
    r.on('data', (c: string) => (d += c));
    r.on('end', () => cb(null, d));
  });
  return { res, text: res.body as string };
};
const exportsCount = async () => (await pool.query<{ n: number }>('SELECT count(*)::int AS n FROM statement_exports')).rows[0]!.n;

beforeAll(async () => {
  pool = createPool({ databaseUrl: config.databaseUrl, hashKey: config.hashKey, max: 4 }, logger);
  await pool.query(
    `TRUNCATE allocations, receipts, remittance_lines, remittance_advices, sync_outbox, external_refs, adjustments,
              match_suggestions, payer_bank_accounts, payment_references, bank_transactions, import_batches,
              bank_csv_profiles, bank_accounts, rent_charge_dirty, rent_charges, rent_schedules, tenancy_tenants,
              tenancies, tenants, property_units, properties, branches, statement_exports CASCADE`,
  );
  await syncTenancies(pool, vecoRows(6), { keys, force: true });
  for (const role of ['admin', 'accounts', 'staff', 'readonly'] as const) cookies[role] = await signIn(role);
  bankA = (await pool.query<{ id: string }>("INSERT INTO bank_accounts (code, bank_name, account_name) VALUES ('STA', 'Test Bank', 'Statement A') RETURNING id")).rows[0]!.id;
  bankB = (await pool.query<{ id: string }>("INSERT INTO bank_accounts (code, bank_name, account_name) VALUES ('STB', 'Test Bank', 'Statement B') RETURNING id")).rows[0]!.id;

  // L1: matched, one receipt (T9001).
  lines.matched = await seedLine(bankA, '2026-03-02', 10000, 'RENT T9001', 'needs_review');
  await pool.query("SELECT confirm_match($1, $2, 'tenant'::payer_type, 'manual', false, NULL, NULL)", [lines.matched, await tenancyId('T9001')]);
  // L2: split into three, third part reversed.
  lines.split = await seedLine(bankA, '2026-03-03', 100000, 'COUNCIL BULK', 'needs_review');
  const split = await post('/api/receipts/split', {
    bankTransactionId: lines.split,
    parts: [
      { tid: 'T9002', payer: 'tenant', amountPence: 30000 },
      { tid: 'T9003', payer: 'council_hb', amountPence: 50000 },
      { tid: 'T9004', payer: 'tenant', amountPence: 20000 },
    ],
  });
  expect(split.status).toBeLessThan(300);
  const third = (await pool.query<{ id: string }>(
    'SELECT r.id FROM receipts r JOIN tenancies t ON t.id = r.tenancy_id WHERE r.bank_transaction_id = $1 AND t.tid = $2',
    [lines.split, 'T9004'],
  )).rows[0]!.id;
  const rev = await post(`/api/receipts/${third}/reverse`, { reason: 'Wrong tenancy' });
  expect(rev.status).toBe(200);
  lines.reversedReceipt = third;

  lines.review = await seedLine(bankA, '2026-03-04', 7500, 'MYSTERY PAYMENT', 'needs_review', {
    note: 'Check with landlord',
    last4: '1234',
    sort: '401234',
    hash: 'acct-hash-secret',
    niHash: 'ni-hash-secret',
    raw: { ni: 'QQ123456C', sort: '401234' },
  });
  lines.excluded = await seedLine(bankA, '2026-03-05', 2000, 'TRANSFER', 'excluded', { reason: 'internal transfer' });
  lines.outgoing = await seedLine(bankA, '2026-03-06', -5000, 'SUPPLIER', 'excluded', { reason: 'money_out' });
  lines.otherBank = await seedLine(bankB, '2026-03-07', 1000, 'OTHER BANK', 'needs_review');
  lines.outOfRange = await seedLine(bankA, '2026-02-15', 1000, 'FEBRUARY', 'needs_review');
  lines.formula = await seedLine(bankA, '2026-03-10', 12345, '=HYPERLINK("x")', 'new');
  lines.comma = await seedLine(bankA, '2026-03-11', 12345, 'Smith, J "Jo"', 'new');
  lines.newline = await seedLine(bankA, '2026-03-12', 12345, 'LINE ONE\nLINE TWO', 'new');
});

afterAll(async () => {
  await pool?.end();
});

describe('statement download', () => {
  it('1: BOM first, header equals STATEMENT_HEADER, CRLF line ends', async () => {
    const { res, text } = await csv(RANGE);
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toContain('text/csv');
    expect(res.headers['content-disposition']).toBe('attachment; filename="statement_all_2026-03-01_2026-03-31.csv"');
    expect(text.charAt(0)).toBe(BOM);
    expect(text.slice(1).startsWith(STATEMENT_HEADER.join(',') + '\r\n')).toBe(true);
    expect(text.endsWith('\r\n')).toBe(true);
    expect(text.replace(/\r\n/g, '').includes('\n')).toBe(true); // only the quoted newline cell keeps a bare LF
    expect(parseCsv(text.slice(1))[0]).toEqual([...STATEMENT_HEADER]);
  });

  it('2: bank A and range: one row per receipt, split parts, reversed row, other statuses; other bank and range absent', async () => {
    const { text } = await csv(`bankAccountId=${bankA}&${RANGE}`);
    const recs = records(text);
    const byLine = (id: string) => recs.filter((r) => r['Line ID'] === id);

    const matched = byLine(lines.matched!);
    expect(matched).toHaveLength(1);
    expect(matched[0]).toMatchObject({
      Bank: 'STA', Account: 'Statement A', Date: '2026-03-02', Status: 'matched', Part: '1 of 1', TID: 'T9001',
      'Bank amount': '100.00', 'Receipt amount': '100.00', 'Receipt status': 'active', 'Left on line': '0.00', Payer: 'tenant',
    });
    expect(matched[0]!.Tenant).not.toBe('');
    expect(matched[0]!.Property).not.toBe('');
    expect(matched[0]!.Branch).not.toBe('');
    expect(['MG', 'RG', 'IRG']).toContain(matched[0]!['MG/RG']);

    const split = byLine(lines.split!);
    expect(split.map((r) => r.Part)).toEqual(['1 of 3', '2 of 3', '3 of 3']);
    expect(split.map((r) => r['Bank amount'])).toEqual(['1000.00', '', '']);
    expect(split.map((r) => r['Left on line'])).toEqual(['200.00', '', '']);
    expect(split.map((r) => r['Receipt status'])).toEqual(['active', 'active', 'reversed']);
    expect(split[2]).toMatchObject({ TID: 'T9004', 'Reversed reason': 'Wrong tenancy', 'Receipt amount': '200.00' });

    expect(byLine(lines.review!)).toEqual([expect.objectContaining({ Status: 'needs_review', Part: '', 'Bank amount': '75.00', Xero: '', Vico: '', Note: 'Check with landlord' })]);
    expect(byLine(lines.excluded!)).toEqual([expect.objectContaining({ Status: 'excluded', 'Exclusion reason': 'internal transfer' })]);
    expect(byLine(lines.outgoing!)).toEqual([expect.objectContaining({ Status: 'outgoing', 'Bank amount': '-50.00', 'Left on line': '-50.00' })]);
    expect(byLine(lines.otherBank!)).toHaveLength(0);
    expect(byLine(lines.outOfRange!)).toHaveLength(0);
    expect(recs.map((r) => r.Bank)).not.toContain('STB');
  });

  it('3: the status filter works on outcome (matched and outgoing)', async () => {
    const { text } = await csv(`bankAccountId=${bankA}&${RANGE}&status=matched,outgoing`);
    expect(records(text).map((r) => r['Line ID']).sort()).toEqual([lines.matched, lines.outgoing].sort());
  });

  it('4: formula-looking descriptions are neutralised, commas and quotes quoted, money exact', async () => {
    const { text } = await csv(`bankAccountId=${bankA}&${RANGE}&status=new`);
    expect(text).toContain(`"'=HYPERLINK(""x"")"`);
    expect(text).toContain('"Smith, J ""Jo"""');
    const recs = records(text);
    expect(recs).toHaveLength(3);
    expect(recs.find((r) => r['Line ID'] === lines.formula)).toMatchObject({ Description: `'=HYPERLINK("x")`, 'Bank amount': '123.45' });
    expect(recs.find((r) => r['Line ID'] === lines.newline)!.Description).toBe('LINE ONE\nLINE TWO');
    const out = records((await csv(`bankAccountId=${bankA}&${RANGE}&status=outgoing`)).text);
    expect(out[0]!['Bank amount']).toBe('-50.00');
  });

  it('5: sort code, account hash, NI hash and raw row never appear; the masked account does', async () => {
    const { text } = await csv(RANGE);
    for (const secret of ['401234', 'acct-hash-secret', 'ni-hash-secret', 'QQ123456C']) expect(text).not.toContain(secret);
    expect(records(text).find((r) => r['Line ID'] === lines.review)!['Payer account']).toBe('****1234');
  });

  it('6: Xero and Vico state come from external_refs and sync_outbox', async () => {
    const receiptId = (await pool.query<{ id: string }>('SELECT id FROM receipts WHERE bank_transaction_id = $1', [lines.matched])).rows[0]!.id;
    const batch = `b-${run}`;
    await pool.query("INSERT INTO external_refs (system, entity_type, entity_id, external_id, external_key2, last_synced_at) VALUES ('xero', 'receipt', $1, $2, $3, now())", [receiptId, `${batch}:${receiptId}`, batch]);
    await pool.query("INSERT INTO sync_outbox (system, entity_type, entity_id, op, payload, idempotency_key, status) VALUES ('xero', 'invoice', $1, 'upsert', '{}'::jsonb, $2, 'done')", [randomUUID(), `recon-inv:${batch}`]);
    await pool.query("INSERT INTO external_refs (system, entity_type, entity_id, external_id, external_key2, last_synced_at) VALUES ('vico', 'receipt', $1, $2, 'x', now())", [receiptId, `x:${receiptId}`]);
    const recs = records((await csv(`bankAccountId=${bankA}&${RANGE}`)).text);
    expect(recs.find((r) => r['Line ID'] === lines.matched)).toMatchObject({ Xero: 'sent', Vico: 'yes' });
    expect(recs.filter((r) => r['Line ID'] === lines.split).map((r) => [r.Xero, r.Vico])).toEqual([['none', 'no'], ['none', 'no'], ['none', 'no']]);
  });

  it('7: unauthenticated 401, readonly 403, staff and accounts 200', async () => {
    expect((await request(app()).get(`/api/export/statement.csv?${RANGE}`)).status).toBe(401);
    expect((await get(`/api/export/statement.csv?${RANGE}`, 'readonly')).status).toBe(403);
    expect((await get(`/api/export/statement/summary?${RANGE}`, 'readonly')).status).toBe(403);
    expect((await get(`/api/export/statement.csv?${RANGE}`, 'staff')).status).toBe(200);
    expect((await get(`/api/export/statement/summary?${RANGE}`, 'accounts')).status).toBe(200);
  });

  it('8: missing from, from after to, a span over 366 days, a bad status and an unknown bank are 400', async () => {
    const before = await exportsCount();
    for (const qs of [
      'to=2026-03-31',
      'from=2026-03-31&to=2026-03-01',
      'from=2025-01-01&to=2026-01-03',
      `${RANGE}&status=bogus`,
      `${RANGE}&bankAccountId=${randomUUID()}`,
      `${RANGE}&bankAccountId=not-a-uuid`,
      'from=2026-02-30&to=2026-03-31',
    ]) {
      expect((await get(`/api/export/statement.csv?${qs}`)).status, qs).toBe(400);
    }
    expect((await get('/api/export/statement/summary?from=2025-01-01&to=2026-01-03')).status).toBe(400);
    expect((await get(`/api/export/statement.csv?from=2025-03-01&to=2026-03-02`)).status).toBe(200); // exactly 366 days
    expect(await exportsCount()).toBe(before + 1);
  });

  it('9: over the row cap is refused with the count and writes no statement_exports row', async () => {
    const before = await exportsCount();
    const filter = StatementFilter.parse({ from: '2026-03-01', to: '2026-03-31' });
    await expect(buildStatement(actorDb(pool, emails.staff), filter, { maxRows: 2 })).rejects.toMatchObject({
      message: expect.stringMatching(/^This download has \d+ rows \(max 2\); narrow the dates or pick one bank$/),
    });
    expect(await exportsCount()).toBe(before);
  });

  it('10: a download writes statement_exports and an audit row naming the staff user', async () => {
    const before = await exportsCount();
    const { res, text } = await csv(`bankAccountId=${bankA}&${RANGE}&status=matched`);
    expect(res.headers['x-statement-rows']).toBe('1');
    expect(records(text)).toHaveLength(1);
    expect(await exportsCount()).toBe(before + 1);
    const row = (await pool.query<{ id: string; requested_by: string; row_count: number; statuses: string[]; bank_account_id: string }>(
      'SELECT id, requested_by, row_count, statuses, bank_account_id FROM statement_exports ORDER BY created_at DESC LIMIT 1',
    )).rows[0]!;
    expect(row).toMatchObject({ requested_by: emails.staff, row_count: 1, statuses: ['matched'], bank_account_id: bankA });
    const audit = await pool.query<{ changed_by: string; action: string }>(
      "SELECT changed_by, action FROM audit_log WHERE table_name = 'statement_exports' AND row_id = $1",
      [row.id],
    );
    expect(audit.rows).toEqual([{ changed_by: emails.staff, action: 'INSERT' }]);

    // An empty result is still a valid file and still audited.
    const empty = await csv('from=2020-01-01&to=2020-01-31');
    expect(empty.text).toBe(BOM + STATEMENT_HEADER.join(',') + '\r\n');
    expect(empty.res.headers['x-statement-rows']).toBe('0');
    expect(await exportsCount()).toBe(before + 2);
  });

  it('11: summary counts equal the CSV rows', async () => {
    const summary = (await get(`/api/export/statement/summary?${RANGE}`)).body as {
      lines: number;
      rows: number;
      byStatus: Record<string, number>;
    };
    const { res, text } = await csv(RANGE);
    const recs = records(text);
    expect(summary.rows).toBe(recs.length);
    expect(String(summary.rows)).toBe(res.headers['x-statement-rows']);
    expect(summary.lines).toBe(new Set(recs.map((r) => r['Line ID'])).size);
    const outcomes: Record<string, number> = {};
    for (const id of new Set(recs.map((r) => r['Line ID']))) {
      const s = recs.find((r) => r['Line ID'] === id)!.Status;
      outcomes[s] = (outcomes[s] ?? 0) + 1;
    }
    for (const [status, n] of Object.entries(outcomes)) expect(summary.byStatus[status]).toBe(n);
    // SUM(Bank amount) = statement total, because only part 1 carries it.
    const sum = recs.reduce((a, r) => a + (r['Bank amount'] ? Math.round(Number(r['Bank amount']) * 100) : 0), 0);
    const { rows } = await pool.query<{ s: string }>("SELECT (sum(amount) * 100)::bigint::text AS s FROM bank_transactions WHERE txn_date BETWEEN '2026-03-01' AND '2026-03-31'");
    expect(String(sum)).toBe(rows[0]!.s);
  });
});

describe('statement download: edge cases', () => {
  const MAY = 'from=2026-05-01&to=2026-05-31';
  const ids: Record<string, string> = {};
  const bytes = async (qs: string): Promise<Buffer> => {
    const res = await get(`/api/export/statement.csv?${qs}`)
      .buffer(true)
      .parse((r, cb) => {
        const chunks: Buffer[] = [];
        r.on('data', (c: Buffer) => chunks.push(c));
        r.on('end', () => cb(null, Buffer.concat(chunks)));
      });
    return res.body as Buffer;
  };

  beforeAll(async () => {
    ids.first = await seedLine(bankA, '2026-05-01', 1, 'FIRST DAY', 'new');
    ids.last = await seedLine(bankA, '2026-05-31', -1, 'LAST DAY', 'new');
    ids.before = await seedLine(bankA, '2026-04-30', 500, 'DAY BEFORE', 'new');
    ids.after = await seedLine(bankA, '2026-06-01', 500, 'DAY AFTER', 'new');
    ids.five = await seedLine(bankA, '2026-05-02', 5, 'FIVE PENCE', 'new');
    ids.big = await seedLine(bankA, '2026-05-02', 100001, 'BIG', 'new');
    ids.zero = await seedLine(bankA, '2026-05-03', 0, 'ZERO', 'excluded', { reason: 'zero' });
    ids.plus = await seedLine(bankA, '2026-05-04', 100, '+1 PLUS', 'new');
    ids.minus = await seedLine(bankA, '2026-05-04', 100, '-cmd MINUS', 'new');
    ids.at = await seedLine(bankA, '2026-05-04', 100, '@SUM(A1)', 'new');
    ids.tab = await seedLine(bankA, '2026-05-04', 100, '\tTABBED', 'new');
    ids.cr = await seedLine(bankA, '2026-05-04', 100, '\rCARRIAGE', 'new');
    ids.fields = await seedLine(bankA, '2026-05-05', 100, 'PLAIN', 'new', { note: '=NOTE()' });
    await pool.query("UPDATE bank_transactions SET reference = '@REF', counterparty = '+CPTY' WHERE id = $1", [ids.fields]);
    ids.otherNeeds = await seedLine(bankB, '2026-05-06', 100, 'B NEEDS', 'needs_review');
    ids.otherNew = await seedLine(bankB, '2026-05-06', 100, 'B NEW', 'new');
    ids.allReversed = await seedLine(bankA, '2026-05-07', 4000, 'REVERSED ONLY', 'needs_review');
    await pool.query("SELECT confirm_match($1, $2, 'tenant'::payer_type, 'manual', false, NULL, NULL)", [ids.allReversed, await tenancyId('T9005')]);
    const r = (await pool.query<{ id: string }>('SELECT id FROM receipts WHERE bank_transaction_id = $1', [ids.allReversed])).rows[0]!.id;
    expect((await post(`/api/receipts/${r}/reverse`, { reason: 'Mistake' })).status).toBe(200);
    // Injection through the tenant name and the receipt note, which come from joined tables.
    ids.joined = await seedLine(bankA, '2026-05-08', 2500, 'JOINED', 'needs_review');
    await pool.query("SELECT confirm_match($1, $2, 'tenant'::payer_type, 'manual', false, NULL, NULL)", [ids.joined, await tenancyId('T9006')]);
    await pool.query(
      "UPDATE tenants SET first_name = '=EVIL()', last_name = '' WHERE id = (SELECT tenant_id FROM tenancy_tenants WHERE tenancy_id = $1 AND is_lead AND left_on IS NULL)",
      [await tenancyId('T9006')],
    );
    await pool.query("UPDATE receipts SET notes = '@receipt-note' WHERE bank_transaction_id = $1", [ids.joined]);
  });

  it('date range is inclusive of both ends and excludes the days either side', async () => {
    const recs = records((await csv(`bankAccountId=${bankA}&${MAY}`)).text);
    const got = new Set(recs.map((r) => r['Line ID']));
    expect(got.has(ids.first!)).toBe(true);
    expect(got.has(ids.last!)).toBe(true);
    expect(got.has(ids.before!)).toBe(false);
    expect(got.has(ids.after!)).toBe(false);
    const day = records((await csv(`bankAccountId=${bankA}&from=2026-05-31&to=2026-05-31`)).text);
    expect(day.map((r) => r['Line ID'])).toEqual([ids.last]);
  });

  it('pence become pounds exactly, including 1p, 5p, negatives and zero', async () => {
    const recs = records((await csv(`bankAccountId=${bankA}&${MAY}`)).text);
    const amt = (k: string) => recs.find((r) => r['Line ID'] === ids[k])!['Bank amount'];
    expect(amt('first')).toBe('0.01');
    expect(amt('last')).toBe('-0.01');
    expect(amt('five')).toBe('0.05');
    expect(amt('big')).toBe('1000.01');
    expect(amt('zero')).toBe('0.00');
    expect(recs.find((r) => r['Line ID'] === ids.zero)!.Status).toBe('excluded');
    expect(recs.find((r) => r['Line ID'] === ids.last)!.Status).toBe('outgoing');
  });

  it('every formula lead character is neutralised in description, reference, counterparty, note, tenant and receipt note', async () => {
    const { text } = await csv(`bankAccountId=${bankA}&${MAY}`);
    const recs = records(text);
    const d = (k: string) => recs.find((r) => r['Line ID'] === ids[k])!.Description;
    expect(d('plus')).toBe("'+1 PLUS");
    expect(d('minus')).toBe("'-cmd MINUS");
    expect(d('at')).toBe("'@SUM(A1)");
    expect(d('tab')).toBe("'\tTABBED");
    expect(d('cr')).toBe("'\rCARRIAGE");
    const f = recs.find((r) => r['Line ID'] === ids.fields)!;
    expect(f).toMatchObject({ Reference: "'@REF", Counterparty: "'+CPTY", Note: "'=NOTE()" });
    const j = recs.find((r) => r['Line ID'] === ids.joined)!;
    expect(j.Tenant).toBe("'=EVIL()");
    expect(j.Note).toBe("'@receipt-note");
    for (const row of parseCsv(text.slice(1)).slice(1)) {
      for (const c of row) expect(/^[=+@\t\r]/.test(c) || (/^-/.test(c) && !/^-\d+\.\d\d$/.test(c)), c).toBe(false);
    }
  });

  it('the BOM is exactly EF BB BF once at the start and the body has no second BOM', async () => {
    const b = await bytes(`bankAccountId=${bankA}&${MAY}`);
    expect([...b.subarray(0, 3)]).toEqual([0xef, 0xbb, 0xbf]);
    expect(b.subarray(3).includes(Buffer.from([0xef, 0xbb, 0xbf]))).toBe(false);
    expect(b.subarray(3, 7).toString('utf8')).toBe('Bank');
  });

  it('bank, date and status filters combine', async () => {
    const bOnly = records((await csv(`bankAccountId=${bankB}&${MAY}&status=needs_review`)).text);
    expect(bOnly.map((r) => r['Line ID'])).toEqual([ids.otherNeeds]);
    const aNeeds = records((await csv(`bankAccountId=${bankA}&${MAY}&status=needs_review`)).text).map((r) => r['Line ID']);
    expect(aNeeds).toContain(ids.allReversed);
    expect(aNeeds).not.toContain(ids.otherNeeds);
    const all = records((await csv(`${MAY}&status=new`)).text).map((r) => r['Line ID']);
    expect(all).toContain(ids.otherNew);
    expect(all).toContain(ids.plus);
    expect(all).not.toContain(ids.otherNeeds);
    expect(all).not.toContain(ids.before);
    const union = records((await csv(`bankAccountId=${bankB}&${MAY}&status=new,needs_review`)).text).map((r) => r['Line ID']).sort();
    expect(union).toEqual([ids.otherNeeds, ids.otherNew].sort());
  });

  it('a line whose only receipt is reversed still appears once, with the full amount left', async () => {
    const rows = records((await csv(`bankAccountId=${bankA}&${MAY}`)).text).filter((r) => r['Line ID'] === ids.allReversed);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ Part: '1 of 1', 'Receipt status': 'reversed', 'Reversed reason': 'Mistake', 'Bank amount': '40.00', 'Left on line': '40.00' });
  });

  it('SUM(Bank amount) equals the bank line total for the filter over no-receipt lines, splits and reversals', async () => {
    for (const qs of [MAY, `bankAccountId=${bankA}&${MAY}`, RANGE, `bankAccountId=${bankA}&${RANGE}`, `${RANGE}&status=matched,outgoing,needs_review`]) {
      const recs = records((await csv(qs)).text);
      const sum = recs.reduce((a, r) => a + (r['Bank amount'] ? Math.round(Number(r['Bank amount']) * 100) : 0), 0);
      const p = new URLSearchParams(qs);
      const st = p.get('status')?.split(',') ?? null;
      const { rows } = await pool.query<{ s: string; n: number }>(
        `SELECT coalesce(sum(amount) * 100, 0)::bigint::text AS s, count(*)::int AS n FROM bank_transactions bt
          WHERE txn_date BETWEEN $1::date AND $2::date
            AND ($3::uuid IS NULL OR bank_account_id = $3)
            AND ($4::text[] IS NULL OR (CASE WHEN amount < 0 THEN 'outgoing' ELSE status::text END) = ANY($4))`,
        [p.get('from'), p.get('to'), p.get('bankAccountId'), st],
      );
      expect(String(sum), qs).toBe(rows[0]!.s);
      expect(new Set(recs.map((r) => r['Line ID'])).size, qs).toBe(rows[0]!.n);
      for (const id of new Set(recs.map((r) => r['Line ID']))) {
        const g = recs.filter((r) => r['Line ID'] === id);
        g.forEach((r, i) => {
          if (r.Part) expect(r.Part).toBe(`${i + 1} of ${g.length}`);
          expect(r['Bank amount'] !== '').toBe(i === 0);
        });
      }
    }
  });

  it('admin may download; the row cap boundary is inclusive and failures are not audited', async () => {
    expect((await get(`/api/export/statement.csv?${MAY}`, 'admin')).status).toBe(200);
    const filter = StatementFilter.parse({ bankAccountId: bankA, from: '2026-05-01', to: '2026-05-31' });
    const db = actorDb(pool, emails.accounts);
    const n = (await buildStatement(db, filter)).rows;
    const before = await exportsCount();
    expect((await buildStatement(db, filter, { maxRows: n })).rows).toBe(n);
    await expect(buildStatement(db, filter, { maxRows: n - 1 })).rejects.toMatchObject({ message: expect.stringContaining(`has ${n} rows`) });
    expect(await exportsCount()).toBe(before + 1);
    const last = (await pool.query<{ requested_by: string; statuses: string[] }>('SELECT requested_by, statuses FROM statement_exports ORDER BY created_at DESC LIMIT 1')).rows[0]!;
    expect(last).toEqual({ requested_by: emails.accounts, statuses: [] });
  });

  it('the file has no sort code, hash, raw row or NI-shaped value for any bank', async () => {
    const text = (await csv('from=2026-01-01&to=2026-12-31')).text;
    expect(text).not.toMatch(/[A-Z]{2}\d{6}[A-D]\b/);
    for (const secret of ['401234', 'acct-hash-secret', 'ni-hash-secret']) expect(text).not.toContain(secret);
  });
});
