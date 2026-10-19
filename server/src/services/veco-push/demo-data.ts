/** Constants for the three demo receipts and the fake VECO that knows their TIDs. Pure data, no side effects. */
import type { TenantLookupRow } from './classify.js';
import type { FakeSeed } from './fake-veco-sql.js';

export const DEMO_MARKER = 'omnia-demo:veco-push';
export const DEMO_TIDS = ['T5755', 'T6008', 'T2822'] as const;
export const DEMO_AMOUNT = '1.00';
export const DEMO_DATE = '2026-10-14';
export const DEMO_STAFF_PK = '0D0D0D0D-0000-4000-8000-000000000001';

function lookup(tid: string): TenantLookupRow {
  const n = tid.replace(/\D/g, '').padStart(12, '0');
  return {
    tid,
    tenancyFk: `D0000000-0000-4000-8000-${n}`,
    contactFk: `D1000000-0000-4000-8000-${n}`,
    propertyFk: `D2000000-0000-4000-8000-${n}`,
    ownerFk: `D3000000-0000-4000-8000-${n}`,
    officeFk: `D4000000-0000-4000-8000-${n}`,
    officeName: 'MY',
    ownerCount: 1,
    officeCount: 1,
    delayPayment: false,
    addressTitle: `Demo Tenant ${tid}`,
    lastDescription: `Rent Received  From Demo Tenant ${tid}  `,
    lastDepartment: 'Tenancy',
  };
}

export const DEMO_FAKE_SEED: FakeSeed = {
  staff: [{ staffPk: DEMO_STAFF_PK, email: 'demo-staff@example.test' }],
  lookups: DEMO_TIDS.map(lookup),
};
