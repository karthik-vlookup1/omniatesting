/** In-memory AgentosClient over the synthetic API fixtures. No network. */
import { readFileSync } from 'node:fs';
import type { ApiDeposit, ApiTenancy, ApiTenant } from '../../../../src/domain/agentos/types.js';
import type { AgentosClient } from '../../../../src/services/agentos/api-client.js';

const load = <T>(name: string): T[] =>
  JSON.parse(readFileSync(new URL(`./${name}.json`, import.meta.url), 'utf8')) as T[];

export const fixtureTenants = (): ApiTenant[] => load<ApiTenant>('tenants');
export const fixtureTenancies = (): ApiTenancy[] => load<ApiTenancy>('tenancies');
export const fixtureDeposits = (): ApiDeposit[] => load<ApiDeposit>('deposits');

export function fixtureClient(tenants: ApiTenant[] = fixtureTenants()): AgentosClient {
  return {
    listTenants: () => Promise.resolve(tenants),
    listTenancies: () => Promise.resolve(fixtureTenancies()),
    listDeposits: () => Promise.resolve(fixtureDeposits()),
  };
}
