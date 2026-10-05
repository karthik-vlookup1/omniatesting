import { useMutation, useQuery, useQueryClient, type QueryClient } from '@tanstack/react-query';
import { apiRequest } from '../../lib/api';

export type Payer = 'tenant' | 'council_hb' | 'dwp_uc' | 'other_third_party';
export type XeroState = 'none' | 'queued' | 'sending' | 'stuck' | 'sent';

export const PAYER_LABEL: Record<Payer, string> = {
  tenant: 'Tenant',
  council_hb: 'Council (HB)',
  dwp_uc: 'DWP (UC)',
  other_third_party: 'Other',
};
export const PAYER_OPTIONS = (Object.keys(PAYER_LABEL) as Payer[]).map((value) => ({ value, label: PAYER_LABEL[value] }));
export const XERO_LABEL: Record<XeroState, string> = {
  none: 'Not sent',
  queued: 'Queued',
  sending: 'Sending',
  stuck: 'Failed',
  sent: 'Sent',
};

export interface ReceiptSummary {
  id: string;
  tid: string;
  tenancyId: string;
  payer: Payer;
  amountPence: number;
  receivedOn: string;
  status: 'active' | 'reversed';
  matchedVia: string;
  allocationMode: 'auto' | 'manual';
  allocatedPence: number;
  bankTransactionId: string | null;
  xeroState: XeroState;
  vicoExported: boolean;
}

export interface ReceiptDetail extends ReceiptSummary {
  reversedReason: string | null;
  externalCorrection: string | null;
  bankLine: { id: string; txnDate: string; description: string; amountPence: number; remainingPence: number } | null;
  allocations: { id: string; rentChargeId: string; periodStart: string; dueDate: string; amountPence: number; allocatedBy: string }[];
  openCharges: { id: string; periodStart: string; dueDate: string; amountPence: number; outstandingPence: number }[];
}

export interface BankLineView {
  id: string;
  txnDate: string;
  description: string;
  amountPence: number;
  remainingPence: number;
  status: string;
  receipts: { id: string; tid: string; payer: Payer; amountPence: number }[];
  remittance: { id: string; payingBody: string; remittanceRef: string | null; remittanceDate: string; totalPence: number } | null;
}

export interface ReceiptFilters {
  tid: string;
  status: '' | 'active' | 'reversed';
  page: number;
}

export interface RemittanceReport {
  fileName: string;
  fileSha256: string;
  dryRun: boolean;
  counts: { rows: number; matched: number; rejected: number };
  totalPence: number;
  linePence: number;
  totalMismatch: boolean;
  rows: { line: number; tid: string | null; claimRef: string | null; amountPence: number; tenancyTid: string }[];
  errors: { line: number; key: string; field: string; reason: string }[];
}

export interface RemittanceInput {
  bankTransactionId: string;
  payer: Exclude<Payer, 'tenant'>;
  payingBody: string;
  remittanceDate: string;
  file: File;
  previewSha256?: string;
}

export interface AdjustmentRow {
  id: string;
  payer: Payer;
  kind: string;
  amountPence: number;
  effectiveOn: string;
  reason: string;
  reversesAdjustmentId: string | null;
  reversedByAdjustmentId: string | null;
  approvedBy: string | null;
  createdAt: string;
}
export interface AdjustmentsView {
  tid: string;
  balances: { payer: Payer; balancePence: number }[];
  adjustments: AdjustmentRow[];
}

export const receiptKeys = {
  all: ['receipts'] as const,
  list: (f: ReceiptFilters) => ['receipts', f] as const,
  one: (id: string) => ['receipt', id] as const,
  line: (id: string) => ['bank-line', id] as const,
  adjustments: (tid: string) => ['adjustments', tid] as const,
};

export function useReceipts(f: ReceiptFilters) {
  return useQuery({
    queryKey: receiptKeys.list(f),
    queryFn: ({ signal }) =>
      apiRequest<{ receipts: ReceiptSummary[]; total: number; page: number; pageSize: number }>('/receipts', {
        query: { tid: f.tid, status: f.status, page: f.page },
        signal,
      }),
  });
}

export function useReceipt(id: string | null) {
  return useQuery({
    queryKey: receiptKeys.one(id ?? ''),
    enabled: id !== null,
    queryFn: async ({ signal }) => (await apiRequest<{ receipt: ReceiptDetail }>(`/receipts/${encodeURIComponent(id!)}`, { signal })).receipt,
  });
}

export function useBankLine(id: string | null) {
  return useQuery({
    queryKey: receiptKeys.line(id ?? ''),
    enabled: id !== null,
    retry: false,
    queryFn: async ({ signal }) => (await apiRequest<{ line: BankLineView }>(`/receipts/bank-lines/${encodeURIComponent(id!)}`, { signal })).line,
  });
}

function refreshAll(qc: QueryClient): void {
  void qc.invalidateQueries({ queryKey: ['receipts'] });
  void qc.invalidateQueries({ queryKey: ['receipt'] });
  void qc.invalidateQueries({ queryKey: ['bank-line'] });
  void qc.invalidateQueries({ queryKey: ['adjustments'] });
}

export interface SplitPartInput {
  tid: string;
  payer: Payer;
  amountPence: number;
}

export function useSplitLine() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { bankTransactionId: string; parts: SplitPartInput[] }) =>
      (await apiRequest<{ line: BankLineView }>('/receipts/split', { method: 'POST', body: input })).line,
    onSuccess: () => refreshAll(qc),
  });
}

export function useSaveAllocations(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (allocations: { rentChargeId: string; amountPence: number }[]) =>
      (await apiRequest<{ receipt: ReceiptDetail }>(`/receipts/${encodeURIComponent(id)}/allocations`, { method: 'PUT', body: { allocations } })).receipt,
    onSuccess: () => refreshAll(qc),
  });
}

export function useResetAllocations(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async () => (await apiRequest<{ receipt: ReceiptDetail }>(`/receipts/${encodeURIComponent(id)}/allocations`, { method: 'DELETE' })).receipt,
    onSuccess: () => refreshAll(qc),
  });
}

export function useReverseReceipt(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { reason: string; xeroCreditRef?: string; vicoNote?: string }) =>
      (await apiRequest<{ receipt: ReceiptDetail }>(`/receipts/${encodeURIComponent(id)}/reverse`, { method: 'POST', body: input })).receipt,
    onSuccess: () => refreshAll(qc),
  });
}

function toForm(input: RemittanceInput): FormData {
  const form = new FormData();
  form.append('bankTransactionId', input.bankTransactionId);
  form.append('payer', input.payer);
  form.append('payingBody', input.payingBody);
  form.append('remittanceDate', input.remittanceDate);
  if (input.previewSha256) form.append('previewSha256', input.previewSha256);
  form.append('file', input.file, input.file.name);
  return form;
}

export async function previewRemittance(input: RemittanceInput): Promise<RemittanceReport> {
  const { report } = await apiRequest<{ report: RemittanceReport }>('/remittances/preview', { method: 'POST', body: toForm(input) });
  return report;
}

export async function commitRemittance(input: RemittanceInput): Promise<{ alreadyImported: boolean; remittanceId: string }> {
  return apiRequest<{ alreadyImported: boolean; remittanceId: string }>('/remittances/commit', { method: 'POST', body: toForm(input) });
}

export function useCommitRemittance() {
  const qc = useQueryClient();
  return useMutation({ mutationFn: commitRemittance, onSuccess: () => refreshAll(qc) });
}

export function useAdjustments(tid: string | null) {
  return useQuery({
    queryKey: receiptKeys.adjustments(tid ?? ''),
    enabled: tid !== null,
    retry: false,
    queryFn: ({ signal }) => apiRequest<AdjustmentsView>('/adjustments', { query: { tid }, signal }),
  });
}

export function useCreateAdjustment() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: { tid: string; payer: Payer; kind: 'write_off' | 'refund'; amountPence: number; reason: string }) =>
      apiRequest<AdjustmentsView>('/adjustments', { method: 'POST', body: input }),
    onSuccess: () => refreshAll(qc),
  });
}

export function useReverseAdjustment() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: { id: string; reason: string }) =>
      apiRequest<AdjustmentsView>(`/adjustments/${encodeURIComponent(input.id)}/reverse`, { method: 'POST', body: { reason: input.reason } }),
    onSuccess: () => refreshAll(qc),
  });
}
