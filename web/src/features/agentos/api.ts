/** agentOS receipts API client: intake batches, lines, reassign, export and mark posted. */
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiRequest, buildUrl } from '../../lib/api';

export type MatchStatus = 'matched' | 'ambiguous' | 'unmatched';

export interface MatchCounts {
  matched: number;
  ambiguous: number;
  unmatched: number;
}

export interface IntakeBatch {
  id: string;
  fileName: string;
  rowsTotal: number;
  amountTotalPence: number;
  periodFrom: string;
  periodTo: string;
  uploadedAt: string;
  uploadedBy: string | null;
}

export interface IntakeLine {
  id: string;
  lineNo: number;
  receivedOn: string;
  tid: string | null;
  payerName: string;
  amountPence: number;
  paymentType: string;
  depositTo: string;
  description: string;
  warnings: string[];
  matchStatus: MatchStatus;
  agentosTenantId: string | null;
  postingStatus: 'not_ready' | 'ready' | 'exported' | 'posted';
  payerType: 'tenant' | 'third_party' | null;
  /** Masked NI Number cell (last characters only), or null. */
  reference: string | null;
  /** Omnia bank account code the deposit text resolved to; null means "Unknown account". */
  receivingAccount: string | null;
}

export interface IntakeImportResult {
  batchId: string;
  fileName: string;
  rowsTotal: number;
  amountTotalPence: number;
  periodFrom: string;
  periodTo: string;
  linesWithWarnings: number;
  matchCounts: MatchCounts;
  unresolvedRefs: number;
}

export interface AgentosTenant {
  id: string;
  tid: string;
  name: string;
  /** Not sent by the tenants endpoint today; shown in the journal grid when present. */
  branch?: string;
  property?: string;
}

export interface ReassignResult {
  line: IntakeLine;
  previous: { tid: string | null; matchStatus: string; agentosTenantId: string | null };
}

export interface AgentosExport {
  id: string;
  batchId: string;
  rowsTotal: number;
  amountTotalPence: number;
  createdAt: string;
}

export const STATUS_LABELS: Record<MatchStatus, string> = {
  matched: 'Matched',
  ambiguous: 'Ambiguous',
  unmatched: 'Unmatched',
};

export const POSTING_LABELS: Record<IntakeLine['postingStatus'], string> = {
  not_ready: 'Not exported',
  ready: 'Ready',
  exported: 'Exported',
  posted: 'Posted',
};

const money = new Intl.NumberFormat('en-GB', { style: 'currency', currency: 'GBP' });
export const gbp = (pence: number): string => money.format(pence / 100);

export const isExportable = (l: IntakeLine): boolean =>
  l.matchStatus === 'matched' && l.agentosTenantId !== null && (l.postingStatus === 'not_ready' || l.postingStatus === 'ready');

export const exportCsvUrl = (id: string): string => buildUrl(`/agentos/exports/${id}.csv`);

export function useIntakeBatches() {
  return useQuery({
    queryKey: ['agentos', 'batches'],
    queryFn: async ({ signal }) => (await apiRequest<{ batches: IntakeBatch[] }>('/agentos/intake', { signal })).batches,
  });
}

export function useIntakeBatch(id: string | null) {
  return useQuery({
    queryKey: ['agentos', 'batch', id],
    queryFn: ({ signal }) =>
      apiRequest<{ batch: IntakeBatch; lines: IntakeLine[] }>(`/agentos/intake/${encodeURIComponent(id ?? '')}`, { signal }),
    enabled: Boolean(id),
  });
}

export function useAgentosTenants() {
  return useQuery({
    queryKey: ['agentos', 'tenants'],
    queryFn: async ({ signal }) => (await apiRequest<{ tenants: AgentosTenant[] }>('/agentos/tenants', { signal })).tenants,
  });
}

export function useUploadIntake() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (file: File) => {
      const form = new FormData();
      form.append('file', file, file.name);
      return (await apiRequest<{ batch: IntakeImportResult }>('/agentos/intake', { method: 'POST', body: form })).batch;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['agentos'] }),
  });
}

export function useReassignLine() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (v: { lineId: string; tid: string }) =>
      apiRequest<ReassignResult>(`/agentos/lines/${encodeURIComponent(v.lineId)}/reassign`, { method: 'POST', body: { tid: v.tid } }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['agentos'] }),
  });
}

export function useCreateExport() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (batchId: string) =>
      (await apiRequest<{ export: AgentosExport }>('/agentos/exports', { method: 'POST', body: { batchId } })).export,
    onSuccess: () => qc.invalidateQueries({ queryKey: ['agentos'] }),
  });
}

export function useMarkPosted() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (lineId: string) =>
      apiRequest<{ line: { id: string } }>(`/agentos/lines/${encodeURIComponent(lineId)}/posted`, { method: 'POST' }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['agentos'] }),
  });
}

export interface JournalEntry {
  lineNo: number;
  accountType: string;
  side: 'from' | 'to';
  tid: string;
  person: string;
  branch: string;
  property: string;
  amountPence: number;
}

export interface JournalTransfer {
  id: string;
  fromTid: string | null;
  toTid: string | null;
  amountPence: number;
  description: string;
  nominalCode: string;
  accountType: string | null;
  postingStatus: 'not_exported' | 'exported' | 'posted';
  exportId: string | null;
  postedAt: string | null;
  createdAt: string;
  entries: JournalEntry[];
}

export interface JournalExport {
  id: string;
  transfersTotal: number;
  amountTotalPence: number;
  createdAt: string;
}

export interface NewJournalEntry {
  agentosTenantId: string;
  accountType: string;
  /** Signed integer pence; the entries of one transfer sum to 0. */
  amountPence: number;
}

export interface NewJournalTransfer {
  clientRequestId: string;
  description: string;
  nominalCode: string;
  entries: NewJournalEntry[];
}

export const JOURNAL_STATUS_LABELS: Record<JournalTransfer['postingStatus'], string> = {
  not_exported: 'Not exported',
  exported: 'Exported',
  posted: 'Posted',
};

export const journalCsvUrl = (id: string): string => buildUrl(`/agentos/journal/exports/${id}.csv`);

export function useJournalTransfers() {
  return useQuery({
    queryKey: ['agentos', 'journal'],
    queryFn: async ({ signal }) =>
      (await apiRequest<{ transfers: JournalTransfer[] }>('/agentos/journal/transfers', { signal })).transfers,
  });
}

export function useCreateJournalTransfer() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (body: NewJournalTransfer) =>
      (await apiRequest<{ transfer: JournalTransfer }>('/agentos/journal/transfers', { method: 'POST', body })).transfer,
    onSuccess: () => qc.invalidateQueries({ queryKey: ['agentos'] }),
  });
}

export function useCreateJournalExport() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async () => (await apiRequest<{ export: JournalExport }>('/agentos/journal/exports', { method: 'POST' })).export,
    onSuccess: () => qc.invalidateQueries({ queryKey: ['agentos'] }),
  });
}

export function useMarkJournalPosted() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (transferId: string) =>
      (
        await apiRequest<{ transfer: JournalTransfer }>(`/agentos/journal/transfers/${encodeURIComponent(transferId)}/posted`, {
          method: 'POST',
        })
      ).transfer,
    onSuccess: () => qc.invalidateQueries({ queryKey: ['agentos'] }),
  });
}

export interface PaymentOptions {
  depositAccounts: { code: string; label: string }[];
  paymentTypes: { code: string; label: string }[];
}

export interface AgentosPayment {
  id: string;
  clientRequestId: string;
  tid: string;
  paymentFrom: string;
  depositAccountCode: string;
  depositTo: string;
  paymentType: string;
  amountPence: number;
  description: string;
  cardAuthCode: string | null;
  postingStatus: 'not_exported' | 'exported' | 'posted';
  exportId: string | null;
  postedAt: string | null;
  createdAt: string;
}

export interface PaymentExport {
  id: string;
  rowsTotal: number;
  amountTotalPence: number;
  createdAt: string;
}

export interface NewPayment {
  clientRequestId: string;
  agentosTenantId: string;
  depositAccountCode: string;
  paymentType: string;
  amountPence: number;
  description: string;
  cardAuthCode?: string;
}

export interface TenantLedger {
  tid: string;
  balancePence: number;
  postings: { transactionId: string; kind: string; effectiveOn: string; description: string; accountType: string | null; amountPence: number }[];
}

/** Converts a pounds amount typed in a form to whole pence without floating-point drift; null when not a positive 2dp amount. */
export function poundsToPence(value: number | string): number | null {
  const text = typeof value === 'number' ? value.toFixed(2) : value.trim();
  const m = /^(-?)(\d+)(?:\.(\d{1,2}))?$/.exec(text);
  if (!m) return null;
  const pence = Number(m[2]) * 100 + Number((m[3] ?? '').padEnd(2, '0') || '0');
  return m[1] === '-' ? -pence : pence;
}

export const PAYMENT_STATUS_LABELS: Record<AgentosPayment['postingStatus'], string> = {
  not_exported: 'Not exported',
  exported: 'Exported',
  posted: 'Posted',
};

export const paymentCsvUrl = (id: string): string => buildUrl(`/agentos/exports/${id}.csv`);

export function usePaymentOptions() {
  return useQuery({
    queryKey: ['agentos', 'payment-options'],
    queryFn: ({ signal }) => apiRequest<PaymentOptions>('/agentos/payments/options', { signal }),
  });
}

export function usePayments() {
  return useQuery({
    queryKey: ['agentos', 'payments'],
    queryFn: async ({ signal }) => (await apiRequest<{ payments: AgentosPayment[] }>('/agentos/payments', { signal })).payments,
  });
}

export function useTenantLedger(tid: string | null) {
  return useQuery({
    queryKey: ['agentos', 'ledger', tid],
    queryFn: ({ signal }) => apiRequest<TenantLedger>(`/agentos/ledger/${encodeURIComponent(tid ?? '')}`, { signal }),
    enabled: Boolean(tid),
  });
}

export function useCreatePayment() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: NewPayment) =>
      apiRequest<{ payment: AgentosPayment; balancePence: number }>('/agentos/payments', { method: 'POST', body }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['agentos'] }),
  });
}

export function useCreatePaymentExport() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async () => (await apiRequest<{ export: PaymentExport }>('/agentos/payments/exports', { method: 'POST' })).export,
    onSuccess: () => qc.invalidateQueries({ queryKey: ['agentos'] }),
  });
}

export function useMarkPaymentPosted() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (paymentId: string) =>
      (await apiRequest<{ payment: AgentosPayment }>(`/agentos/payments/${encodeURIComponent(paymentId)}/posted`, { method: 'POST' }))
        .payment,
    onSuccess: () => qc.invalidateQueries({ queryKey: ['agentos'] }),
  });
}
