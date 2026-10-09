/**
 * Read-only agentOS v4 client. GET only. Throttled below the documented 50 calls/minute.
 * The API key travels only in the X-API-KEY header and never appears in a URL, log line or error.
 */
import { ConfigError } from '../../config/env.js';
import { AgentosApiError, type ApiDeposit, type ApiTenancy, type ApiTenant } from '../../domain/agentos/types.js';

export interface AgentosApiConfig {
  apiKey: string;
  baseUrl: string;
  shortName: string;
  branchId: string;
  managedBy: string;
}

export function loadAgentosApiConfig(env: NodeJS.ProcessEnv = process.env): AgentosApiConfig {
  const problems: string[] = [];
  const apiKey = (env['AGENTOS_API_KEY'] ?? '').trim();
  const baseUrl = (env['AGENTOS_BASE_URL'] ?? '').trim().replace(/\/+$/, '');
  if (!apiKey) problems.push('AGENTOS_API_KEY is not set');
  if (!baseUrl) problems.push('AGENTOS_BASE_URL is not set');
  else if (!baseUrl.startsWith('https://')) problems.push('AGENTOS_BASE_URL must start with https://');
  if (problems.length > 0) throw new ConfigError(problems);
  return {
    apiKey,
    baseUrl,
    shortName: (env['AGENTOS_SHORT_NAME'] ?? '').trim() || 'isl',
    branchId: (env['AGENTOS_BRANCH_ID'] ?? '').trim() || '0004-6020-1894-c1a8',
    managedBy: (env['AGENTOS_MANAGED_BY'] ?? '').trim() || 'Investing Solutions',
  };
}

export interface AgentosClientDeps {
  fetch: typeof fetch;
  sleep: (ms: number) => Promise<void>;
  now: () => number;
  pageSize: number;
  minIntervalMs: number;
  retryDelayMs: number;
}

export interface AgentosClient {
  listTenants(): Promise<ApiTenant[]>;
  listTenancies(): Promise<ApiTenancy[]>;
  listDeposits(): Promise<ApiDeposit[]>;
}

const MAX_PAGES = 100;
const MAX_ATTEMPTS = 3;

export function createAgentosClient(cfg: AgentosApiConfig, overrides: Partial<AgentosClientDeps> = {}): AgentosClient {
  const deps: AgentosClientDeps = {
    fetch: (...a) => globalThis.fetch(...a),
    sleep: (ms) => new Promise((r) => setTimeout(r, ms)),
    now: Date.now,
    pageSize: 1000,
    minIntervalMs: 1300,
    retryDelayMs: 60_000,
    ...overrides,
  };
  let lastCallAt: number | null = null;

  async function throttle(): Promise<void> {
    if (lastCallAt !== null) {
      const wait = deps.minIntervalMs - (deps.now() - lastCallAt);
      if (wait > 0) await deps.sleep(wait);
    }
    lastCallAt = deps.now();
  }

  async function getPage<T>(path: string): Promise<{ Data?: T[]; Count?: number }> {
    const url = `${cfg.baseUrl}${path}?integrator=omnia-recon`;
    for (let attempt = 1; ; attempt++) {
      await throttle();
      const res = await deps.fetch(url, {
        method: 'GET',
        headers: { 'X-API-KEY': cfg.apiKey, Accept: 'application/json' },
        signal: AbortSignal.timeout(30_000),
      });
      if (res.ok) return (await res.json()) as { Data?: T[]; Count?: number };
      const retryable = res.status === 429 || res.status >= 500;
      if (!retryable || attempt >= MAX_ATTEMPTS) throw new AgentosApiError(res.status, path);
      await deps.sleep(deps.retryDelayMs);
    }
  }

  async function listAll<T>(prefix: string): Promise<T[]> {
    const out: T[] = [];
    let offset = 0;
    for (let pages = 1; ; pages++) {
      if (pages > MAX_PAGES) throw new Error(`agentOS paging exceeded ${MAX_PAGES} pages on ${prefix}`);
      const body = await getPage<T>(`${prefix}/${offset}/${deps.pageSize}`);
      const data = body.Data ?? [];
      out.push(...data);
      if (data.length === 0) break;
      offset += deps.pageSize;
      if (offset >= (body.Count ?? 0)) break;
    }
    return out;
  }

  const sn = encodeURIComponent(cfg.shortName);
  const branch = encodeURIComponent(cfg.branchId);
  return {
    listTenants: () => listAll<ApiTenant>(`/v4/maintenance/${sn}/contacts/tenants/${branch}`),
    listTenancies: () => listAll<ApiTenancy>(`/v4/reporting/${sn}/lettings/tenancies`),
    listDeposits: () => listAll<ApiDeposit>(`/v4/deposits/${sn}/deposits/${branch}/tenancies`),
  };
}
