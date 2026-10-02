/**
 * Turns one bank CSV into normalised lines, or explains exactly why it can't.
 *
 * - Columns are found by header name (profiles.ts); a missing required field rejects the file,
 *   naming the fields.
 * - Any row with an unreadable date or amount rejects the whole file with line numbers: a
 *   half-imported statement is worse than none.
 * - Money is parsed from the text into pence (no floats).
 * - NI numbers in free text and payer account numbers are masked before anything is kept. The
 *   unmasked text is returned separately (`matchText`) only so the caller can extract the TID / NI
 *   hash at insert time; it is never stored.
 */
import { createHash } from 'node:crypto';
import { parse } from 'csv-parse/sync';
import { payerAccountHash } from '../../lib/crypto.js';
import { normaliseHeader, resolveColumns, type ColumnMap, type CsvProfile, type CanonicalField } from './profiles.js';

export interface ParsedLine {
  /** 1-based line number in the file, for error messages. */
  lineNo: number;
  txnDate: string;
  /** Signed, 2dp: + money in, - money out. */
  amount: string;
  description: string;
  reference: string | null;
  counterparty: string | null;
  balanceAfter: string | null;
  bankTxnId: string | null;
  /** Unmasked text for TID/NI extraction at insert time. Never stored. */
  matchText: string;
  /** Explicit TID column value, if the bank provides one. */
  tidColumn: string | null;
  /** Explicit NI column value, if the bank provides one. Never stored. */
  niColumn: string | null;
  payerSortCode: string | null;
  payerAccountHash: string | null;
  payerAccountLast4: string | null;
  /** The CSV row keyed by header, with NI and payer account numbers masked. */
  rawRow: Record<string, string>;
  dedupeKey: string;
}

export interface ParseOk {
  ok: true;
  lines: ParsedLine[];
  /** Rows with neither a date nor an amount (blank lines, footers) that were skipped. */
  skipped: number;
}

export interface ParseFailed {
  ok: false;
  code: 'layout_mismatch' | 'bad_rows' | 'empty_file' | 'unreadable';
  message: string;
  missingFields?: CanonicalField[];
  rowErrors?: { line: number; error: string }[];
}

export type ParseResult = ParseOk | ParseFailed;

const MAX_ROW_ERRORS = 20;

export function parseBankCsv(
  content: Buffer | string,
  profile: CsvProfile,
  opts: { bankAccountId: string; hashKey: string },
): ParseResult {
  let parsedRecords: { record: string[]; info: { lines: number } }[];
  try {
    parsedRecords = parse(content, {
      bom: true,
      relax_column_count: true,
      relax_quotes: true,
      skip_empty_lines: true,
      from_line: profile.skipRows + 1,
      info: true,
    }) as unknown as { record: string[]; info: { lines: number } }[];
  } catch (err) {
    return { ok: false, code: 'unreadable', message: `The file is not a readable CSV: ${(err as Error).message}` };
  }
  if (parsedRecords.length === 0) return { ok: false, code: 'empty_file', message: 'The file has no header row' };

  const headers = parsedRecords[0]!.record.map((h) => h.trim());
  const { columns, missing } = resolveColumns(headers, profile);
  if (missing.length > 0) {
    return {
      ok: false,
      code: 'layout_mismatch',
      message: `This file doesn't match the bank's CSV profile. Missing: ${missing.join(', ')}. Found headers: ${headers.join(', ')}`,
      missingFields: missing,
    };
  }

  const sensitive = sensitiveColumns(headers, profile, columns);
  const lines: ParsedLine[] = [];
  const rowErrors: { line: number; error: string }[] = [];
  const occurrences = new Map<string, number>();
  let skipped = 0;

  parsedRecords.slice(1).forEach(({ record, info }) => {
    // The physical line in the file where this record ends (blank lines and quoted newlines included).
    const lineNo = info.lines;
    const cell = (f: CanonicalField) => {
      const idx = columns[f];
      const v = idx === undefined ? '' : (record[idx] ?? '').trim();
      return v === '' ? null : v;
    };
    try {
      const line = toLine(cell, columns, sensitive, record, headers, profile, opts, lineNo, occurrences);
      if (line === null) skipped += 1;
      else lines.push(line);
    } catch (err) {
      if (rowErrors.length < MAX_ROW_ERRORS) rowErrors.push({ line: lineNo, error: (err as Error).message });
      else rowErrors.length = MAX_ROW_ERRORS;
    }
  });

  if (rowErrors.length > 0) {
    return {
      ok: false,
      code: 'bad_rows',
      message: `${rowErrors.length} row(s) could not be read; nothing was imported`,
      rowErrors,
    };
  }
  if (lines.length === 0) return { ok: false, code: 'empty_file', message: 'The file has no transaction rows' };
  return { ok: true, lines, skipped };
}

interface SensitiveColumns {
  account: Set<number>;
  ni: Set<number>;
}

/** Column indexes holding payer account numbers or NI numbers, by alias, including repeats. */
function sensitiveColumns(headers: string[], profile: CsvProfile, columns: ColumnMap): SensitiveColumns {
  const matching = (f: CanonicalField) => {
    const aliases = new Set((profile.headerAliases[f] ?? []).map(normaliseHeader));
    const set = new Set<number>();
    headers.forEach((h, i) => aliases.has(normaliseHeader(h)) && set.add(i));
    if (columns[f] !== undefined) set.add(columns[f]);
    return set;
  };
  return { account: matching('payer_account_number'), ni: matching('ni_number') };
}

function toLine(
  cell: (f: CanonicalField) => string | null,
  columns: ColumnMap,
  sensitive: SensitiveColumns,
  record: string[],
  headers: string[],
  profile: CsvProfile,
  opts: { bankAccountId: string; hashKey: string },
  lineNo: number,
  occurrences: Map<string, number>,
): ParsedLine | null {
  const rawDate = cell('txn_date');
  const amountPence = readAmount(cell, profile);
  if (rawDate === null && amountPence === null) return null; // blank-ish row
  if (rawDate === null) throw new Error('date is empty');
  if (amountPence === null) {
    // "Closing balance" style footers: no amount and no real date. A real date with no amount is an error.
    if (!isDate(rawDate, profile.dateFormat)) return null;
    throw new Error('amount is empty');
  }

  const txnDate = parseDate(rawDate, profile.dateFormat);
  const balancePence = cell('balance') === null ? null : parseMoney(cell('balance')!, 'balance');

  const descriptionRaw = cell('description') ?? cell('reference') ?? cell('counterparty') ?? '(no description)';
  const referenceRaw = cell('reference');
  const counterpartyRaw = cell('counterparty');
  const matchText = [descriptionRaw, referenceRaw, counterpartyRaw].filter(Boolean).join(' ');

  const payer = readPayerAccount(cell('payer_sort_code'), cell('payer_account_number'), opts.hashKey);

  // Masking goes by column, and covers EVERY column whose header is an account-number or NI
  // alias (a repeated header must not slip through). Repeated headers are kept as "Name (2)".
  const rawRow: Record<string, string> = {};
  headers.forEach((h, i) => {
    if (h === '') return;
    let v = (record[i] ?? '').trim();
    if (v !== '' && sensitive.account.has(i)) v = maskTail(v.replace(/\D/g, ''), 4);
    else if (v !== '' && sensitive.ni.has(i)) v = maskNiValue(v);
    else v = maskNiInText(v);
    let key = h;
    for (let n = 2; key in rawRow; n++) key = `${h} (${n})`;
    rawRow[key] = v;
  });

  const description = maskNiInText(descriptionRaw);
  const amount = formatPence(amountPence);
  const balanceAfter = balancePence === null ? null : formatPence(balancePence);
  const bankTxnId = cell('bank_txn_id');

  // Same account + date + amount + text + balance = same line; the occurrence counter keeps two
  // genuinely identical payments on one statement apart. A bank's own transaction id wins.
  const identity = bankTxnId
    ? `id|${bankTxnId}`
    : [txnDate, amount, description.toUpperCase().replace(/\s+/g, ' '), balanceAfter ?? ''].join('|');
  const occurrence = (occurrences.get(identity) ?? 0) + 1;
  occurrences.set(identity, occurrence);
  const dedupeKey = createHash('sha256').update(`${opts.bankAccountId}|${identity}|${occurrence}`).digest('hex');

  return {
    lineNo,
    txnDate,
    amount,
    description,
    reference: referenceRaw === null ? null : maskNiInText(referenceRaw),
    counterparty: counterpartyRaw === null ? null : maskNiInText(counterpartyRaw),
    balanceAfter,
    bankTxnId,
    matchText,
    tidColumn: cell('tid'),
    niColumn: cell('ni_number'),
    payerSortCode: payer?.sortCode ?? null,
    payerAccountHash: payer?.hash ?? null,
    payerAccountLast4: payer?.last4 ?? null,
    rawRow,
    dedupeKey,
  };
}

function readAmount(cell: (f: CanonicalField) => string | null, profile: CsvProfile): number | null {
  if (profile.amountMode === 'signed') {
    const v = cell('amount');
    return v === null ? null : parseMoney(v, 'amount');
  }
  const inV = cell('paid_in');
  const outV = cell('paid_out');
  const inP = inV === null ? 0 : Math.abs(parseMoney(inV, 'paid in'));
  const outP = outV === null ? 0 : Math.abs(parseMoney(outV, 'paid out'));
  if (inV === null && outV === null) return null;
  if (inP !== 0 && outP !== 0) throw new Error('both paid in and paid out are filled');
  return inP - outP;
}

/** Largest amount numeric(12,2) can hold, in pence. */
const MAX_PENCE = 999_999_999_999;

/** "£1,234.56", "-12.5", "(12.00)", "12.00 CR", "12.00 DR" -> pence. Anything ambiguous is refused. */
export function parseMoney(text: string, label: string): number {
  const bad = () => new Error(`${label} "${text}" is not an amount`);
  let t = text.replace(/[£\s]/g, '').toUpperCase();
  let sign = 1;
  let bracketed = false;
  if (/^\(.*\)$/.test(t)) {
    sign = -1;
    bracketed = true;
    t = t.slice(1, -1);
  }
  if (t.endsWith('DR')) {
    sign = -sign;
    t = t.slice(0, -2);
  } else if (t.endsWith('CR')) {
    t = t.slice(0, -2);
  }
  if (t.startsWith('-') || t.startsWith('+')) {
    if (bracketed) throw bad(); // "(-5)" has no single meaning
    if (t.startsWith('-')) sign = -sign;
    t = t.slice(1);
  }
  // Commas only as thousands separators ("1,234.56"); "1,23" could be a decimal comma, so refuse it.
  if (t.includes(',')) {
    if (!/^\d{1,3}(,\d{3})+(\.\d{1,2})?$/.test(t)) throw bad();
    t = t.replace(/,/g, '');
  }
  const m = /^(\d+)(?:\.(\d{1,2}))?$/.exec(t);
  if (!m) throw bad();
  const pence = Number(m[1]) * 100 + Number((m[2] ?? '').padEnd(2, '0'));
  if (!Number.isSafeInteger(pence) || pence > MAX_PENCE) throw new Error(`${label} "${text}" is too large`);
  return sign * pence;
}

export function formatPence(pence: number): string {
  const sign = pence < 0 ? '-' : '';
  const abs = Math.abs(pence);
  return `${sign}${Math.floor(abs / 100)}.${String(abs % 100).padStart(2, '0')}`;
}

const MONTHS: Record<string, number> = {
  JAN: 1, FEB: 2, MAR: 3, APR: 4, MAY: 5, JUN: 6, JUL: 7, AUG: 8, SEP: 9, OCT: 10, NOV: 11, DEC: 12,
};

/** Parses a date strictly in the profile's format and returns YYYY-MM-DD. A trailing time is ignored. */
export function parseDate(text: string, format: string): string {
  const t = text.trim().replace(/[ T]\d{1,2}:\d{2}(:\d{2})?$/, '');
  let ymd: [number, number, number] | null = null;
  let m: RegExpExecArray | null;
  switch (format) {
    case 'DD/MM/YYYY':
    case 'DD-MM-YYYY':
    case 'DD.MM.YYYY': {
      const sep = format[2] === '.' ? '\\.' : format[2]!;
      m = new RegExp(`^(\\d{1,2})${sep}(\\d{1,2})${sep}(\\d{4})$`).exec(t);
      if (m) ymd = [Number(m[3]), Number(m[2]), Number(m[1])];
      break;
    }
    case 'DD/MM/YY':
      m = /^(\d{1,2})\/(\d{1,2})\/(\d{2})$/.exec(t);
      if (m) ymd = [2000 + Number(m[3]), Number(m[2]), Number(m[1])];
      break;
    case 'YYYY-MM-DD':
      m = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(t);
      if (m) ymd = [Number(m[1]), Number(m[2]), Number(m[3])];
      break;
    case 'D MMM YYYY': {
      m = /^(\d{1,2})[ -]([A-Za-z]{3})[A-Za-z]*[ -](\d{4})$/.exec(t);
      const month = m ? MONTHS[m[2]!.toUpperCase()] : undefined;
      if (m && month) ymd = [Number(m[3]), month, Number(m[1])];
      break;
    }
    default:
      throw new Error(`unsupported date format ${format}`);
  }
  if (!ymd) throw new Error(`date "${text}" is not in the format ${format}`);
  const [y, mo, d] = ymd;
  const date = new Date(Date.UTC(y, mo - 1, d));
  if (date.getUTCFullYear() !== y || date.getUTCMonth() !== mo - 1 || date.getUTCDate() !== d) {
    throw new Error(`date "${text}" does not exist`);
  }
  return `${y}-${String(mo).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}

function isDate(text: string, format: string): boolean {
  try {
    parseDate(text, format);
    return true;
  } catch {
    return false;
  }
}

/** Same letters and spacing rules as the SQL extract_ni(). */
const NI_IN_TEXT = /(^|[^A-Z0-9])([A-CEGHJ-PR-TW-Z]{2}\s?\d{2}\s?\d{2}\s?\d{2}\s?[A-D])(?![A-Z0-9])/gi;

/** Replaces any NI number in free text with "•••••56D". */
export function maskNiInText(text: string): string {
  return text.replace(NI_IN_TEXT, (_m, pre: string, ni: string) => `${pre}${maskNiValue(ni)}`);
}

function maskNiValue(ni: string): string {
  const n = ni.replace(/\s/g, '').toUpperCase();
  return `•••••${n.slice(-3)}`;
}

function maskTail(digits: string, keep: number): string {
  return `••••${digits.slice(-keep)}`;
}

function readPayerAccount(sortCode: string | null, account: string | null, hashKey: string) {
  if (!sortCode || !account) return null;
  try {
    const sc = sortCode.replace(/\D/g, '');
    const acc = account.replace(/\D/g, '');
    return { sortCode: sc, hash: payerAccountHash(sc, acc, hashKey), last4: acc.slice(-4) };
  } catch {
    return null; // malformed: kept masked in raw_row, just not usable for matching
  }
}
