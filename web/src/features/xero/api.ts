/** Xero API client: status, settings, pending invoices, staging, sending and the outbox. */
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiRequest } from '../../lib/api';

export interface XeroStatus {
  configured: boolean;
  targetEnv: 'demo' | 'live';
  bridge: {
    reachable: boolean;
    tenantId: string | null;
    error?: string;
  } | null;
}

export interface XeroSettings {
  contacts: Record<string, string>;
  extendedFields: boolean;
}

export interface InvoiceLine {
  receiptId: string;
  tid: string;
  tenantName: string | null;
  amount: string;
  accountCode: string;
  managementType: string;
  branch: string | null;
  property: string | null;
}

export interface InvoiceDraft {
  bankCode: string | null;
  contactName: string;
  date: string;
  invoiceNumber: string;
  lines: InvoiceLine[];
  total: string;
}

export type OutboxStatus = 'pending' | 'in_flight' | 'done' | 'failed' | 'dead';

export interface OutboxItem extends InvoiceDraft {
  id: string;
  batchId: string;
  status: OutboxStatus;
  attempts: number;
  lastError: string | null;
  xeroInvoiceId: string | null;
  xeroInvoiceNumber: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface RunResult {
  targetEnv: 'demo' | 'live';
  attempted: number;
  sent: number;
  failed: number;
  dead: number;
}

export interface PropertyMapSummary {
  fetched: number;
  matched: number;
  unmatchedProperties: number;
  ambiguous: number;
}

const KEY = ['xero'] as const;

export function useXeroStatus() {
  return useQuery({
    queryKey: [...KEY, 'status'],
    queryFn: () => apiRequest<XeroStatus>('/xero/status'),
  });
}

export function useXeroSettings() {
  return useQuery({
    queryKey: [...KEY, 'settings'],
    queryFn: () => apiRequest<{ settings: XeroSettings }>('/xero/settings').then((r) => r.settings),
  });
}

export function useSaveXeroSettings() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (s: XeroSettings) =>
      apiRequest<{ settings: XeroSettings }>('/xero/settings', {
        method: 'PUT',
        body: s,
      }).then((r) => r.settings),
    onSuccess: (s) => {
      qc.setQueryData([...KEY, 'settings'], s);
      void qc.invalidateQueries({ queryKey: [...KEY, 'pending'] });
    },
  });
}

export function useXeroPending() {
  return useQuery({
    queryKey: [...KEY, 'pending'],
    queryFn: () => apiRequest<{ invoices: InvoiceDraft[]; receipts: number; total: string }>('/xero/pending'),
  });
}

export function useXeroOutbox(status: 'open' | 'done' | 'dead') {
  return useQuery({
    queryKey: [...KEY, 'outbox', status],
    queryFn: () =>
      apiRequest<{ items: OutboxItem[]; summary: Record<OutboxStatus, number>; ready: number }>('/xero/outbox', {
        query: { status },
      }),
  });
}

export function useStageInvoices() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () =>
      apiRequest<{ batches: OutboxItem[] }>('/xero/stage', {
        method: 'POST',
        body: {},
      }).then((r) => r.batches),
    onSettled: () => void qc.invalidateQueries({ queryKey: KEY }),
  });
}

export function useRunXero() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: { confirmLive: boolean }) =>
      apiRequest<RunResult>('/xero/run', {
        method: 'POST',
        body,
      }),
    onSettled: () => void qc.invalidateQueries({ queryKey: KEY }),
  });
}

export function useRetryBatch() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) =>
      apiRequest<{ item: OutboxItem }>(`/xero/outbox/${id}/retry`, {
        method: 'POST',
        body: {},
      }),
    onSettled: () => void qc.invalidateQueries({ queryKey: KEY }),
  });
}

export function useRefreshPropertyMap() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () =>
      apiRequest<{ summary: PropertyMapSummary }>('/xero/property-map/refresh', { method: 'POST', body: {} }).then(
        (r) => r.summary,
      ),
    onSettled: () => void qc.invalidateQueries({ queryKey: [...KEY, 'pending'] }),
  });
}
