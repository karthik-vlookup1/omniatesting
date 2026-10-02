/** CSV profile editing: install the default banks and save a new profile version for a bank. */
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { importsKeys, type CanonicalField, type CsvProfile } from '../../data/imports';
import { apiRequest } from '../../lib/api';

export { useBankAccounts } from '../../data/imports';
export type { BankAccount, CanonicalField } from '../../data/imports';

export const CANONICAL_FIELDS = [
  'txn_date',
  'description',
  'reference',
  'amount',
  'paid_in',
  'paid_out',
  'counterparty',
  'payer_sort_code',
  'payer_account_number',
  'balance',
  'bank_txn_id',
  'tid',
  'ni_number',
] as const satisfies readonly CanonicalField[];
export const DATE_FORMATS = ['DD/MM/YYYY', 'DD/MM/YY', 'DD-MM-YYYY', 'DD.MM.YYYY', 'YYYY-MM-DD', 'D MMM YYYY'] as const;

export type ProfileInput = Omit<CsvProfile, 'id' | 'version'>;

export function useInstallDefaultBanks() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => apiRequest<{ created: string[] }>('/bank-accounts/defaults', { method: 'POST' }),
    onSuccess: () => void qc.invalidateQueries({ queryKey: importsKeys.bankAccounts }),
  });
}

export function useSaveProfile() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ bankAccountId, profile }: { bankAccountId: string; profile: ProfileInput }) =>
      apiRequest<{ id: string; version: number }>(`/bank-accounts/${encodeURIComponent(bankAccountId)}/profile`, {
        method: 'POST',
        body: profile,
      }),
    onSuccess: () => void qc.invalidateQueries({ queryKey: importsKeys.bankAccounts }),
  });
}
