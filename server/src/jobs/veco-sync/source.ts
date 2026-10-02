/**
 * What we read from Veco (via the omnia_analytics warehouse, refreshed nightly ~03:30).
 *
 * One row per active tenancy. Every active tenancy is a room: `portfolio_ref` (P1107-3) is the
 * room and `base_portfolio_ref` (P1107) the building, so buildings become `properties` and rooms
 * `property_units`.
 *
 * There is no RG/MG/IRG field anywhere in the warehouse. Management type is derived from
 * vw_PropertyUltimateOwner.ohg_owned: OHG-owned -> IRG, otherwise RG. MG is never produced, and a
 * room with no owner record defaults to RG; the sync counts both so nobody mistakes this for data.
 */
import { z } from 'zod';
import type { SqlSource } from './mcp-client.js';

export const ACTIVE_TENANCIES_SQL = `
SELECT v.TenancyPK              AS tenancyPk,
       v.TenancyRef             AS tid,
       v.OccupiedDate           AS startDate,
       v.RentalAmount           AS rent,
       v.RentalFrequency        AS frequency,
       d.tenant_contact_pk      AS contactPk,
       d.tenant_name            AS tenantName,
       s.NINumber               AS ni,
       p.portfolio_ref          AS unitRef,
       p.base_portfolio_ref     AS propertyRef,
       p.address_line           AS address,
       p.postcode               AS postcode,
       p.branch_code            AS branchCode,
       CAST(o.ohg_owned AS int) AS ohgOwned,
       x.name_suffix            AS xeroSuffix
  FROM vw_ActiveTenancies v
  LEFT JOIN dim_Tenancy d              ON d.tenancy_pk = v.TenancyPK
  LEFT JOIN snap_TenantSearchIndex s   ON s.TenancyPK = v.TenancyPK
  LEFT JOIN dim_Property p             ON p.property_pk = v.PropertyFK
  LEFT JOIN vw_PropertyUltimateOwner o ON o.PropertyPK = v.PropertyFK
  -- The Xero "Properties" tracking option ends in *IRG, *MN (managed) or a branch code (RG): the
  -- accounts team's own classification. One option per building; prefer one that has a suffix.
  OUTER APPLY (SELECT TOP 1 m.name_suffix
                 FROM dim_PropertyXeroMap m
                WHERE m.portfolio_ref = p.base_portfolio_ref AND m.match_status = 'matched_active'
                ORDER BY CASE WHEN m.name_suffix IS NULL THEN 1 ELSE 0 END, m.xero_option_name) x
 ORDER BY v.TenancyRef`;

const FREQUENCIES = {
  weekly: 'weekly',
  fortnightly: 'fortnightly',
  'four weekly': 'four_weekly',
  '4 weekly': 'four_weekly',
  monthly: 'monthly',
  'calendar monthly': 'monthly',
  quarterly: 'quarterly',
} as const;

export type RentFrequency = (typeof FREQUENCIES)[keyof typeof FREQUENCIES];
export type ManagementType = 'RG' | 'MG' | 'IRG';

const text = z.string().trim().min(1);
const optionalText = z
  .string()
  .nullish()
  .transform((v) => (v == null || v.trim() === '' || v.trim() === 'None' ? null : v.trim()));

/** A raw warehouse row, before validation. Exported for tests and the e2e seed. */
export type VecoTenancyRow = {
  tenancyPk: string;
  tid: string;
  startDate: string;
  rent: number;
  frequency: string;
  contactPk: string | null;
  tenantName: string | null;
  ni: string | null;
  unitRef: string;
  propertyRef: string;
  address: string | null;
  postcode: string;
  branchCode: string;
  ohgOwned: number | null;
  /** Suffix of the building's Xero tracking option: IRG, MN or a branch code. */
  xeroSuffix?: string | null;
};

const RowSchema = z.object({
  tenancyPk: text,
  tid: z
    .string()
    .trim()
    .transform((v) => v.toUpperCase())
    .pipe(z.string().regex(/^T\d{3,6}$/, 'TID must look like T1234')),
  startDate: z
    .string()
    .trim()
    .transform((v) => v.slice(0, 10))
    .pipe(z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'start date missing or not a date')),
  rent: z.coerce.number().finite().nonnegative('rent must not be negative'),
  frequency: z
    .string()
    .trim()
    .transform((v) => v.toLowerCase())
    .pipe(z.enum(Object.keys(FREQUENCIES) as [keyof typeof FREQUENCIES, ...(keyof typeof FREQUENCIES)[]]))
    .transform((v) => FREQUENCIES[v]),
  contactPk: optionalText,
  tenantName: optionalText,
  ni: optionalText,
  unitRef: text,
  propertyRef: text,
  address: optionalText,
  postcode: text,
  branchCode: z.string().trim().min(1).transform((v) => v.toUpperCase()),
  ohgOwned: z.coerce.number().int().nullish(),
  xeroSuffix: optionalText.optional(),
});

export interface VecoTenancy {
  tenancyPk: string;
  tid: string;
  startDate: string;
  /** Pounds, rounded to pence. */
  rent: number;
  frequency: RentFrequency;
  contactPk: string | null;
  tenantName: string | null;
  ni: string | null;
  unitRef: string;
  propertyRef: string;
  address: string | null;
  postcode: string;
  branchCode: string;
  managementType: ManagementType;
  /** True when the building has no Xero suffix and the Veco owner flag was used instead. */
  managementTypeDefaulted: boolean;
}

export interface RejectedRow {
  tid: string | null;
  reason: string;
}

/**
 * Half-up to pence on the decimal digits, as Postgres numeric does. Shifting via the exponent
 * string avoids binary float error (10.075 * 100 = 1007.4999...).
 */
export function roundPence(value: number): number {
  return Number(`${Math.round(Number(`${value}e2`))}e-2`);
}

/** Validates warehouse rows. Bad rows are reported, never silently dropped or guessed. */
export interface ParsedFeed {
  valid: VecoTenancy[];
  rejected: RejectedRow[];
  /**
   * Every TID Veco says is active, including rows we rejected. A rejected row is still a live
   * tenancy in Veco, so it must never be ended just because we couldn't read the rest of it.
   */
  presentTids: string[];
}

export function parseVecoRows(rows: unknown[]): ParsedFeed {
  const valid: VecoTenancy[] = [];
  const rejected: RejectedRow[] = [];
  const seenTids = new Set<string>();
  const present = new Set<string>();
  for (const raw of rows) {
    const parsed = RowSchema.safeParse(raw);
    const rawTid = typeof (raw as { tid?: unknown })?.tid === 'string' ? (raw as { tid: string }).tid : null;
    const normalisedTid = rawTid?.trim().toUpperCase() ?? '';
    if (/^T\d{3,6}$/.test(normalisedTid)) present.add(normalisedTid);
    if (!parsed.success) {
      const issue = parsed.error.issues[0];
      rejected.push({ tid: rawTid, reason: `${issue?.path.join('.') ?? 'row'}: ${issue?.message ?? 'invalid'}` });
      continue;
    }
    const r = parsed.data;
    if (seenTids.has(r.tid)) {
      rejected.push({ tid: r.tid, reason: 'duplicate TID in the Veco feed' });
      continue;
    }
    seenTids.add(r.tid);
    const { ohgOwned, xeroSuffix, ...rest } = r;
    valid.push({
      ...rest,
      rent: roundPence(r.rent),
      managementType: managementTypeOf(xeroSuffix ?? null, ohgOwned ?? null),
      managementTypeDefaulted: !xeroSuffix,
    });
  }
  return { valid, rejected, presentTids: [...present] };
}

/**
 * RG / MG / IRG as the accounts team record it: the Xero property suffix (*IRG, *MN = managed, a branch
 * code = rent guaranteed). Without one, fall back to Veco's owner flag (OHG-owned = IRG, else RG).
 */
export function managementTypeOf(xeroSuffix: string | null, ohgOwned: number | null): ManagementType {
  const suffix = xeroSuffix?.trim().toUpperCase();
  if (suffix === 'IRG') return 'IRG';
  if (suffix === 'MN') return 'MG';
  if (suffix) return 'RG';
  return ohgOwned === 1 ? 'IRG' : 'RG';
}

export async function fetchActiveTenancies(source: SqlSource): Promise<unknown[]> {
  return source.queryRows(ACTIVE_TENANCIES_SQL);
}
