/**
 * Columns of a council / DWP remittance CSV. Headers are matched by normaliseHeader(label | alias), so
 * case, spacing and punctuation do not matter. There is deliberately no National Insurance column:
 * a remittance is matched by TID or claim reference only.
 */
import { normaliseHeader } from '../ingest/profiles.js';

export interface RemittanceField {
  field: 'tid' | 'claim_ref' | 'tenant_name' | 'period_from' | 'period_to' | 'amount';
  label: string;
  aliases: string[];
  required: boolean;
}

export const REMITTANCE_FIELDS: RemittanceField[] = [
  { field: 'tid', label: 'TID', aliases: ['Tenancy Ref', 'Tenancy ID'], required: false },
  { field: 'claim_ref', label: 'Claim Ref', aliases: ['Claim Reference', 'Claim No', 'HB Ref'], required: false },
  { field: 'tenant_name', label: 'Tenant Name', aliases: ['Name', 'Claimant'], required: false },
  { field: 'period_from', label: 'Period From', aliases: ['From', 'Start Date'], required: false },
  { field: 'period_to', label: 'Period To', aliases: ['To', 'End Date'], required: false },
  { field: 'amount', label: 'Amount', aliases: ['Amount Paid', 'Payment', 'Paid'], required: true },
];

export interface ResolvedRemittanceHeaders {
  columns: Partial<Record<RemittanceField['field'], number>>;
  /** Labels of what the file lacks: Amount, or both TID and Claim Ref. */
  missing: string[];
}

export function resolveRemittanceHeaders(headers: string[]): ResolvedRemittanceHeaders {
  const index = new Map<string, number>();
  headers.forEach((h, i) => {
    const key = normaliseHeader(h);
    if (key !== '' && !index.has(key)) index.set(key, i);
  });
  const columns: ResolvedRemittanceHeaders['columns'] = {};
  for (const spec of REMITTANCE_FIELDS) {
    for (const name of [spec.label, ...spec.aliases]) {
      const i = index.get(normaliseHeader(name));
      if (i !== undefined) {
        columns[spec.field] = i;
        break;
      }
    }
  }
  const missing: string[] = [];
  if (columns.amount === undefined) missing.push('Amount');
  if (columns.tid === undefined && columns.claim_ref === undefined) missing.push('TID or Claim Ref');
  return { columns, missing };
}
