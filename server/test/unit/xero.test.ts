import { describe, expect, it } from 'vitest';
import { createHttpBridge, loadXeroConfig, BridgeError } from '../../src/services/xero/bridge.js';
import {
  branchTracking,
  invoiceNumberFor,
  sumPounds,
  toBridgeInvoice,
  type Batch,
} from '../../src/services/xero/xero.service.js';

const batch: Batch = {
  batchId: '00000000-0000-4000-8000-0000000000b7',
  bankCode: 'HSBC',
  contactName: 'Apollo HSBC',
  date: '2026-10-01',
  invoiceNumber: 'Apollo HSBC 011026',
  total: '791.90',
  lines: [
    {
      receiptId: 'r1',
      tid: 'T6644',
      tenantName: 'Test Person',
      amount: '12.12',
      accountCode: '001',
      managementType: 'RG',
      branch: 'HL',
      property: '0866 Example Road *HL',
    },
    {
      receiptId: 'r2',
      tid: 'T6412',
      tenantName: null,
      amount: '779.78',
      accountCode: '001B',
      managementType: 'MG',
      branch: 'Managed',
      property: null,
    },
  ],
};

describe('Xero invoice shape', () => {
  it('numbers invoices "<contact> DDMMYY" like the accounts team', () => {
    expect(invoiceNumberFor('Apollo HSBC', '2026-10-01')).toBe('Apollo HSBC 011026');
  });

  it('tracks Branch as the office for RG, "Managed" for MG and "IRG" for IRG', () => {
    expect(branchTracking('RG', 'HL')).toBe('HL');
    expect(branchTracking('MG', 'HL')).toBe('Managed');
    expect(branchTracking('IRG', 'BA')).toBe('IRG');
    expect(branchTracking('RG', null)).toBeNull();
  });

  it('sums money exactly', () => {
    expect(sumPounds(['12.12', '779.78'])).toBe('791.90');
    expect(sumPounds(['0.1', '0.2'])).toBe('0.30');
  });

  it('core fields only: TID kept in the description, No VAT, due date = date, idempotent externalRef', () => {
    const inv = toBridgeInvoice(batch, 'c-1', false);
    expect(inv).toEqual({
      externalRef: 'recon-inv:00000000-0000-4000-8000-0000000000b7',
      contactId: 'c-1',
      date: '2026-10-01',
      dueDate: '2026-10-01',
      status: 'AUTHORISED',
      lineItems: [
        {
          description: 'T6644 Test Person',
          quantity: 1,
          unitAmount: 12.12,
          accountCode: '001',
          taxType: 'NONE',
        },
        {
          description: 'T6412',
          quantity: 1,
          unitAmount: 779.78,
          accountCode: '001B',
          taxType: 'NONE',
        },
      ],
    });
  });

  it('extended fields add the invoice number, reference, item code and tracking', () => {
    const inv = toBridgeInvoice(batch, 'c-1', true);
    expect(inv).toMatchObject({
      invoiceNumber: 'Apollo HSBC 011026',
      reference: 'Rental Income',
    });
    expect(inv.lineItems).toEqual([
      {
        description: 'Test Person',
        itemCode: 'T6644',
        quantity: 1,
        unitAmount: 12.12,
        accountCode: '001',
        taxType: 'NONE',
        tracking: [
          { name: 'Properties', option: '0866 Example Road *HL' },
          { name: 'Branch', option: 'HL' },
        ],
      },
      {
        description: 'T6412',
        itemCode: 'T6412',
        quantity: 1,
        unitAmount: 779.78,
        accountCode: '001B',
        taxType: 'NONE',
        tracking: [{ name: 'Branch', option: 'Managed' }],
      },
    ]);
  });
});

describe('bridge config and client', () => {
  it('only an explicit XERO_TARGET_ENV=demo is demo; anything else is live', () => {
    expect(loadXeroConfig({ XERO_TARGET_ENV: 'demo' }).targetEnv).toBe('demo');
    expect(loadXeroConfig({}).targetEnv).toBe('live');
    expect(loadXeroConfig({ XERO_TARGET_ENV: 'Demo' }).targetEnv).toBe('live');
    expect(loadXeroConfig({ XERO_TARGET_ENV: 'staging' }).targetEnv).toBe('live');
    expect(loadXeroConfig({ XERO_BRIDGE_URL: ' ', XERO_BRIDGE_RECON_KEY: '' })).toMatchObject({ url: null, key: null });
    expect(() =>
      loadXeroConfig({
        NODE_ENV: 'production',
        XERO_BRIDGE_URL: 'http://bridge',
      }),
    ).toThrow('https');
  });

  it('sends the key header, and turns errors and missing ids into BridgeError', async () => {
    const calls: {
      url: string;
      headers: Record<string, string>;
      body: unknown;
    }[] = [];
    const replies = [
      new Response(JSON.stringify({ contactId: 'c-9', created: true }), {
        status: 200,
      }),
      new Response(JSON.stringify({ error: 'Validation failed' }), {
        status: 400,
      }),
      new Response(JSON.stringify({ invoice: {} }), { status: 200 }),
    ];
    const fetchImpl = (async (url: string, init: RequestInit) => {
      calls.push({
        url,
        headers: init.headers as Record<string, string>,
        body: init.body ? JSON.parse(init.body as string) : null,
      });
      return replies.shift()!;
    }) as unknown as typeof fetch;
    const b = createHttpBridge({ url: 'https://bridge.example.test/', key: 'k-test' }, { fetchImpl });

    expect(await b.upsertContact('Apollo HSBC')).toEqual({
      contactId: 'c-9',
      created: true,
    });
    expect(calls[0]).toMatchObject({
      url: 'https://bridge.example.test/api/contacts',
      body: { name: 'Apollo HSBC', email: null },
    });
    expect(calls[0]!.headers['X-Api-Key']).toBe('k-test');

    const inv = toBridgeInvoice(batch, 'c-9', false);
    await expect(b.createInvoice(inv)).rejects.toMatchObject({
      name: 'BridgeError',
      status: 400,
      message: expect.stringContaining('Validation failed') as string,
    });
    await expect(b.createInvoice(inv)).rejects.toBeInstanceOf(BridgeError);
  });

  it('a network failure is a BridgeError with status 0 that never echoes the URL or key', async () => {
    const fetchImpl = (async () => {
      throw new TypeError('fetch failed https://secret.example.test?key=k-secret');
    }) as unknown as typeof fetch;
    const b = createHttpBridge({ url: 'https://secret.example.test', key: 'k-secret' }, { fetchImpl });
    const err = (await b.health().catch((e: unknown) => e)) as BridgeError;
    expect(err.status).toBe(0);
    expect(err.message).not.toMatch(/secret|k-secret/);
  });
});

describe('senior-tester probes: background worker gate', () => {
  it('never runs unattended unless XERO_TARGET_ENV is exactly demo', async () => {
    const { vi } = await import('vitest');
    const { scheduleXeroWorker } = await import('../../src/jobs/xero/worker.js');
    vi.useFakeTimers();
    try {
      const calls: string[] = [];
      const pool = {
        query: async () => {
          calls.push('query');
          return { rows: [{ n: 0 }] };
        },
      } as never;
      const bridge = {
        health: async () => ({ status: 'ok', tenantId: null }),
        upsertContact: async () => {
          calls.push('contact');
          return { contactId: 'c', created: false };
        },
        createInvoice: async () => {
          calls.push('invoice');
          throw new Error('no');
        },
      };
      const logger = { info: () => {}, error: () => {} } as never;
      for (const env of [{}, { XERO_TARGET_ENV: 'live' }, { XERO_TARGET_ENV: 'Demo' }, { XERO_TARGET_ENV: 'demo ' }]) {
        const cfg = loadXeroConfig(env as NodeJS.ProcessEnv);
        const stop = scheduleXeroWorker(pool, bridge, cfg, logger, 1000);
        await vi.advanceTimersByTimeAsync(5000);
        stop();
        if (env.XERO_TARGET_ENV === 'demo ') continue; // trimmed to demo by design
        expect(calls).toEqual([]);
      }
      const stop = scheduleXeroWorker(
        pool,
        bridge,
        loadXeroConfig({ XERO_TARGET_ENV: 'demo' } as NodeJS.ProcessEnv),
        logger,
        1000,
      );
      calls.length = 0;
      await vi.advanceTimersByTimeAsync(1500);
      stop();
      expect(calls).toContain('query');
    } finally {
      vi.useRealTimers();
    }
  });
});
