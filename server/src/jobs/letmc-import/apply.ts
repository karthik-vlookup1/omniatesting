/**
 * Applies parsed LetMC rows inside the caller's transaction. One function per record type.
 *
 * Rule for every type: an existing Recon value is never overwritten. On an existing record only empty
 * fields are filled (action 'update', `changes` names them); a differing non-empty value is kept and
 * reported as a warning. Rows are applied in file order; the caller rolls everything back if any row
 * is rejected (or on a dry run).
 */
import type { PoolClient } from '../../db/pool.js';
import { protectNi, type ProtectionKeys } from '../../lib/crypto.js';
import { LAYOUTS, type EntityType } from './layout.js';
import type { LandlordData, ParsedRow, PayerKey, PropertyData, RowError, TenancyData, TenantData } from './parse.js';

export type RowAction = 'create' | 'update' | 'unchanged' | 'duplicate' | 'reject';

export interface RowResult {
  line: number;
  key: string;
  action: RowAction;
  changes: string[];
  warnings: string[];
  errors: RowError[];
  /** Set when this row writes a new opening balance (signed pence; + arrears, - credit). */
  opening?: { pence: number };
}

export interface ApplyCtx {
  keys: ProtectionKeys;
  userId: string;
  runId: string;
  /** Tenancies only: YYYY-MM-DD. */
  cutover: string | null;
  /** Database current date, YYYY-MM-DD. */
  today: string;
}

const label = (type: EntityType, field: string): string => LAYOUTS[type].find((s) => s.field === field)?.label ?? field;

const pounds = (pence: number): string => `£${(Math.abs(pence) / 100).toFixed(2)}`;

function start<D>(row: ParsedRow<D>): RowResult {
  return { line: row.line, key: row.key, action: 'unchanged', changes: [], warnings: [], errors: [...row.errors] };
}

/** Rows that are already decided before touching the database: invalid, or an identical repeat. */
function settled<D>(row: ParsedRow<D>): RowResult | null {
  const r = start(row);
  if (row.errors.length > 0) return { ...r, action: 'reject' };
  if (row.duplicateOf !== null) return { ...r, action: 'duplicate', warnings: [`Same as row ${row.duplicateOf}`] };
  return null;
}

function reject(r: RowResult, type: EntityType, field: string, reason: string): RowResult {
  r.errors.push({ field: label(type, field), reason });
  r.action = 'reject';
  return r;
}

/** Sets only the listed columns (column names are fixed in this file, never from input). */
async function setColumns(client: PoolClient, table: string, id: string, cols: Record<string, unknown>): Promise<void> {
  const names = Object.keys(cols);
  if (names.length === 0) return;
  const sets = names.map((c, i) => `${c} = $${i + 2}`).join(', ');
  await client.query(`UPDATE ${table} SET ${sets} WHERE id = $1`, [id, ...names.map((c) => cols[c])]);
}

const norm = (s: string | null | undefined): string => (s ?? '').toUpperCase().replace(/\s+/g, ' ').trim();

// -----------------------------------------------------------------------------
// Landlords
// -----------------------------------------------------------------------------
export async function applyLandlords(
  client: PoolClient,
  rows: ParsedRow<LandlordData>[],
  _ctx: ApplyCtx,
): Promise<RowResult[]> {
  const refs = rows.map((r) => r.data.landlord_ref).filter(Boolean);
  const { rows: found } = await client.query<{ id: string; landlord_ref: string; name: string; email: string | null; phone: string | null }>(
    'SELECT id, landlord_ref, name, email, phone FROM landlords WHERE landlord_ref = ANY($1::text[])',
    [refs],
  );
  const existing = new Map(found.map((l) => [l.landlord_ref, l]));
  const out: RowResult[] = [];
  for (const row of rows) {
    const decided = settled(row);
    if (decided) {
      out.push(decided);
      continue;
    }
    const r = start(row);
    const d = row.data;
    const cur = existing.get(d.landlord_ref);
    if (!cur) {
      await client.query('INSERT INTO landlords (landlord_ref, name, email, phone) VALUES ($1, $2, $3, $4)', [
        d.landlord_ref,
        d.name,
        d.email,
        d.phone,
      ]);
      r.action = 'create';
      r.changes = ['name', ...(d.email ? ['email'] : []), ...(d.phone ? ['phone'] : [])];
      out.push(r);
      continue;
    }
    const fill: Record<string, unknown> = {};
    if (d.email) {
      if (!cur.email) {
        fill.email = d.email;
        r.changes.push('email');
      } else if (cur.email.toLowerCase() !== d.email.toLowerCase()) r.warnings.push('Email differs from Recon; Recon value kept');
    }
    if (d.phone) {
      if (!cur.phone) {
        fill.phone = d.phone;
        r.changes.push('phone');
      } else if (cur.phone !== d.phone) r.warnings.push('Phone differs from Recon; Recon value kept');
    }
    if (norm(cur.name) !== norm(d.name)) r.warnings.push('Landlord Name differs from Recon; Recon value kept');
    await setColumns(client, 'landlords', cur.id, fill);
    r.action = r.changes.length > 0 ? 'update' : 'unchanged';
    out.push(r);
  }
  return out;
}

// -----------------------------------------------------------------------------
// Properties
// -----------------------------------------------------------------------------
interface PropertyRow {
  id: string;
  property_ref: string;
  branch_id: string;
  landlord_id: string | null;
  address_line1: string;
  address_line2: string | null;
  town: string | null;
  postcode: string;
  bedrooms: number | null;
  default_management_type: string | null;
}

export async function applyProperties(
  client: PoolClient,
  rows: ParsedRow<PropertyData>[],
  _ctx: ApplyCtx,
): Promise<RowResult[]> {
  const { rows: branches } = await client.query<{ id: string; code: string }>('SELECT id, code FROM branches');
  const branchByCode = new Map(branches.map((b) => [b.code.toUpperCase(), b.id]));
  const { rows: landlords } = await client.query<{ id: string; landlord_ref: string }>(
    'SELECT id, landlord_ref FROM landlords WHERE landlord_ref IS NOT NULL',
  );
  const landlordByRef = new Map(landlords.map((l) => [l.landlord_ref.toUpperCase(), l.id]));
  const { rows: found } = await client.query<PropertyRow>(
    `SELECT id, property_ref, branch_id, landlord_id, address_line1, address_line2, town, postcode, bedrooms,
            default_management_type::text
       FROM properties WHERE property_ref = ANY($1::text[])`,
    [rows.map((r) => r.data.property_ref).filter(Boolean)],
  );
  const existing = new Map(found.map((p) => [p.property_ref, p]));

  const out: RowResult[] = [];
  for (const row of rows) {
    const decided = settled(row);
    if (decided) {
      out.push(decided);
      continue;
    }
    const r = start(row);
    const d = row.data;
    const T = 'properties';
    const branchId = d.branch ? branchByCode.get(d.branch) : undefined;
    const landlordId = d.landlord_ref ? landlordByRef.get(d.landlord_ref) : undefined;
    if (d.branch && !branchId) reject(r, T, 'branch', 'Branch not found in Recon (branches are not created by the import)');
    if (d.landlord_ref && !landlordId) reject(r, T, 'landlord_ref', 'Landlord not found in Recon; import Landlords first');
    const cur = existing.get(d.property_ref);
    if (!cur) {
      if (!d.branch) reject(r, T, 'branch', 'is required to create a property');
      if (!d.address_line1) reject(r, T, 'address_line1', 'is required to create a property');
      if (!d.postcode) reject(r, T, 'postcode', 'is required to create a property');
      if (r.action === 'reject') {
        out.push(r);
        continue;
      }
      await client.query(
        `INSERT INTO properties (property_ref, branch_id, landlord_id, address_line1, address_line2, town, postcode,
                                 bedrooms, default_management_type)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
        [d.property_ref, branchId, landlordId ?? null, d.address_line1, d.address_line2, d.town, d.postcode, d.bedrooms, d.management_type],
      );
      r.action = 'create';
      r.changes = ['address'];
      out.push(r);
      continue;
    }
    if (r.action === 'reject') {
      out.push(r);
      continue;
    }
    const fill: Record<string, unknown> = {};
    if (d.address_line2) {
      if (!cur.address_line2) {
        fill.address_line2 = d.address_line2;
        r.changes.push('address line 2');
      } else if (norm(cur.address_line2) !== norm(d.address_line2)) r.warnings.push('Address 2 differs from Recon; Recon value kept');
    }
    if (d.town) {
      if (!cur.town) {
        fill.town = d.town;
        r.changes.push('town');
      } else if (norm(cur.town) !== norm(d.town)) r.warnings.push('Town differs from Recon; Recon value kept');
    }
    if (d.bedrooms !== null) {
      if (cur.bedrooms === null) {
        fill.bedrooms = d.bedrooms;
        r.changes.push('bedrooms');
      } else if (cur.bedrooms !== d.bedrooms) r.warnings.push('Bedrooms differs from Recon; Recon value kept');
    }
    if (landlordId) {
      if (!cur.landlord_id) {
        fill.landlord_id = landlordId;
        r.changes.push('landlord');
      } else if (cur.landlord_id !== landlordId) r.warnings.push('Landlord differs from Recon; Recon value kept');
    }
    if (d.management_type) {
      if (!cur.default_management_type) {
        fill.default_management_type = d.management_type;
        r.changes.push('management type');
      } else if (cur.default_management_type !== d.management_type) {
        r.warnings.push('Management Type differs from Recon (Veco owns it); Recon value kept');
      }
    }
    if (branchId && cur.branch_id !== branchId) r.warnings.push('Branch differs from Recon (Veco owns it); Recon value kept');
    if (d.address_line1 && norm(cur.address_line1) !== norm(d.address_line1)) {
      r.warnings.push('Address 1 differs from Recon (Veco owns it); Recon value kept');
    }
    if (d.postcode && norm(cur.postcode).replace(/ /g, '') !== norm(d.postcode).replace(/ /g, '')) {
      r.warnings.push('Postcode differs from Recon (Veco owns it); Recon value kept');
    }
    await setColumns(client, 'properties', cur.id, fill);
    r.action = r.changes.length > 0 ? 'update' : 'unchanged';
    out.push(r);
  }
  return out;
}

// -----------------------------------------------------------------------------
// Tenants
// -----------------------------------------------------------------------------
interface TenantRow {
  id: string;
  title: string | null;
  first_name: string;
  last_name: string;
  email: string | null;
  phone: string | null;
  ni_hash: string | null;
}

export async function applyTenants(client: PoolClient, rows: ParsedRow<TenantData>[], ctx: ApplyCtx): Promise<RowResult[]> {
  const refs = rows.map((r) => r.data.tenant_ref).filter(Boolean);
  const { rows: links } = await client.query<{ entity_id: string; external_id: string }>(
    `SELECT entity_id, external_id FROM external_refs
      WHERE system = 'letmc' AND entity_type = 'tenant' AND external_id = ANY($1::text[])`,
    [refs],
  );
  const idByRef = new Map(links.map((l) => [l.external_id, l.entity_id]));
  const { rows: letmcLinked } = await client.query<{ entity_id: string; external_id: string }>(
    `SELECT entity_id, external_id FROM external_refs WHERE system = 'letmc' AND entity_type = 'tenant'`,
  );
  const refById = new Map(letmcLinked.map((l) => [l.entity_id, l.external_id]));

  const hashes = new Map<string, string>(); // tenant_ref -> ni hash
  for (const row of rows) {
    if (row.data.ni && row.errors.length === 0) hashes.set(row.data.tenant_ref, protectNi(row.data.ni, ctx.keys).hash);
  }
  const { rows: holders } = await client.query<{ id: string; ni_hash: string }>(
    'SELECT id, ni_hash FROM tenants WHERE ni_hash = ANY($1::text[])',
    [[...hashes.values()]],
  );
  const holderByHash = new Map(holders.map((h) => [h.ni_hash, h.id]));

  const loadTenant = async (id: string): Promise<TenantRow> => {
    const { rows: t } = await client.query<TenantRow>(
      'SELECT id, title, first_name, last_name, email, phone, ni_hash FROM tenants WHERE id = $1',
      [id],
    );
    return t[0]!;
  };

  /** Fills blank fields of an existing tenant; differing values become warnings. */
  const fillBlanks = async (cur: TenantRow, d: TenantData, r: RowResult): Promise<void> => {
    const fill: Record<string, unknown> = {};
    if (d.title) {
      if (!cur.title) {
        fill.title = d.title;
        r.changes.push('title');
      } else if (norm(cur.title) !== norm(d.title)) r.warnings.push('Title differs from Recon; Recon value kept');
    }
    if (d.email) {
      if (!cur.email) {
        fill.email = d.email;
        r.changes.push('email');
      } else if (cur.email.toLowerCase() !== d.email.toLowerCase()) r.warnings.push('Email differs from Recon; Recon value kept');
    }
    if (d.phone) {
      if (!cur.phone) {
        fill.phone = d.phone;
        r.changes.push('phone');
      } else if (cur.phone !== d.phone) r.warnings.push('Mobile differs from Recon; Recon value kept');
    }
    if (d.ni) {
      const p = protectNi(d.ni, ctx.keys);
      if (!cur.ni_hash) {
        const holder = holderByHash.get(p.hash);
        if (holder && holder !== cur.id) {
          r.warnings.push('NI Number is already held by another tenant; not filled');
        } else {
          fill.ni_encrypted = p.encrypted;
          fill.ni_hash = p.hash;
          fill.ni_last3 = p.last;
          holderByHash.set(p.hash, cur.id);
          r.changes.push('NI number');
        }
      } else if (cur.ni_hash !== p.hash) r.warnings.push('NI Number differs from Recon; Recon value kept');
    }
    if (norm(cur.first_name) !== norm(d.first_name) || norm(cur.last_name) !== norm(d.last_name)) {
      r.warnings.push('Name differs from Recon; Recon value kept');
    }
    await setColumns(client, 'tenants', cur.id, fill);
  };

  const out: RowResult[] = [];
  for (const row of rows) {
    const decided = settled(row);
    if (decided) {
      out.push(decided);
      continue;
    }
    const r = start(row);
    const d = row.data;
    const knownId = idByRef.get(d.tenant_ref);
    if (knownId) {
      await fillBlanks(await loadTenant(knownId), d, r);
      r.action = r.changes.length > 0 ? 'update' : 'unchanged';
      out.push(r);
      continue;
    }
    const p = d.ni ? protectNi(d.ni, ctx.keys) : null;
    const heldBy = p ? holderByHash.get(p.hash) : undefined;
    if (heldBy) {
      const linkedTo = refById.get(heldBy);
      if (linkedTo && linkedTo !== d.tenant_ref) {
        out.push(reject(r, 'tenants', 'ni', `A tenant with this NI number is already linked to LetMC tenant ${linkedTo}`));
        continue;
      }
      await client.query(
        `INSERT INTO external_refs (system, entity_type, entity_id, external_id) VALUES ('letmc', 'tenant', $1, $2)
         ON CONFLICT DO NOTHING`,
        [heldBy, d.tenant_ref],
      );
      idByRef.set(d.tenant_ref, heldBy);
      refById.set(heldBy, d.tenant_ref);
      r.action = 'duplicate';
      r.warnings.push('Same NI as existing tenant');
      await fillBlanks(await loadTenant(heldBy), d, r);
      out.push(r);
      continue;
    }
    const { rows: ins } = await client.query<{ id: string }>(
      `INSERT INTO tenants (tenant_ref, title, first_name, last_name, email, phone, ni_encrypted, ni_hash, ni_last3)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) RETURNING id`,
      [`letmc:${d.tenant_ref}`, d.title, d.first_name, d.last_name, d.email, d.phone, p?.encrypted ?? null, p?.hash ?? null, p?.last ?? null],
    );
    const id = ins[0]!.id;
    await client.query(
      `INSERT INTO external_refs (system, entity_type, entity_id, external_id) VALUES ('letmc', 'tenant', $1, $2)`,
      [id, d.tenant_ref],
    );
    idByRef.set(d.tenant_ref, id);
    refById.set(id, d.tenant_ref);
    if (p) holderByHash.set(p.hash, id);
    r.action = 'create';
    r.changes = ['name', ...(d.email ? ['email'] : []), ...(d.phone ? ['mobile'] : []), ...(p ? ['NI number'] : [])];
    out.push(r);
  }
  return out;
}

// -----------------------------------------------------------------------------
// Tenancies and opening balances
// -----------------------------------------------------------------------------
interface TenancyRow {
  id: string;
  tid: string;
  property_id: string;
  charges_from: string | null;
}

export async function applyTenancies(client: PoolClient, rows: ParsedRow<TenancyData>[], ctx: ApplyCtx): Promise<RowResult[]> {
  const cutover = ctx.cutover!;
  const T = 'tenancies';
  const { rows: found } = await client.query<TenancyRow>(
    `SELECT id, tid, property_id, to_char(charges_from, 'YYYY-MM-DD') AS charges_from
       FROM tenancies WHERE tid = ANY($1::text[])`,
    [rows.map((r) => r.data.tid).filter(Boolean)],
  );
  const existing = new Map(found.map((t) => [t.tid, t]));
  const { rows: leads } = await client.query<{ tenancy_id: string; tenant_id: string }>(
    `SELECT tenancy_id, tenant_id FROM tenancy_tenants
      WHERE is_lead AND left_on IS NULL AND tenancy_id = ANY($1::uuid[])`,
    [found.map((t) => t.id)],
  );
  const leadByTenancy = new Map(leads.map((l) => [l.tenancy_id, l.tenant_id]));
  const { rows: props } = await client.query<{ id: string; property_ref: string; default_management_type: string | null }>(
    'SELECT id, property_ref, default_management_type::text FROM properties',
  );
  const propByRef = new Map(props.map((p) => [p.property_ref.toUpperCase(), p]));
  const { rows: tenantLinks } = await client.query<{ entity_id: string; external_id: string }>(
    `SELECT entity_id, external_id FROM external_refs WHERE system = 'letmc' AND entity_type = 'tenant'`,
  );
  const tenantByRef = new Map(tenantLinks.map((l) => [l.external_id, l.entity_id]));
  const { rows: balances } = await client.query<{ tenancy_id: string; payer: PayerKey; amount_pence: string; cutover: string }>(
    `SELECT tenancy_id, payer::text, amount_pence::text, to_char(cutover_date, 'YYYY-MM-DD') AS cutover
       FROM letmc_opening_balances WHERE tenancy_id = ANY($1::uuid[])`,
    [found.map((t) => t.id)],
  );
  const balanceKey = (tenancyId: string, payer: string) => `${tenancyId}|${payer}`;
  const obByKey = new Map(balances.map((b) => [balanceKey(b.tenancy_id, b.payer), b]));

  const out: RowResult[] = [];
  for (const row of rows) {
    const decided = settled(row);
    if (decided) {
      out.push(decided);
      continue;
    }
    const r = start(row);
    const d = row.data;
    const cur = existing.get(d.tid);
    const prop = d.property_ref ? propByRef.get(d.property_ref) : undefined;
    const tenantId = d.tenant_ref ? tenantByRef.get(d.tenant_ref) : undefined;
    if (d.property_ref && !prop) reject(r, T, 'property_ref', 'Property not found in Recon; import Properties (or run the Veco sync) first');
    if (d.tenant_ref && !tenantId) reject(r, T, 'tenant_ref', 'Tenant not found in Recon; import Tenants first');

    let mgmt: string | null = null;
    if (cur) {
      if (prop && prop.id !== cur.property_id) r.warnings.push('Property Ref differs from Recon; Recon value kept');
      const lead = leadByTenancy.get(cur.id);
      if (tenantId && lead && lead !== tenantId) r.warnings.push('Tenant Ref differs from Recon; Recon value kept');
    } else {
      if (!d.property_ref) reject(r, T, 'property_ref', 'is required for a tenancy not yet in Recon');
      if (!d.tenant_ref) reject(r, T, 'tenant_ref', 'is required for a tenancy not yet in Recon');
      if (!d.start_date) reject(r, T, 'start_date', 'is required for a tenancy not yet in Recon');
      if (!d.end_date || d.end_date >= ctx.today) {
        reject(r, T, 'end_date', 'Active tenancy not in Recon; Veco owns active tenancies - run the Veco sync first');
      }
      mgmt = d.management_type ?? prop?.default_management_type ?? null;
      if (prop && !mgmt) reject(r, T, 'management_type', 'is required: the property has no default management type');
    }

    // Opening balance rules, checked before anything is written for this row.
    const payer = d.balance_payer;
    const pence = d.balance_pence;
    const ob = cur ? obByKey.get(balanceKey(cur.id, payer)) : undefined;
    let setChargesFrom = false;
    let insertBalance = false;
    if (ob) {
      if (Number(ob.amount_pence) !== pence || ob.cutover !== cutover) {
        reject(r, T, 'balance', `Opening balance already imported (${pounds(Number(ob.amount_pence))} at ${ob.cutover})`);
      }
    } else {
      const from = cur?.charges_from ?? null;
      if (from === null) setChargesFrom = true;
      else if (from !== cutover) {
        if (pence !== 0) reject(r, T, 'balance', `Rent account already starts ${from}`);
        else r.warnings.push(`Rent account already starts ${from}`);
      }
      insertBalance = pence !== 0;
    }
    if (r.action === 'reject') {
      out.push(r);
      continue;
    }

    // Writes.
    let tenancyId: string;
    if (cur) {
      tenancyId = cur.id;
    } else {
      let unitId: string | null = null;
      if (d.unit_ref) {
        const { rows: u } = await client.query<{ id: string }>(
          `INSERT INTO property_units (property_id, unit_ref) VALUES ($1, $2)
           ON CONFLICT (property_id, unit_ref) DO UPDATE SET unit_ref = EXCLUDED.unit_ref RETURNING id`,
          [prop!.id, d.unit_ref],
        );
        unitId = u[0]!.id;
      }
      const { rows: ins } = await client.query<{ id: string }>(
        `INSERT INTO tenancies (tid, property_id, unit_id, management_type, start_date, end_date, status)
         VALUES ($1, $2, $3, $4, $5, $6, 'ended') RETURNING id`,
        [d.tid, prop!.id, unitId, mgmt, d.start_date, d.end_date],
      );
      tenancyId = ins[0]!.id;
      await client.query(
        `INSERT INTO tenancy_tenants (tenancy_id, tenant_id, is_lead, joined_on, left_on) VALUES ($1, $2, true, $3, $4)`,
        [tenancyId, tenantId, d.start_date, d.end_date],
      );
      r.changes.push('tenancy created (ended)');
    }

    if (setChargesFrom) {
      await client.query('UPDATE tenancies SET charges_from = $2::date WHERE id = $1', [tenancyId, cutover]);
      r.changes.push(`rent account from ${cutover}`);
    }
    if (insertBalance) {
      let chargeId: string | null = null;
      let adjustmentId: string | null = null;
      if (pence > 0) {
        const { rows: c } = await client.query<{ id: string }>(
          `INSERT INTO rent_charges (tenancy_id, payer, period_start, period_end, due_date, amount, source, notes)
           VALUES ($1, $2, $3::date - 1, $3::date - 1, $3::date - 1, ($4::bigint)::numeric / 100, 'opening_balance', 'LetMC opening balance')
           RETURNING id`,
          [tenancyId, payer, cutover, pence],
        );
        chargeId = c[0]!.id;
        r.changes.push(`opening arrears ${pounds(pence)}`);
      } else {
        const { rows: a } = await client.query<{ id: string }>(
          `INSERT INTO adjustments (tenancy_id, payer, kind, amount, effective_on, reason, approved_by)
           VALUES ($1, $2, 'opening_balance', ($4::bigint)::numeric / 100, $3::date - 1, $5, $6) RETURNING id`,
          [tenancyId, payer, cutover, pence, `LetMC opening credit at ${cutover}`, ctx.userId],
        );
        adjustmentId = a[0]!.id;
        r.changes.push(`opening credit ${pounds(pence)}`);
      }
      await client.query(
        `INSERT INTO letmc_opening_balances (tenancy_id, payer, cutover_date, amount_pence, rent_charge_id, adjustment_id, import_run_id)
         VALUES ($1, $2, $3, $4, $5, $6, $7)`,
        [tenancyId, payer, cutover, pence, chargeId, adjustmentId, ctx.runId],
      );
      r.opening = { pence };
    }
    if (r.changes.length > 0) await client.query('SELECT refresh_rent_charges($1)', [tenancyId]);
    r.action = cur ? (r.changes.length > 0 ? 'update' : 'unchanged') : 'create';
    out.push(r);
  }
  return out;
}

export const APPLIERS = {
  landlords: applyLandlords,
  properties: applyProperties,
  tenants: applyTenants,
  tenancies: applyTenancies,
} as const;
