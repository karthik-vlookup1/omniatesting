import { describe, expect, it } from 'vitest';
import { buildRows, normalisePhone, parseTid, stripTid } from '../../src/domain/agentos/sync.js';
import { AgentosApiError, SYNC_FLAGS, type SyncFlag } from '../../src/domain/agentos/types.js';
import { createAgentosClient, loadAgentosApiConfig, type AgentosApiConfig } from '../../src/services/agentos/api-client.js';
import { ConfigError } from '../../src/config/env.js';
import { fixtureDeposits, fixtureTenancies, fixtureTenants } from '../fixtures/agentos/api/fixture-client.js';

const KEY = 'sekrit-key-123';
const cfg: AgentosApiConfig = {
  apiKey: KEY,
  baseUrl: 'https://api.example.test',
  shortName: 'isl',
  branchId: '0004-6020-1894-c1a8',
  managedBy: 'Investing Solutions',
};

describe('parseTid', () => {
  it.each([
    ['9701 Ana', '9701', 'Ana', []],
    ['9702', '9702', '', ['tid_only_forename']],
    ['97031 Cy', '97031', 'Cy', ['tid_5_digit']],
    ['T9705 Fin', '9705', 'Fin', []],
    ['Dee', null, 'Dee', ['no_tid']],
    ['', null, '', ['no_tid']],
    ['  9704   Eve ', '9704', 'Eve', []],
    ['123 Short', null, '123 Short', ['no_tid']],
  ])('%j', (forename, tid, firstName, flags) => {
    expect(parseTid(forename)).toEqual({ tid, firstName, flags });
  });
  it('treats null as no tid and strips the tid', () => {
    expect(parseTid(null).flags).toEqual(['no_tid']);
    expect(stripTid('T9705 Fin')).toBe('Fin');
  });
});

describe('buildRows', () => {
  const rows = buildRows(fixtureTenants(), fixtureTenancies(), fixtureDeposits(), { managedBy: 'MB' });
  const by = (n: number) => rows.find((r) => r.agentosOid === `aaaa-0000-0000-00${n}`)!;

  it('counts each flag', () => {
    const counts = Object.fromEntries(SYNC_FLAGS.map((f) => [f, rows.filter((r) => r.flags.includes(f)).length]));
    expect(counts).toEqual({
      no_tid: 2,
      tid_only_forename: 1,
      tid_5_digit: 1,
      tid_shared_across_tenancies: 3,
      no_reporting_tenancy: 1,
      no_deposit_record: 2,
      lead_inferred: 2,
      gdpr_withheld: 1,
    } satisfies Record<SyncFlag, number>);
  });

  it('sets lead from the deposit record and infers it when absent', () => {
    expect(by(11).isHeadTenant).toBe(true);
    expect(by(12).isHeadTenant).toBe(false);
    expect(by(19).isHeadTenant).toBe(true);
    expect(by(19).flags).toContain('lead_inferred');
    expect(by(11).flags).not.toContain('lead_inferred');
  });

  it('builds descriptor, residence and contact fields', () => {
    expect(by(11).tenancyDescriptor).toBe('Signed Tenancy 01/09/2025 - 31/08/2026');
    expect(by(14).tenancyDescriptor).toBe('Signed Tenancy 01/09/2025 - No End Date Periodic');
    expect(by(15).tenancyDescriptor.startsWith('Ended Tenancy')).toBe(true);
    expect(by(16).tenancyDescriptor.startsWith('Closed Tenancy')).toBe(true);
    expect(by(17).tenancyDescriptor.startsWith('Proposed Tenancy')).toBe(true);
    expect(by(18).tenancyDescriptor.startsWith('Abandoned Tenancy')).toBe(true);
    expect(by(20).tenancyDescriptor).toBe('Unknown Tenancy');
    expect(by(14).residence).toBe('1 Test Road, Testville, ZZ1 1ZZ');
    expect(by(20).residence).toBe('');
    expect(by(11)).toMatchObject({
      forename: '9701 Ana',
      surname: 'Testa',
      title: 'Ms',
      phone: '07700900001',
      managedBy: 'MB',
    });
    expect(by(12).phone).toBe('02079460002');
    expect(by(18)).toMatchObject({ tid: null, forename: '', surname: '', email: null });
  });

  it('normalises phones', () => {
    expect(normalisePhone('+44 7700 900 001', '020')).toBe('07700900001');
    expect(normalisePhone(' ', '020 7946 0002')).toBe('02079460002');
    expect(normalisePhone(null, null)).toBeNull();
  });
});

describe('agentos client', () => {
  const records = Array.from({ length: 10 }, (_, i) => ({ OID: `r${i}` }));
  function harness(statuses: number[] = []) {
    const calls: { url: string; init: RequestInit }[] = [];
    const sleeps: number[] = [];
    const queue = [...statuses];
    const fetchFn = ((url: string, init: RequestInit) => {
      calls.push({ url, init });
      const status = queue.shift() ?? 200;
      if (status !== 200) return Promise.resolve(new Response('secret body', { status }));
      const m = /\/(\d+)\/(\d+)\?/.exec(url)!;
      const off = Number(m[1]);
      const n = Number(m[2]);
      return Promise.resolve(new Response(JSON.stringify({ Data: records.slice(off, off + n), Count: records.length })));
    }) as unknown as typeof fetch;
    const client = createAgentosClient(cfg, {
      fetch: fetchFn,
      sleep: (ms) => {
        sleeps.push(ms);
        return Promise.resolve();
      },
      now: () => 0,
      pageSize: 3,
    });
    return { client, calls, sleeps };
  }

  it('pages 10 records in 4 calls per list with header, path and throttle', async () => {
    const { client, calls, sleeps } = harness();
    for (const list of [client.listTenants, client.listTenancies, client.listDeposits]) {
      expect(await list()).toHaveLength(10);
    }
    expect(calls).toHaveLength(12);
    expect(calls.slice(0, 4).map((c) => c.url)).toEqual(
      [0, 3, 6, 9].map(
        (o) => `https://api.example.test/v4/maintenance/isl/contacts/tenants/0004-6020-1894-c1a8/${o}/3?integrator=omnia-recon`,
      ),
    );
    expect(calls[4]!.url).toContain('/v4/reporting/isl/lettings/tenancies/0/3?');
    expect(calls[8]!.url).toContain('/v4/deposits/isl/deposits/0004-6020-1894-c1a8/tenancies/0/3?');
    for (const c of calls) {
      expect(c.init.method).toBe('GET');
      expect((c.init.headers as Record<string, string>)['X-API-KEY']).toBe(KEY);
      expect(c.url).not.toContain(KEY);
    }
    expect(sleeps).toHaveLength(11);
    expect(new Set(sleeps)).toEqual(new Set([1300]));
  });

  it('retries a 429 once after 60 s', async () => {
    const { client, calls, sleeps } = harness([429]);
    expect(await client.listTenancies()).toHaveLength(10);
    expect(calls).toHaveLength(5);
    expect(sleeps.filter((s) => s === 60000)).toHaveLength(1);
  });

  it('gives up after 3 attempts on 5xx', async () => {
    const { client, calls } = harness([500, 503, 502]);
    await expect(client.listTenants()).rejects.toBeInstanceOf(AgentosApiError);
    expect(calls).toHaveLength(3);
  });

  it('throws AgentosApiError on 401 without the key or body in the message', async () => {
    const { client } = harness([401]);
    const err = (await client.listTenants().catch((e: unknown) => e)) as AgentosApiError;
    expect(err).toBeInstanceOf(AgentosApiError);
    expect(err.status).toBe(401);
    expect(err.message).not.toContain(KEY);
    expect(err.message).not.toContain('secret body');
  });

  it('stops paging on an empty page', async () => {
    const fetchFn = (() => Promise.resolve(new Response(JSON.stringify({ Data: [], Count: 50 })))) as unknown as typeof fetch;
    const client = createAgentosClient(cfg, { fetch: fetchFn, sleep: () => Promise.resolve() });
    expect(await client.listTenants()).toEqual([]);
  });
});

describe('loadAgentosApiConfig', () => {
  it('requires key and an https base url, naming variables not values', () => {
    expect(() => loadAgentosApiConfig({})).toThrow(ConfigError);
    try {
      loadAgentosApiConfig({ AGENTOS_API_KEY: KEY, AGENTOS_BASE_URL: 'http://x.test' });
      expect.unreachable();
    } catch (e) {
      expect((e as Error).message).toContain('AGENTOS_BASE_URL');
      expect((e as Error).message).not.toContain(KEY);
    }
  });
  it('applies defaults and needs no deposit-to setting', () => {
    expect(loadAgentosApiConfig({ AGENTOS_API_KEY: KEY, AGENTOS_BASE_URL: 'https://a.test/' })).toMatchObject({
      baseUrl: 'https://a.test',
      shortName: 'isl',
      branchId: '0004-6020-1894-c1a8',
      managedBy: 'Investing Solutions',
    });
  });
});
