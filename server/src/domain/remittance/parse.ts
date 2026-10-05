/**
 * Remittance CSV -> validated rows. Pure: no database. A problem with one row becomes a row error
 * (field label + reason); a problem with the file as a whole throws bad_request.
 */
import { parse } from 'csv-parse/sync';
import { AppError } from '../../lib/errors.js';
import { parseDate, parseMoney } from '../ingest/parse.js';
import { resolveRemittanceHeaders, REMITTANCE_FIELDS } from './layout.js';

export const MAX_REMITTANCE_ROWS = 2000;

export interface RemittanceRowError {
  field: string;
  reason: string;
}

export interface RemittanceRowData {
  tid: string | null;
  claimRef: string | null;
  tenantName: string | null;
  periodFrom: string | null;
  periodTo: string | null;
  amountPence: number;
}

export interface ParsedRemittanceRow {
  /** Physical line in the file. */
  line: number;
  data: RemittanceRowData;
  errors: RemittanceRowError[];
}

const TID = /^T\d{3,6}$/;
const LABELS = new Map<string, string>(REMITTANCE_FIELDS.map((f) => [f.field, f.label]));

export function parseRemittanceCsv(buf: Buffer | string): ParsedRemittanceRow[] {
  let records: { record: string[]; info: { lines: number } }[];
  try {
    records = parse(buf, {
      bom: true,
      info: true,
      skip_empty_lines: true,
      relax_column_count: true,
      trim: true,
    }) as unknown as { record: string[]; info: { lines: number } }[];
  } catch (err) {
    throw new AppError('bad_request', `The file is not a readable CSV: ${(err as Error).message}`);
  }
  if (records.length === 0) throw new AppError('bad_request', 'The file has no header row');
  const { columns, missing } = resolveRemittanceHeaders(records[0]!.record);
  if (missing.length > 0) throw new AppError('bad_request', `Missing columns: ${missing.join(', ')}`);
  const dataRows = records.slice(1);
  if (dataRows.length === 0) throw new AppError('bad_request', 'The file has no data rows');
  if (dataRows.length > MAX_REMITTANCE_ROWS) throw new AppError('bad_request', `The file has more than ${MAX_REMITTANCE_ROWS} rows`);

  const rows: ParsedRemittanceRow[] = [];
  const seen = new Map<string, number>();

  for (const { record, info } of dataRows) {
    const errors: RemittanceRowError[] = [];
    const cell = (field: keyof typeof columns): string => {
      const i = columns[field];
      return i === undefined ? '' : (record[i] ?? '').trim();
    };
    const fail = (field: string, reason: string) => errors.push({ field: LABELS.get(field) ?? field, reason });
    const date = (field: 'period_from' | 'period_to'): string | null => {
      const raw = cell(field);
      if (raw === '') return null;
      try {
        return parseDate(raw, /^\d{4}-/.test(raw) ? 'YYYY-MM-DD' : 'DD/MM/YYYY');
      } catch (err) {
        fail(field, (err as Error).message);
        return null;
      }
    };

    const rawTid = cell('tid').toUpperCase();
    let tid: string | null = null;
    if (rawTid !== '') {
      if (TID.test(rawTid)) tid = rawTid;
      else fail('tid', 'is not a valid tenancy reference (T followed by 3-6 digits)');
    }
    const rawClaim = cell('claim_ref').toUpperCase();
    const claimRef = rawClaim === '' ? null : rawClaim;
    if (rawTid === '' && claimRef === null) fail('tid', 'row needs a TID or a Claim Ref');

    let amountPence = 0;
    const rawAmount = cell('amount');
    if (rawAmount === '') fail('amount', 'is required');
    else {
      try {
        amountPence = parseMoney(rawAmount, 'Amount');
        if (amountPence <= 0) {
          fail('amount', 'must be more than zero');
          amountPence = 0;
        }
      } catch (err) {
        fail('amount', (err as Error).message);
      }
    }
    const periodFrom = date('period_from');
    const periodTo = date('period_to');
    if (periodFrom && periodTo && periodTo < periodFrom) fail('period_to', 'is before Period From');
    const name = cell('tenant_name');

    const data: RemittanceRowData = {
      tid,
      claimRef,
      tenantName: name === '' ? null : name.slice(0, 200),
      periodFrom,
      periodTo,
      amountPence,
    };
    if (errors.length === 0) {
      const key = JSON.stringify(data);
      const first = seen.get(key);
      if (first !== undefined) fail('amount', `Same as row ${first}`);
      else seen.set(key, info.lines);
    }
    rows.push({ line: info.lines, data, errors });
  }
  return rows;
}
