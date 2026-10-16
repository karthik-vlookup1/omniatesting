/**
 * The SQL the VECO push would send, checked as text against a recording fake. No real VECO / MCP endpoint is
 * called and VECO_RW_MCP_URL is never read.
 */
import { describe, expect, it } from 'vitest';
import { createMcpSqlClient, VecoSourceError, type SqlBatchRunner, type SqlSource } from '../../src/jobs/veco-sync/mcp-client.js';
import { classify, type Candidate, type TenantLookupRow } from '../../src/services/veco-push/classify.js';
import { loadVecoPushConfig } from '../../src/services/veco-push/config.js';
import { createSqlGateway } from '../../src/services/veco-push/gateway.js';
import { buildRows } from '../../src/services/veco-push/row-builder.js';
import { deleteBatchSql, insertBatchSql, lookupSql, readBackSql } from '../../src/services/veco-push/sql-batches.js';

const STAFF = '11111111-2222-3333-4444-555555555555';
const hex = (n: number) => n.toString(16).toUpperCase().padStart(12, '0');
const guidSeq = () => {
  let i = 0;
  return () => `AAAAAAAA-0000-4000-8000-${hex(++i)}`;
};

function makeRows(n: number) {
  const ready = Array.from({ length: n }, (_, i) => {
    const c: Candidate = {
      receiptId: `00000000-0000-4000-8000-${hex(i + 1)}`,
      tid: `T${1000 + i}`,
      amount: '10.00',
      paymentDate: '2026-10-14',
      sourceBank: 'HSBC',
      tenantName: null,
      property: null,
      landlord: null,
    };
    const l: TenantLookupRow = {
      tid: c.tid,
      tenancyFk: 'BBBBBBBB-0000-4000-8000-000000000001',
      contactFk: 'CCCCCCCC-0000-4000-8000-000000000001',
      propertyFk: 'DDDDDDDD-0000-4000-8000-000000000001',
      officeName: 'MY',
      ownerCount: 1,
      ownerFk: 'EEEEEEEE-0000-4000-8000-000000000001',
      officeCount: 1,
      officeFk: 'FFFFFFFF-0000-4000-8000-000000000001',
      delayPayment: false,
      addressTitle: "Mr O'Test",
      lastDescription: null,
      lastDepartment: 'Tenancy',
    };
    return classify([c], [l], { bankOk: true, sentIds: new Set(), departments: {} }).ready[0]!;
  });
  return buildRows(ready, { at: new Date('2026-10-14T13:17:06Z'), staffFk: STAFF, uuid: guidSeq() }).rows;
}

describe('insert batch SQL', () => {
  const rows = makeRows(3);
  const sql = insertBatchSql(rows);

  it('puts the database guard first, inside one TRY/TRAN with rollback', () => {
    expect(sql.indexOf('DB_NAME() <> N\'Test Database Read Write\'')).toBeGreaterThan(-1);
    expect(sql.indexOf('DB_NAME()')).toBeLessThan(sql.indexOf('BEGIN TRAN'));
    expect(sql.indexOf('DB_NAME()')).toBeLessThan(sql.indexOf('INSERT INTO'));
    expect(sql.match(/BEGIN TRAN;/g)).toHaveLength(1);
    expect(sql.match(/COMMIT TRAN;/g)).toHaveLength(1);
    expect(sql).toContain('BEGIN TRY');
    expect(sql).toContain('BEGIN CATCH IF @@TRANCOUNT > 0 ROLLBACK TRAN; THROW; END CATCH');
    expect(sql).toContain('SET XACT_ABORT ON');
  });

  it('checks the keys do not exist before the first INSERT', () => {
    const firstInsert = sql.indexOf('INSERT INTO');
    for (const marker of ['50002', '50003', '50004']) {
      const at = sql.indexOf(marker);
      expect(at).toBeGreaterThan(-1);
      expect(at).toBeLessThan(firstInsert);
    }
  });

  it('uses no OPENJSON / STRING_SPLIT / STRING_AGG', () => {
    expect(sql).not.toMatch(/OPENJSON|STRING_SPLIT|STRING_AGG/i);
  });

  it('writes 79 values per Transaction tuple and 14 per Allocation tuple, escaping quotes', () => {
    const txInsert = /INSERT INTO dbo\.\[Transaction\] \(([^)]*)\) VALUES (.*);/.exec(sql)!;
    expect(txInsert[1]!.split(',')).toHaveLength(79);
    const tuples = txInsert[2]!.split(/\),\s\(/);
    expect(tuples).toHaveLength(3);
    const alInsert = /INSERT INTO dbo\.Allocation \(([^)]*)\) VALUES (.*);/.exec(sql)!;
    expect(alInsert[1]!.split(',')).toHaveLength(14);
    expect(sql).toContain("Rent Received  From Mr O''Test");
  });

  it('splits 501 receipts into two VALUES chunks per table', () => {
    const big = insertBatchSql(makeRows(501));
    expect(big.match(/INSERT INTO dbo\.\[Transaction\]/g)).toHaveLength(2);
    expect(big.match(/INSERT INTO dbo\.Allocation/g)).toHaveLength(2);
  });
});

describe('read SQL', () => {
  it('the lookup is one SELECT with no write keywords', () => {
    const sql = lookupSql(['T1', 'T2']);
    expect(sql).toMatch(/^\/\* omnia:lookup \*\/ SELECT /);
    expect(sql.match(/;/g) ?? []).toHaveLength(0);
    expect(sql).not.toMatch(/\b(INSERT|UPDATE|DELETE|DROP|ALTER|CREATE|EXEC|MERGE|TRUNCATE)\b/i);
    expect(sql).toContain("IN (N'T1', N'T2')");
  });

  it('the read-back selects the 30 + 7 values and the tenant name', () => {
    const sql = readBackSql(['AAAAAAAA-0000-4000-8000-000000000001'], ['AAAAAAAA-0000-4000-8000-000000000002']);
    expect(sql).toContain('a.AllocationPK AS a_AllocationPK');
    expect(sql).toContain('AS tenantName');
    expect(sql).not.toMatch(/\b(INSERT|UPDATE|DELETE)\b/i);
  });
});

describe('delete SQL', () => {
  const tx = ['AAAAAAAA-0000-4000-8000-000000000001', 'AAAAAAAA-0000-4000-8000-000000000002'];
  const al = ['BBBBBBBB-0000-4000-8000-000000000001', 'BBBBBBBB-0000-4000-8000-000000000002'];
  const sql = deleteBatchSql(tx, al);

  it('guards the database, deletes Allocation before Transaction, and refuses foreign references', () => {
    expect(sql.indexOf('DB_NAME()')).toBeLessThan(sql.indexOf('DELETE FROM'));
    expect(sql.indexOf('DELETE FROM dbo.Allocation')).toBeLessThan(sql.indexOf('DELETE FROM dbo.[Transaction]'));
    expect(sql).toContain('50006');
    expect(sql).toContain('AllocationPK NOT IN');
  });

  it('only mentions GUIDs that came from the inputs', () => {
    const found = sql.match(/[0-9A-F]{8}-[0-9A-F]{4}-[0-9A-F]{4}-[0-9A-F]{4}-[0-9A-F]{12}/gi) ?? [];
    expect(found.length).toBeGreaterThan(0);
    for (const g of found) expect([...tx, ...al]).toContain(g.toUpperCase());
  });

  it('rejects an unsafe key instead of sending it', () => {
    expect(() => deleteBatchSql(["x' OR 1=1 --"], al)).toThrow('unsafe SQL value');
  });
});

describe('gateway database lock', () => {
  const sqlWith = (db: string): SqlSource & SqlBatchRunner => ({
    queryRows: async () => [{ db }],
    executeBatch: async () => '',
  });

  it('assertTargetDb refuses any other database name', async () => {
    await expect(createSqlGateway(sqlWith('Test Database Read Write')).assertTargetDb()).resolves.toBeUndefined();
    await expect(createSqlGateway(sqlWith('Veco-onesystem')).assertTargetDb()).rejects.toMatchObject({
      status: 409,
      details: { reason: 'wrong_database' },
    });
  });

  it('createSqlGateway cannot be pointed at another database', () => {
    expect(() => createSqlGateway(sqlWith('x'), 'Veco-onesystem')).toThrow();
  });
});

describe('MCP client batch method', () => {
  function fakeFetch(toolResult: unknown, seen: { queries: string[]; names: string[] }): typeof fetch {
    return (async (_url: unknown, init: RequestInit) => {
      const body = JSON.parse(String(init.body)) as { id?: number; method: string; params?: { name?: string; clientInfo?: { name: string }; arguments?: { query: string } } };
      if (body.method === 'initialize') seen.names.push(body.params!.clientInfo!.name);
      if (body.method === 'tools/call') seen.queries.push(body.params!.arguments!.query);
      const result = body.method === 'tools/call' ? toolResult : {};
      return new Response(JSON.stringify({ jsonrpc: '2.0', id: body.id, result }), {
        status: 200,
        headers: { 'content-type': 'application/json', 'mcp-session-id': 's1' },
      });
    }) as unknown as typeof fetch;
  }

  it('executeBatch sends the SQL unwrapped and returns the text', async () => {
    const seen = { queries: [] as string[], names: [] as string[] };
    const client = createMcpSqlClient({
      url: 'https://example.invalid/mcp',
      fetchImpl: fakeFetch({ content: [{ type: 'text', text: 'OMNIA_PUSH_OK' }] }, seen),
      clientName: 'omnia-recon-veco-push',
    });
    expect(await client.executeBatch('  SELECT 1;  ')).toBe('OMNIA_PUSH_OK');
    expect(seen.queries).toEqual(['SELECT 1;']);
    expect(seen.names).toEqual(['omnia-recon-veco-push']);
  });

  it('a tool error becomes a VecoSourceError, and queryRows still appends FOR JSON', async () => {
    const failing = createMcpSqlClient({
      url: 'https://example.invalid/mcp',
      fetchImpl: fakeFetch({ isError: true, content: [{ type: 'text', text: 'boom' }] }, { queries: [], names: [] }),
    });
    await expect(failing.executeBatch('SELECT 1')).rejects.toBeInstanceOf(VecoSourceError);

    const seen = { queries: [] as string[], names: [] as string[] };
    const reading = createMcpSqlClient({
      url: 'https://example.invalid/mcp',
      fetchImpl: fakeFetch({ content: [{ type: 'text', text: 'JSON_F52E\n[{"a":1}]' }] }, seen),
    });
    expect(await reading.queryRows('SELECT 1 AS a;')).toEqual([{ a: 1 }]);
    expect(seen.queries[0]).toBe('SELECT 1 AS a FOR JSON PATH, INCLUDE_NULL_VALUES');
  });
});

describe('loadVecoPushConfig', () => {
  it('treats empty as not configured and never echoes a bad value', () => {
    expect(loadVecoPushConfig({})).toEqual({ rwMcpUrl: null });
    expect(loadVecoPushConfig({ VECO_RW_MCP_URL: '' })).toEqual({ rwMcpUrl: null });
    expect(loadVecoPushConfig({ VECO_RW_MCP_URL: 'https://example.invalid/mcp?key=abc' }).rwMcpUrl).toContain('example.invalid');
    let message = '';
    try {
      loadVecoPushConfig({ VECO_RW_MCP_URL: 'not-a-url-SECRETKEY123' });
    } catch (err) {
      message = (err as Error).message;
    }
    expect(message).toContain('Invalid VECO push configuration: VECO_RW_MCP_URL');
    expect(message).not.toContain('SECRETKEY123');
  });
});
