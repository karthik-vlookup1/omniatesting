import { describe, expect, it } from 'vitest';
import { sharedDisplayPath } from '../../src/services/vico/shared-folder.js';
import { buildVicoCsv, normaliseSortCode, sumPounds } from '../../src/services/vico/vico.service.js';

const BANK = { sortCode: '00-00-99', accountNumber: '00009999' };

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

  it('writes the accounts team layout: sort code digits, account, UK date, 2dp amount, TID, MG/RG', () => {
    const csv = buildVicoCsv(
      [
        { tid: 'T1234', amount: '650', receivedOn: '2026-09-30', managementType: 'RG' },
        { tid: 'T42', amount: '346.1', receivedOn: '2026-10-01', managementType: 'IRG' },
      ],
      BANK,
    );
    expect(csv).toBe(
      'Sort code,Account number,Date,Amount,Standing order reference,MG/RG\r\n' +
        '000099,00009999,30/09/2026,650.00,T1234,RG\r\n' +
        '000099,00009999,01/10/2026,346.10,T42,IRG\r\n',
    );
  });

  it('never lets a cell be read as a spreadsheet formula', () => {
    const csv = buildVicoCsv([{ tid: '=HYPERLINK("x")', amount: '1', receivedOn: '2026-09-30', managementType: 'MG' }], BANK);
    expect(csv.split('\r\n')[1]).toBe(`000099,00009999,30/09/2026,1.00,"'=HYPERLINK(""x"")",MG`);
  });
});

describe('sharedDisplayPath', () => {
  const f = 'f.csv';
  const p = (exportDir: string | null, displayDir: string | null = null) => sharedDisplayPath(f, { exportDir, displayDir });
  it('joins with the separator style of the directory', () => {
    expect(p('/srv/vico')).toBe('/srv/vico/f.csv');
    expect(p('/srv/vico/')).toBe('/srv/vico/f.csv');
    expect(p('/srv/vico', '\\\\fileserver\\vico')).toBe('\\\\fileserver\\vico\\f.csv');
    expect(p('/srv/vico', '\\\\fileserver\\vico\\')).toBe('\\\\fileserver\\vico\\f.csv');
    expect(p('/srv/vico', 'Z:\\Vico')).toBe('Z:\\Vico\\f.csv');
    expect(p('/')).toBe('/f.csv');
  });
  it('is null when the feature is off', () => {
    expect(p(null, '/shown')).toBeNull();
  });
});
