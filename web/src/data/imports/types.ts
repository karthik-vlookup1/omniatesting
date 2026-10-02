/**
 * Mirrors Omnia_recon-backend server/src/services/ingest/ingest.service.ts and
 * services/matching (FRONTEND_REFERENCE.md §5.4–5.5). Keep in step with the API.
 */

export type CanonicalField =
  | 'txn_date'
  | 'description'
  | 'reference'
  | 'amount'
  | 'paid_in'
  | 'paid_out'
  | 'counterparty'
  | 'payer_sort_code'
  | 'payer_account_number'
  | 'balance'
  | 'bank_txn_id'
  | 'tid'
  | 'ni_number';

/** Plain-language names for CSV fields, used when a file's layout does not match its profile. */
export const CANONICAL_FIELD_LABEL: Record<CanonicalField, string> = {
  txn_date: 'Date',
  description: 'Description',
  reference: 'Reference',
  amount: 'Amount',
  paid_in: 'Paid in',
  paid_out: 'Paid out',
  counterparty: 'Counterparty',
  payer_sort_code: 'Payer sort code',
  payer_account_number: 'Payer account number',
  balance: 'Balance',
  bank_txn_id: 'Bank transaction ID',
  tid: 'Tenancy ID (TID)',
  ni_number: 'NI number',
};

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

/** POST /imports result. Counts are numbers; moneyIn / moneyOut are numbers in pounds. */
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
  /** The uploader's full name. */
  uploadedBy: string | null;
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

export interface UploadResponse {
  import: ImportResult;
  /** null: the import was saved but matching failed; lines are matched when matching runs again. */
  matching: MatchSummary | null;
}

/** Server upload limit (MAX_FILE_BYTES in api/ingest/routes.ts). */
export const MAX_UPLOAD_BYTES = 10 * 1024 * 1024;

/** The `details` of a 400 from POST /imports when the file does not fit the bank's profile. */
export interface UploadRejection {
  reason?: string;
  missingFields?: CanonicalField[];
  rowErrors?: { line: number; error: string }[];
}
