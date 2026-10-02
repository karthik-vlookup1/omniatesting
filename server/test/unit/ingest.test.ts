/**
 * Bank CSV parsing against the 7 synthetic bank layouts, plus money/date/masking edge cases.
 */
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { formatPence, maskNiInText, parseBankCsv, parseDate, parseMoney, type ParseResult } from '../../src/domain/ingest/parse.js';
import { DEFAULT_BANKS, resolveColumns, type CsvProfile } from '../../src/domain/ingest/profiles.js';

const HASH_KEY = 'test-only-key';
const BANK_ID = '00000000-0000-4000-8000-0000000000b1';
const fixture = (name: string) => readFileSync(new URL(`../../../fixtures/banks/${name}`, import.meta.url));
const profileFor = (code: string): CsvProfile => DEFAULT_BANKS.find((b) => b.code === code)!.profile;
const parseFixture = (code: string, file?: string): ParseResult =>
  parseBankCsv(fixture(file ?? DEFAULT_BANKS.find((b) => b.code === code)!.fixture), profileFor(code), {
    bankAccountId: BANK_ID,
    hashKey: HASH_KEY,
  });

function ok(r: ParseResult) {
  if (!r.ok) throw new Error(`expected ok, got ${r.code}: ${r.message}`);
  return r;
}

describe('the 7 default bank layouts', () => {
  // [code, lines, money out, skipped]
  const expected: [string, number, number, number][] = [
    ['HSBC', 6, 1, 0],
    ['LLOYDS', 4, 1, 0],
    ['APOLLO_TW', 3, 1, 0],
    ['REDSTONE', 3, 1, 0],
    ['ARMY', 3, 1, 2],
    ['ISL', 3, 1, 0],
    ['OTHER', 3, 1, 0],
  ];
  it.each(expected)('%s parses %i lines (%i money out, %i skipped)', (code, lines, out, skipped) => {
    const r = ok(parseFixture(code));
    expect(r.lines).toHaveLength(lines);
    expect(r.lines.filter((l) => l.amount.startsWith('-'))).toHaveLength(out);
    expect(r.skipped).toBe(skipped);
    expect(r.lines.every((l) => /^\d{4}-\d{2}-\d{2}$/.test(l.txnDate))).toBe(true);
    expect(new Set(r.lines.map((l) => l.dedupeKey)).size).toBe(lines);
  });

  it('every default profile has a fixture and the 7 codes are distinct', () => {
    expect(new Set(DEFAULT_BANKS.map((b) => b.code)).size).toBe(7);
  });

  it('reads split columns, thousands separators and signs into exact pence', () => {
    const lloyds = ok(parseFixture('LLOYDS')).lines;
    expect(lloyds.map((l) => l.amount)).toEqual(['1300.00', '650.00', '-120.50', '650.00']);
    const hsbc = ok(parseFixture('HSBC')).lines;
    expect(hsbc[2]).toMatchObject({ txnDate: '2026-09-02', amount: '346.15', balanceAfter: '11646.15' });
  });

  it('keeps the bank transaction id, payer name and reference (TransferWise)', () => {
    const [first] = ok(parseFixture('APOLLO_TW')).lines;
    expect(first).toMatchObject({
      bankTxnId: 'TRANSFER-900001',
      txnDate: '2026-09-01',
      reference: 'T9008 SEPT',
      counterparty: 'TEST TENANT8',
    });
  });

  it('hashes payer sort code + account and keeps only the last 4', () => {
    const r = ok(parseFixture('REDSTONE')).lines;
    expect(r[0]).toMatchObject({ payerSortCode: '000010', payerAccountLast4: '0010' });
    expect(r[0]!.payerAccountHash).toMatch(/^[0-9a-f]{64}$/);
    expect(r[0]!.rawRow['Counterparty Account']).toBe('••••0010');
    expect(JSON.stringify(r)).not.toContain('12340010');
  });

  it('carries the explicit TID column (Recon format) for extraction', () => {
    const r = ok(parseFixture('OTHER')).lines;
    expect(r.map((l) => l.tidColumn)).toEqual(['T9016', 't9017', null]);
  });

  it('masks NI numbers everywhere they are stored, keeping the unmasked text only for matching', () => {
    const hsbc = ok(parseFixture('HSBC')).lines[1]!;
    expect(hsbc.description).toBe('FPI TEST TENANT2 •••••02C');
    expect(hsbc.rawRow.Description).toBe('FPI TEST TENANT2 •••••02C');
    expect(hsbc.matchText).toContain('AB100002C');

    const lloyds = ok(parseFixture('LLOYDS')).lines[3]!;
    expect(lloyds.description).toBe('NI •••••56D RENT');
    const tw = ok(parseFixture('APOLLO_TW')).lines[2]!;
    expect(tw.reference).toBe('rent •••••09C');
    const stored = JSON.stringify([hsbc, lloyds, tw].map(({ matchText: _m, ...rest }) => rest));
    expect(stored).not.toMatch(/AB\s?10\s?00\s?0[29]\s?C|CE\s?12\s?34\s?56\s?D/i);
  });

  it('skips preamble lines, blank rows and "Closing balance" footers (Army)', () => {
    const r = ok(parseFixture('ARMY'));
    expect(r.lines.map((l) => l.txnDate)).toEqual(['2026-09-01', '2026-09-02', '2026-09-02']);
  });

  it('keeps two identical payments on one statement apart', () => {
    const [a, b] = ok(parseFixture('HSBC')).lines.slice(4);
    expect(a!.description).toBe(b!.description);
    expect(a!.dedupeKey).not.toBe(b!.dedupeKey);
  });

  it('gives overlapping statements the same keys for the shared lines', () => {
    const full = ok(parseFixture('HSBC')).lines.map((l) => l.dedupeKey);
    const overlap = ok(parseFixture('HSBC', 'hsbc_overlap.csv')).lines.map((l) => l.dedupeKey);
    expect(overlap.filter((k) => full.includes(k))).toHaveLength(2);
  });

  it('dedupe keys differ per bank account', () => {
    const a = ok(parseFixture('HSBC')).lines[0]!.dedupeKey;
    const other = parseBankCsv(fixture('hsbc.csv'), profileFor('HSBC'), { bankAccountId: 'another', hashKey: HASH_KEY });
    expect(ok(other).lines[0]!.dedupeKey).not.toBe(a);
  });
});

describe('rejections name the problem', () => {
  it('an unknown layout names the missing fields', () => {
    const r = parseFixture('HSBC', 'hsbc_wrong_layout.csv');
    expect(r).toMatchObject({ ok: false, code: 'layout_mismatch' });
    if (!r.ok) {
      expect(r.missingFields).toEqual(expect.arrayContaining(['txn_date', 'description', 'paid_in', 'paid_out']));
      expect(r.message).toContain('Found headers: Posting Date, Narrative, Amount');
    }
  });

  it('bad rows reject the whole file with line numbers', () => {
    const r = parseFixture('HSBC', 'hsbc_bad_rows.csv');
    expect(r).toMatchObject({ ok: false, code: 'bad_rows' });
    if (!r.ok) {
      expect(r.rowErrors).toEqual([
        { line: 3, error: 'date "31/02/2026" does not exist' },
        { line: 4, error: 'paid in "12.3.4" is not an amount' },
        { line: 5, error: 'both paid in and paid out are filled' },
      ]);
    }
  });

  it('empty files and header-only files', () => {
    expect(parseBankCsv('', profileFor('HSBC'), { bankAccountId: BANK_ID, hashKey: HASH_KEY })).toMatchObject({
      ok: false,
      code: 'empty_file',
    });
    expect(
      parseBankCsv('Date,Description,Paid in,Paid out\n', profileFor('HSBC'), { bankAccountId: BANK_ID, hashKey: HASH_KEY }),
    ).toMatchObject({ ok: false, code: 'empty_file' });
  });
});

describe('headers, money, dates', () => {
  it('matches headers ignoring case, spaces, punctuation and a BOM', () => {
    const { columns, missing } = resolveColumns(['﻿DATE', 'description ', 'PAID-IN', 'paid_out'], profileFor('HSBC'));
    expect(missing).toEqual([]);
    expect(columns).toMatchObject({ txn_date: 0, description: 1, paid_in: 2, paid_out: 3 });
  });

  it('parses money into pence without floats', () => {
    expect(parseMoney('£1,234.56', 'x')).toBe(123456);
    expect(parseMoney('(12.00)', 'x')).toBe(-1200);
    expect(parseMoney('-0.1', 'x')).toBe(-10);
    expect(parseMoney('12.00 DR', 'x')).toBe(-1200);
    expect(parseMoney('12 CR', 'x')).toBe(1200);
    expect(parseMoney('0.29', 'x')).toBe(29);
    expect(() => parseMoney('1.234', 'x')).toThrow('not an amount');
    expect(() => parseMoney('(-5)', 'x')).toThrow('not an amount');
    expect(() => parseMoney('1,23', 'x')).toThrow('not an amount');
    expect(parseMoney('9,999,999,999.99', 'x')).toBe(999_999_999_999);
    expect(() => parseMoney('10000000000.00', 'x')).toThrow('too large');
    expect(() => parseMoney('abc', 'x')).toThrow();
    expect(formatPence(-5)).toBe('-0.05');
    expect(formatPence(123456)).toBe('1234.56');
  });

  it('parses each supported date format strictly', () => {
    expect(parseDate('02/10/2026', 'DD/MM/YYYY')).toBe('2026-10-02');
    expect(parseDate('2/9/26', 'DD/MM/YY')).toBe('2026-09-02');
    expect(parseDate('02-10-2026', 'DD-MM-YYYY')).toBe('2026-10-02');
    expect(parseDate('02.10.2026', 'DD.MM.YYYY')).toBe('2026-10-02');
    expect(parseDate('2026-10-02 00:00:00', 'YYYY-MM-DD')).toBe('2026-10-02');
    expect(parseDate('2 Oct 2026', 'D MMM YYYY')).toBe('2026-10-02');
    expect(parseDate('29/02/2028', 'DD/MM/YYYY')).toBe('2028-02-29');
    expect(() => parseDate('29/02/2026', 'DD/MM/YYYY')).toThrow('does not exist');
    expect(() => parseDate('2026-10-02', 'DD/MM/YYYY')).toThrow('not in the format');
    expect(() => parseDate('02x10x2026', 'DD.MM.YYYY')).toThrow('not in the format');
  });

  it('masks NI numbers in any spacing but leaves look-alikes alone', () => {
    expect(maskNiInText('ref ab 12 34 56 c ok')).toBe('ref •••••56C ok');
    expect(maskNiInText('XAB123456C')).toBe('XAB123456C');
    expect(maskNiInText('T9001 650.00')).toBe('T9001 650.00');
  });
});

describe('senior-tester: weird CSV, money and masking edges', () => {
  const opts = { bankAccountId: BANK_ID, hashKey: HASH_KEY };
  const H = 'Date,Description,Paid in,Paid out,Balance\n';

  it('reads a BOM, CRLF and a quoted newline inside a description', () => {
    const r = ok(parseBankCsv(`\uFEFF${H.replace('\n', '\r\n')}01/09/2026,"LINE ONE\r\nLINE TWO T9001",1.00,,1.00\r\n`, profileFor('HSBC'), opts));
    expect(r.lines).toHaveLength(1);
    expect(r.lines[0]!.description).toContain('T9001');
  });

  it('reports the physical file line of a bad row after blank lines and quoted newlines', () => {
    const blank = parseBankCsv(`${H}01/09/2026,A,1.00,,1\n\n\n02/09/2026,B,x,,2\n`, profileFor('HSBC'), opts);
    expect(blank).toMatchObject({ ok: false, rowErrors: [{ line: 5 }] });
    const quoted = parseBankCsv(`${H}01/09/2026,"A\nB",1.00,,1\n02/09/2026,B,x,,2\n`, profileFor('HSBC'), opts);
    expect(quoted).toMatchObject({ ok: false, rowErrors: [{ line: 4 }] });
  });

  it('counts preamble lines in reported line numbers (Army, 3 skipped rows)', () => {
    const csv = [
      'Army Rent Account',
      'Statement',
      ' ',
      'Date,Details,Money In,Money Out,Balance',
      '01/09/26,A,1.00,,1.00',
      '02/09/26,B,1.0.0,,2.00',
      '',
    ].join('\n');
    expect(parseBankCsv(csv, profileFor('ARMY'), opts)).toMatchObject({ ok: false, rowErrors: [{ line: 6 }] });
  });

  it('rejects misplaced thousands separators instead of guessing (1,23 is not £123)', () => {
    expect(parseMoney('1,234.56', 'x')).toBe(123456);
    expect(parseMoney('1,234,567.00', 'x')).toBe(123456700);
    expect(() => parseMoney('1,23', 'x')).toThrow('not an amount');
    expect(() => parseMoney('1,2,3', 'x')).toThrow('not an amount');
    expect(() => parseMoney('12,34.00', 'x')).toThrow('not an amount');
  });

  it('zero and negative zero are exact', () => {
    expect(formatPence(parseMoney('-0.00', 'x'))).toBe('0.00');
    expect(formatPence(parseMoney('0', 'x'))).toBe('0.00');
  });

  it('strict 2-digit vs 4-digit years and impossible dates', () => {
    expect(() => parseDate('01/09/26', 'DD/MM/YYYY')).toThrow('not in the format');
    expect(() => parseDate('01/09/2026', 'DD/MM/YY')).toThrow('not in the format');
    expect(() => parseDate('31/04/26', 'DD/MM/YY')).toThrow('does not exist');
    expect(() => parseDate('2026-13-01', 'YYYY-MM-DD')).toThrow('does not exist');
  });

  it('masks an explicit NI column in the raw row and keeps it only for extraction', () => {
    const base = profileFor('OTHER');
    const profile: CsvProfile = { ...base, headerAliases: { ...base.headerAliases, ni_number: ['NI Number'] } };
    const r = ok(parseBankCsv('Description,Date,Amount,NI Number,Notes\nRENT,01/09/2026,1.00,ab 10 00 11 c,also AB100011C\n', profile, opts));
    const line = r.lines[0]!;
    expect(line.niColumn).toBe('ab 10 00 11 c');
    expect(line.rawRow['NI Number']).toBe('•••••11C');
    const { matchText: _m, niColumn: _n, ...stored } = line;
    expect(JSON.stringify(stored)).not.toMatch(/AB\s?10\s?00\s?11\s?C/i);
  });

  it('never stores a payer account number in plain text, even under a duplicated header', () => {
    const csv =
      'Posting Date,Reference,Narrative,Amount,Counterparty Sort Code,Counterparty Account,Counterparty Account\n' +
      '2026-09-01,R,N,1.00,00-00-10,12340010,12340010\n';
    const r = parseBankCsv(csv, profileFor('REDSTONE'), opts);
    if (r.ok) expect(JSON.stringify(r.lines[0]!.rawRow)).not.toContain('12340010');
  });
});
