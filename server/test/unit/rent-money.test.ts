/** Pence arithmetic for rent terms: parsing money text and converting between rent cycles. */
import { describe, expect, it } from 'vitest';
import { convertPence, toPence } from '../../src/services/rent/money.js';

describe('convertPence', () => {
  it('converts weekly to monthly, rounding half up', () => {
    expect(convertPence(5000, 'weekly', 'monthly')).toBe(21667);
  });

  it('is the identity for the same frequency', () => {
    for (const f of ['weekly', 'fortnightly', 'four_weekly', 'monthly', 'quarterly'] as const) {
      expect(convertPence(12345, f, f)).toBe(12345);
    }
  });

  it('converts one penny weekly to quarterly (13 weeks)', () => {
    expect(convertPence(1, 'weekly', 'quarterly')).toBe(13);
  });

  it('weekly to fortnightly doubles', () => {
    expect(convertPence(6000, 'weekly', 'fortnightly')).toBe(12000);
  });
});

describe('toPence', () => {
  it('parses whole pounds, one and two decimals', () => {
    expect(toPence('650')).toBe(65000);
    expect(toPence('650.5')).toBe(65050);
    expect(toPence('650.00')).toBe(65000);
    expect(toPence('0.01')).toBe(1);
    expect(toPence('-1.20')).toBe(-120);
  });

  it('rejects more than two decimals and non-numbers', () => {
    expect(() => toPence('1.234')).toThrow();
    expect(() => toPence('abc')).toThrow();
    expect(() => toPence('')).toThrow();
  });
});
