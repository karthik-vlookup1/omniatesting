import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { getTenancy, runVecoSync, searchTenancies } from './api';
import type { TenancyStatusFilter } from './types';

export const tenanciesKeys = {
  all: ['tenancies'] as const,
  search: (q: string, status: TenancyStatusFilter) => ['tenancies', 'search', status, q.trim()] as const,
  detail: (tid: string) => ['tenancies', 'detail', tid] as const,
};

export function useTenancySearch(q: string, status: TenancyStatusFilter, options: { enabled?: boolean } = {}) {
  return useQuery({
    queryKey: tenanciesKeys.search(q, status),
    queryFn: ({ signal }) => searchTenancies({ q, status }, signal),
    placeholderData: keepPreviousData,
    enabled: options.enabled ?? true,
  });
}

export function useTenancy(tid: string | null) {
  return useQuery({
    queryKey: tenanciesKeys.detail(tid ?? ''),
    queryFn: ({ signal }) => getTenancy(tid!, signal),
    enabled: Boolean(tid),
  });
}

export function useVecoSync() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: runVecoSync,
    onSuccess: (summary) => {
      if (!summary.dryRun) void qc.invalidateQueries({ queryKey: tenanciesKeys.all });
    },
  });
}
