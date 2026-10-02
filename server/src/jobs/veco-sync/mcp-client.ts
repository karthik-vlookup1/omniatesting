/**
 * Minimal client for the Veco read-only SQL MCP (streamable HTTP transport).
 *
 *   initialize -> mcp-session-id header -> notifications/initialized -> tools/call execute_sql
 *
 * The server answers execute_sql with unquoted CSV text, which breaks on commas or newlines in
 * values and prints NULL as "None". So every query is wrapped in FOR JSON PATH: the CSV then has a
 * single JSON column, split across rows, which we join back together and parse.
 *
 * The URL carries the access key, so it is never logged or put into an error message.
 */

const PROTOCOL_VERSION = '2025-06-18';

export interface SqlSource {
  /** Runs a SELECT (without FOR JSON) and returns its rows as objects keyed by column alias. */
  queryRows(selectSql: string): Promise<Record<string, unknown>[]>;
}

export class VecoSourceError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'VecoSourceError';
  }
}

export interface McpSqlSourceOptions {
  url: string;
  timeoutMs?: number;
  fetchImpl?: typeof fetch;
}

interface JsonRpcResponse {
  id?: number;
  result?: unknown;
  error?: { code: number; message: string };
}

export function createMcpSqlSource({ url, timeoutMs = 120_000, fetchImpl = fetch }: McpSqlSourceOptions): SqlSource {
  let nextId = 1;

  async function post(body: object, sessionId?: string): Promise<{ res: Response; text: string }> {
    let res: Response;
    try {
      res = await fetchImpl(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json, text/event-stream',
          ...(sessionId ? { 'mcp-session-id': sessionId } : {}),
        },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(timeoutMs),
      });
    } catch (err) {
      const reason = err instanceof Error && err.name === 'TimeoutError' ? 'timed out' : 'could not be reached';
      throw new VecoSourceError(`Veco MCP ${reason}`);
    }
    const text = await res.text();
    if (!res.ok) throw new VecoSourceError(`Veco MCP answered HTTP ${res.status}`);
    return { res, text };
  }

  async function call(method: string, params: object, sessionId?: string): Promise<{ result: unknown; sessionId?: string }> {
    const id = nextId++;
    const { res, text } = await post({ jsonrpc: '2.0', id, method, params }, sessionId);
    const message = parseRpcMessage(text, id);
    if (message.error) throw new VecoSourceError(`Veco MCP error ${message.error.code}: ${message.error.message}`);
    return { result: message.result, sessionId: res.headers.get('mcp-session-id') ?? sessionId };
  }

  return {
    async queryRows(selectSql) {
      const init = await call('initialize', {
        protocolVersion: PROTOCOL_VERSION,
        capabilities: {},
        clientInfo: { name: 'omnia-recon-veco-sync', version: '1.0.0' },
      });
      const sessionId = init.sessionId;
      await post({ jsonrpc: '2.0', method: 'notifications/initialized' }, sessionId);

      const sql = `${selectSql.trim().replace(/;$/, '')} FOR JSON PATH, INCLUDE_NULL_VALUES`;
      const { result } = await call('tools/call', { name: 'execute_sql', arguments: { query: sql } }, sessionId);
      return parseJsonRows(toolText(result));
    },
  };
}

/** Finds the JSON-RPC response with `id` in a plain JSON or SSE (`data: ...`) body. */
export function parseRpcMessage(body: string, id: number): JsonRpcResponse {
  const candidates = body.trimStart().startsWith('{')
    ? [body]
    : body
        .split(/\r?\n/)
        .filter((line) => line.startsWith('data:'))
        .map((line) => line.slice(5).trim());
  for (const candidate of candidates) {
    try {
      const msg = JSON.parse(candidate) as JsonRpcResponse;
      if (msg.id === id) return msg;
    } catch {
      // keep looking
    }
  }
  throw new VecoSourceError('Veco MCP sent a response that could not be read');
}

function toolText(result: unknown): string {
  const r = result as {
    isError?: boolean;
    structuredContent?: { result?: unknown };
    content?: { type: string; text?: string }[];
  } | null;
  const text =
    typeof r?.structuredContent?.result === 'string'
      ? r.structuredContent.result
      : r?.content?.find((c) => c.type === 'text')?.text;
  if (r?.isError) throw new VecoSourceError(`Veco query failed: ${(text ?? 'unknown error').slice(0, 300)}`);
  if (typeof text !== 'string') throw new VecoSourceError('Veco query returned no result text');
  return text;
}

/**
 * The tool output for a FOR JSON query: a header line (the generated JSON_F52E... column name)
 * followed by the JSON split into chunks, one per line. No rows at all -> header only (or nothing).
 */
export function parseJsonRows(text: string): Record<string, unknown>[] {
  const lines = text.split('\n');
  const json = lines.slice(1).join('');
  if (json.trim() === '' || json.trim() === 'None') return [];
  let parsed: unknown;
  try {
    parsed = JSON.parse(json);
  } catch {
    throw new VecoSourceError('Veco query result was not valid JSON');
  }
  if (!Array.isArray(parsed)) throw new VecoSourceError('Veco query result was not a list of rows');
  return parsed as Record<string, unknown>[];
}
