import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiRequest } from '../../lib/api';

export interface Branch {
  id: string;
  code: string;
  name: string;
  xeroTrackingOption: string | null;
}

export interface BranchCreateInput {
  code: string;
  name: string;
  xeroTrackingOption?: string | null;
}

export type BranchPatchInput = Partial<Pick<BranchCreateInput, 'name' | 'xeroTrackingOption'>>;

export const branchesKeys = {
  all: ['branches'] as const,
  list: (q: string) => ['branches', 'list', q.trim()] as const,
};

export async function listBranches(q: string, signal?: AbortSignal): Promise<Branch[]> {
  const { branches } = await apiRequest<{ branches: Branch[] }>('/branches', { query: { q: q.trim() || undefined }, signal });
  return branches;
}

export function useBranches(q = '') {
  return useQuery({
    queryKey: branchesKeys.list(q),
    queryFn: ({ signal }) => listBranches(q, signal),
    placeholderData: keepPreviousData,
  });
}

export function useCreateBranch() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: BranchCreateInput) => apiRequest<{ id: string }>('/branches', { method: 'POST', body: input }),
    onSuccess: () => void qc.invalidateQueries({ queryKey: branchesKeys.all }),
  });
}

export function useUpdateBranch() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: BranchPatchInput }) =>
      apiRequest<{ branch: Branch }>(`/branches/${encodeURIComponent(id)}`, { method: 'PATCH', body: input }),
    onSuccess: () => void qc.invalidateQueries({ queryKey: branchesKeys.all }),
  });
}
