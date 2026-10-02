/**
 * Synthetic Veco warehouse rows. Every value is invented: TIDs T9xxx, refs P9xxx, example NI
 * numbers that pass the format check but belong to nobody, @example-style names.
 */
import type { VecoTenancyRow } from '../../src/jobs/veco-sync/source.js';

export function vecoRow(n: number, overrides: Partial<VecoTenancyRow> = {}): VecoTenancyRow {
  const building = 9000 + Math.floor(n / 10);
  return {
    tenancyPk: `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`,
    tid: `T9${String(n).padStart(3, '0')}`,
    startDate: '2025-04-01T00:00:00',
    rent: 650,
    frequency: 'Monthly',
    contactPk: `11111111-0000-4000-8000-${String(n).padStart(12, '0')}`,
    tenantName: `Test Tenant${n}`,
    ni: `AB${String(100000 + n).padStart(6, '0')}C`,
    unitRef: `P${building}-${(n % 10) + 1}`,
    propertyRef: `P${building}`,
    address: `${n} Example Street`,
    postcode: 'ZZ1 1ZZ',
    branchCode: n % 2 === 0 ? 'TSA' : 'TSB',
    ohgOwned: n % 3 === 0 ? 1 : 0,
    xeroSuffix: n % 3 === 0 ? 'IRG' : n % 2 === 0 ? 'TSA' : 'TSB',
    ...overrides,
  };
}

export function vecoRows(count: number, start = 1): VecoTenancyRow[] {
  return Array.from({ length: count }, (_, i) => vecoRow(start + i));
}
