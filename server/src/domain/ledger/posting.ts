/**
 * Pure ledger posting rules. Sign rule: + means the account is credited (a tenant paying in);
 * a tenant's balance is the sum of its postings.
 */
import { AppError } from '../../lib/errors.js';

export interface Posting {
  accountKind: 'tenant' | 'bank';
  accountRef: string;
  accountType?: string | null;
  amountPence: number;
}

export function validatePostings(postings: Posting[]): void {
  if (postings.length < 2) throw new AppError('bad_request', 'A ledger transaction needs at least 2 postings');
  let sum = 0;
  for (const p of postings) {
    if (!Number.isInteger(p.amountPence) || p.amountPence === 0) {
      throw new AppError('bad_request', 'Each posting amount must be a non-zero whole number of pence');
    }
    if (p.accountKind === 'tenant' && !/^\d{4,5}$/.test(p.accountRef)) {
      throw new AppError('bad_request', 'A tenant account reference must be 4 or 5 digits');
    }
    sum += p.amountPence;
  }
  if (sum !== 0) throw new AppError('bad_request', 'Ledger postings must sum to 0');
}

export function takePaymentPostings(tid: string, bankCode: string, amountPence: number): Posting[] {
  return [
    { accountKind: 'tenant', accountRef: tid, amountPence },
    { accountKind: 'bank', accountRef: bankCode, amountPence: -amountPence },
  ];
}
