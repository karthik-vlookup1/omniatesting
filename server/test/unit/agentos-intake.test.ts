import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  INTAKE_HEADERS,
  parseAmountPence,
  parseIntakeCsv,
  parseUkDate,
  type IntakeParseResult,
} from '../../src/domain/agentos/intake.js';

const TODAY = '2026-06-15';
const fixture = (name: string) => readFileSync(new URL(`../fixtures/agentos/${name}`, import.meta.url), 'utf8');
const HEADER = INTAKE_HEADERS.join(',');

function failed(r: IntakeParseResult) {
  if (r.ok) throw new Error('expected a failure');
  return r;
}

describe('parseIntakeCsv', () => {
  it('parses the valid fixture', () => {
    const r = parseIntakeCsv(fixture('intake-valid.csv'), TODAY);
    if (!r.ok) throw new Error(JSON.stringify(r));
    expect(r.lines).toHaveLength(6);
    expect(r.lines.map((l) => l.amountPence)).toEqual([87322, 104500, 5000, 1250, 60000, 1]);
    expect(r.lines[2]!.tid).toBeNull();
    expect(r.lines[3]!.warnings).toEqual(['unverified_type']);
    expect(r.lines[0]!.warnings).toEqual([]);
    expect(r.lines[0]!.receivedOn).toBe('2026-03-02');
    // the blank line between the third and fourth rows is skipped but still counted
    expect(r.lines.map((l) => l.lineNo)).toEqual([2, 3, 4, 6, 7, 8]);
  });

  it('parses a BOM + CRLF copy the same way', () => {
    const plain = parseIntakeCsv(fixture('intake-valid.csv'), TODAY);
    const copy = '﻿' + fixture('intake-valid.csv').replace(/\r?\n/g, '\r\n');
    expect(parseIntakeCsv(copy, TODAY)).toEqual(plain);
  });

  it('rejects outgoing and zero amounts with line numbers', () => {
    const r = failed(parseIntakeCsv(fixture('intake-outgoing.csv'), TODAY));
    expect(r.code).toBe('bad_rows');
    expect(r.rowErrors.map((e) => e.line)).toEqual([3, 5]);
    expect(r.rowErrors[0]!.reason).toContain('incoming only');
    expect(r.rowErrors[1]!.reason).toContain('incoming only');
  });

  it('reports every bad row', () => {
    const r = failed(parseIntakeCsv(fixture('intake-bad-rows.csv'), TODAY));
    expect(r.code).toBe('bad_rows');
    expect(r.rowErrors.map((e) => e.line)).toEqual([2, 3, 4, 5, 6]);
    expect(r.rowErrors.map((e) => e.field)).toEqual(['Date', 'TID', 'Payer Name', 'row', 'Amount']);
  });

  it('accepts a TID with or without a leading T and stores 4 digits', () => {
    const csv = [
      HEADER,
      '02/03/2026,T1234,Ann Lee,10.00,Cash,Acct A,',
      '02/03/2026,t1234,Ann Lee,10.00,Cash,Acct A,',
      '02/03/2026,1234,Ann Lee,10.00,Cash,Acct A,',
    ].join('\n');
    const r = parseIntakeCsv(csv, TODAY);
    if (!r.ok) throw new Error(JSON.stringify(r));
    expect(r.lines.map((l) => l.tid)).toEqual(['1234', '1234', '1234']);
  });

  it('rejects TT1234, T123 and X1234 with line numbers', () => {
    const csv = [
      HEADER,
      '02/03/2026,TT1234,Ann Lee,10.00,Cash,Acct A,',
      '02/03/2026,T123,Ann Lee,10.00,Cash,Acct A,',
      '02/03/2026,X1234,Ann Lee,10.00,Cash,Acct A,',
    ].join('\n');
    const r = failed(parseIntakeCsv(csv, TODAY));
    expect(r.rowErrors.map((e) => [e.line, e.field])).toEqual([[2, 'TID'], [3, 'TID'], [4, 'TID']]);
  });

  it('rejects a bad header', () => {
    const r = failed(parseIntakeCsv(fixture('intake-bad-header.csv'), TODAY));
    expect(r.code).toBe('bad_header');
    expect(r.rowErrors[0]!.line).toBe(1);
  });

  it('rejects a header-only file', () => {
    expect(failed(parseIntakeCsv(fixture('intake-empty.csv'), TODAY)).code).toBe('empty_file');
  });

  it('rejects more than 5000 rows', () => {
    const rows = Array.from({ length: 5001 }, () => '01/03/2026,9101,A B,1.00,Cash,Dep,');
    expect(failed(parseIntakeCsv([HEADER, ...rows].join('\n'), TODAY)).code).toBe('too_many_rows');
  });

  it('counts every error but keeps only the first 200', () => {
    const rows = Array.from({ length: 205 }, () => '01/03/2026,9101,A B,-1.00,Cash,Dep,');
    const r = failed(parseIntakeCsv([HEADER, ...rows].join('\n'), TODAY));
    expect(r.errorCount).toBe(205);
    expect(r.rowErrors).toHaveLength(200);
  });
});

describe('parseUkDate', () => {
  it('checks real calendar days', () => {
    expect(parseUkDate('29/02/2024', TODAY)).toEqual({ ok: true, iso: '2024-02-29' });
    expect(parseUkDate('29/02/2025', TODAY).ok).toBe(false);
    expect(parseUkDate('2026-01-01', TODAY).ok).toBe(false);
  });
  it('rejects tomorrow', () => {
    expect(parseUkDate('16/06/2026', TODAY)).toEqual({ ok: false, reason: 'in the future' });
    expect(parseUkDate('15/06/2026', TODAY).ok).toBe(true);
  });
});

describe('parseAmountPence', () => {
  it('rejects bracketed amounts as outgoing', () => {
    const r = parseAmountPence('(5.00)');
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toContain('outgoing');
  });
  it('rejects amounts over the cap', () => {
    expect(parseAmountPence('1,000,000.01')).toEqual({ ok: false, reason: 'over 1,000,000.00' });
    expect(parseAmountPence('1,000,000.00')).toEqual({ ok: true, pence: 100_000_000 });
  });
  it('parses pound signs, commas and short pence', () => {
    expect(parseAmountPence('£50.00')).toEqual({ ok: true, pence: 5000 });
    expect(parseAmountPence('12.5')).toEqual({ ok: true, pence: 1250 });
    expect(parseAmountPence('12.345').ok).toBe(false);
  });
});
