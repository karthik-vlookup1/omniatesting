import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { fetchBatchSummary, listBankAccounts, listImports, uploadStatement } from './api';

export const importsKeys = {
  bankAccounts: ['bank-accounts'] as const,
  list: ['imports'] as const,
  summary: (batchId: string) => ['matching', 'imports', batchId, 'summary'] as const,
};

export function useBankAccounts() {
  return useQuery({
    queryKey: importsKeys.bankAccounts,
    queryFn: ({ signal }) => listBankAccounts(signal),
    staleTime: 5 * 60_000,
  });
}

export function useImports() {
  return useQuery({ queryKey: importsKeys.list, queryFn: ({ signal }) => listImports(signal) });
}

/** Lazy: pass `enabled` once the row is on screen so a long history does not fire 50 requests. */
export function useBatchSummary(batchId: string, enabled: boolean) {
  return useQuery({
    queryKey: importsKeys.summary(batchId),
    queryFn: ({ signal }) => fetchBatchSummary(batchId, signal),
    enabled,
  });
}

export function useUploadStatement() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: uploadStatement,
    onSuccess: (res) => {
      if (res.matching) qc.setQueryData(importsKeys.summary(res.import.batchId), res.matching);
      void qc.invalidateQueries({ queryKey: importsKeys.list });
      // New lines change the review queue and its badge.
      void qc.invalidateQueries({ queryKey: ['matching', 'lines'] });
    },
  });
}
