/**
 * Bank CSV profiles: how to find each canonical field in one bank's CSV, by header NAME.
 *
 * Header matching ignores case, spaces, punctuation and a UTF-8 BOM, so "Paid In", "paid_in" and
 * "PAID-IN" are the same header. A bank renaming a column is a new profile version, not code.
 */

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
export type AmountMode = 'signed' | 'split_in_out';
export type HeaderAliases = Partial<Record<CanonicalField, string[]>>;

export interface CsvProfile {
  headerAliases: HeaderAliases;
  requiredFields: CanonicalField[];
  amountMode: AmountMode;
  dateFormat: string;
  skipRows: number;
}

export const DATE_FORMATS = ['DD/MM/YYYY', 'DD/MM/YY', 'DD-MM-YYYY', 'DD.MM.YYYY', 'YYYY-MM-DD', 'D MMM YYYY'] as const;

export function normaliseHeader(header: string): string {
  return header
    .replace(/^\uFEFF/, '')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '');
}

export type ColumnMap = Partial<Record<CanonicalField, number>>;

export interface ResolveResult {
  columns: ColumnMap;
  /** Required fields (including the amount columns the amount mode needs) with no matching header. */
  missing: CanonicalField[];
  /**
   * The amount layout this file actually has. Banks change exports between one signed Amount column and
   * Paid in / Paid out; when the profile's layout is absent but the other one is fully there, use it.
   */
  amountMode: AmountMode;
}

/** Finds each canonical field's column index. The first alias that matches a header wins. */
export function resolveColumns(headers: string[], profile: CsvProfile): ResolveResult {
  const index = new Map<string, number>();
  headers.forEach((h, i) => {
    const key = normaliseHeader(h);
    if (key !== '' && !index.has(key)) index.set(key, i);
  });

  const columns: ColumnMap = {};
  for (const field of CANONICAL_FIELDS) {
    for (const alias of profile.headerAliases[field] ?? []) {
      const i = index.get(normaliseHeader(alias));
      if (i !== undefined) {
        columns[field] = i;
        break;
      }
    }
  }

  const hasSigned = columns.amount !== undefined;
  const hasSplit = columns.paid_in !== undefined || columns.paid_out !== undefined;
  let amountMode = profile.amountMode;
  // Switch to split only when both directions are there, so a file never imports one side and drops the other.
  const hasBothSplit = columns.paid_in !== undefined && columns.paid_out !== undefined;
  if (amountMode === 'signed' && !hasSigned && hasBothSplit) amountMode = 'split_in_out';
  if (amountMode === 'split_in_out' && !hasSplit && hasSigned) amountMode = 'signed';

  const required = new Set<CanonicalField>(profile.requiredFields);
  if (amountMode === 'signed') required.add('amount');
  const missing = [...required].filter((f) => columns[f] === undefined);
  if (amountMode === 'split_in_out' && !hasSplit) missing.push('paid_in', 'paid_out');
  return { columns, missing, amountMode };
}

export interface DefaultBank {
  code: string;
  bankName: string;
  accountName: string;
  profile: CsvProfile;
  /** Synthetic fixture under fixtures/banks/ that follows this layout. */
  fixture: string;
}

const base = { requiredFields: ['txn_date', 'description'] as CanonicalField[] };

/**
 * Starting profiles for the 7 rent accounts. Only OTHER (Sam's Recon format) is a known real
 * layout; the rest are synthetic placeholders to be replaced with each bank's real headers in the
 * profile screen (a new version), with no code change.
 */
export const DEFAULT_BANKS: DefaultBank[] = [
  {
    code: 'HSBC',
    bankName: 'HSBC',
    accountName: 'Rent - HSBC',
    fixture: 'hsbc.csv',
    profile: {
      ...base,
      headerAliases: {
        txn_date: ['Date'],
        description: ['Description'],
        // Business exports have one signed Amount (with a Type column: CR / BP / DD); others split it.
        amount: ['Amount'],
        paid_in: ['Paid in'],
        paid_out: ['Paid out'],
        balance: ['Balance'],
      },
      amountMode: 'split_in_out',
      dateFormat: 'DD/MM/YYYY',
      skipRows: 0,
    },
  },
  {
    code: 'LLOYDS',
    bankName: 'Lloyds',
    accountName: 'Rent - Lloyds',
    fixture: 'lloyds.csv',
    profile: {
      ...base,
      headerAliases: {
        txn_date: ['Transaction Date'],
        description: ['Transaction Description'],
        paid_in: ['Credit Amount'],
        paid_out: ['Debit Amount'],
        balance: ['Balance'],
      },
      amountMode: 'split_in_out',
      dateFormat: 'DD/MM/YYYY',
      skipRows: 0,
    },
  },
  {
    code: 'APOLLO_TW',
    bankName: 'Apollo (TransferWise)',
    accountName: 'Rent - Apollo TW',
    fixture: 'apollo_tw.csv',
    profile: {
      ...base,
      headerAliases: {
        bank_txn_id: ['TransferWise ID'],
        txn_date: ['Date'],
        amount: ['Amount'],
        description: ['Description'],
        reference: ['Payment Reference'],
        counterparty: ['Payer Name'],
        balance: ['Running Balance'],
      },
      amountMode: 'signed',
      dateFormat: 'DD-MM-YYYY',
      skipRows: 0,
    },
  },
  {
    code: 'REDSTONE',
    bankName: 'Redstone',
    accountName: 'Rent - Redstone',
    fixture: 'redstone.csv',
    profile: {
      ...base,
      headerAliases: {
        txn_date: ['Posting Date'],
        description: ['Narrative'],
        reference: ['Reference'],
        amount: ['Amount'],
        payer_sort_code: ['Counterparty Sort Code'],
        payer_account_number: ['Counterparty Account'],
      },
      amountMode: 'signed',
      dateFormat: 'YYYY-MM-DD',
      skipRows: 0,
    },
  },
  {
    code: 'ARMY',
    bankName: 'Army',
    accountName: 'Rent - Army',
    fixture: 'army.csv',
    profile: {
      ...base,
      headerAliases: {
        txn_date: ['Date'],
        description: ['Details'],
        paid_in: ['Money In'],
        paid_out: ['Money Out'],
        balance: ['Balance'],
      },
      amountMode: 'split_in_out',
      dateFormat: 'DD/MM/YY',
      skipRows: 3,
    },
  },
  {
    code: 'ISL',
    bankName: 'ISL',
    accountName: 'Rent - ISL',
    fixture: 'isl.csv',
    profile: {
      ...base,
      headerAliases: {
        txn_date: ['Value Date'],
        description: ['Payer'],
        counterparty: ['Payer'],
        payer_sort_code: ['Payer Sort Code'],
        payer_account_number: ['Payer Account No'],
        reference: ['Payment Reference'],
        paid_in: ['Credit'],
        paid_out: ['Debit'],
      },
      amountMode: 'split_in_out',
      dateFormat: 'DD/MM/YYYY',
      skipRows: 0,
    },
  },
  {
    code: 'OTHER',
    bankName: 'Seventh account (to confirm)',
    accountName: 'Rent - other',
    fixture: 'other_recon_format.csv',
    profile: {
      ...base,
      // The format the earlier Recon app (Sam's) imported; TransferWise exports add an ID column.
      headerAliases: {
        description: ['Description'],
        reference: ['Payment Reference'],
        txn_date: ['Date'],
        counterparty: ['Payer Name'],
        tid: ['Current Tenancy ID'],
        amount: ['Amount'],
        bank_txn_id: ['TransferWise ID'],
      },
      amountMode: 'signed',
      dateFormat: 'DD/MM/YYYY',
      skipRows: 0,
    },
  },
];
