/**
 * agentOS reference-driven receipts matching (recon-510): an NI Number cell (NI or sort code + account)
 * means the tenant paid; a TID means a council / third party paid. Core tenancies come from synthetic
 * Veco rows through the real sync. No plaintext reference may be stored, audited or returned.
 */
import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createApp } from '../../src/api/app.js';
import { CSRF_HEADER, CSRF_HEADER_VALUE, SESSION_COOKIE } from '../../src/api/auth/middleware.js';
import { loadConfig } from '../../src/config/env.js';
import { actorDb } from '../../src/db/context.js';
import { createPool, type Pool } from '../../src/db/pool.js';
import { INTAKE_HEADERS_V2 } from '../../src/domain/agentos/intake.js';
import { syncTenancies } from '../../src/jobs/veco-sync/sync.js';
import { createLogger } from '../../src/lib/logger.js';
import { addDepositAlias, listDepositAccounts } from '../../src/services/agentos/accounts.service.js';
import { upsertUser, type Role } from '../../src/services/auth.service.js';
import { vecoRows } from '../fixtures/veco-rows.js';

const PASSWORD = 'correct-horse-battery';
const config = loadConfig();
const logger = createLogger({ level: 'silent' });
const run = randomUUID().slice(0, 8);
let pool: Pool;
const cookies = {} as Record<Role, string>;
const agentosId: Record<string, string> = {};

const app = () => createApp({ config, pool, logger });
const H8 = INTAKE_HEADERS_V2.join(',');
const RECEIVED = '02/03/2026';
const NI = 'ZY123456C';
const SORT_ACC = '12-34-56 12345678';

async function signIn(role: Role): Promise<string> {
  const email = `${role}-aref-${run}@example.test`;
  await upsertUser(pool, { email, fullName: `Aref ${role}`, role, password: PASSWORD });
  const res = await request(app()).post('/api/auth/login').set(CSRF_HEADER, CSRF_HEADER_VALUE).send({ email, password: PASSWORD });
  return (res.headers['set-cookie'] as unknown as string[]).find((c) => c.startsWith(`${SESSION_COOKIE}=`))!.split(';')[0]!;
}

const post = (path: string, role: Role) =>
  request(app()).post(path).set('Cookie', cookies[role]).set(CSRF_HEADER, CSRF_HEADER_VALUE);
const get = (path: string, role: Role) => request(app()).get(path).set('Cookie', cookies[role]);
let seq = 0;
/** One upload; `seq` makes every file's bytes unique so the SHA-256 dedupe never fires. */
const upload = (rows: [tid: string, ref: string][]) => {
  seq++;
  const body = rows.map(([tid, ref], i) => `${RECEIVED},${tid},Someone Else,${10 + seq + i}.00,Cash,HSBC,r${seq}-${i},${ref}`);
  return post('/api/agentos/intake', 'staff').attach('file', Buffer.from([H8, ...body].join('\n')), 'ref.csv');
};
interface LineView {
  id: string;
  matchStatus: string;
  payerType: string | null;
  reference: string | null;
  agentosTenantId: string | null;
  receivingAccount: string | null;
}
const linesOf = async (batchId: string) => (await get(`/api/agentos/intake/${batchId}`, 'readonly')).body.lines as LineView[];

async function clean() {
  await pool.query('TRUNCATE agentos_intake_batches CASCADE');
  await pool.query('DELETE FROM agentos_tenants');
  await pool.query(
    "DELETE FROM audit_log WHERE table_name IN ('agentos_intake_lines', 'agentos_intake_batches', 'agentos_tenants', 'agentos_deposit_aliases')",
  );
}

beforeAll(async () => {
  pool = createPool({ databaseUrl: config.databaseUrl, hashKey: config.hashKey, max: 4 }, logger);
  await clean();
  await pool.query(
    `TRUNCATE allocations, receipts, match_suggestions, payer_bank_accounts, payment_references, bank_transactions,
              import_batches, bank_csv_profiles, bank_accounts,
              rent_schedules, tenancy_tenants, tenancies, tenants, property_units, properties, branches CASCADE`,
  );
  await syncTenancies(pool, vecoRows(20), { keys: { hashKey: config.hashKey, encryptionKey: config.encryptionKey }, force: true });
  // T9001's lead tenant has this NI; T9002 has a tenant payer account on file.
  await pool.query(
    `UPDATE tenants SET ni_hash = secure_hash($1)
      WHERE id = (SELECT tt.tenant_id FROM tenancy_tenants tt JOIN tenancies t ON t.id = tt.tenancy_id WHERE t.tid = 'T9001' LIMIT 1)`,
    [NI],
  );
  await pool.query(
    `INSERT INTO payer_bank_accounts (account_hash, account_last4, holder_type, payer, tenant_id, tenancy_id)
     SELECT secure_hash('12345612345678'), '5678', 'tenant', 'tenant', tt.tenant_id, t.id
       FROM tenancies t JOIN tenancy_tenants tt ON tt.tenancy_id = t.id WHERE t.tid = 'T9002' LIMIT 1`,
  );
  for (const n of ['9001', '9002']) {
    const { rows } = await pool.query<{ id: string }>(
      `INSERT INTO agentos_tenants (agentos_oid, source, tid, forename, surname, managed_by, residence, tenancy_descriptor, is_head_tenant)
       VALUES ($1, 'api', $2, $3, 'Tenant', 'Test Lettings', 'Test House', 'Periodic', true) RETURNING id`,
      [`aaaa-0000-0000-${n}`, n, `${n} Test`],
    );
    agentosId[n] = rows[0]!.id;
  }
  await pool.query(
    "INSERT INTO bank_accounts (code, bank_name, account_name) VALUES ('HSBC', 'HSBC', 'Test HSBC') ON CONFLICT DO NOTHING",
  );
  for (const role of ['admin', 'accounts', 'staff', 'readonly'] as const) cookies[role] = await signIn(role);
});

afterAll(async () => {
  await clean();
  await pool?.end();
});

describe('reference matching', () => {
  it('both core tenancies are live on the received date', async () => {
    const { rows } = await pool.query<{ tid: string; live: boolean }>(
      "SELECT t.tid, tenancy_live_on(t, '2026-03-02') AS live FROM tenancies t WHERE t.tid IN ('T9001', 'T9002') ORDER BY t.tid",
    );
    expect(rows).toEqual([{ tid: 'T9001', live: true }, { tid: 'T9002', live: true }]);
  });

  it('an NI with spaces matches the tenant as payer and is shown masked', async () => {
    const res = await upload([['', 'ZY 12 34 56 C']]);
    expect(res.status).toBe(201);
    expect(res.body.batch.matchCounts).toEqual({ matched: 1, ambiguous: 0, unmatched: 0 });
    expect(res.body.batch.unresolvedRefs).toBe(0);
    const [l] = await linesOf(res.body.batch.batchId);
    expect(l).toMatchObject({ matchStatus: 'matched', payerType: 'tenant', reference: '•••••56C', agentosTenantId: agentosId['9001'] });
  });

  it('a sort code + account number matches the payer account on file', async () => {
    const res = await upload([['', SORT_ACC]]);
    expect(res.status).toBe(201);
    const [l] = await linesOf(res.body.batch.batchId);
    expect(l).toMatchObject({ matchStatus: 'matched', payerType: 'tenant', reference: '****5678', agentosTenantId: agentosId['9002'] });
  });

  it('NI plus the same TID is matched; NI plus a different TID is ambiguous', async () => {
    const res = await upload([['9001', NI], ['9002', NI]]);
    expect(res.status).toBe(201);
    expect(res.body.batch.matchCounts).toEqual({ matched: 1, ambiguous: 1, unmatched: 0 });
    const ls = await linesOf(res.body.batch.batchId);
    expect(ls[0]).toMatchObject({ matchStatus: 'matched', payerType: 'tenant' });
    expect(ls[1]).toMatchObject({ matchStatus: 'ambiguous', payerType: null, agentosTenantId: null });
  });

  it('an unknown NI with a blank TID is unmatched and counted; with a TID it is matched as tenant', async () => {
    const a = await upload([['', 'AB 11 22 33 C']]);
    expect(a.body.batch.matchCounts).toEqual({ matched: 0, ambiguous: 0, unmatched: 1 });
    expect(a.body.batch.unresolvedRefs).toBe(1);
    const b = await upload([['9002', 'AB 11 22 33 C']]);
    expect(b.body.batch.matchCounts).toEqual({ matched: 1, ambiguous: 0, unmatched: 0 });
    const [l] = await linesOf(b.body.batch.batchId);
    expect(l).toMatchObject({ matchStatus: 'matched', payerType: 'tenant', agentosTenantId: agentosId['9002'] });
  });

  it('a TID alone is a third-party payer; payer name never matters', async () => {
    const res = await upload([['9001', '']]);
    const [l] = await linesOf(res.body.batch.batchId);
    expect(l).toMatchObject({ matchStatus: 'matched', payerType: 'third_party', reference: null });
  });

  it('a bad NI Number cell is a 400 on that field and is not echoed', async () => {
    const res = await upload([['', '12345']]);
    expect(res.status).toBe(400);
    expect(res.body.error.details.rowErrors).toEqual([
      { line: 2, field: 'NI Number', reason: 'must be a UK NI number, a sort code + account number, or blank' },
    ]);
    expect(JSON.stringify(res.body)).not.toContain('12345');
  });

  it('GDPR: no plaintext reference in lines, audit_log or responses; only hash + last chars', async () => {
    const res = await upload([['', ' zy123456c'], ['', SORT_ACC]]);
    expect(res.status).toBe(201);
    expect(JSON.stringify(res.body)).not.toMatch(/ZY123456|12345678/i);
    const { rows } = await pool.query<{ txt: string }>(
      'SELECT row_to_json(l)::text AS txt FROM agentos_intake_lines l WHERE batch_id = $1',
      [res.body.batch.batchId],
    );
    expect(rows).toHaveLength(2);
    for (const r of rows) expect(r.txt).not.toMatch(/ZY ?123456|12345678|123456 ?1234/i);
    const lines = await linesOf(res.body.batch.batchId);
    expect(JSON.stringify(lines)).not.toMatch(/ZY123456|12345678/i);
    const { rows: audit } = await pool.query<{ n: string }>(
      `SELECT count(*) AS n FROM audit_log WHERE table_name IN ('agentos_intake_lines', 'agentos_intake_batches')
          AND (old_row::text ~* 'ZY ?123456|12345678' OR new_row::text ~* 'ZY ?123456|12345678')`,
    );
    expect(Number(audit[0]!.n)).toBe(0);
    const { rows: stored } = await pool.query<{ ref_kind: string; ref_last: string; hashed: boolean }>(
      `SELECT ref_kind, ref_last,
              ref_hash = secure_hash(CASE ref_kind WHEN 'ni' THEN 'ZY123456C' ELSE '12345612345678' END) AS hashed
         FROM agentos_intake_lines WHERE batch_id = $1 ORDER BY line_no`,
      [res.body.batch.batchId],
    );
    expect(stored).toEqual([
      { ref_kind: 'ni', ref_last: '56C', hashed: true },
      { ref_kind: 'account', ref_last: '5678', hashed: true },
    ]);
  });

  it('reassign keeps the payer type of the reference line', async () => {
    const up = await upload([['', 'AB 11 22 33 C']]);
    const [l] = await linesOf(up.body.batch.batchId);
    const res = await post(`/api/agentos/lines/${l!.id}/reassign`, 'staff').send({ tid: '9002' });
    expect(res.status).toBe(200);
    expect(res.body.line).toMatchObject({ matchStatus: 'matched', payerType: 'tenant', reference: '•••••33C' });
  });
});

describe('deposit accounts and aliases', () => {
  const resolve = async (t: string) =>
    (await pool.query<{ c: string | null }>('SELECT agentos_deposit_account($1) AS c', [t])).rows[0]!.c;

  it('resolves case- and space-insensitively; unknown text is null and the line shows no account', async () => {
    expect(await resolve('hsbc ')).toBe('HSBC');
    expect(await resolve('  Apollo   HSBC')).toBe('HSBC');
    expect(await resolve('Nowhere')).toBeNull();
    const res = await upload([['9001', '']]);
    const batchId = res.body.batch.batchId as string;
    expect((await linesOf(batchId))[0]!.receivingAccount).toBe('HSBC');
    await pool.query("UPDATE agentos_intake_lines SET deposit_to = 'Nowhere' WHERE batch_id = $1", [batchId]);
    await pool.query('UPDATE agentos_intake_lines SET receiving_account_code = agentos_deposit_account(deposit_to) WHERE batch_id = $1', [batchId]);
    expect((await linesOf(batchId))[0]!.receivingAccount).toBeNull();
  });

  it('lists active accounts with aliases and adds an alias', async () => {
    const before = (await listDepositAccounts(pool)).find((a) => a.code === 'HSBC')!;
    expect(before.aliases).toEqual(expect.arrayContaining(['hsbc', 'apollo hsbc']));
    const added = await addDepositAlias(actorDb(pool, 'test:accounts'), 'HSBC', '  Apollo   BANK ');
    expect(added).toEqual({ code: 'HSBC', alias: 'apollo bank' });
    expect(await resolve('APOLLO bank')).toBe('HSBC');
  });

  it('rejects unknown or inactive codes and duplicate aliases', async () => {
    const db = actorDb(pool, 'test:accounts');
    await expect(addDepositAlias(db, 'NOPE', 'x')).rejects.toMatchObject({ code: 'bad_request' });
    await pool.query(
      "INSERT INTO bank_accounts (code, bank_name, account_name, is_active) VALUES ('OLD_ONE', 'Old', 'Old', false) ON CONFLICT DO NOTHING",
    );
    await expect(addDepositAlias(db, 'OLD_ONE', 'old one')).rejects.toMatchObject({ code: 'bad_request' });
    await expect(addDepositAlias(db, 'HSBC', 'APOLLO bank')).rejects.toMatchObject({ code: 'conflict' });
    await expect(addDepositAlias(db, 'HSBC', 'hsbc')).rejects.toMatchObject({ code: 'conflict' });
    await expect(addDepositAlias(db, 'HSBC', '   ')).rejects.toMatchObject({ code: 'bad_request' });
    await pool.query("DELETE FROM bank_accounts WHERE code = 'OLD_ONE'");
  });

  it('export writes the raw bank text, never blocking on an unknown account', async () => {
    const up = await upload([['9001', '']]);
    const batchId = up.body.batch.batchId as string;
    await pool.query("UPDATE agentos_intake_lines SET deposit_to = 'Somewhere Else' WHERE batch_id = $1", [batchId]);
    const ex = await post('/api/agentos/exports', 'staff').send({ batchId });
    expect(ex.status).toBe(201);
    expect(ex.body.export.rowsTotal).toBe(1);
    const { rows } = await pool.query<{ csv: string }>('SELECT csv FROM agentos_exports WHERE id = $1', [ex.body.export.id]);
    expect(rows[0]!.csv).toContain('Somewhere Else');
  });
});
