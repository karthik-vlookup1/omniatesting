import { apiRequest } from '../../lib/api';
import type { BankAccount, ImportBatch, MatchSummary, UploadResponse } from './types';

/**
 * Real endpoints: Omnia_recon-backend server/src/api/ingest/routes.ts (bank accounts, imports) and
 * api/matching/routes.ts (per-import match summary).
 */

export async function listBankAccounts(signal?: AbortSignal): Promise<BankAccount[]> {
  const { bankAccounts } = await apiRequest<{ bankAccounts: BankAccount[] }>('/bank-accounts', { signal });
  return bankAccounts;
}

/** The 50 most recent imports, newest first. */
export async function listImports(signal?: AbortSignal): Promise<ImportBatch[]> {
  const { imports } = await apiRequest<{ imports: ImportBatch[] }>('/imports', { signal });
  return imports;
}

/** Multipart upload: the client sends the CSRF header and lets the browser set the boundary. */
export async function uploadStatement(input: { bankAccountId: string; file: File }): Promise<UploadResponse> {
  const form = new FormData();
  form.append('bankAccountId', input.bankAccountId);
  form.append('file', input.file, input.file.name);
  return apiRequest<UploadResponse>('/imports', { method: 'POST', body: form });
}

export async function fetchBatchSummary(batchId: string, signal?: AbortSignal): Promise<MatchSummary> {
  const { summary } = await apiRequest<{ summary: MatchSummary }>(`/matching/imports/${encodeURIComponent(batchId)}/summary`, {
    signal,
  });
  return summary;
}
