/**
 * recon-101 edge cases and failure paths: LIKE escaping, postcode normalisation, full sort code /
 * account number rejection, 404 on bad ids, 409 duplicates, FK 400s, roles, anonymous access,
 * and ingest routes still working behind the bank-accounts admin router.
 */
import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createApp } from '../../src/api/app.js';
import { CSRF_HEADER, CSRF_HEADER_VALUE, SESSION_COOKIE } from '../../src/api/auth/middleware.js';
import { loadConfig } from '../../src/config/env.js';
import { createPool, type Pool } from '../../src/db/pool.js';
import { createLogger } from '../../src/lib/logger.js';
import { upsertUser, type Role } from '../../src/services/auth.service.js';

const PASSWORD = 'correct-horse-battery';
const config = loadConfig();
const logger = createLogger({ level: 'silent' });
const run = randomUUID().slice(0, 8).toUpperCase();
let pool: Pool;
const cookies = {} as Record<Role, string>;
const emails = {} as Record<Role, string>;
const app = () => createApp({ config, pool, logger });

async function signIn(role: Role): Promise<string> {
  const email = `${role}-edge-${run.toLowerCase()}@example.test`;
  emails[role] = email;
  await upsertUser(pool, { email, fullName: `Edge ${role}`, role, password: PASSWORD });
  const res = await request(app()).post('/api/auth/login').set(CSRF_HEADER, CSRF_HEADER_VALUE).send({ email, password: PASSWORD });
  const raw = res.headers['set-cookie'] as unknown as string[];
  return raw.find((c) => c.startsWith(`${SESSION_COOKIE}=`))!.split(';')[0]!;
}

const get = (path: string, role: Role) => request(app()).get(path).set('Cookie', cookies[role]);
const send = (method: 'post' | 'patch', path: string, role: Role, body: object) =>
  request(app())[method](path).set('Cookie', cookies[role]).set(CSRF_HEADER, CSRF_HEADER_VALUE).send(body);

const branchCode = `E${run}`;
const bankCode = `EB_${run}`;
let branchId = '';
let bankId = '';
let landlordId = '';
let propA = '';
let propB = '';

const baseProp = (ref: string, extra: object = {}) => ({
  propertyRef: ref,
  branchId,
  addressLine1: '1 Edge Street',
  postcode: 'SW1A 1AA',
  ...extra,
});

beforeAll(async () => {
  pool = createPool({ databaseUrl: config.databaseUrl, hashKey: config.hashKey, max: 4 }, logger);
  for (const role of ['admin', 'accounts', 'staff', 'readonly'] as const) cookies[role] = await signIn(role);
  branchId = (await send('post', '/api/branches', 'admin', { code: branchCode, name: `Edge ${run}` })).body.id;
  bankId = (await send('post', '/api/bank-accounts', 'admin', { code: bankCode, bankName: 'Edge Bank', accountName: 'Edge' })).body.id;
  landlordId = (await send('post', '/api/landlords', 'staff', { landlordRef: `EL-${run}`, name: `Edge LL ${run}` })).body.id;
});

afterAll(async () => {
  await pool?.end();
});

describe('anonymous and role access', () => {
  it('rejects anonymous reads with 401', async () => {
    for (const p of ['/api/branches', '/api/landlords', '/api/properties', `/api/bank-accounts/${bankId}`]) {
      expect((await request(app()).get(p)).status).toBe(401);
    }
  });

  it('forbids non-admins on bank account detail and create; accounts/staff cannot write branches', async () => {
    for (const role of ['accounts', 'staff', 'readonly'] as const) {
      expect((await get(`/api/bank-accounts/${bankId}`, role)).status).toBe(403);
      expect((await send('post', '/api/bank-accounts', role, { code: `ZZ_${run}`, bankName: 'B', accountName: 'A' })).status).toBe(403);
    }
    expect((await send('post', '/api/branches', 'accounts', { code: `Q${run}`, name: 'N' })).status).toBe(403);
    expect((await send('patch', `/api/branches/${branchId}`, 'staff', { name: 'N' })).status).toBe(403);
  });

  it('lets accounts write landlords and properties, but not readonly', async () => {
    expect((await send('post', '/api/landlords', 'accounts', { name: `Acc LL ${run}` })).status).toBe(201);
    expect((await send('post', '/api/landlords', 'readonly', { name: 'Nope' })).status).toBe(403);
    expect((await send('patch', `/api/landlords/${landlordId}`, 'readonly', { name: 'Nope' })).status).toBe(403);
  });

  it('requires the CSRF header on every write route', async () => {
    const noCsrf = (m: 'post' | 'patch', p: string, b: object) => request(app())[m](p).set('Cookie', cookies.admin).send(b);
    expect((await noCsrf('post', '/api/branches', { code: 'NOPE', name: 'x' })).status).toBe(403);
    expect((await noCsrf('post', '/api/bank-accounts', { code: 'NOPE', bankName: 'x', accountName: 'y' })).status).toBe(403);
    expect((await noCsrf('post', '/api/landlords', { name: 'x' })).status).toBe(403);
    expect((await noCsrf('patch', `/api/branches/${branchId}`, { name: 'x' })).status).toBe(403);
  });
});

describe('ingest routes survive the bank-accounts admin router', () => {
  it('still serves GET / to any signed-in role and POST /defaults to admin only', async () => {
    const list = await get('/api/bank-accounts', 'readonly');
    expect(list.status).toBe(200);
    expect(list.body.bankAccounts.some((b: { id: string }) => b.id === bankId)).toBe(true);
    expect((await send('post', '/api/bank-accounts/defaults', 'accounts', {})).status).toBe(403);
    expect((await send('post', '/api/bank-accounts/defaults', 'admin', {})).status).toBe(200);
  });

  it('still accepts the ingest create body (code, bankName, accountName only)', async () => {
    const res = await send('post', '/api/bank-accounts', 'admin', { code: `IN_${run}`, bankName: 'Ingest Bank', accountName: 'Ingest' });
    expect(res.status).toBe(201);
  });
});

describe('bank account: never full sort codes or account numbers', () => {
  it.each([
    ['sort code with dashes', { sortCodeLast2: '12-34-56' }],
    ['six-digit sort code', { sortCodeLast2: '123456' }],
    ['one-digit sort code', { sortCodeLast2: '1' }],
    ['full eight-digit account number', { accountLast4: '12345678' }],
    ['three-digit account fragment', { accountLast4: '123' }],
    ['non-digit account fragment', { accountLast4: 'abcd' }],
    ['unknown key sortCode', { sortCode: '123456' }],
    ['unknown key accountNumber', { accountNumber: '12345678' }],
    ['unknown key iban', { iban: 'GB00TEST00000000000000' }],
  ])('rejects %s on create', async (_n, extra) => {
    const res = await send('post', '/api/bank-accounts', 'admin', { code: `RJ_${run}`, bankName: 'B', accountName: 'A', ...extra });
    expect(res.status).toBe(400);
    const { rows } = await pool.query('SELECT 1 FROM bank_accounts WHERE code = $1', [`RJ_${run}`]);
    expect(rows).toHaveLength(0);
  });

  it.each([
    ['full sort code', { sortCodeLast2: '123456' }],
    ['full account number', { accountLast4: '12345678' }],
    ['unknown key accountNumber', { accountNumber: '12345678' }],
    ['immutable code', { code: 'OTHER' }],
  ])('rejects %s on patch and leaves the row unchanged', async (_n, body) => {
    expect((await send('patch', `/api/bank-accounts/${bankId}`, 'admin', body)).status).toBe(400);
    const { rows } = await pool.query<{ sort_code_last2: string | null; account_last4: string | null; code: string }>(
      'SELECT code, sort_code_last2, account_last4 FROM bank_accounts WHERE id = $1',
      [bankId],
    );
    expect(rows[0]!.code).toBe(bankCode);
    expect(rows[0]!.sort_code_last2 ?? '').not.toMatch(/\d{3,}/);
    expect(rows[0]!.account_last4 ?? '').not.toMatch(/\d{5,}/);
  });

  it('accepts last digits, clears them with null, and stores the code uppercase', async () => {
    const ok = await send('patch', `/api/bank-accounts/${bankId}`, 'admin', { sortCodeLast2: '56', accountLast4: '7890', xeroAccountId: 'xero-1' });
    expect(ok.status).toBe(200);
    expect(ok.body.bankAccount).toMatchObject({ sortCodeLast2: '56', accountLast4: '7890', xeroAccountId: 'xero-1' });
    const cleared = await send('patch', `/api/bank-accounts/${bankId}`, 'admin', { sortCodeLast2: null, accountLast4: null });
    expect(cleared.body.bankAccount).toMatchObject({ sortCodeLast2: null, accountLast4: null });
    const lower = await send('post', '/api/bank-accounts', 'admin', { code: `lo_${run.toLowerCase()}`, bankName: 'B', accountName: 'A' });
    const { rows } = await pool.query('SELECT code FROM bank_accounts WHERE id = $1', [lower.body.id]);
    expect(rows[0].code).toBe(`LO_${run}`);
  });

  it('409 on duplicate code, 400 on bad code, 400 on empty patch, 404 on bad or unknown id', async () => {
    expect((await send('post', '/api/bank-accounts', 'admin', { code: bankCode.toLowerCase(), bankName: 'B', accountName: 'A' })).status).toBe(409);
    expect((await send('post', '/api/bank-accounts', 'admin', { code: 'a', bankName: 'B', accountName: 'A' })).status).toBe(400);
    expect((await send('post', '/api/bank-accounts', 'admin', { code: 'has space', bankName: 'B', accountName: 'A' })).status).toBe(400);
    expect((await send('post', '/api/bank-accounts', 'admin', { code: `NN_${run}`, bankName: '   ', accountName: 'A' })).status).toBe(400);
    expect((await send('patch', `/api/bank-accounts/${bankId}`, 'admin', {})).status).toBe(400);
    expect((await get('/api/bank-accounts/not-a-uuid', 'admin')).status).toBe(404);
    expect((await get(`/api/bank-accounts/${randomUUID()}`, 'admin')).status).toBe(404);
    expect((await send('patch', '/api/bank-accounts/not-a-uuid', 'admin', { isActive: true })).status).toBe(404);
    expect((await send('patch', `/api/bank-accounts/${randomUUID()}`, 'admin', { isActive: true })).status).toBe(404);
  });

  it('audits the bank account insert and update as the admin', async () => {
    const { rows } = await pool.query<{ action: string; changed_by: string }>(
      'SELECT action, changed_by FROM audit_log WHERE table_name = $1 AND row_id = $2',
      ['bank_accounts', bankId],
    );
    expect(rows.map((r) => r.action)).toContain('INSERT');
    expect(rows.map((r) => r.action)).toContain('UPDATE');
    expect(rows.every((r) => r.changed_by === emails.admin)).toBe(true);
  });
});

describe('branches: validation and ids', () => {
  it.each([
    ['too short code', { code: 'A', name: 'N' }],
    ['code with underscore', { code: 'AB_C', name: 'N' }],
    ['code too long', { code: 'ABCDEFGHIJK', name: 'N' }],
    ['blank name', { code: `V${run}`, name: '  ' }],
    ['unknown key', { code: `V${run}`, name: 'N', extra: 1 }],
  ])('400 on %s', async (_n, body) => {
    expect((await send('post', '/api/branches', 'admin', body)).status).toBe(400);
  });

  it('404 on bad or unknown id, 400 on empty patch, trims names', async () => {
    expect((await send('patch', '/api/branches/not-a-uuid', 'admin', { name: 'x' })).status).toBe(404);
    expect((await send('patch', `/api/branches/${randomUUID()}`, 'admin', { name: 'x' })).status).toBe(404);
    expect((await send('patch', `/api/branches/${branchId}`, 'admin', {})).status).toBe(400);
    const res = await send('patch', `/api/branches/${branchId}`, 'admin', { name: `  Edge ${run}  `, xeroTrackingOption: null });
    expect(res.body.branch).toMatchObject({ name: `Edge ${run}`, xeroTrackingOption: null });
  });

  it('matches % and _ literally in search', async () => {
    const code = `P${run.slice(0, 6)}`;
    await send('post', '/api/branches', 'admin', { code, name: `Pct 100%${run}` });
    await send('post', '/api/branches', 'admin', { code: `${code}X`, name: `Pct 100Z${run}` });
    const pct = await get(`/api/branches?q=${encodeURIComponent(`100%${run}`)}`, 'readonly');
    expect(pct.body.branches.map((b: { code: string }) => b.code)).toEqual([code]);
    const lone = await get(`/api/branches?q=${encodeURIComponent('%')}`, 'readonly');
    expect(lone.body.branches.every((b: { code: string; name: string }) => (b.code + b.name).includes('%'))).toBe(true);
    const us = await get(`/api/branches?q=${encodeURIComponent(`Pct_${run}`)}`, 'readonly');
    expect(us.body.branches).toHaveLength(0);
  });
});

describe('landlords: validation, duplicates, search', () => {
  it('409 on duplicate landlordRef, 400 on bad phone and unknown key', async () => {
    expect((await send('post', '/api/landlords', 'staff', { landlordRef: `EL-${run}`, name: 'Dup' })).status).toBe(409);
    expect((await send('post', '/api/landlords', 'staff', { name: 'Ph', phone: 'abc' })).status).toBe(400);
    expect((await send('post', '/api/landlords', 'staff', { name: 'Ph', phone: '12345' })).status).toBe(400);
    expect((await send('post', '/api/landlords', 'staff', { name: '' })).status).toBe(400);
    expect((await send('post', '/api/landlords', 'staff', { name: 'X', bogus: true })).status).toBe(400);
  });

  it('patches, clears nullable fields, 400 empty, 404 bad and unknown id, 409 ref clash', async () => {
    const set = await send('patch', `/api/landlords/${landlordId}`, 'staff', { email: `e-${run.toLowerCase()}@example.test`, phone: '+44 20 7946 0001' });
    expect(set.status).toBe(200);
    const cleared = await send('patch', `/api/landlords/${landlordId}`, 'staff', { email: null, phone: null });
    expect(cleared.body.landlord).toMatchObject({ email: null, phone: null });
    expect((await send('patch', `/api/landlords/${landlordId}`, 'staff', {})).status).toBe(400);
    expect((await send('patch', `/api/landlords/${landlordId}`, 'staff', { email: 'bad' })).status).toBe(400);
    expect((await send('patch', '/api/landlords/nope', 'staff', { name: 'x' })).status).toBe(404);
    expect((await send('patch', `/api/landlords/${randomUUID()}`, 'staff', { name: 'x' })).status).toBe(404);
    const other = await send('post', '/api/landlords', 'staff', { landlordRef: `EM-${run}`, name: `Other ${run}` });
    expect((await send('patch', `/api/landlords/${other.body.id}`, 'staff', { landlordRef: `EL-${run}` })).status).toBe(409);
  });

  it('matches % and _ literally in search', async () => {
    await send('post', '/api/landlords', 'staff', { name: `Pct 50%${run}` });
    await send('post', '/api/landlords', 'staff', { name: `Pct 50Z${run}` });
    const pct = await get(`/api/landlords?q=${encodeURIComponent(`50%${run}`)}`, 'readonly');
    expect(pct.body.landlords).toHaveLength(1);
    const us = await get(`/api/landlords?q=${encodeURIComponent(`Pct 50_${run}`)}`, 'readonly');
    expect(us.body.landlords).toHaveLength(0);
    const bs = await get(`/api/landlords?q=${encodeURIComponent('\\')}`, 'readonly');
    expect(bs.status).toBe(200);
  });

  it('audits landlord insert as the staff user', async () => {
    const { rows } = await pool.query<{ changed_by: string }>(
      "SELECT changed_by FROM audit_log WHERE table_name = 'landlords' AND row_id = $1 AND action = 'INSERT'",
      [landlordId],
    );
    expect(rows).toHaveLength(1);
    expect(rows[0]!.changed_by).toBe(emails.staff);
  });
});

describe('properties: postcode, filters, FK, duplicates, ids', () => {
  it('normalises postcodes with and without a space, and trims', async () => {
    const a = await send('post', '/api/properties', 'staff', baseProp(`EA-${run}`, { postcode: '  m1 1ae ', town: `Aaa${run}` }));
    expect(a.status).toBe(201);
    propA = a.body.id;
    const b = await send('post', '/api/properties', 'staff', baseProp(`EB-${run}`, { postcode: 'EC1A1BB', town: `Bbb${run}`, landlordId }));
    expect(b.status).toBe(201);
    propB = b.body.id;
    const { rows } = await pool.query<{ postcode: string }>('SELECT postcode FROM properties WHERE id = ANY($1) ORDER BY property_ref', [[propA, propB]]);
    expect(rows.map((r) => r.postcode)).toEqual(['M1 1AE', 'EC1A1BB']);
  });

  it.each([
    ['garbage postcode', { postcode: 'NOTAPOSTCODE' }],
    ['empty postcode', { postcode: '' }],
    ['negative bedrooms', { bedrooms: -1 }],
    ['bedrooms 51', { bedrooms: 51 }],
    ['fractional bedrooms', { bedrooms: 1.5 }],
    ['bad management type', { defaultManagementType: 'XX' }],
    ['non-uuid branchId', { branchId: 'nope' }],
    ['unknown key', { rogue: 1 }],
    ['blank address', { addressLine1: ' ' }],
    ['bad ref chars', { propertyRef: 'has space' }],
  ])('400 on %s', async (_n, extra) => {
    const res = await send('post', '/api/properties', 'staff', baseProp(`EV-${run}`, extra));
    expect(res.status).toBe(400);
  });

  it('409 on duplicate property ref; 400 Unknown landlord; ref is immutable', async () => {
    expect((await send('post', '/api/properties', 'staff', baseProp(`EA-${run}`))).status).toBe(409);
    const ll = await send('post', '/api/properties', 'staff', baseProp(`EF-${run}`, { landlordId: randomUUID() }));
    expect(ll.status).toBe(400);
    expect(ll.body.error.message).toBe('Unknown landlord');
    expect((await send('patch', `/api/properties/${propA}`, 'staff', { propertyRef: 'NEW-1' })).status).toBe(400);
    const badBranch = await send('patch', `/api/properties/${propA}`, 'staff', { branchId: randomUUID() });
    expect(badBranch.status).toBe(400);
    expect(badBranch.body.error.message).toBe('Unknown branch');
    const badLl = await send('patch', `/api/properties/${propA}`, 'staff', { landlordId: randomUUID() });
    expect(badLl.status).toBe(400);
    expect(badLl.body.error.message).toBe('Unknown landlord');
  });

  it('404 on non-uuid id', async () => {
    expect((await send('patch', '/api/properties/not-a-uuid', 'staff', { town: 'x' })).status).toBe(404);
  });

  it('searches postcode with and without the space', async () => {
    const spaced = await get(`/api/properties?q=${encodeURIComponent('M1 1')}`, 'readonly');
    expect(spaced.body.properties.map((p: { id: string }) => p.id)).toContain(propA);
    const tight = await get(`/api/properties?q=${encodeURIComponent('ec1a1')}`, 'readonly');
    expect(tight.body.properties.map((p: { id: string }) => p.id)).toContain(propB);
  });

  it('filters by status and rejects a bad status, branchId or oversize q', async () => {
    await send('patch', `/api/properties/${propA}`, 'staff', { isActive: false });
    const q = `branchId=${branchId}`;
    const ids = async (s: string) => (await get(`/api/properties?${q}&status=${s}`, 'readonly')).body.properties.map((p: { id: string }) => p.id);
    expect(await ids('inactive')).toEqual([propA]);
    expect(await ids('active')).not.toContain(propA);
    expect(await ids('active')).toContain(propB);
    expect((await ids('all')).sort()).toEqual(expect.arrayContaining([propA, propB]));
    expect((await get('/api/properties?status=bogus', 'readonly')).status).toBe(400);
    expect((await get('/api/properties?branchId=nope', 'readonly')).status).toBe(400);
    expect((await get(`/api/properties?q=${'x'.repeat(101)}`, 'readonly')).status).toBe(400);
  });

  it('empty q returns at most 200 rows', async () => {
    const res = await get('/api/properties?q=', 'readonly');
    expect(res.status).toBe(200);
    const refs: string[] = res.body.properties.map((p: { propertyRef: string }) => p.propertyRef);
    expect(refs.length).toBeLessThanOrEqual(200);
  });

  it('matches % and _ literally in search', async () => {
    await send('patch', `/api/properties/${propA}`, 'staff', { town: `Pct%${run}` });
    await send('patch', `/api/properties/${propB}`, 'staff', { town: `PctZ${run}` });
    const pct = await get(`/api/properties?q=${encodeURIComponent(`Pct%${run}`)}`, 'readonly');
    expect(pct.body.properties.map((p: { id: string }) => p.id)).toEqual([propA]);
    const us = await get(`/api/properties?q=${encodeURIComponent(`Pct_${run}`)}`, 'readonly');
    expect(us.body.properties).toHaveLength(0);
    const lone = await get(`/api/properties?q=${encodeURIComponent('%')}`, 'readonly');
    expect(lone.status).toBe(200);
    expect(lone.body.properties.map((p: { id: string }) => p.id)).toContain(propA);
    expect(lone.body.properties.map((p: { id: string }) => p.id)).not.toContain(propB);
  });

  it('clears nullable fields with null', async () => {
    const res = await send('patch', `/api/properties/${propB}`, 'staff', { landlordId: null, town: null, brma: null, bedrooms: null, addressLine2: null });
    expect(res.status).toBe(200);
    expect(res.body.property).toMatchObject({ landlordId: null, town: null, brma: null, bedrooms: null, addressLine2: null });
  });
});
