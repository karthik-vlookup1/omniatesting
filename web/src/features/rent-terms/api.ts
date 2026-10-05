import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiRequest } from '../../lib/api';

export type Frequency = 'weekly' | 'fortnightly' | 'four_weekly' | 'monthly' | 'quarterly';
export type Payer = 'tenant' | 'council_hb' | 'dwp_uc' | 'other_third_party';

export const FREQUENCY_OPTIONS: { value: Frequency; label: string }[] = [
  { value: 'weekly', label: 'Weekly' },
  { value: 'fortnightly', label: 'Fortnightly' },
  { value: 'four_weekly', label: 'Four-weekly' },
  { value: 'monthly', label: 'Monthly' },
  { value: 'quarterly', label: 'Quarterly' },
];

export const PAYER_LABEL: Record<Payer, string> = {
  tenant: 'Tenant',
  council_hb: 'Council (HB)',
  dwp_uc: 'DWP (UC)',
  other_third_party: 'Other',
};

export const frequencyLabel = (f: Frequency | null): string => FREQUENCY_OPTIONS.find((o) => o.value === f)?.label ?? '—';

export interface RentAccount {
  tenancy: { id: string; tid: string; startDate: string; endDate: string | null; status: string; chargesFrom: string | null };
  schedules: { id: string; amountPence: number; frequency: Frequency; effectiveFrom: string; effectiveTo: string | null; reason: string | null }[];
  awards: {
    id: string;
    benefit: 'UC' | 'HB' | 'DHP';
    payingBody: string;
    claimReference: string | null;
    awardPence: number;
    awardFrequency: Frequency;
    paidTo: 'landlord_direct' | 'tenant';
    effectiveFrom: string;
    effectiveTo: string | null;
  }[];
  splits: {
    id: string;
    payer: Payer;
    benefitAwardId: string | null;
    sharePercent: string | null;
    fixedPence: number | null;
    effectiveFrom: string;
    effectiveTo: string | null;
  }[];
  paymentMethods: {
    id: string;
    payer: Payer;
    method: string;
    expectedPence: number | null;
    expectedFrequency: Frequency | null;
    expectedDay: number | null;
    referenceHint: string | null;
    effectiveFrom: string;
    effectiveTo: string | null;
  }[];
  periods: { periodStart: string; periodEnd: string; dueDate: string; byPayer: Partial<Record<Payer, number>>; totalPence: number }[];
  payers: {
    payer: Payer;
    chargedPence: number;
    receivedPence: number;
    adjustmentsPence: number;
    balancePence: number;
    lines: { date: string; kind: 'charge' | 'adjustment' | 'receipt'; description: string; amountPence: number; balancePence: number }[];
  }[];
}

export interface RentInput {
  amountPence: number;
  frequency: Frequency;
  effectiveFrom: string;
}
export interface AwardInput {
  benefit: 'UC' | 'HB' | 'DHP';
  payingBody: string;
  claimReference?: string | null;
  awardPence: number;
  awardFrequency: Frequency;
  paidTo: 'landlord_direct' | 'tenant';
  effectiveFrom: string;
}
export interface SplitInput {
  payer: Exclude<Payer, 'tenant'>;
  sharePercent?: number | null;
  fixedAmountPence?: number | null;
  effectiveFrom: string;
}
export interface MethodInput {
  payer: Payer;
  method: string;
  expectedPence?: number | null;
  expectedFrequency?: Frequency | null;
  expectedDay?: number | null;
  referenceHint?: string | null;
  effectiveFrom: string;
}

export const PAY_METHOD_OPTIONS = [
  { value: 'standing_order', label: 'Standing order' },
  { value: 'bank_transfer', label: 'Bank transfer' },
  { value: 'direct_debit', label: 'Direct debit' },
  { value: 'uc_managed_payment', label: 'UC managed payment' },
  { value: 'hb_direct', label: 'HB direct' },
  { value: 'card', label: 'Card' },
  { value: 'cash', label: 'Cash' },
  { value: 'cheque', label: 'Cheque' },
  { value: 'other', label: 'Other' },
];

export const rentKeys = { account: (tid: string) => ['rent', tid] as const };

export function useRentAccount(tid: string) {
  return useQuery({
    queryKey: rentKeys.account(tid),
    queryFn: async ({ signal }) => (await apiRequest<{ account: RentAccount }>(`/rent/${encodeURIComponent(tid)}`, { signal })).account,
    retry: false,
  });
}

/** A write that answers with the refreshed account, which replaces the cached one. */
function useRentWrite<I>(tid: string, path: (input: I) => string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: I) => (await apiRequest<{ account: RentAccount }>(path(input), { method: 'POST', body: input })).account,
    onSuccess: (account) => qc.setQueryData(rentKeys.account(tid), account),
  });
}

const base = (tid: string) => `/rent/${encodeURIComponent(tid)}`;

export const useSetRent = (tid: string) => useRentWrite<RentInput>(tid, () => `${base(tid)}/schedules`);
export const useAddAward = (tid: string) => useRentWrite<AwardInput>(tid, () => `${base(tid)}/benefit-awards`);
export const useAddSplit = (tid: string) => useRentWrite<SplitInput>(tid, () => `${base(tid)}/payer-splits`);
export const useAddMethod = (tid: string) => useRentWrite<MethodInput>(tid, () => `${base(tid)}/payment-methods`);

export type EndKind = 'benefit-awards' | 'payer-splits' | 'payment-methods';
export function useEnd(tid: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ kind, id, effectiveTo }: { kind: EndKind; id: string; effectiveTo: string }) =>
      (await apiRequest<{ account: RentAccount }>(`/rent/${kind}/${encodeURIComponent(id)}/end`, { method: 'POST', body: { effectiveTo } })).account,
    onSuccess: (account) => qc.setQueryData(rentKeys.account(tid), account),
  });
}
