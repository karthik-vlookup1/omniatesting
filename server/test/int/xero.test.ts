/**
 * Xero posting against a fake bridge: one invoice per bank per bank date, account codes and tracking,
 * staging each receipt once, retries that never duplicate, the demo/live gate, and permissions.
 */
import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../../src/api/app.js';
import { CSRF_HEADER, CSRF_HEADER_VALUE, SESSION_COOKIE } from '../../src/api/auth/middleware.js';
import { loadConfig } from '../../src/config/env.js';
import { createPool, type Pool } from '../../src/db/pool.js';
import type { SqlSource } from '../../src/jobs/veco-sync/mcp-client.js';
import { syncTenancies } from '../../src/jobs/veco-sync/sync.js';
import { createLogger } from '../../src/lib/logger.js';
import { upsertUser, type Role } from '../../src/services/auth.service.js';
import { BridgeError, type BridgeInvoice, type TargetEnv, type XeroBridge } from '../../src/services/xero/bridge.js';
import type { Batch, InvoiceDraft, OutboxItem } from '../../src/services/xero/xero.service.js';
import { vecoRows } from '../fixtures/veco-rows.js';

const PASSWORD = 'correct-horse-battery';
const config = loadConfig();
const logger = createLogger({ level: 'silent' });
const run = randomUUID().slice(0, 8);
let pool: Pool;
const cookies = {} as Record<Role, string>;
const bankIds: Record<string, string> = {};

/** A bridge double that records calls, dedupes on externalRef like the real one, and can be told to fail. */
class FakeBridge implements XeroBridge {
  contacts: string[] = [];
  invoices: BridgeInvoice[] = [];
  failNext = 0;
  private byRef = new Map<string, string>();
  async health() {
    return { status: 'ok', tenantId: '00000000-0000-4000-8000-00000000de30' };
  }
  async upsertContact(name: string) {
    this.contacts.push(name);
    return { contactId: `contact-${name}`, created: false };
  }
  async createInvoice(inv: BridgeInvoice) {
    if (this.failNext > 0) {
      this.failNext -= 1;
      throw new BridgeError('Xero bridge /api/invoices answered 500: boom', 500);
    }
    this.invoices.push(inv);
    const existing = this.byRef.get(inv.externalRef);
    if (existing)
      return {
        invoiceId: existing,
        invoiceNumber: 'INV-dup',
        status: 'AUTHORISED',
        deduped: true,
      };
    const id = randomUUID();
    this.byRef.set(inv.externalRef, id);
    return {
      invoiceId: id,
      invoiceNumber: `INV-${this.byRef.size}`,
      status: 'AUTHORISED',
      deduped: false,
    };
  }
}

let bridge: FakeBridge;
const fixture = (name: string) => readFileSync(new URL(`../../../fixtures/banks/${name}`, import.meta.url));
const app = (targetEnv: TargetEnv = 'demo', withBridge = true, vecoSource: SqlSource | null = null) =>
  createApp({
    config,
    pool,
    logger,
    xero: {
      bridge: withBridge ? bridge : null,
      config: { url: null, key: null, targetEnv },
    },
    vecoSource,
  });

async function signIn(role: Role): Promise<string> {
  const email = `${role}-xero-${run}@example.test`;
  await upsertUser(pool, {
    email,
    fullName: `Xero ${role}`,
    role,
    password: PASSWORD,
  });
  const res = await request(app())
    .post('/api/auth/login')
    .set(CSRF_HEADER, CSRF_HEADER_VALUE)
    .send({ email, password: PASSWORD });
  return (res.headers['set-cookie'] as unknown as string[])
    .find((c) => c.startsWith(`${SESSION_COOKIE}=`))!
    .split(';')[0]!;
}

const get = (path: string, role: Role = 'accounts', a = app()) => request(a).get(path).set('Cookie', cookies[role]);
const send = (method: 'post' | 'put', path: string, role: Role = 'accounts', a = app()) =>
  request(a)[method](path).set('Cookie', cookies[role]).set(CSRF_HEADER, CSRF_HEADER_VALUE);
const upload = (name: string, content?: string) =>
  send('post', '/api/imports', 'staff')
    .field('bankAccountId', bankIds.HSBC!)
    .attach('file', content === undefined ? fixture(name) : Buffer.from(content), name);
const pending = async () =>
  (await get('/api/xero/pending')).body as {
    invoices: InvoiceDraft[];
    receipts: number;
    total: string;
  };
const outbox = async (status?: string) =>
  (await get(`/api/xero/outbox${status ? `?status=${status}` : ''}`)).body as {
    items: OutboxItem[];
    summary: Record<string, number>;
  };
const count = async (sql: string) => (await pool.query<{ n: number }>(sql)).rows[0]!.n;

beforeAll(async () => {
  pool = createPool({ databaseUrl: config.databaseUrl, hashKey: config.hashKey, max: 6 }, logger);
  await pool.query(
    `TRUNCATE allocations, receipts, match_suggestions, payer_bank_accounts, payment_references, bank_transactions,
              import_batches, bank_csv_profiles, bank_accounts, external_refs, sync_outbox,
              rent_schedules, tenancy_tenants, tenancies, tenants, property_units, properties, branches CASCADE`,
  );
  await pool.query("DELETE FROM integration_settings WHERE system = 'xero'");
  await syncTenancies(pool, vecoRows(20), {
    keys: { hashKey: config.hashKey, encryptionKey: config.encryptionKey },
    force: true,
  });
  bridge = new FakeBridge();
  for (const role of ['admin', 'accounts', 'staff', 'readonly'] as const) cookies[role] = await signIn(role);
  await send('post', '/api/bank-accounts/defaults', 'admin');
  const banks = (await get('/api/bank-accounts')).body.bankAccounts as {
    code: string;
    id: string;
  }[];
  for (const b of banks) bankIds[b.code] = b.id;
});

beforeEach(() => {
  bridge.failNext = 0;
});

afterAll(async () => {
  await pool?.end();
});

describe('permissions and status', () => {
  it('only admin and accounts reach /api/xero; settings are admin-only', async () => {
    expect((await get('/api/xero/status', 'staff')).status).toBe(403);
    expect((await get('/api/xero/pending', 'readonly')).status).toBe(403);
    expect((await send('post', '/api/xero/run', 'staff').send({})).status).toBe(403);
    expect(
      (
        await send('put', '/api/xero/settings', 'accounts').send({
          contacts: {},
          extendedFields: false,
        })
      ).status,
    ).toBe(403);
    const s = await get('/api/xero/status');
    expect(s.body).toEqual({
      configured: true,
      targetEnv: 'demo',
      bridge: {
        reachable: true,
        tenantId: '00000000-0000-4000-8000-00000000de30',
      },
    });
    expect((await get('/api/xero/status', 'accounts', app('live', false))).body).toMatchObject({
      configured: false,
      targetEnv: 'live',
      bridge: null,
    });
  });
});

describe('invoices per bank per bank date', () => {
  it('groups confirmed receipts into one invoice per bank day, with ledger codes and branch tracking', async () => {
    expect((await pending()).receipts).toBe(0);
    expect((await upload('hsbc.csv')).status).toBe(201); // auto-matches T9001, AB100002C (01/09), T 9003 (02/09)
    const p = await pending();
    expect(p.invoices.map((i) => [i.invoiceNumber, i.lines.map((l) => l.tid)])).toEqual([
      ['Rent - HSBC 010926', ['T9001', 'T9002']],
      ['Rent - HSBC 020926', ['T9003']],
    ]);
    const [first, second] = p.invoices;
    expect(first!.lines.map((l) => [l.accountCode, l.managementType, l.branch])).toEqual([
      ['001', 'RG', 'TSB'],
      ['001', 'RG', 'TSB'], // branch is per building: P9000's rooms are mostly TSB
    ]);
    expect(second!.lines[0]).toMatchObject({
      accountCode: '001G',
      managementType: 'IRG',
      branch: 'IRG',
      tenantName: 'Test Tenant3',
    });
    expect(first!.total).toBe(first!.lines.reduce((a, l) => (Number(a) + Number(l.amount)).toFixed(2), '0'));
    expect(p.receipts).toBe(3);
  });

  it('admin names the Xero contact per bank; invoices are numbered "<contact> DDMMYY"', async () => {
    const bad = await send('put', '/api/xero/settings', 'admin').send({
      contacts: { HSBC: '' },
      extendedFields: false,
    });
    expect(bad.status).toBe(400);
    const ok = await send('put', '/api/xero/settings', 'admin').send({
      contacts: { hsbc: 'Apollo HSBC' },
      extendedFields: false,
    });
    expect(ok.body.settings).toEqual({
      contacts: { HSBC: 'Apollo HSBC' },
      extendedFields: false,
    });
    expect((await pending()).invoices.map((i) => i.invoiceNumber)).toEqual([
      'Apollo HSBC 010926',
      'Apollo HSBC 020926',
    ]);
  });

  it('staging claims each receipt once; staging again with nothing new is refused', async () => {
    const res = await send('post', '/api/xero/stage');
    expect(res.status).toBe(201);
    expect((res.body.batches as Batch[]).map((b) => b.invoiceNumber)).toEqual([
      'Apollo HSBC 010926',
      'Apollo HSBC 020926',
    ]);
    expect((await pending()).receipts).toBe(0);
    expect(
      await count("SELECT count(*)::int AS n FROM external_refs WHERE system = 'xero' AND entity_type = 'receipt'"),
    ).toBe(3);
    const again = await send('post', '/api/xero/stage');
    expect(again.status).toBe(409);
    expect((await outbox('pending')).items).toHaveLength(2);
  });
});

describe('sending', () => {
  it('a dry run previews without calling the bridge', async () => {
    const res = await send('post', '/api/xero/run').send({ dryRun: true });
    expect(res.body).toEqual({
      dryRun: true,
      targetEnv: 'demo',
      configured: true,
      wouldSend: 2,
    });
    expect(bridge.invoices).toHaveLength(0);
  });

  it('refuses when the bridge is not configured, and a live target needs confirmation', async () => {
    const off = await send('post', '/api/xero/run', 'accounts', app('demo', false)).send({});
    expect(off.status).toBe(503);
    expect(off.body.error.code).toBe('xero_not_configured');
    const live = await send('post', '/api/xero/run', 'accounts', app('live')).send({});
    expect(live.status).toBe(409);
    expect(live.body.error.code).toBe('live_requires_confirmation');
    expect(bridge.invoices).toHaveLength(0);
  });

  it('pushes one invoice per batch with the bridge contract fields', async () => {
    const res = await send('post', '/api/xero/run').send({});
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      targetEnv: 'demo',
      attempted: 2,
      sent: 2,
      failed: 0,
      dead: 0,
    });
    expect(bridge.contacts).toEqual(['Apollo HSBC', 'Apollo HSBC']);
    const [inv] = bridge.invoices;
    expect(inv).toMatchObject({
      contactId: 'contact-Apollo HSBC',
      date: '2026-09-01',
      dueDate: '2026-09-01',
      status: 'AUTHORISED',
    });
    expect(inv!.externalRef).toMatch(/^recon-inv:[0-9a-f-]{36}$/);
    expect(inv!.lineItems[0]).toEqual({
      description: 'T9001 Test Tenant1',
      quantity: 1,
      unitAmount: 650,
      accountCode: '001',
      taxType: 'NONE',
    });
    expect(inv).not.toHaveProperty('invoiceNumber');

    const done = await outbox('done');
    expect(done.items).toHaveLength(2);
    expect(done.items.every((i) => i.xeroInvoiceId && i.attempts === 1 && i.lastError === null)).toBe(true);
    expect((await send('post', '/api/xero/run').send({})).body.attempted).toBe(0);
  });

  it('with extended fields on, lines carry the TID item code, tracking, and the invoice its number', async () => {
    await send('put', '/api/xero/settings', 'admin').send({
      contacts: { HSBC: 'Apollo HSBC' },
      extendedFields: true,
    });
    await upload('hsbc_overlap.csv'); // T9004 on 04/09 is auto-matched
    await send('post', '/api/xero/stage');
    bridge.invoices = [];
    await send('post', '/api/xero/run').send({});
    const [inv] = bridge.invoices;
    expect(inv).toMatchObject({
      invoiceNumber: 'Apollo HSBC 040926',
      reference: 'Rental Income',
    });
    expect(inv!.lineItems[0]).toEqual({
      description: 'Test Tenant4',
      itemCode: 'T9004',
      quantity: 1,
      unitAmount: 650,
      accountCode: '001',
      taxType: 'NONE',
      tracking: [{ name: 'Branch', option: 'TSB' }],
    });
  });
});

describe('retries', () => {
  async function stageOne(day: string, tid: string) {
    const csv = `Date,Description,Paid in,Paid out,Balance\n${day}/09/2026,"COUNCIL HB ${tid}",650.00,,1.00\n`;
    expect((await upload(`xero-${day}-${tid}.csv`, csv)).status).toBe(201);
    const res = await send('post', '/api/xero/stage');
    expect(res.status).toBe(201);
    return (res.body.batches as Batch[])[0]!;
  }

  it('a failed push is retried after its backoff with the same externalRef, never duplicating', async () => {
    const batch = await stageOne('20', 'T9010');
    bridge.failNext = 1;
    const first = await send('post', '/api/xero/run').send({});
    expect(first.body).toMatchObject({ attempted: 1, sent: 0, failed: 1 });
    const [failed] = (await outbox('failed')).items;
    expect(failed).toMatchObject({
      batchId: batch.batchId,
      attempts: 1,
      lastError: expect.stringContaining('500') as string,
    });
    expect((await send('post', '/api/xero/run').send({})).body.attempted).toBe(0); // still backing off

    await pool.query("UPDATE sync_outbox SET next_attempt_at = now() WHERE status = 'failed'");
    bridge.invoices = [];
    const second = await send('post', '/api/xero/run').send({});
    expect(second.body).toMatchObject({ attempted: 1, sent: 1 });
    expect(bridge.invoices[0]!.externalRef).toBe(`recon-inv:${batch.batchId}`);
  });

  it('a batch whose worker died mid-push is picked up after the lease; the bridge dedupes it', async () => {
    const batch = await stageOne('21', 'T9011');
    await send('post', '/api/xero/run').send({}); // succeeds
    // Simulate a crash after the bridge call but before marking done.
    await pool.query(
      "UPDATE sync_outbox SET status = 'in_flight', next_attempt_at = now() - interval '1 minute' WHERE entity_id = $1",
      [batch.batchId],
    );
    const res = await send('post', '/api/xero/run').send({});
    expect(res.body.results[0]).toMatchObject({ ok: true, deduped: true });
    expect(
      await count(
        `SELECT count(*)::int AS n FROM external_refs WHERE system = 'xero' AND entity_type = 'invoice' AND entity_id = '${batch.batchId}'`,
      ),
    ).toBe(1);
  });

  it('after 5 failed attempts a batch is dead until a person retries it', async () => {
    const batch = await stageOne('22', 'T9012');
    bridge.failNext = 5;
    for (let i = 0; i < 5; i += 1) {
      await pool.query("UPDATE sync_outbox SET next_attempt_at = now() WHERE status IN ('pending', 'failed')");
      await send('post', '/api/xero/run').send({});
    }
    const [dead] = (await outbox('dead')).items;
    expect(dead).toMatchObject({
      batchId: batch.batchId,
      attempts: 5,
      status: 'dead',
    });
    await pool.query("UPDATE sync_outbox SET next_attempt_at = now() WHERE status = 'dead'");
    expect((await send('post', '/api/xero/run').send({})).body.attempted).toBe(0);

    expect((await send('post', `/api/xero/outbox/${dead!.id}/retry`)).body.item).toMatchObject({
      status: 'pending',
      attempts: 0,
    });
    expect((await send('post', `/api/xero/outbox/${dead!.id}/retry`)).status).toBe(409);
    expect((await send('post', '/api/xero/outbox/999999999/retry')).status).toBe(404);
    expect((await send('post', '/api/xero/outbox/abc/retry')).status).toBe(404);
    expect((await send('post', '/api/xero/run').send({})).body).toMatchObject({
      sent: 1,
    });
  });

  it('a live target sends only with confirmLive', async () => {
    await stageOne('23', 'T9013');
    const res = await send('post', '/api/xero/run', 'accounts', app('live')).send({ confirmLive: true });
    expect(res.body).toMatchObject({ targetEnv: 'live', sent: 1 });
  });
});

describe('numbering and concurrency', () => {
  it('receipts confirmed later for an invoiced bank day get a numbered follow-up invoice', async () => {
    const csv = 'Date,Description,Paid in,Paid out,Balance\n01/09/2026,"LATE COUNCIL HB T9014",650.00,,1.00\n';
    expect((await upload('xero-late.csv', csv)).status).toBe(201);
    const res = await send('post', '/api/xero/stage');
    expect((res.body.batches as Batch[]).map((b) => b.invoiceNumber)).toEqual(['Apollo HSBC 010926 (2)']);
  });

  it('two staging requests at once never claim a receipt twice', async () => {
    const csv =
      'Date,Description,Paid in,Paid out,Balance\n' +
      ['15', '16', '17', '18'].map((d) => `${d}/09/2026,"COUNCIL HB T90${d}",650.00,,1.00`).join('\n') +
      '\n';
    expect((await upload('xero-race.csv', csv)).status).toBe(201);
    const [a, b] = await Promise.all([send('post', '/api/xero/stage'), send('post', '/api/xero/stage')]);
    expect([a.status, b.status].sort()).toEqual([201, 409]);
    expect(
      await count(
        `SELECT count(*)::int AS n FROM (SELECT entity_id FROM external_refs WHERE system = 'xero' AND entity_type = 'receipt'
           GROUP BY entity_id HAVING count(*) > 1) d`,
      ),
    ).toBe(0);
  });
});

describe('property tracking from Veco', () => {
  it('admin reloads the Xero property options; lines then carry the Properties tracking', async () => {
    expect((await send('post', '/api/xero/property-map/refresh', 'admin').send({})).status).toBe(503);
    const source: SqlSource = {
      queryRows: async () => [
        {
          portfolioRef: 'P9000',
          optionId: '11111111-1111-4111-8111-111111111111',
          optionName: '9000 Example Street *TSA',
          suffix: 'TSA',
        },
        {
          portfolioRef: 'P9000',
          optionId: '22222222-2222-4222-8222-222222222222',
          optionName: 'zz old name',
          suffix: null,
        },
        {
          portfolioRef: 'P9999',
          optionId: '33333333-3333-4333-8333-333333333333',
          optionName: 'not ours',
          suffix: 'HL',
        },
      ],
    };
    const withVeco = app('demo', true, source);
    expect((await send('post', '/api/xero/property-map/refresh', 'accounts', withVeco).send({})).status).toBe(403);
    const res = await send('post', '/api/xero/property-map/refresh', 'admin', withVeco).send({});
    expect(res.status).toBe(200);
    expect(res.body.summary).toMatchObject({
      fetched: 3,
      matched: 1,
      ambiguous: 1,
    });

    const csv = 'Date,Description,Paid in,Paid out,Balance\n25/09/2026,"COUNCIL HB T9005",650.00,,1.00\n';
    expect((await upload('xero-tracking.csv', csv)).status).toBe(201);
    const line = (await pending()).invoices[0]!.lines[0]!;
    expect(line).toMatchObject({
      tid: 'T9005',
      property: '9000 Example Street *TSA',
      branch: 'TSB',
    });
  });
});

describe('senior-tester probes', () => {
  async function stageDay(date: string, tid: string) {
    const csv = `Date,Description,Paid in,Paid out,Balance\n${date},"COUNCIL HB ${tid}",650.00,,1.00\n`;
    expect((await upload(`xero-probe-${tid}.csv`, csv)).status).toBe(201);
    const res = await send('post', '/api/xero/stage');
    expect(res.status).toBe(201);
    const [d, m, y] = date.split('/');
    return (res.body.batches as Batch[]).find((b) => b.date === `${y}-${m}-${d}`)!;
  }

  it('a receipt reversed after staging but before sending is not posted to Xero', async () => {
    const batch = await stageDay('05/10/2026', 'T9006');
    await pool.query("UPDATE receipts SET status = 'reversed', reversed_reason = 'probe' WHERE id = $1", [
      batch.lines[0]!.receiptId,
    ]);
    bridge.invoices = [];
    await send('post', '/api/xero/run').send({});
    expect(bridge.invoices.filter((i) => i.externalRef === `recon-inv:${batch.batchId}`)).toEqual([]);
  });

  it('a batch whose worker died on its last attempt can still be recovered', async () => {
    const batch = await stageDay('06/10/2026', 'T9007');
    await pool.query(
      "UPDATE sync_outbox SET status = 'in_flight', attempts = 5, next_attempt_at = now() - interval '1 minute' WHERE entity_id = $1",
      [batch.batchId],
    );
    await send('post', '/api/xero/run').send({});
    const { rows } = await pool.query<{ id: string; status: string }>(
      'SELECT id::text AS id, status::text AS status FROM sync_outbox WHERE entity_id = $1',
      [batch.batchId],
    );
    const recoverable =
      rows[0]!.status !== 'in_flight' || (await send('post', `/api/xero/outbox/${rows[0]!.id}/retry`)).status === 200;
    expect(recoverable).toBe(true);
  });

  it('a property map refresh survives Veco moving an option from one building to another', async () => {
    const opt = (n: string) => `${n.repeat(8)}-${n.repeat(4)}-4${n.repeat(3)}-8${n.repeat(3)}-${n.repeat(12)}`;
    const first: SqlSource = {
      queryRows: async () => [
        {
          portfolioRef: 'P9000',
          optionId: opt('4'),
          optionName: 'probe A',
          suffix: 'TSA',
        },
        {
          portfolioRef: 'P9001',
          optionId: opt('5'),
          optionName: 'probe B',
          suffix: 'TSB',
        },
      ],
    };
    const second: SqlSource = {
      queryRows: async () => [
        {
          portfolioRef: 'P9001',
          optionId: opt('4'),
          optionName: 'probe A',
          suffix: 'TSB',
        },
        {
          portfolioRef: 'P9000',
          optionId: opt('6'),
          optionName: 'probe C',
          suffix: 'TSA',
        },
      ],
    };
    expect(
      (await send('post', '/api/xero/property-map/refresh', 'admin', app('demo', true, first)).send({})).status,
    ).toBe(200);
    expect(
      (await send('post', '/api/xero/property-map/refresh', 'admin', app('demo', true, second)).send({})).status,
    ).toBe(200);
  });
});

describe('property map guard', () => {
  it('an empty answer from Veco keeps the current property list', async () => {
    const before = await count(
      "SELECT count(*)::int AS n FROM external_refs WHERE system = 'xero' AND entity_type = 'property'",
    );
    expect(before).toBeGreaterThan(0);
    const empty: SqlSource = { queryRows: async () => [] };
    const res = await send('post', '/api/xero/property-map/refresh', 'admin', app('demo', true, empty)).send({});
    expect(res.status).toBe(502);
    expect(res.body.error.code).toBe('veco_unavailable');
    expect(
      await count("SELECT count(*)::int AS n FROM external_refs WHERE system = 'xero' AND entity_type = 'property'"),
    ).toBe(before);
  });

  it('a partly reversed batch sends only the active lines and frees the reversed receipt', async () => {
    const csv =
      'Date,Description,Paid in,Paid out,Balance\n' +
      '07/10/2026,"COUNCIL HB T9008",650.00,,1.00\n07/10/2026,"COUNCIL HB T9009",650.00,,2.00\n';
    expect((await upload('xero-probe-partial.csv', csv)).status).toBe(201);
    const staged = await send('post', '/api/xero/stage');
    const batch = (staged.body.batches as Batch[]).find((b) => b.date === '2026-10-07')!;
    expect(batch.lines).toHaveLength(2);
    const reversed = batch.lines[0]!;
    await pool.query("UPDATE receipts SET status = 'reversed', reversed_reason = 'probe' WHERE id = $1", [
      reversed.receiptId,
    ]);
    bridge.invoices = [];
    await send('post', '/api/xero/run').send({});
    const sent = bridge.invoices.filter((i) => i.externalRef === `recon-inv:${batch.batchId}`);
    expect(sent).toHaveLength(1);
    expect(sent[0]!.lineItems).toHaveLength(1);
    expect(sent[0]!.lineItems[0]!.unitAmount).toBe(650);
    expect(
      await count(
        `SELECT count(*)::int AS n FROM external_refs WHERE system = 'xero' AND entity_type = 'receipt' AND entity_id = '${reversed.receiptId}'`,
      ),
    ).toBe(0);
    const done = (await outbox('done')).items.find((i) => i.batchId === batch.batchId)!;
    expect(done.lines).toHaveLength(1);
    expect(done.total).toBe('650.00');
  });

  it('a batch abandoned on its last attempt shows as dead, and a person retry sends it once', async () => {
    const csv = 'Date,Description,Paid in,Paid out,Balance\n08/10/2026,"COUNCIL HB T9010",650.00,,1.00\n';
    expect((await upload('xero-probe-abandoned.csv', csv)).status).toBe(201);
    const batch = ((await send('post', '/api/xero/stage')).body.batches as Batch[]).find(
      (b) => b.date === '2026-10-08',
    )!;
    await pool.query(
      "UPDATE sync_outbox SET status = 'in_flight', attempts = 5, next_attempt_at = now() - interval '1 minute' WHERE entity_id = $1",
      [batch.batchId],
    );
    const dead = (await outbox('dead')).items.find((i) => i.batchId === batch.batchId)!;
    expect(dead.lastError).toContain('Check Xero');
    expect((await send('post', `/api/xero/outbox/${dead.id}/retry`)).status).toBe(200);
    bridge.invoices = [];
    await send('post', '/api/xero/run').send({});
    expect(bridge.invoices.filter((i) => i.externalRef === `recon-inv:${batch.batchId}`)).toHaveLength(1);
  });
});
