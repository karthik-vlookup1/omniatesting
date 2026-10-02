import { describe, expect, it } from 'vitest';
import { buildVicoCsv, normaliseSortCode, sumPounds } from '../../src/services/vico/vico.service.js';

describe('Vico file helpers', () => {
  it('sums pound strings exactly', () => {
    expect(sumPounds([])).toBe('0.00');
    expect(sumPounds(['0.1', '0.2'])).toBe('0.30');
    expect(sumPounds(['650.00', '346.15', '1300'])).toBe('2296.15');
    expect(sumPounds(['-12.5', '10'])).toBe('-2.50');
    expect(sumPounds(['999999999999.99', '0.01'])).toBe('1000000000000.00');
  });

  it('normalises sort codes to 12-34-56', () => {
    expect(normaliseSortCode('123456')).toBe('12-34-56');
    expect(normaliseSortCode('12-34-56')).toBe('12-34-56');
  });

  it('writes CRLF rows with two-decimal amounts and the constant bank details', () => {
    const csv = buildVicoCsv(
      [
        { tid: 'T1234', amount: '650' },
        { tid: 'T42', amount: '346.1' },
      ],
      { sortCode: '00-00-99', accountNumber: '00009999' },
    );
    expect(csv).toBe('TID,Amount,Sort Code,Account Number\r\nT1234,650.00,00-00-99,00009999\r\nT42,346.10,00-00-99,00009999\r\n');
  });

  it('never lets a cell be read as a spreadsheet formula', () => {
    const csv = buildVicoCsv([{ tid: '=HYPERLINK("x")', amount: '1' }], { sortCode: '00-00-99', accountNumber: '00009999' });
    expect(csv.split('\r\n')[1]).toBe(`"'=HYPERLINK(""x"")",1.00,00-00-99,00009999`);
  });
});
