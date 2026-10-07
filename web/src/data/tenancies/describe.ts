import { formatDate } from '../../lib/format';
import type { TenancySummary } from './types';

/**
 * LetMC-style one-line descriptions of a tenancy, shared by the global search dropdown, the
 * open-record tabs and the tenant record header (plans/recon-601.md). Display only.
 */

const STATUS_WORD: Record<TenancySummary['status'], string> = {
  pending: 'Pending',
  active: 'Active',
  ended: 'Ended',
};

const MANAGEMENT_WORD: Record<TenancySummary['managementType'], string> = {
  RG: 'Rent guarantee (RG)',
  MG: 'Managed (MG)',
  IRG: 'Investor rent guarantee (IRG)',
};

/** "6568 Jason Morgan" — the record title (LetMC shows TID then name). */
export function tenancyTitle(t: Pick<TenancySummary, 'tid' | 'tenantName'>): string {
  return t.tenantName ? `${t.tid} ${t.tenantName}` : `${t.tid} (no tenant name)`;
}

/** "Room 1, Flat 2, Ransford House, London, SE21 8QG" */
export function tenancyAddress(t: Pick<TenancySummary, 'unitRef' | 'address' | 'postcode'>): string {
  const parts = [t.unitRef, t.address].filter((p): p is string => Boolean(p && p.trim()));
  const text = parts.join(', ');
  if (!t.postcode || text.toUpperCase().includes(t.postcode.toUpperCase())) return text;
  return text ? `${text}, ${t.postcode}` : t.postcode;
}

/** "Active tenancy 30/01/2025 – no end date · Managed (MG) · Branch ISL" */
export function tenancyLine(
  t: Pick<TenancySummary, 'status' | 'startDate' | 'endDate' | 'managementType' | 'branchCode'>,
): string {
  const end = t.endDate ? formatDate(t.endDate) : 'no end date';
  return `${STATUS_WORD[t.status]} tenancy ${formatDate(t.startDate)} – ${end} · ${MANAGEMENT_WORD[t.managementType]} · Branch ${t.branchCode}`;
}

export function managementLabel(type: TenancySummary['managementType']): string {
  return MANAGEMENT_WORD[type];
}
