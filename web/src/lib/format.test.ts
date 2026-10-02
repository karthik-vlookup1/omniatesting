import { describe, expect, it } from 'vitest';
import { formatCount, formatDate, formatDateTime, formatMoney, formatPercent, formatRelative, humanize } from './format';

describe('formatMoney', () => {
  it('formats GBP from numbers and Postgres numeric strings', () => {
    expect(formatMoney(1234.5)).toBe('£1,234.50');
    expect(formatMoney('450.00')).toBe('£450.00');
    expect(formatMoney(0)).toBe('£0.00');
  });

  it('uses a true minus sign for money out', () => {
    expect(formatMoney('-12')).toBe('−£12.00');
  });

  it('shows an em dash for missing or invalid values', () => {
    expect(formatMoney(null)).toBe('—');
    expect(formatMoney(undefined)).toBe('—');
    expect(formatMoney('abc')).toBe('—');
  });
});

describe('dates', () => {
  it('formats en-GB dates', () => {
    expect(formatDate('2026-10-02')).toBe('2 Oct 2026');
    expect(formatDateTime('2026-10-02T14:05:00')).toBe('2 Oct 2026, 14:05');
    expect(formatDate(null)).toBe('—');
    expect(formatDate('not a date')).toBe('—');
  });

  it('formats relative times', () => {
    expect(formatRelative('2026-10-02T10:00:00Z', new Date('2026-10-02T13:00:00Z'))).toBe('3 hours ago');
  });
});

describe('numbers and labels', () => {
  it('formats confidence and counts', () => {
    expect(formatPercent(0.95)).toBe('95%');
    expect(formatPercent('0.600')).toBe('60%');
    expect(formatCount(1240)).toBe('1,240');
  });

  it('humanizes enum values', () => {
    expect(humanize('needs_review')).toBe('Needs review');
    expect(humanize('yet_to_take')).toBe('Yet to take');
  });
});
