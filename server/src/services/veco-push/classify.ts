/**
 * Decides, per pending receipt, whether it can go to VECO or is held back (never guessed).
 * Checks run in a fixed order and the first hit wins.
 */
import type { Department } from './settings.js';

/** One pending Omnia Recon receipt. `amount` and `paymentDate` are exact strings (2 dp, YYYY-MM-DD). */
export interface Candidate {
  receiptId: string;
  tid: string;
  amount: string;
  paymentDate: string;
  /** bank_accounts.code, or MANUAL when the receipt has no bank line. */
  sourceBank: string;
  tenantName: string | null;
  property: string | null;
  landlord: string | null;
}

/** What VECO says about one TID (one row per Tenant row with that standing order reference). */
export interface TenantLookupRow {
  tid: string;
  tenancyFk: string | null;
  contactFk: string | null;
  propertyFk: string | null;
  officeName: string | null;
  ownerCount: number;
  ownerFk: string | null;
  officeCount: number;
  officeFk: string | null;
  delayPayment: boolean;
  addressTitle: string | null;
  lastDescription: string | null;
  lastDepartment: string | null;
}

export type HeldCode =
  | 'already_sent'
  | 'amount_not_positive'
  | 'bank_account_mismatch'
  | 'tid_invalid'
  | 'tid_not_found'
  | 'tid_duplicate'
  | 'tenancy_missing'
  | 'owner_none'
  | 'owner_multiple'
  | 'office_none'
  | 'office_multiple'
  | 'contact_name_missing'
  | 'department_not_chosen';

export const HELD_MESSAGES: Record<HeldCode, string> = {
  already_sent: 'Already sent to VECO or exported, or not a confirmed receipt',
  amount_not_positive: 'Amount is not above zero',
  bank_account_mismatch: 'The Vico bank details are not the VECO bank account (20-79-06 / 43789276)',
  tid_invalid: 'TID has characters VECO import does not accept',
  tid_not_found: 'TID not found in VECO',
  tid_duplicate: 'TID is on more than one VECO tenant',
  tenancy_missing: 'VECO tenant has no tenancy or property',
  owner_none: 'Property has no current owner in VECO',
  owner_multiple: 'Property has more than one current owner in VECO',
  office_none: 'Tenancy office name matches no VECO office',
  office_multiple: 'Tenancy office name matches more than one VECO office',
  contact_name_missing: 'No earlier receipt description and the VECO contact has no name',
  department_not_chosen: 'First receipt for this tenancy: choose Owner or Tenancy',
};

export interface Held {
  receiptId: string;
  tid: string;
  amount: string;
  paymentDate: string;
  sourceBank: string;
  code: HeldCode;
  message: string;
  /** True when only a department pick is missing. */
  needsDepartment: boolean;
}

export interface ReadyInput {
  candidate: Candidate;
  lookup: TenantLookupRow;
  /** Copied from VECO's latest receipt for the tenancy, else the user's pick. */
  department: string;
  departmentFromVeco: boolean;
}

export interface ClassifyOptions {
  bankOk: boolean;
  sentIds: Set<string>;
  departments: Record<string, Department>;
}

const TID_OK = /^[A-Za-z0-9]{1,20}$/;
const key = (tid: string) => tid.trim().toUpperCase();

export function classify(
  cands: Candidate[],
  lookups: TenantLookupRow[],
  o: ClassifyOptions,
): { ready: ReadyInput[]; held: Held[] } {
  const byTid = new Map<string, TenantLookupRow[]>();
  for (const l of lookups) byTid.set(key(l.tid), [...(byTid.get(key(l.tid)) ?? []), l]);

  const ready: ReadyInput[] = [];
  const held: Held[] = [];
  for (const c of cands) {
    const hold = (code: HeldCode) =>
      held.push({
        receiptId: c.receiptId,
        tid: c.tid,
        amount: c.amount,
        paymentDate: c.paymentDate,
        sourceBank: c.sourceBank,
        code,
        message: HELD_MESSAGES[code],
        needsDepartment: code === 'department_not_chosen',
      });

    if (o.sentIds.has(c.receiptId)) { hold('already_sent'); continue; }
    if (!(Number(c.amount) > 0)) { hold('amount_not_positive'); continue; }
    if (!o.bankOk) { hold('bank_account_mismatch'); continue; }
    if (!TID_OK.test(c.tid)) { hold('tid_invalid'); continue; }
    const rows = byTid.get(key(c.tid)) ?? [];
    if (rows.length === 0) { hold('tid_not_found'); continue; }
    if (rows.length > 1) { hold('tid_duplicate'); continue; }
    const l = rows[0]!;
    if (!l.propertyFk || !l.tenancyFk || !l.contactFk) { hold('tenancy_missing'); continue; }
    if (l.ownerCount === 0 || !l.ownerFk) { hold('owner_none'); continue; }
    if (l.ownerCount > 1) { hold('owner_multiple'); continue; }
    if (l.officeCount === 0 || !l.officeFk) { hold('office_none'); continue; }
    if (l.officeCount > 1) { hold('office_multiple'); continue; }
    if (l.lastDescription === null && (l.addressTitle ?? '').trim() === '') { hold('contact_name_missing'); continue; }
    let department = l.lastDepartment;
    const fromVeco = department !== null && department !== '';
    if (!fromVeco) {
      department = o.departments[c.receiptId] ?? null;
      if (!department) { hold('department_not_chosen'); continue; }
    }
    ready.push({ candidate: c, lookup: l, department: department!, departmentFromVeco: fromVeco });
  }
  return { ready, held };
}
