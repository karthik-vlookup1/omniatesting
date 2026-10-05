/**
 * Property reference data. property_ref is immutable (Veco/Xero key).
 * Veco sync overwrites branch, address_line1, postcode, management type and is_active,
 * so edits to those fields may be replaced by the next sync.
 */
import type { ActorDb } from '../../db/context.js';
import type { Pool } from '../../db/pool.js';
import { AppError } from '../../lib/errors.js';

export interface Property {
  id: string;
  propertyRef: string;
  branchId: string;
  branchCode: string;
  landlordId: string | null;
  landlordName: string | null;
  addressLine1: string;
  addressLine2: string | null;
  town: string | null;
  postcode: string;
  bedrooms: number | null;
  brma: string | null;
  defaultManagementType: string | null;
  isActive: boolean;
}

export interface PropertyCreate {
  propertyRef: string;
  branchId: string;
  landlordId?: string | null;
  addressLine1: string;
  addressLine2?: string | null;
  town?: string | null;
  postcode: string;
  bedrooms?: number | null;
  brma?: string | null;
  defaultManagementType?: string | null;
}

export type PropertyPatch = Partial<{
  branchId: string;
  landlordId: string | null;
  addressLine1: string;
  addressLine2: string | null;
  town: string | null;
  postcode: string;
  bedrooms: number | null;
  brma: string | null;
  defaultManagementType: string | null;
  isActive: boolean;
}>;

export interface PropertyFilter {
  q?: string;
  branchId?: string;
  status?: 'active' | 'inactive' | 'all';
}

const COLUMNS: Record<keyof PropertyPatch, string> = {
  branchId: 'branch_id',
  landlordId: 'landlord_id',
  addressLine1: 'address_line1',
  addressLine2: 'address_line2',
  town: 'town',
  postcode: 'postcode',
  bedrooms: 'bedrooms',
  brma: 'brma',
  defaultManagementType: 'default_management_type',
  isActive: 'is_active',
};

interface Row {
  id: string;
  property_ref: string;
  branch_id: string;
  branch_code: string;
  landlord_id: string | null;
  landlord_name: string | null;
  address_line1: string;
  address_line2: string | null;
  town: string | null;
  postcode: string;
  bedrooms: number | null;
  brma: string | null;
  default_management_type: string | null;
  is_active: boolean;
}

const SELECT = `SELECT p.id, p.property_ref, p.branch_id, b.code AS branch_code, p.landlord_id, l.name AS landlord_name,
       p.address_line1, p.address_line2, p.town, p.postcode, p.bedrooms, p.brma,
       p.default_management_type::text AS default_management_type, p.is_active
  FROM properties p
  JOIN branches b ON b.id = p.branch_id
  LEFT JOIN landlords l ON l.id = p.landlord_id`;

const toProperty = (r: Row): Property => ({
  id: r.id,
  propertyRef: r.property_ref,
  branchId: r.branch_id,
  branchCode: r.branch_code,
  landlordId: r.landlord_id,
  landlordName: r.landlord_name,
  addressLine1: r.address_line1,
  addressLine2: r.address_line2,
  town: r.town,
  postcode: r.postcode,
  bedrooms: r.bedrooms,
  brma: r.brma,
  defaultManagementType: r.default_management_type,
  isActive: r.is_active,
});

const escapeLike = (s: string): string => s.replace(/[\\%_]/g, (m) => `\\${m}`);

function mapDbError(err: unknown): never {
  const e = err as { code?: string; constraint?: string };
  if (e.code === '23505') throw new AppError('conflict', 'A property with that reference exists');
  if (e.code === '23503') {
    throw new AppError('bad_request', e.constraint?.includes('landlord') ? 'Unknown landlord' : 'Unknown branch');
  }
  throw err;
}

export async function list(pool: Pool, filter: PropertyFilter): Promise<Property[]> {
  const q = escapeLike((filter.q ?? '').trim());
  const status = filter.status ?? 'all';
  const { rows } = await pool.query<Row>(
    `${SELECT}
      WHERE ($1 = '' OR p.property_ref ILIKE '%'||$1||'%' OR p.address_line1 ILIKE '%'||$1||'%'
              OR p.town ILIKE '%'||$1||'%' OR p.postcode ILIKE '%'||$1||'%')
        AND ($2::uuid IS NULL OR p.branch_id = $2::uuid)
        AND ($3 = 'all' OR p.is_active = ($3 = 'active'))
      ORDER BY p.property_ref LIMIT 200`,
    [q, filter.branchId ?? null, status],
  );
  return rows.map(toProperty);
}

export async function create(db: ActorDb, input: PropertyCreate): Promise<string> {
  try {
    return await db.tx(async (c) => {
      const { rows } = await c.query<{ id: string }>(
        `INSERT INTO properties (property_ref, branch_id, landlord_id, address_line1, address_line2, town, postcode,
                                 bedrooms, brma, default_management_type)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10) RETURNING id`,
        [
          input.propertyRef,
          input.branchId,
          input.landlordId ?? null,
          input.addressLine1,
          input.addressLine2 ?? null,
          input.town ?? null,
          input.postcode,
          input.bedrooms ?? null,
          input.brma ?? null,
          input.defaultManagementType ?? null,
        ],
      );
      return rows[0]!.id;
    });
  } catch (err) {
    return mapDbError(err);
  }
}

export async function update(db: ActorDb, id: string, patch: PropertyPatch): Promise<Property> {
  const keys = (Object.keys(COLUMNS) as (keyof PropertyPatch)[]).filter((k) => patch[k] !== undefined);
  if (keys.length === 0) throw new AppError('bad_request', 'nothing to change');
  const sets = keys.map((k, i) => `${COLUMNS[k]} = $${i + 2}`).join(', ');
  const values = keys.map((k) => patch[k]);
  try {
    return await db.tx(async (c) => {
      const { rows } = await c.query<{ id: string }>(
        `UPDATE properties SET ${sets}, updated_at = now() WHERE id = $1 RETURNING id`,
        [id, ...values],
      );
      if (rows.length === 0) throw new AppError('not_found', 'No such property');
      const after = await c.query<Row>(`${SELECT} WHERE p.id = $1`, [id]);
      return toProperty(after.rows[0]!);
    });
  } catch (err) {
    return mapDbError(err);
  }
}
