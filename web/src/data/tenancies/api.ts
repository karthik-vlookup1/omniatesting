import { apiRequest } from '../../lib/api';
import { TENANCY_QUERY_MAX, type SyncSummary, type TenancyDetail, type TenancyStatusFilter, type TenancySummary } from './types';

/** Real endpoints: Omnia_recon-backend server/src/api/tenancy/routes.ts. */

/** Search by TID, tenant name or full NI number (the server hashes NI; it is never stored raw). */
export async function searchTenancies(
  input: { q: string; status: TenancyStatusFilter },
  signal?: AbortSignal,
): Promise<TenancySummary[]> {
  const { tenancies } = await apiRequest<{ tenancies: TenancySummary[] }>('/tenancies', {
    signal,
    query: { q: input.q.trim().slice(0, TENANCY_QUERY_MAX), status: input.status },
  });
  return tenancies;
}

export async function getTenancy(tid: string, signal?: AbortSignal): Promise<TenancyDetail> {
  const { tenancy } = await apiRequest<{ tenancy: TenancyDetail }>(`/tenancies/${encodeURIComponent(tid)}`, { signal });
  return tenancy;
}

/** Admin only. A dry run reports what would change without saving anything. */
export async function runVecoSync(input: { dryRun: boolean; force?: boolean }): Promise<SyncSummary> {
  const { summary } = await apiRequest<{ summary: SyncSummary }>('/tenancies/sync', {
    method: 'POST',
    body: { dryRun: input.dryRun, force: input.force ?? false },
  });
  return summary;
}
