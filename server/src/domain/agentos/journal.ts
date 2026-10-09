/** Pure validation for a multi-row Journal Transfer. */
import { AppError } from '../../lib/errors.js';

export interface JournalEntryInput {
  tid: string;
  accountType: string;
  amountPence: number;
}

export const MAX_JOURNAL_ENTRIES = 20;
const MAX_ABS_PENCE = 9999999999;

export function validateJournalEntries(entries: JournalEntryInput[]): void {
  if (entries.length < 2) throw new AppError('bad_request', 'A journal transfer needs at least 2 entries');
  if (entries.length > MAX_JOURNAL_ENTRIES) {
    throw new AppError('bad_request', `A journal transfer can have at most ${MAX_JOURNAL_ENTRIES} entries`);
  }
  let sum = 0;
  entries.forEach((e, i) => {
    const n = i + 1;
    if (!Number.isInteger(e.amountPence) || e.amountPence === 0) {
      throw new AppError('bad_request', `Entry ${n}: amount must be a non-zero whole number of pence`);
    }
    if (Math.abs(e.amountPence) > MAX_ABS_PENCE) {
      throw new AppError('bad_request', `Entry ${n}: amount is too large`);
    }
    sum += e.amountPence;
  });
  if (sum !== 0) throw new AppError('bad_request', 'Entries must add up to £0.00');
  const seen = new Set<string>();
  entries.forEach((e, i) => {
    const key = `${e.tid}|${e.accountType.trim().toLowerCase()}`;
    if (seen.has(key)) throw new AppError('bad_request', `Entry ${i + 1}: duplicate person and account type`);
    seen.add(key);
  });
}
