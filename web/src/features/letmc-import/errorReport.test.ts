import { describe, expect, it } from 'vitest';
import { toErrorCsv } from './errorReport';

describe('toErrorCsv', () => {
  it('lists each bad row as Row,Key,Field,Reason and quotes commas, quotes and newlines', () => {
    const csv = toErrorCsv([
      { line: 6, key: 'L8004', field: 'Email', reason: 'is not a valid email address' },
      { line: 9, key: 'T1', field: 'Balance', reason: 'balance "1,23" is not an amount' },
    ]);
    expect(csv.split('\r\n')).toEqual([
      'Row,Key,Field,Reason',
      '6,L8004,Email,is not a valid email address',
      '9,T1,Balance,"balance ""1,23"" is not an amount"',
      '',
    ]);
  });

  it('is just the header when there are no errors', () => {
    expect(toErrorCsv([])).toBe('Row,Key,Field,Reason\r\n');
  });
});
