/**
 * LetMC CSV -> validated rows. Pure: no database. Every problem with a single row becomes a row error
 * (field label + reason, never the value of an NI number or e-mail address); problems with the file
 * as a whole throw bad_request.
 */
import { parse } from 'csv-parse/sync';
import { parseDate, parseMoney } from '../../domain/ingest/parse.js';
import { AppError } from '../../lib/errors.js';
import { isValidNi, normaliseIdentifier } from '../../lib/crypto.js';
import { LAYOUTS, resolveHeaders, type EntityType } from './layout.js';

export const MAX_ROWS = 5000;

export type PayerKey = 'tenant' | 'council_hb' | 'dwp_uc' | 'other_third_party';
export type MgmtType = 'RG' | 'MG' | 'IRG';

export interface RowError {
  field: string;
  reason: string;
}

export interface LandlordData {
  landlord_ref: string;
  name: string;
  email: string | null;
  phone: string | null;
}
export interface PropertyData {
  property_ref: string;
  branch: string | null;
  landlord_ref: string | null;
  address_line1: string | null;
  address_line2: string | null;
  town: string | null;
  postcode: string | null;
  bedrooms: number | null;
  management_type: MgmtType | null;
}
export interface TenantData {
  tenant_ref: string;
  title: string | null;
  first_name: string;
  last_name: string;
  email: string | null;
  phone: string | null;
  /** Normalised, valid NI number; never echoed in reports. */
  ni: string | null;
}
export interface TenancyData {
  tid: string;
  property_ref: string | null;
  unit_ref: string | null;
  tenant_ref: string | null;
  management_type: MgmtType | null;
  start_date: string | null;
  end_date: string | null;
  balance_pence: number;
  balance_payer: PayerKey;
}

export interface DataFor {
  landlords: LandlordData;
  properties: PropertyData;
  tenants: TenantData;
  tenancies: TenancyData;
}

export interface ParsedRow<D> {
  /** Physical line in the file. */
  line: number;
  key: string;
  data: D;
  errors: RowError[];
  /** Line of an earlier row with the same key and identical values (this row is skipped). */
  duplicateOf: number | null;
}

const REF = /^[A-Z0-9/_-]{1,30}$/;
const TID = /^T\d{3,6}$/;
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PHONE = /^[0-9 +()-]{6,30}$/;
const POSTCODE = /^[A-Z]{1,2}\d[A-Z\d]? ?\d[A-Z]{2}$/i;
const PAYERS: Record<string, PayerKey> = {
  '': 'tenant',
  tenant: 'tenant',
  hb: 'council_hb',
  council_hb: 'council_hb',
  uc: 'dwp_uc',
  dwp_uc: 'dwp_uc',
  other: 'other_third_party',
  other_third_party: 'other_third_party',
};

/** Key column per type, for "Same <key label> as row N" messages. */
const KEY_FIELD: Record<EntityType, string> = {
  landlords: 'landlord_ref',
  properties: 'property_ref',
  tenants: 'tenant_ref',
  tenancies: 'tid',
};

export function parseLetmcCsv<T extends EntityType>(buf: Buffer | string, type: T): ParsedRow<DataFor[T]>[] {
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
  const headers = records[0]!.record;
  const { columns, missing } = resolveHeaders(headers, type);
  if (missing.length > 0) throw new AppError('bad_request', `Missing columns: ${missing.join(', ')}`);
  const dataRows = records.slice(1);
  if (dataRows.length === 0) throw new AppError('bad_request', 'The file has no data rows');
  if (dataRows.length > MAX_ROWS) throw new AppError('bad_request', `The file has more than ${MAX_ROWS} rows`);

  const labels = new Map(LAYOUTS[type].map((s) => [s.field, s.label]));
  const keyLabel = labels.get(KEY_FIELD[type])!;
  const rows: ParsedRow<DataFor[T]>[] = [];
  const firstByKey = new Map<string, ParsedRow<DataFor[T]>>();
  const niOwner = new Map<string, string>();

  for (const { record, info } of dataRows) {
    const errors: RowError[] = [];
    const cell = (field: string): string => {
      const i = columns[field];
      return i === undefined ? '' : (record[i] ?? '').trim();
    };
    const fail = (field: string, reason: string) => errors.push({ field: labels.get(field) ?? field, reason });
    const v = makeValidators(cell, fail);

    let data: unknown;
    let key: string;
    switch (type) {
      case 'landlords': {
        const d: LandlordData = {
          landlord_ref: v.ref('landlord_ref', true) ?? '',
          name: v.text('name', 200, true) ?? '',
          email: v.email('email'),
          phone: v.phone('phone'),
        };
        data = d;
        key = d.landlord_ref;
        break;
      }
      case 'properties': {
        const d: PropertyData = {
          property_ref: v.ref('property_ref', true) ?? '',
          branch: v.ref('branch', false),
          landlord_ref: v.ref('landlord_ref', false),
          address_line1: v.text('address_line1', 200, false),
          address_line2: v.text('address_line2', 200, false),
          town: v.text('town', 200, false),
          postcode: v.postcode('postcode'),
          bedrooms: v.bedrooms('bedrooms'),
          management_type: v.mgmt('management_type'),
        };
        data = d;
        key = d.property_ref;
        break;
      }
      case 'tenants': {
        const d: TenantData = {
          tenant_ref: v.ref('tenant_ref', true) ?? '',
          title: v.text('title', 20, false),
          first_name: v.text('first_name', 200, true) ?? '',
          last_name: v.text('last_name', 200, true) ?? '',
          email: v.email('email'),
          phone: v.phone('phone'),
          ni: v.ni('ni'),
        };
        data = d;
        key = d.tenant_ref;
        break;
      }
      default: {
        const start = v.date('start_date');
        const end = v.date('end_date');
        if (start && end && end < start) fail('end_date', 'is before the start date');
        let balance = 0;
        const rawBalance = cell('balance');
        if (rawBalance !== '') {
          try {
            balance = parseMoney(rawBalance, 'balance');
          } catch (err) {
            fail('balance', (err as Error).message);
          }
        }
        const payer = PAYERS[cell('balance_payer').toLowerCase()];
        if (payer === undefined) fail('balance_payer', 'must be tenant, hb, uc or other');
        const rawTid = cell('tid').toUpperCase();
        if (rawTid === '') fail('tid', 'is required');
        else if (!TID.test(rawTid)) fail('tid', 'is not a valid tenancy reference (T followed by 3-6 digits)');
        const d: TenancyData = {
          tid: rawTid,
          property_ref: v.ref('property_ref', false),
          unit_ref: v.ref('unit_ref', false),
          tenant_ref: v.ref('tenant_ref', false),
          management_type: v.mgmt('management_type'),
          start_date: start,
          end_date: end,
          balance_pence: balance,
          balance_payer: payer ?? 'tenant',
        };
        data = d;
        key = d.tid;
        break;
      }
    }

    const row: ParsedRow<DataFor[T]> = { line: info.lines, key, data: data as DataFor[T], errors, duplicateOf: null };

    const first = key === '' ? undefined : firstByKey.get(key);
    if (first) {
      if (JSON.stringify(first.data) === JSON.stringify(row.data)) {
        row.duplicateOf = first.line;
        row.errors = [];
      } else {
        row.errors.push({ field: keyLabel, reason: `Same ${keyLabel} as row ${first.line} with different values` });
      }
    } else if (key !== '') {
      firstByKey.set(key, row);
    }

    if (type === 'tenants' && row.duplicateOf === null) {
      const ni = (row.data as TenantData).ni;
      if (ni) {
        const owner = niOwner.get(ni);
        if (owner !== undefined && owner !== key) {
          row.errors.push({ field: labels.get('ni')!, reason: `Same NI number as tenant ${owner} earlier in the file` });
        } else if (owner === undefined && row.errors.length === 0) {
          niOwner.set(ni, key);
        }
      }
    }
    rows.push(row);
  }
  return rows;
}

function makeValidators(cell: (f: string) => string, fail: (field: string, reason: string) => void) {
  return {
    ref(field: string, mandatory: boolean): string | null {
      const raw = cell(field).toUpperCase();
      if (raw === '') {
        if (mandatory) fail(field, 'is required');
        return null;
      }
      if (!REF.test(raw)) {
        fail(field, 'must be 1-30 letters, digits, / _ or -');
        return null;
      }
      return raw;
    },
    text(field: string, max: number, mandatory: boolean): string | null {
      const raw = cell(field);
      if (raw === '') {
        if (mandatory) fail(field, 'is required');
        return null;
      }
      if (raw.length > max) {
        fail(field, `is longer than ${max} characters`);
        return null;
      }
      return raw;
    },
    email(field: string): string | null {
      const raw = cell(field);
      if (raw === '') return null;
      if (raw.length > 200 || !EMAIL.test(raw)) {
        fail(field, 'is not a valid email address');
        return null;
      }
      return raw;
    },
    phone(field: string): string | null {
      const raw = cell(field);
      if (raw === '') return null;
      if (!PHONE.test(raw)) {
        fail(field, 'is not a valid phone number');
        return null;
      }
      return raw;
    },
    postcode(field: string): string | null {
      const raw = cell(field);
      if (raw === '') return null;
      if (!POSTCODE.test(raw)) {
        fail(field, 'is not a valid UK postcode');
        return null;
      }
      const compact = raw.toUpperCase().replace(/\s+/g, '');
      return `${compact.slice(0, -3)} ${compact.slice(-3)}`;
    },
    bedrooms(field: string): number | null {
      const raw = cell(field);
      if (raw === '') return null;
      const n = /^\d{1,2}$/.test(raw) ? Number(raw) : NaN;
      if (!(n >= 0 && n <= 50)) {
        fail(field, 'must be a whole number from 0 to 50');
        return null;
      }
      return n;
    },
    mgmt(field: string): MgmtType | null {
      const raw = cell(field).toUpperCase();
      if (raw === '') return null;
      if (raw !== 'RG' && raw !== 'MG' && raw !== 'IRG') {
        fail(field, 'must be RG, MG or IRG');
        return null;
      }
      return raw;
    },
    ni(field: string): string | null {
      const raw = cell(field);
      if (raw === '') return null;
      if (!isValidNi(raw)) {
        fail(field, 'is not a valid National Insurance number');
        return null;
      }
      return normaliseIdentifier(raw);
    },
    date(field: string): string | null {
      const raw = cell(field);
      if (raw === '') return null;
      try {
        return parseDate(raw, /^\d{4}-/.test(raw) ? 'YYYY-MM-DD' : 'DD/MM/YYYY');
      } catch (err) {
        fail(field, (err as Error).message);
        return null;
      }
    },
  };
}
