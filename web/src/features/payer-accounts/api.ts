import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiRequest } from '../../lib/api';

export type PayerKind = 'tenant' | 'council_hb' | 'dwp_uc' | 'other_third_party';

export interface PayerAccount {
  id: string;
  /** Masked, e.g. "****1234". The full number is never returned. */
  account: string | null;
  holderType: string;
  holderName: string | null;
  payer: PayerKind;
  isActive: boolean;
  source: 'manual' | 'learned';
  tid: string | null;
  landlordId: string | null;
  landlordName: string | null;
  sharedWith: number;
  createdAt: string;
}

export interface PayerAccountFilter {
  tid?: string;
  landlordId?: string;
}

export interface PayerAccountInput {
  tid?: string;
  landlordId?: string;
  sortCode: string;
  accountNumber: string;
  holderType: 'tenant' | 'relative' | 'landlord';
  holderName?: string | null;
  payer: PayerKind;
}

export const payerAccountsKeys = {
  all: ['payer-accounts'] as const,
  list: (f: PayerAccountFilter) => ['payer-accounts', f] as const,
};

export async function listPayerAccounts(f: PayerAccountFilter, signal?: AbortSignal): Promise<PayerAccount[]> {
  const { payerAccounts } = await apiRequest<{ payerAccounts: PayerAccount[] }>('/payer-accounts', {
    query: { tid: f.tid || undefined, landlordId: f.landlordId || undefined },
    signal,
  });
  return payerAccounts;
}

export function usePayerAccounts(f: PayerAccountFilter) {
  return useQuery({
    queryKey: payerAccountsKeys.list(f),
    queryFn: ({ signal }) => listPayerAccounts(f, signal),
    placeholderData: keepPreviousData,
  });
}

function useInvalidate() {
  const qc = useQueryClient();
  return () => void qc.invalidateQueries({ queryKey: payerAccountsKeys.all });
}

export function useAddPayerAccount() {
  const invalidate = useInvalidate();
  return useMutation({
    // The response carries only the masked row, so full numbers never enter the query cache.
    mutationFn: (input: PayerAccountInput) =>
      apiRequest<{ payerAccount: PayerAccount }>('/payer-accounts', { method: 'POST', body: input }),
    onSuccess: invalidate,
  });
}

export function useUpdatePayerAccount() {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: { isActive?: boolean; holderName?: string | null; payer?: PayerKind } }) =>
      apiRequest<{ payerAccount: PayerAccount }>(`/payer-accounts/${encodeURIComponent(id)}`, { method: 'PATCH', body: input }),
    onSuccess: invalidate,
  });
}
