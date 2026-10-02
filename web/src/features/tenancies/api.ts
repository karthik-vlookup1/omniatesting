/** Tenancies API client: search, detail, and the admin "sync from Veco now" action. */
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiFetch } from '../auth/api';

export interface Tenancy {
  tid: string;
  status: 'pending' | 'active' | 'ended';
  startDate: string;
  endDate: string | null;
  managementType: 'RG' | 'MG' | 'IRG';
  tenantName: string | null;
  niMasked: string | null;
  propertyRef: string;
  unitRef: string | null;
  postcode: string;
  address: string;
  branchCode: string;
  rent: { amount: string; frequency: string } | null;
  /** Full NI: only sent to admin and accounts. */
  ni?: string;
}

export type StatusFilter = 'active' | 'ended' | 'all';

export interface SyncSummary {
  dryRun: boolean;
  fetched: number;
  rejected: { tid: string | null; reason: string }[];
  tenancies: { inserted: number; updated: number; reactivated: number; ended: number };
  tenants: { inserted: number; updated: number };
  rentChanges: number;
  ni: { missing: number; invalid: number; conflicts: number };
  namesMissing: number;
  managementType: { RG: number; MG: number; IRG: number; fromOwnerFlag: number };
}

const KEY = ['tenancies'] as const;

export function useTenancySearch(q: string, status: StatusFilter) {
  const term = q.trim();
  return useQuery({
    queryKey: [...KEY, 'search', term, status],
    queryFn: () =>
      apiFetch<{ tenancies: Tenancy[] }>(`/api/tenancies?${new URLSearchParams({ q: term, status })}`).then(
        (r) => r.tenancies,
      ),
    enabled: term.length !== 1,
    placeholderData: (prev) => prev,
  });
}

export function useTenancy(tid: string | null) {
  return useQuery({
    queryKey: [...KEY, 'detail', tid],
    queryFn: () => apiFetch<{ tenancy: Tenancy }>(`/api/tenancies/${encodeURIComponent(tid!)}`).then((r) => r.tenancy),
    enabled: tid !== null,
  });
}

export function useVecoSync() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: { dryRun: boolean; force?: boolean }) =>
      apiFetch<{ summary: SyncSummary }>('/api/tenancies/sync', { method: 'POST', body: JSON.stringify(body) }).then(
        (r) => r.summary,
      ),
    onSuccess: (s) => {
      if (!s.dryRun) void qc.invalidateQueries({ queryKey: KEY });
    },
  });
}
