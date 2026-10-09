/** Pure rules for a multi-row Journal Transfer. */
import { describe, expect, it } from 'vitest';
import { validateJournalEntries } from '../../src/domain/agentos/journal.js';

const e = (tid: string, accountType: string, amountPence: number) => ({ tid, accountType, amountPence });

describe('validateJournalEntries', () => {
  it('accepts a pair and a three-way split that net to zero', () => {
    expect(() => validateJournalEntries([e('9201', 'Rent', -100), e('9202', 'Rent', 100)])).not.toThrow();
    expect(() => validateJournalEntries([e('9201', 'Rent', -100), e('9202', 'Rent', 60), e('9203', 'Rent', 40)])).not.toThrow();
  });

  it('allows two account types on one TID', () => {
    expect(() => validateJournalEntries([e('9201', 'Rent', -50), e('9201', 'Deposit', 50)])).not.toThrow();
  });

  it('accepts exactly 20 entries and rejects 21 or fewer than 2', () => {
    const twenty = Array.from({ length: 20 }, (_, i) => e(`${9300 + i}`, 'Rent', i % 2 === 0 ? -10 : 10));
    expect(() => validateJournalEntries(twenty)).not.toThrow();
    expect(() => validateJournalEntries([...twenty, e('9400', 'Rent', 0)])).toThrow(/at most 20/);
    expect(() => validateJournalEntries([e('9201', 'Rent', 0)])).toThrow(/at least 2/);
  });

  it('rejects zero, fractional and oversized amounts naming the entry', () => {
    expect(() => validateJournalEntries([e('9201', 'Rent', 0), e('9202', 'Rent', 0)])).toThrow(/Entry 1/);
    expect(() => validateJournalEntries([e('9201', 'Rent', -1), e('9202', 'Rent', 1.5)])).toThrow(/Entry 2/);
    expect(() => validateJournalEntries([e('9201', 'Rent', -10000000000), e('9202', 'Rent', 10000000000)])).toThrow(/Entry 1/);
  });

  it('rejects entries that do not add up to zero', () => {
    expect(() => validateJournalEntries([e('9201', 'Rent', -100), e('9202', 'Rent', 99)])).toThrow('Entries must add up to £0.00');
  });

  it('rejects a repeated TID and account type pair ignoring case and spaces', () => {
    expect(() => validateJournalEntries([e('9201', 'Rent', -100), e('9201', ' rent ', 100)])).toThrow(/Entry 2/);
  });
});
