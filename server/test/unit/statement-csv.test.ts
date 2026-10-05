import { describe, expect, it } from 'vitest';
import { BOM, buildStatementCsv, pounds, STATEMENT_HEADER } from '../../src/services/export/statement-csv.js';

describe('statement-csv', () => {
  it('has the fixed 28 columns in the documented order', () => {
    expect(STATEMENT_HEADER).toHaveLength(28);
    expect(STATEMENT_HEADER[0]).toBe('Bank');
    expect(STATEMENT_HEADER[7]).toBe('Bank amount');
    expect(STATEMENT_HEADER[12]).toBe('Part');
    expect(STATEMENT_HEADER[25]).toBe('Left on line');
    expect(STATEMENT_HEADER[27]).toBe('Line ID');
  });

  it('formats pence as pounds', () => {
    expect(pounds(0n)).toBe('0.00');
    expect(pounds(1n)).toBe('0.01');
    expect(pounds(-1n)).toBe('-0.01');
    expect(pounds(-1250n)).toBe('-12.50');
    expect(pounds(12345n)).toBe('123.45');
    expect(pounds(100000000000n)).toBe('1000000000.00');
  });

  it('starts with one BOM, uses CRLF, escapes formulas and quotes specials', () => {
    const row = Array.from({ length: 28 }, () => '');
    row[3] = '=1+1';
    row[4] = 'a,b';
    row[5] = 'say "hi"';
    row[6] = 'x\ny';
    row[7] = '-12.50';
    row[8] = '-cmd';
    row[9] = '\tT';
    const out = buildStatementCsv([row]);
    expect(out.charCodeAt(0)).toBe(0xfeff);
    expect(out.indexOf(BOM, 1)).toBe(-1);
    const body = out.slice(1).split('\r\n');
    expect(body).toHaveLength(3);
    expect(body[1]!.split(',').slice(0, 4)).toEqual(['', '', '', "'=1+1"]);
    expect(body[1]).toContain(`,"a,b","say ""hi""","x\ny",-12.50,'-cmd,'\tT,`);
    expect(body[2]).toBe('');
  });
});
