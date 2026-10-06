/**
 * Pure parser for the hand-formatted agentOS bank record CSV:
 * Date,TID,Payer Name,Amount,Type,Will deposit to,Description. Incoming payments only.
 * Any bad row rejects the whole file; every bad row is reported with its line number.
 */
import { parse } from 'csv-parse/sync';

export const INTAKE_HEADERS = ['Date', 'TID', 'Payer Name', 'Amount', 'Type', 'Will deposit to', 'Description'] as const;
export const MAX_ROW_ERRORS = 200;
export const MAX_ROWS = 5000;
export const MAX_PENCE = 100_000_000;

export interface IntakeRowError {
  line: number;
  field: string;
  reason: string;
}

export interface IntakeLineInput {
  lineNo: number;
  receivedOn: string;
  tid: string | null;
  payerName: string;
  amountPence: number;
  paymentType: string;
  depositTo: string;
  description: string;
  warnings: string[];
}

type FailCode = 'unreadable' | 'bad_header' | 'empty_file' | 'too_many_rows' | 'bad_rows';

export type IntakeParseResult =
  | { ok: true; lines: IntakeLineInput[] }
  | { ok: false; code: FailCode; message: string; rowErrors: IntakeRowError[]; errorCount: number };

export function londonToday(now = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/London' }).format(now);
}

export function parseUkDate(raw: string, today: string): { ok: true; iso: string } | { ok: false; reason: string } {
  const m = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(raw);
  if (!m) return { ok: false, reason: 'must be dd/mm/yyyy' };
  const d = Number(m[1]);
  const mo = Number(m[2]);
  const y = Number(m[3]);
  const t = new Date(Date.UTC(y, mo - 1, d));
  if (t.getUTCFullYear() !== y || t.getUTCMonth() !== mo - 1 || t.getUTCDate() !== d) {
    return { ok: false, reason: 'not a real date' };
  }
  if (y < 2000) return { ok: false, reason: 'before 2000' };
  const iso = `${m[3]}-${m[2]}-${m[1]}`;
  if (iso > today) return { ok: false, reason: 'in the future' };
  return { ok: true, iso };
}

export function parseAmountPence(raw: string): { ok: true; pence: number } | { ok: false; reason: string } {
  if (raw.startsWith('-') || raw.startsWith('(') || raw.endsWith(')')) {
    return { ok: false, reason: 'outgoing payments are not accepted (incoming only)' };
  }
  const s = raw.startsWith('£') ? raw.slice(1) : raw;
  if (!/^(\d{1,3}(,\d{3})+|\d+)(\.\d{1,2})?$/.test(s)) return { ok: false, reason: 'must look like 0.00' };
  const [whole = '0', frac = ''] = s.replace(/,/g, '').split('.');
  const pence = Number(whole) * 100 + Number(frac.padEnd(2, '0'));
  if (pence === 0) return { ok: false, reason: 'must be greater than 0.00 (incoming only)' };
  if (pence > MAX_PENCE) return { ok: false, reason: 'over 1,000,000.00' };
  return { ok: true, pence };
}

function fail(code: FailCode, message: string, rowErrors: IntakeRowError[], errorCount = rowErrors.length): IntakeParseResult {
  return { ok: false, code, message, rowErrors, errorCount };
}

export function parseIntakeCsv(content: Buffer | string, today: string): IntakeParseResult {
  let records: { record: string[]; info: { lines: number } }[];
  try {
    records = parse(content, {
      bom: true,
      relax_column_count: true,
      relax_quotes: true,
      skip_empty_lines: true,
      info: true,
    }) as unknown as { record: string[]; info: { lines: number } }[];
  } catch (err) {
    const e = err as { lines?: number; message?: string };
    return fail('unreadable', 'The file could not be read as CSV', [
      { line: e.lines ?? 0, field: 'file', reason: e.message ?? 'unreadable' },
    ]);
  }

  const header = records[0]?.record.map((c) => c.trim()) ?? [];
  if (header.length !== INTAKE_HEADERS.length || !INTAKE_HEADERS.every((h, i) => header[i] === h)) {
    return fail('bad_header', `Header must be: ${INTAKE_HEADERS.join(',')}`, [
      { line: 1, field: 'header', reason: `expected "${INTAKE_HEADERS.join(',')}"` },
    ]);
  }

  const data = records.slice(1).filter((r) => r.record.some((c) => c.trim() !== ''));
  if (data.length === 0) return fail('empty_file', 'The file has no payment rows', []);
  if (data.length > MAX_ROWS) return fail('too_many_rows', `The file has more than ${MAX_ROWS} rows`, []);

  const errors: IntakeRowError[] = [];
  let errorCount = 0;
  const lines: IntakeLineInput[] = [];

  for (const { record, info } of data) {
    const line = info.lines;
    const rowErrs: IntakeRowError[] = [];
    const err = (field: string, reason: string) => rowErrs.push({ line, field, reason });

    if (record.length !== 7) {
      err('row', `expected 7 columns, got ${record.length}`);
    } else {
      const [date, tid, payer, amount, type, depositTo, description] = record.map((c) => c.trim()) as [
        string, string, string, string, string, string, string,
      ];
      const d = parseUkDate(date, today);
      if (!d.ok) err('Date', d.reason);
      const tidDigits = tid.replace(/^[Tt]/, '');
      if (tid !== '' && !/^\d{4}$/.test(tidDigits)) err('TID', 'must be 4 digits (optionally prefixed with T) or blank');
      if (payer === '') err('Payer Name', 'required');
      else if (payer.length > 200) err('Payer Name', 'too long (max 200)');
      const a = parseAmountPence(amount);
      if (!a.ok) err('Amount', a.reason);
      if (type === '') err('Type', 'required');
      else if (type.length > 50) err('Type', 'too long (max 50)');
      if (depositTo === '') err('Will deposit to', 'required');
      else if (depositTo.length > 200) err('Will deposit to', 'too long (max 200)');
      if (description.length > 500) err('Description', 'too long (max 500)');

      if (rowErrs.length === 0 && d.ok && a.ok) {
        lines.push({
          lineNo: line,
          receivedOn: d.iso,
          tid: tid === '' ? null : tidDigits,
          payerName: payer,
          amountPence: a.pence,
          paymentType: type,
          depositTo,
          description,
          warnings: type !== 'Cash' ? ['unverified_type'] : [],
        });
      }
    }
    errorCount += rowErrs.length;
    for (const e of rowErrs) if (errors.length < MAX_ROW_ERRORS) errors.push(e);
  }

  if (errorCount > 0) return fail('bad_rows', `${errorCount} row error(s); nothing was imported`, errors, errorCount);
  return { ok: true, lines };
}
