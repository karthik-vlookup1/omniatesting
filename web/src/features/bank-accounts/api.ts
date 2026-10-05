import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { importsKeys } from '../../data/imports';
import { apiRequest } from '../../lib/api';

export interface BankAccountRow {
  id: string;
  code: string;
  bankName: string;
  accountName: string;
  isActive: boolean;
}

export interface BankAccountDetail extends BankAccountRow {
  sortCodeLast2: string | null;
  accountLast4: string | null;
  xeroAccountId: string | null;
}

export interface BankAccountCreateInput {
  code: string;
  bankName: string;
  accountName: string;
  sortCodeLast2?: string | null;
  accountLast4?: string | null;
  xeroAccountId?: string | null;
}

export type BankAccountPatchInput = Partial<Omit<BankAccountCreateInput, 'code'> & { isActive: boolean }>;

export const bankAccountsKeys = {
  all: ['bank-accounts'] as const,
  list: ['bank-accounts', 'list'] as const,
  detail: (id: string) => ['bank-accounts', 'detail', id] as const,
};

/** The list endpoint has no search, so the page filters client-side. */
export async function listBankAccounts(signal?: AbortSignal): Promise<BankAccountRow[]> {
  const { bankAccounts } = await apiRequest<{ bankAccounts: BankAccountRow[] }>('/bank-accounts', { signal });
  return bankAccounts.map(({ id, code, bankName, accountName, isActive }) => ({ id, code, bankName, accountName, isActive }));
}

export async function getBankAccount(id: string, signal?: AbortSignal): Promise<BankAccountDetail> {
  const { bankAccount } = await apiRequest<{ bankAccount: BankAccountDetail }>(`/bank-accounts/${encodeURIComponent(id)}`, { signal });
  return bankAccount;
}

export function useBankAccountList() {
  return useQuery({ queryKey: bankAccountsKeys.list, queryFn: ({ signal }) => listBankAccounts(signal) });
}

export function useBankAccountDetail(id: string | null) {
  return useQuery({
    queryKey: bankAccountsKeys.detail(id ?? ''),
    queryFn: ({ signal }) => getBankAccount(id!, signal),
    enabled: Boolean(id),
    staleTime: 0,
  });
}

function useInvalidate() {
  const qc = useQueryClient();
  return () => {
    void qc.invalidateQueries({ queryKey: bankAccountsKeys.all });
    void qc.invalidateQueries({ queryKey: importsKeys.bankAccounts });
  };
}

export function useCreateBankAccount() {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: (input: BankAccountCreateInput) => apiRequest<{ id: string }>('/bank-accounts', { method: 'POST', body: input }),
    onSuccess: invalidate,
  });
}

export function useUpdateBankAccount() {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: BankAccountPatchInput }) =>
      apiRequest<{ bankAccount: BankAccountDetail }>(`/bank-accounts/${encodeURIComponent(id)}`, { method: 'PATCH', body: input }),
    onSuccess: invalidate,
  });
}
