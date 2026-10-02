/** Review queue API client: bank lines with their suggestions, and the confirm / reject / exclude / include actions. */
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiFetch } from '../auth/api';

export type LineStatus = 'new' | 'excluded' | 'needs_review' | 'yet_to_take' | 'partially_matched' | 'matched';
export type QueueStatus = 'open' | LineStatus;
export type Payer = 'tenant' | 'council_hb' | 'dwp_uc' | 'other_third_party';

export const PAYERS: { value: Payer; label: string }[] = [
  { value: 'tenant', label: 'Tenant' },
  { value: 'council_hb', label: 'Council (HB)' },
  { value: 'dwp_uc', label: 'DWP (UC)' },
  { value: 'other_third_party', label: 'Other third party' },
];

export interface Suggestion {
  id: string;
  tid: string;
  tenantName: string | null;
  payer: Payer;
  method: string;
  confidence: number;
  reason: string | null;
  status: 'open' | 'accepted' | 'rejected';
}

export interface ReceiptView {
  id: string;
  tid: string;
  payer: Payer;
  amount: string;
  ledgerCode: string | null;
  matchedVia: string;
  /** null = matched automatically. */
  matchedBy: string | null;
}

export interface BankLine {
  id: string;
  bankCode: string;
  importBatchId: string;
  txnDate: string;
  amount: string;
  remaining: string;
  description: string;
  reference: string | null;
  counterparty: string | null;
  payerAccountLast4: string | null;
  extractedTid: string | null;
  status: LineStatus;
  exclusionReason: string | null;
  note: string | null;
  suggestions: Suggestion[];
  receipts: ReceiptView[];
}

export interface LineFilters {
  status: QueueStatus;
  bankAccountId?: string;
  batchId?: string;
  limit: number;
  offset: number;
}

export interface ConfirmInput {
  suggestionId?: string;
  tid?: string;
  payer?: Payer;
  remember: boolean;
  amount?: string;
}

const KEY = ['matching'] as const;

function query(f: LineFilters): string {
  const p = new URLSearchParams({ status: f.status, limit: String(f.limit), offset: String(f.offset) });
  if (f.bankAccountId) p.set('bankAccountId', f.bankAccountId);
  if (f.batchId) p.set('batchId', f.batchId);
  return p.toString();
}

export function useLines(filters: LineFilters) {
  return useQuery({
    queryKey: [...KEY, 'lines', filters],
    queryFn: () => apiFetch<{ lines: BankLine[]; total: number }>(`/api/matching/lines?${query(filters)}`),
    placeholderData: (prev) => prev,
  });
}

/** Number of lines still waiting for a person (needs review, yet to take, part matched). */
export function useOpenCount() {
  return useQuery({
    queryKey: [...KEY, 'lines', 'open-count'],
    queryFn: () =>
      apiFetch<{ total: number }>('/api/matching/lines?status=open&limit=1&offset=0').then((r) => r.total),
    staleTime: 30_000,
  });
}

export function useLine(id: string | null) {
  return useQuery({
    queryKey: [...KEY, 'line', id],
    queryFn: () => apiFetch<{ line: BankLine }>(`/api/matching/lines/${id!}`).then((r) => r.line),
    enabled: id !== null,
  });
}

/** Every action answers with the updated line: put it in the cache, then refresh the lists. */
function useLineAction<V>(run: (v: V) => Promise<{ line: BankLine }>) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (v: V) => run(v).then((r) => r.line),
    onSuccess: (line) => {
      qc.setQueryData([...KEY, 'line', line.id], line);
      void qc.invalidateQueries({ queryKey: [...KEY, 'lines'] });
    },
  });
}

const post = (path: string, body?: unknown) =>
  apiFetch<{ line: BankLine }>(path, { method: 'POST', body: body === undefined ? undefined : JSON.stringify(body) });

export function useConfirmLine() {
  return useLineAction(({ lineId, input }: { lineId: string; input: ConfirmInput }) =>
    post(`/api/matching/lines/${lineId}/confirm`, input),
  );
}

export function useRejectSuggestion() {
  return useLineAction(({ lineId, suggestionId }: { lineId: string; suggestionId: string }) =>
    post(`/api/matching/lines/${lineId}/suggestions/${suggestionId}/reject`),
  );
}

export function useExcludeLine() {
  return useLineAction(({ lineId, reason }: { lineId: string; reason: string }) =>
    post(`/api/matching/lines/${lineId}/exclude`, { reason }),
  );
}

export function useIncludeLine() {
  return useLineAction(({ lineId }: { lineId: string }) => post(`/api/matching/lines/${lineId}/include`));
}
