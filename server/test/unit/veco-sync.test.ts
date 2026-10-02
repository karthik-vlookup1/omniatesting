/**
 * Veco sync building blocks that need no database: row validation, the MCP client protocol,
 * the FOR JSON result parser, name splitting and the nightly schedule.
 */
import { describe, expect, it } from 'vitest';
import { createMcpSqlSource, parseJsonRows, parseRpcMessage, VecoSourceError } from '../../src/jobs/veco-sync/mcp-client.js';
import { loadVecoConfig, msUntilNextRun } from '../../src/jobs/veco-sync/index.js';
import { parseVecoRows } from '../../src/jobs/veco-sync/source.js';
import { splitName } from '../../src/jobs/veco-sync/sync.js';
import { vecoRow } from '../fixtures/veco-rows.js';

describe('parseVecoRows', () => {
  it('maps a warehouse row to a tenancy', () => {
    const { valid, rejected } = parseVecoRows([vecoRow(3, { tid: ' t9003 ', rent: 346.149, frequency: 'Four Weekly' })]);
    expect(rejected).toEqual([]);
    expect(valid[0]).toMatchObject({
      tid: 'T9003',
      startDate: '2025-04-01',
      rent: 346.15,
      frequency: 'four_weekly',
      managementType: 'IRG',
      managementTypeDefaulted: false,
      branchCode: 'TSB',
    });
  });

  it('takes the management type from the Xero property suffix: IRG, MN = MG, a branch code = RG', () => {
    const { valid } = parseVecoRows([
      vecoRow(1, { xeroSuffix: 'IRG', ohgOwned: 0 }),
      vecoRow(2, { xeroSuffix: 'MN', ohgOwned: 1 }), // managed, even though OHG owns the building
      vecoRow(4, { xeroSuffix: 'hl', ohgOwned: 1 }),
      vecoRow(5, { xeroSuffix: 'GPC', ohgOwned: 0 }),
    ]);
    expect(valid.map((v) => [v.tid, v.managementType, v.managementTypeDefaulted])).toEqual([
      ['T9001', 'IRG', false],
      ['T9002', 'MG', false],
      ['T9004', 'RG', false],
      ['T9005', 'RG', false],
    ]);
  });

  it('falls back to the Veco owner flag when the building has no Xero suffix, flagging it', () => {
    const { valid } = parseVecoRows([
      vecoRow(1, { xeroSuffix: null, ohgOwned: 1 }),
      vecoRow(2, { xeroSuffix: 'None', ohgOwned: 0 }),
      vecoRow(4, { xeroSuffix: undefined, ohgOwned: null }),
    ]);
    expect(valid.map((v) => [v.managementType, v.managementTypeDefaulted])).toEqual([
      ['IRG', true],
      ['RG', true],
      ['RG', true],
    ]);
  });

  it('treats empty strings and "None" as missing', () => {
    const { valid } = parseVecoRows([vecoRow(1, { ni: 'None', tenantName: '  ', contactPk: '' })]);
    expect(valid[0]).toMatchObject({ ni: null, tenantName: null, contactPk: null });
  });

  it('rejects bad rows with a reason instead of guessing', () => {
    const { valid, rejected } = parseVecoRows([
      vecoRow(1, { tid: 'X12' }),
      vecoRow(2, { frequency: 'Annually' }),
      vecoRow(3, { rent: -5 }),
      vecoRow(4, { startDate: '' }),
      vecoRow(5, { postcode: '' }),
      vecoRow(6),
      vecoRow(6, { tenantName: 'Second copy' }),
    ]);
    expect(valid.map((v) => v.tid)).toEqual(['T9006']);
    expect(rejected).toHaveLength(6);
    expect(rejected[0]).toEqual({ tid: 'X12', reason: expect.stringContaining('tid') as string });
    expect(rejected[1]!.reason).toContain('frequency');
    expect(rejected[2]!.reason).toContain('rent');
    expect(rejected[5]).toEqual({ tid: 'T9006', reason: 'duplicate TID in the Veco feed' });
  });

  it('keeps zero rent (rent-free rooms) and rounds half-up to pence like Postgres', () => {
    const { valid } = parseVecoRows([vecoRow(1, { rent: 0 }), vecoRow(2, { rent: 0.005 }), vecoRow(3, { rent: 1.005 }), vecoRow(4, { rent: 10.075 }), vecoRow(5, { rent: 346.149 })]);
    expect(valid.map((v) => v.rent)).toEqual([0, 0.01, 1.01, 10.08, 346.15]);
  });

  it('lists every usable TID as present, including rejected rows, so they are never ended', () => {
    const { valid, rejected, presentTids } = parseVecoRows([
      vecoRow(1),
      vecoRow(2, { frequency: 'Annually' }),
      vecoRow(3, { tid: ' t9003 ', postcode: '' }),
      vecoRow(4, { tid: 'junk' }),
    ]);
    expect(valid).toHaveLength(1);
    expect(rejected).toHaveLength(3);
    expect(presentTids.sort()).toEqual(['T9001', 'T9002', 'T9003']);
  });
});

describe('splitName', () => {
  it('splits on the last space and handles one-word and empty names', () => {
    expect(splitName('Mr A B Sample')).toEqual({ first: 'Mr A B', last: 'Sample' });
    expect(splitName('Cher')).toEqual({ first: 'Cher', last: '' });
    expect(splitName('   ')).toBeNull();
    expect(splitName(null)).toBeNull();
  });
});

describe('parseJsonRows', () => {
  it('rejoins FOR JSON chunks split across lines, with commas, quotes and newlines intact', () => {
    const json = JSON.stringify([{ a: 'x,y', b: 'q"t', c: null, d: 'l1\nl2' }]);
    const text = `JSON_F52E2B61-18A1-11d1-B105-00805F49916B\n${json.slice(0, 10)}\n${json.slice(10)}`;
    expect(parseJsonRows(text)).toEqual([{ a: 'x,y', b: 'q"t', c: null, d: 'l1\nl2' }]);
  });

  it('returns no rows for an empty result and errors on garbage', () => {
    expect(parseJsonRows('JSON_F52E2B61-18A1-11d1-B105-00805F49916B')).toEqual([]);
    expect(parseJsonRows('JSON_F52E\nNone')).toEqual([]);
    expect(() => parseJsonRows('h\n{not json')).toThrow(VecoSourceError);
    expect(() => parseJsonRows('h\n{"a":1}')).toThrow('not a list');
  });
});

describe('parseRpcMessage', () => {
  it('reads plain JSON and SSE bodies and picks the matching id', () => {
    expect(parseRpcMessage('{"jsonrpc":"2.0","id":1,"result":1}', 1).result).toBe(1);
    const sse = 'event: message\ndata: {"jsonrpc":"2.0","id":1,"result":"a"}\n\ndata: {"jsonrpc":"2.0","id":2,"result":"b"}\n';
    expect(parseRpcMessage(sse, 2).result).toBe('b');
    expect(() => parseRpcMessage('data: nope', 1)).toThrow(VecoSourceError);
  });
});

const SECRET_URL = 'https://veco.example.test/mcp?key=SECRET-KEY-123';

/** A fake MCP server: answers initialize with a session id and execute_sql with `toolResult`. */
function fakeMcp(toolResult: object, opts: { status?: number } = {}) {
  const calls: { method?: string; session: string | null; query?: string }[] = [];
  const fetchImpl = (async (_url: string, init: RequestInit) => {
    const body = JSON.parse(String(init.body)) as { id?: number; method: string; params?: { arguments?: { query: string } } };
    const headers = new Headers(init.headers);
    calls.push({ method: body.method, session: headers.get('mcp-session-id'), query: body.params?.arguments?.query });
    if (opts.status) return new Response('nope', { status: opts.status });
    if (body.method === 'notifications/initialized') return new Response(null, { status: 202 });
    const result = body.method === 'initialize' ? { protocolVersion: '2025-06-18' } : toolResult;
    const sse = `event: message\ndata: ${JSON.stringify({ jsonrpc: '2.0', id: body.id, result })}\n\n`;
    return new Response(sse, {
      status: 200,
      headers: { 'Content-Type': 'text/event-stream', 'mcp-session-id': 'sess-1' },
    });
  }) as unknown as typeof fetch;
  return { calls, fetchImpl };
}

describe('createMcpSqlSource', () => {
  it('runs initialize -> initialized -> execute_sql with the session id and FOR JSON', async () => {
    const rows = [{ tid: 'T9001' }];
    const text = `JSON_F52E\n${JSON.stringify(rows)}`;
    const mcp = fakeMcp({ structuredContent: { result: text }, content: [{ type: 'text', text }], isError: false });
    const source = createMcpSqlSource({ url: SECRET_URL, fetchImpl: mcp.fetchImpl });
    expect(await source.queryRows('SELECT 1 AS a;')).toEqual(rows);
    expect(mcp.calls.map((c) => c.method)).toEqual(['initialize', 'notifications/initialized', 'tools/call']);
    expect(mcp.calls.slice(1).every((c) => c.session === 'sess-1')).toBe(true);
    expect(mcp.calls[2]!.query).toBe('SELECT 1 AS a FOR JSON PATH, INCLUDE_NULL_VALUES');
  });

  it('turns a tool error into VecoSourceError', async () => {
    const mcp = fakeMcp({ content: [{ type: 'text', text: 'Invalid object name' }], isError: true });
    const source = createMcpSqlSource({ url: SECRET_URL, fetchImpl: mcp.fetchImpl });
    await expect(source.queryRows('SELECT 1')).rejects.toThrow('Veco query failed: Invalid object name');
  });

  it('never puts the keyed URL into an error message', async () => {
    const http = createMcpSqlSource({ url: SECRET_URL, fetchImpl: fakeMcp({}, { status: 401 }).fetchImpl });
    const down = createMcpSqlSource({
      url: SECRET_URL,
      fetchImpl: (async () => {
        throw new TypeError(`fetch failed for ${SECRET_URL}`);
      }) as unknown as typeof fetch,
    });
    for (const source of [http, down]) {
      const err = (await source.queryRows('SELECT 1').catch((e: unknown) => e)) as Error;
      expect(err).toBeInstanceOf(VecoSourceError);
      expect(err.message).not.toContain('SECRET-KEY-123');
    }
  });
});

describe('veco config and schedule', () => {
  it('is disabled without a URL, requires https, never echoes the URL', () => {
    expect(loadVecoConfig({})).toEqual({ mcpUrl: undefined, syncHour: 4 });
    expect(loadVecoConfig({ VECO_MCP_URL: SECRET_URL, VECO_SYNC_HOUR: '2' })).toEqual({ mcpUrl: SECRET_URL, syncHour: 2 });
    expect(() => loadVecoConfig({ VECO_MCP_URL: 'http://x.test/mcp?key=SECRET-KEY-123' })).toThrow(
      /VECO_MCP_URL must be an https/,
    );
    try {
      loadVecoConfig({ VECO_MCP_URL: 'http://x.test/mcp?key=SECRET-KEY-123' });
    } catch (err) {
      expect((err as Error).message).not.toContain('SECRET-KEY-123');
    }
    expect(() => loadVecoConfig({ VECO_SYNC_HOUR: '24' })).toThrow('VECO_SYNC_HOUR');
  });

  it('schedules the next run at the configured local hour', () => {
    const before = new Date(2026, 9, 2, 3, 30, 0);
    expect(msUntilNextRun(4, before)).toBe(30 * 60 * 1000);
    const after = new Date(2026, 9, 2, 4, 0, 0);
    expect(msUntilNextRun(4, after)).toBe(24 * 60 * 60 * 1000);
  });
});
