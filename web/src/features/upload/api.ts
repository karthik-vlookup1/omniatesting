/** Bank accounts, CSV profiles and statement uploads. */
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiFetch } from '../auth/api';

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
] as const;
export type CanonicalField = (typeof CANONICAL_FIELDS)[number];
export const DATE_FORMATS = ['DD/MM/YYYY', 'DD/MM/YY', 'DD-MM-YYYY', 'DD.MM.YYYY', 'YYYY-MM-DD', 'D MMM YYYY'] as const;

export interface CsvProfile {
  id: string;
  version: number;
  headerAliases: Partial<Record<CanonicalField, string[]>>;
  requiredFields: CanonicalField[];
  amountMode: 'signed' | 'split_in_out';
  dateFormat: string;
  skipRows: number;
  notes: string | null;
}

export interface BankAccount {
  id: string;
  code: string;
  bankName: string;
  accountName: string;
  isActive: boolean;
  profile: CsvProfile | null;
}

export interface ImportResult {
  batchId: string;
  rowsTotal: number;
  rowsInserted: number;
  rowsDuplicate: number;
  rowsSkipped: number;
  periodFrom: string;
  periodTo: string;
  withTid: number;
  withNi: number;
  withPayerAccount: number;
  moneyIn: number;
  moneyOut: number;
}

export interface MatchSummary {
  lines: number;
  autoMatched: number;
  matched: number;
  partiallyMatched: number;
  needsReview: number;
  yetToTake: number;
  excluded: number;
  unprocessed: number;
}

export interface UploadOutcome {
  import: ImportResult;
  /** null when matching failed after the import; the lines can be matched again later. */
  matching: MatchSummary | null;
}

export interface ImportBatch {
  id: string;
  bankCode: string;
  fileName: string;
  periodFrom: string | null;
  periodTo: string | null;
  rowsTotal: number | null;
  rowsInserted: number | null;
  rowsDuplicate: number | null;
  uploadedAt: string;
  uploadedBy: string | null;
}

/** An upload the server refused, with whatever it explained (missing headers, bad rows). */
export class UploadError extends Error {
  constructor(
    message: string,
    readonly missingFields?: string[],
    readonly rowErrors?: { line: number; error: string }[],
  ) {
    super(message);
    this.name = 'UploadError';
  }
}

const BANKS = ['bank-accounts'] as const;
const IMPORTS = ['imports'] as const;

export function useBankAccounts() {
  return useQuery({
    queryKey: BANKS,
    queryFn: () => apiFetch<{ bankAccounts: BankAccount[] }>('/api/bank-accounts').then((r) => r.bankAccounts),
  });
}

export function useImports() {
  return useQuery({
    queryKey: IMPORTS,
    queryFn: () => apiFetch<{ imports: ImportBatch[] }>('/api/imports').then((r) => r.imports),
  });
}

async function uploadStatement({ bankAccountId, file }: { bankAccountId: string; file: File }): Promise<UploadOutcome> {
  const form = new FormData();
  form.append('bankAccountId', bankAccountId);
  form.append('file', file);
  // No Content-Type: the browser sets the multipart boundary.
  const res = await fetch('/api/imports', {
    method: 'POST',
    body: form,
    credentials: 'same-origin',
    headers: { 'X-Requested-With': 'omnia-recon' },
  });
  const body = (await res.json().catch(() => ({}))) as {
    import?: ImportResult;
    matching?: MatchSummary | null;
    error?: { message?: string; details?: { missingFields?: string[]; rowErrors?: { line: number; error: string }[] } };
  };
  if (!res.ok || !body.import) {
    throw new UploadError(
      body.error?.message ?? 'Upload failed',
      body.error?.details?.missingFields,
      body.error?.details?.rowErrors,
    );
  }
  return { import: body.import, matching: body.matching ?? null };
}

export function useUpload() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: uploadStatement,
    onSuccess: () => void qc.invalidateQueries({ queryKey: IMPORTS }),
  });
}

export function useInstallDefaultBanks() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => apiFetch<{ created: string[] }>('/api/bank-accounts/defaults', { method: 'POST' }),
    onSuccess: () => void qc.invalidateQueries({ queryKey: BANKS }),
  });
}

export type ProfileInput = Omit<CsvProfile, 'id' | 'version'>;

export function useSaveProfile() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ bankAccountId, profile }: { bankAccountId: string; profile: ProfileInput }) =>
      apiFetch<{ id: string; version: number }>(`/api/bank-accounts/${bankAccountId}/profile`, {
        method: 'POST',
        body: JSON.stringify(profile),
      }),
    onSuccess: () => void qc.invalidateQueries({ queryKey: BANKS }),
  });
}
