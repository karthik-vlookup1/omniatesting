/**
 * Expected columns of each LetMC CSV. Headers are matched by normaliseHeader(label | alias), so case,
 * spacing and punctuation do not matter. When the real LetMC export names a column differently, add
 * the name to `aliases` here.
 */
import { normaliseHeader } from '../../domain/ingest/profiles.js';

export const ENTITY_TYPES = ['landlords', 'properties', 'tenants', 'tenancies'] as const;
export type EntityType = (typeof ENTITY_TYPES)[number];

export interface FieldSpec {
  field: string;
  label: string;
  aliases: string[];
  /** 'always' = every row; 'create' = needed when the record does not exist yet. */
  required: 'always' | 'create' | false;
}

export const LAYOUTS: Record<EntityType, FieldSpec[]> = {
  landlords: [
    { field: 'landlord_ref', label: 'Landlord Ref', aliases: ['LandlordID', 'Landlord Code'], required: 'always' },
    { field: 'name', label: 'Landlord Name', aliases: ['Name'], required: 'always' },
    { field: 'email', label: 'Email', aliases: [], required: false },
    { field: 'phone', label: 'Phone', aliases: ['Telephone', 'Mobile'], required: false },
  ],
  properties: [
    { field: 'property_ref', label: 'Property Ref', aliases: ['Property ID', 'PropertyID'], required: 'always' },
    { field: 'branch', label: 'Branch', aliases: ['Branch Code', 'Office'], required: 'create' },
    { field: 'landlord_ref', label: 'Landlord Ref', aliases: [], required: false },
    { field: 'address_line1', label: 'Address 1', aliases: ['Address Line 1'], required: 'create' },
    { field: 'address_line2', label: 'Address 2', aliases: [], required: false },
    { field: 'town', label: 'Town', aliases: ['City'], required: false },
    { field: 'postcode', label: 'Postcode', aliases: ['Post Code'], required: 'create' },
    { field: 'bedrooms', label: 'Bedrooms', aliases: [], required: false },
    { field: 'management_type', label: 'Management Type', aliases: ['Mgmt Type'], required: false },
  ],
  tenants: [
    { field: 'tenant_ref', label: 'Tenant Ref', aliases: ['Tenant ID', 'TenantID'], required: 'always' },
    { field: 'title', label: 'Title', aliases: [], required: false },
    { field: 'first_name', label: 'First Name', aliases: ['Forename'], required: 'always' },
    { field: 'last_name', label: 'Surname', aliases: ['Last Name'], required: 'always' },
    { field: 'email', label: 'Email', aliases: [], required: false },
    { field: 'phone', label: 'Mobile', aliases: ['Phone', 'Telephone'], required: false },
    { field: 'ni', label: 'NI Number', aliases: ['National Insurance', 'NINO'], required: false },
  ],
  tenancies: [
    { field: 'tid', label: 'Tenancy Ref', aliases: ['TID', 'Tenancy ID'], required: 'always' },
    { field: 'property_ref', label: 'Property Ref', aliases: [], required: 'create' },
    { field: 'unit_ref', label: 'Unit Ref', aliases: ['Room'], required: false },
    { field: 'tenant_ref', label: 'Tenant Ref', aliases: [], required: 'create' },
    { field: 'management_type', label: 'Management Type', aliases: [], required: false },
    { field: 'start_date', label: 'Start Date', aliases: [], required: 'create' },
    { field: 'end_date', label: 'End Date', aliases: [], required: false },
    { field: 'balance', label: 'Balance', aliases: ['Arrears', 'Opening Balance'], required: false },
    { field: 'balance_payer', label: 'Balance Payer', aliases: [], required: false },
  ],
};

export interface ResolvedHeaders {
  /** field -> column index */
  columns: Record<string, number>;
  /** Labels of required-'always' fields not found. */
  missing: string[];
  /** Headers in the file that match no field. */
  unknown: string[];
}

export function resolveHeaders(headers: string[], type: EntityType): ResolvedHeaders {
  const index = new Map<string, number>();
  headers.forEach((h, i) => {
    const key = normaliseHeader(h);
    if (key !== '' && !index.has(key)) index.set(key, i);
  });
  const columns: Record<string, number> = {};
  const used = new Set<number>();
  const missing: string[] = [];
  for (const spec of LAYOUTS[type]) {
    let found: number | undefined;
    for (const name of [spec.label, ...spec.aliases]) {
      const i = index.get(normaliseHeader(name));
      if (i !== undefined) {
        found = i;
        break;
      }
    }
    if (found === undefined) {
      if (spec.required === 'always') missing.push(spec.label);
    } else {
      columns[spec.field] = found;
      used.add(found);
    }
  }
  const unknown = headers.filter((h, i) => h.trim() !== '' && !used.has(i));
  return { columns, missing, unknown };
}
