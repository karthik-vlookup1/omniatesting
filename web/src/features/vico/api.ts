/** Vico export API client: constants, pending receipts, export (file download) and history. */
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiFetch, ApiError } from '../auth/api';

export interface VicoSettings {
  sortCode: string | null;
  accountNumber: string | null;
}

export interface PendingReceipt {
  receiptId: string;
  tid: string;
  tenantName: string | null;
  amount: string;
  receivedOn: string;
  bankCode: string | null;
}

export interface VicoExport {
  exportId: string;
  fileName: string;
  createdAt: string;
  rows: number;
  totalAmount: string;
}

export interface Downloaded {
  fileName: string;
  rows: number;
  totalAmount: string;
}

const KEY = ['vico'] as const;

export function useVicoSettings() {
  return useQuery({
    queryKey: [...KEY, 'settings'],
    queryFn: () => apiFetch<{ settings: VicoSettings }>('/api/vico/settings').then((r) => r.settings),
  });
}

export function useSaveVicoSettings() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: { sortCode: string; accountNumber: string }) =>
      apiFetch<{ settings: VicoSettings }>('/api/vico/settings', { method: 'PUT', body: JSON.stringify(body) }).then(
        (r) => r.settings,
      ),
    onSuccess: (s) => qc.setQueryData([...KEY, 'settings'], s),
  });
}

export function useVicoPending() {
  return useQuery({
    queryKey: [...KEY, 'pending'],
    queryFn: () => apiFetch<{ rows: PendingReceipt[]; total: number; totalAmount: string }>('/api/vico/pending'),
  });
}

export function useVicoExports() {
  return useQuery({
    queryKey: [...KEY, 'exports'],
    queryFn: () => apiFetch<{ exports: VicoExport[] }>('/api/vico/exports').then((r) => r.exports),
  });
}

/** Fetches a CSV and hands it to the browser as a download. */
async function download(path: string, init: RequestInit): Promise<Downloaded> {
  const res = await fetch(path, {
    ...init,
    credentials: 'same-origin',
    headers: { 'X-Requested-With': 'omnia-recon', 'Content-Type': 'application/json', ...init.headers },
  });
  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as { error?: { code?: string; message?: string } };
    throw new ApiError(res.status, body.error?.code ?? 'error', body.error?.message ?? 'Download failed');
  }
  const fileName = /filename="([^"]+)"/.exec(res.headers.get('Content-Disposition') ?? '')?.[1] ?? 'vico.csv';
  const url = URL.createObjectURL(await res.blob());
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  return {
    fileName,
    rows: Number(res.headers.get('X-Vico-Rows') ?? 0),
    totalAmount: res.headers.get('X-Vico-Total') ?? '0.00',
  };
}

export function useCreateVicoExport() {
  const qc = useQueryClient();
  return useMutation({
    /**
     * Exports exactly the receipts the person saw and confirmed (the server refuses if any went meanwhile).
     * Above the server's 5000-id limit it falls back to "everything pending".
     */
    mutationFn: (receiptIds: string[]) =>
      download('/api/vico/exports', {
        method: 'POST',
        body: JSON.stringify(receiptIds.length > 0 && receiptIds.length <= 5000 ? { receiptIds } : {}),
      }),
    onSettled: () => void qc.invalidateQueries({ queryKey: KEY }),
  });
}

export function useDownloadVicoExport() {
  return useMutation({
    mutationFn: (exportId: string) => download(`/api/vico/exports/${exportId}/file`, { method: 'GET' }),
  });
}
