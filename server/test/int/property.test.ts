/**
 * Reference data API: branches, bank accounts, landlords and properties. Role checks, validation,
 * search, FK errors and the audit trail (changed_by = the signed-in user).
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
  const email = `${role}-prop-${run.toLowerCase()}@example.test`;
  emails[role] = email;
  await upsertUser(pool, { email, fullName: `Prop ${role}`, role, password: PASSWORD });
  const res = await request(app()).post('/api/auth/login').set(CSRF_HEADER, CSRF_HEADER_VALUE).send({ email, password: PASSWORD });
  const raw = res.headers['set-cookie'] as unknown as string[];
  return raw.find((c) => c.startsWith(`${SESSION_COOKIE}=`))!.split(';')[0]!;
}

const get = (path: string, role: Role) => request(app()).get(path).set('Cookie', cookies[role]);
const send = (method: 'post' | 'patch', path: string, role: Role, body: object) =>
  request(app())[method](path).set('Cookie', cookies[role]).set(CSRF_HEADER, CSRF_HEADER_VALUE).send(body);

const branchCode = `B${run}`;
const bankCode = `BK_${run}`;
const landlordRef = `L-${run}`;
const landlordEmail = `landlord-${run.toLowerCase()}@example.test`;
const propRef = `P-${run}`;
let branchId = '';
let bankId = '';
let landlordId = '';
let propertyId = '';

beforeAll(async () => {
  pool = createPool({ databaseUrl: config.databaseUrl, hashKey: config.hashKey, max: 4 }, logger);
  for (const role of ['admin', 'accounts', 'staff', 'readonly'] as const) cookies[role] = await signIn(role);
});

afterAll(async () => {
  await pool?.end();
});

describe('branches', () => {
  it('admin creates a branch; the code is stored uppercase', async () => {
    const res = await send('post', '/api/branches', 'admin', { code: branchCode.toLowerCase(), name: `Branch ${run}` });
    expect(res.status).toBe(201);
    branchId = res.body.id;
    const { rows } = await pool.query('SELECT code FROM branches WHERE id = $1', [branchId]);
    expect(rows[0].code).toBe(branchCode);
  });

  it('rejects a duplicate branch code with 409', async () => {
    const res = await send('post', '/api/branches', 'admin', { code: branchCode, name: 'Other' });
    expect(res.status).toBe(409);
  });

  it('forbids staff from creating a branch', async () => {
    const res = await send('post', '/api/branches', 'staff', { code: `X${run}`, name: 'Nope' });
    expect(res.status).toBe(403);
  });

  it('patches name and Xero option; refuses to change the code', async () => {
    const ok = await send('patch', `/api/branches/${branchId}`, 'admin', { name: `Renamed ${run}`, xeroTrackingOption: 'Tracking X' });
    expect(ok.status).toBe(200);
    expect(ok.body.branch).toMatchObject({ code: branchCode, name: `Renamed ${run}`, xeroTrackingOption: 'Tracking X' });
    const bad = await send('patch', `/api/branches/${branchId}`, 'admin', { code: 'NEWCODE' });
    expect(bad.status).toBe(400);
  });

  it('searches by part of the name (readonly may read)', async () => {
    const res = await get(`/api/branches?q=${encodeURIComponent(`enamed ${run}`)}`, 'readonly');
    expect(res.status).toBe(200);
    expect(res.body.branches.map((b: { code: string }) => b.code)).toEqual([branchCode]);
  });
});

describe('bank accounts', () => {
  it('admin creates a bank account with last digits and reads it back', async () => {
    const res = await send('post', '/api/bank-accounts', 'admin', {
      code: bankCode,
      bankName: 'Test Bank',
      accountName: `Client ${run}`,
      sortCodeLast2: '42',
      accountLast4: '1234',
    });
    expect(res.status).toBe(201);
    bankId = res.body.id;
    const detail = await get(`/api/bank-accounts/${bankId}`, 'admin');
    expect(detail.status).toBe(200);
    expect(detail.body.bankAccount).toMatchObject({ code: bankCode, sortCodeLast2: '42', accountLast4: '1234', isActive: true });
  });

  it('rejects a three-digit sort code fragment', async () => {
    const res = await send('post', '/api/bank-accounts', 'admin', {
      code: `BX_${run}`,
      bankName: 'Test Bank',
      accountName: 'Bad',
      sortCodeLast2: '123',
    });
    expect(res.status).toBe(400);
  });

  it('deactivating shows in the ingest list', async () => {
    const res = await send('patch', `/api/bank-accounts/${bankId}`, 'admin', { isActive: false });
    expect(res.status).toBe(200);
    const list = await get('/api/bank-accounts', 'admin');
    const row = list.body.bankAccounts.find((b: { id: string }) => b.id === bankId);
    expect(row.isActive).toBe(false);
  });

  it('forbids the accounts role from patching', async () => {
    const res = await send('patch', `/api/bank-accounts/${bankId}`, 'accounts', { isActive: true });
    expect(res.status).toBe(403);
  });
});

describe('landlords', () => {
  it('staff creates a landlord; a bad e-mail is 400', async () => {
    const ok = await send('post', '/api/landlords', 'staff', {
      landlordRef,
      name: `Landlord ${run}`,
      email: landlordEmail,
      phone: '020 7946 0000',
    });
    expect(ok.status).toBe(201);
    landlordId = ok.body.id;
    const bad = await send('post', '/api/landlords', 'staff', { name: 'Bad Email', email: 'not-an-email' });
    expect(bad.status).toBe(400);
  });

  it('searches by reference and by e-mail', async () => {
    const byRef = await get(`/api/landlords?q=${encodeURIComponent(landlordRef.toLowerCase())}`, 'readonly');
    expect(byRef.body.landlords.map((l: { id: string }) => l.id)).toEqual([landlordId]);
    const byEmail = await get(`/api/landlords?q=${encodeURIComponent(landlordEmail)}`, 'readonly');
    expect(byEmail.body.landlords.map((l: { id: string }) => l.id)).toEqual([landlordId]);
  });
});

describe('properties', () => {
  it('staff creates a property; postcode is uppercased; list shows branch and landlord', async () => {
    const res = await send('post', '/api/properties', 'staff', {
      propertyRef: propRef,
      branchId,
      landlordId,
      addressLine1: '1 Test Street',
      town: `Testville${run}`,
      postcode: 'sw1a1aa',
    });
    expect(res.status).toBe(201);
    propertyId = res.body.id;
    const { rows } = await pool.query<{ postcode: string }>('SELECT postcode FROM properties WHERE id = $1', [propertyId]);
    expect(['SW1A1AA', 'SW1A 1AA']).toContain(rows[0]!.postcode);
    const list = await get(`/api/properties?q=${propRef}`, 'readonly');
    expect(list.body.properties).toHaveLength(1);
    expect(list.body.properties[0]).toMatchObject({ propertyRef: propRef, branchCode, landlordName: `Landlord ${run}` });
  });

  it('searches by postcode fragment and town, and filters by branch', async () => {
    const byPostcode = await get('/api/properties?q=SW1A', 'readonly');
    expect(byPostcode.body.properties.map((p: { id: string }) => p.id)).toContain(propertyId);
    const byTown = await get(`/api/properties?q=${encodeURIComponent(`ville${run}`)}`, 'readonly');
    expect(byTown.body.properties.map((p: { id: string }) => p.id)).toEqual([propertyId]);
    const byBranch = await get(`/api/properties?branchId=${branchId}`, 'readonly');
    expect(byBranch.body.properties.map((p: { id: string }) => p.id)).toEqual([propertyId]);
  });

  it('rejects an unknown branch with 400', async () => {
    const res = await send('post', '/api/properties', 'staff', {
      propertyRef: `PX-${run}`,
      branchId: randomUUID(),
      addressLine1: '2 Test Street',
      postcode: 'SW1A 1AA',
    });
    expect(res.status).toBe(400);
    expect(res.body.error.message).toBe('Unknown branch');
  });

  it('forbids readonly writes and requires the CSRF header', async () => {
    const body = { propertyRef: `PR-${run}`, branchId, addressLine1: '3 Test Street', postcode: 'SW1A 1AA' };
    expect((await send('post', '/api/properties', 'readonly', body)).status).toBe(403);
    expect((await send('patch', `/api/properties/${propertyId}`, 'readonly', { town: 'X' })).status).toBe(403);
    const noCsrf = await request(app()).post('/api/properties').set('Cookie', cookies.staff).send(body);
    expect(noCsrf.status).toBe(403);
  });

  it('patches town and clears the landlord; empty patch is 400; unknown id is 404', async () => {
    const ok = await send('patch', `/api/properties/${propertyId}`, 'staff', { town: 'Newtown', landlordId: null });
    expect(ok.status).toBe(200);
    expect(ok.body.property).toMatchObject({ town: 'Newtown', landlordId: null, landlordName: null });
    expect((await send('patch', `/api/properties/${propertyId}`, 'staff', {})).status).toBe(400);
    expect((await send('patch', `/api/properties/${randomUUID()}`, 'staff', { town: 'X' })).status).toBe(404);
  });
});

describe('audit', () => {
  it('records property INSERT and UPDATE as the staff user', async () => {
    const { rows } = await pool.query<{ action: string; changed_by: string }>(
      'SELECT action, changed_by FROM audit_log WHERE table_name = $1 AND row_id = $2',
      ['properties', propertyId],
    );
    expect(rows.map((r) => r.action).sort()).toEqual(['INSERT', 'UPDATE']);
    expect(rows.every((r) => r.changed_by === emails.staff)).toBe(true);
  });

  it('records the branch INSERT as the admin user', async () => {
    const { rows } = await pool.query<{ changed_by: string }>(
      "SELECT changed_by FROM audit_log WHERE table_name = 'branches' AND row_id = $1 AND action = 'INSERT'",
      [branchId],
    );
    expect(rows).toHaveLength(1);
    expect(rows[0]!.changed_by).toBe(emails.admin);
  });
});
