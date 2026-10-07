import { describe, expect, it } from 'vitest';
import { takePaymentPostings, validatePostings, type Posting } from '../../src/domain/ledger/posting.js';

const t = (ref: string, amountPence: number): Posting => ({ accountKind: 'tenant', accountRef: ref, amountPence });
const b = (ref: string, amountPence: number): Posting => ({ accountKind: 'bank', accountRef: ref, amountPence });

describe('ledger postings', () => {
  it('takePaymentPostings credits the tenant and debits the bank, summing to 0', () => {
    const p = takePaymentPostings('9201', 'HSBC', 12345);
    expect(p).toEqual([t('9201', 12345), b('HSBC', -12345)]);
    expect(p.reduce((s, x) => s + x.amountPence, 0)).toBe(0);
    expect(() => validatePostings(p)).not.toThrow();
  });

  it('accepts 5 digit tenant refs', () => {
    expect(() => validatePostings([t('10001', 5), b('X', -5)])).not.toThrow();
  });

  it.each([
    ['fewer than 2 postings', [t('9201', 0)]],
    ['a zero amount', [t('9201', 0), b('X', 0)]],
    ['a fractional amount', [t('9201', 1.5), b('X', -1.5)]],
    ['a non zero sum', [t('9201', 100), b('X', -99)]],
    ['a bad tenant ref', [t('92', 100), b('X', -100)]],
    ['a 6 digit tenant ref', [t('920100', 100), b('X', -100)]],
  ])('rejects %s', (_name, postings) => {
    expect(() => validatePostings(postings as Posting[])).toThrow();
  });
});
