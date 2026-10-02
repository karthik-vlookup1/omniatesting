/**
 * Tenancy search and detail over the Veco-synced copy.
 *
 * Search understands three shapes of query:
 *   T1234        -> exact TID
 *   QQ123456C    -> full NI number, looked up by its keyed hash (never by plaintext)
 *   anything else -> tenant name, room/building ref or postcode (case-insensitive substring)
 *
 * The full NI number is only ever decrypted for admin and accounts; everyone else sees the last 3.
 */
import type { Pool } from '../../db/pool.js';
import { decrypt, isValidNi, maskNi, secureHash } from '../../lib/crypto.js';
import { AppError } from '../../lib/errors.js';
import type { Role } from '../auth.service.js';

export const NI_VIEWER_ROLES: readonly Role[] = ['admin', 'accounts'];
const SEARCH_LIMIT = 50;

export interface TenancySummary {
  tid: string;
  status: 'pending' | 'active' | 'ended';
  startDate: string;
  endDate: string | null;
  managementType: 'RG' | 'MG' | 'IRG';
  tenantName: string | null;
  niMasked: string | null;
  propertyRef: string;
  unitRef: string | null;
  postcode: string;
  address: string;
  branchCode: string;
  rent: { amount: string; frequency: string } | null;
}

export interface TenancyDetail extends TenancySummary {
  /** Full NI number; present only for NI viewer roles and only when one is on file. */
  ni?: string;
}

interface Row {
  tid: string;
  status: TenancySummary['status'];
  start_date: string;
  end_date: string | null;
  management_type: TenancySummary['managementType'];
  full_name: string | null;
  ni_last3: string | null;
  ni_encrypted: Buffer | null;
  property_ref: string;
  unit_ref: string | null;
  postcode: string;
  address_line1: string;
  branch_code: string;
  rent_amount: string | null;
  rent_frequency: string | null;
}

const SELECT = `
SELECT t.tid, t.status::text AS status,
       to_char(t.start_date, 'YYYY-MM-DD') AS start_date, to_char(t.end_date, 'YYYY-MM-DD') AS end_date,
       t.management_type::text AS management_type,
       tn.full_name, tn.ni_last3, tn.ni_encrypted,
       p.property_ref, u.unit_ref, p.postcode, p.address_line1, b.code AS branch_code,
       rs.amount::text AS rent_amount, rs.frequency::text AS rent_frequency
  FROM tenancies t
  JOIN properties p ON p.id = t.property_id
  JOIN branches b ON b.id = p.branch_id
  LEFT JOIN property_units u ON u.id = t.unit_id
  LEFT JOIN tenancy_tenants tt ON tt.tenancy_id = t.id AND tt.is_lead AND tt.left_on IS NULL
  LEFT JOIN tenants tn ON tn.id = tt.tenant_id
  LEFT JOIN LATERAL (
        SELECT amount, frequency FROM rent_schedules r
         WHERE r.tenancy_id = t.id
         ORDER BY (r.effective_to IS NULL) DESC, r.effective_from DESC LIMIT 1) rs ON true`;

function toSummary(r: Row): TenancySummary {
  return {
    tid: r.tid,
    status: r.status,
    startDate: r.start_date,
    endDate: r.end_date,
    managementType: r.management_type,
    tenantName: r.full_name,
    niMasked: maskNi(r.ni_last3),
    propertyRef: r.property_ref,
    unitRef: r.unit_ref,
    postcode: r.postcode,
    address: r.address_line1,
    branchCode: r.branch_code,
    rent: r.rent_amount && r.rent_frequency ? { amount: r.rent_amount, frequency: r.rent_frequency } : null,
  };
}

export interface SearchInput {
  q: string;
  status: 'active' | 'ended' | 'all';
}

export async function searchTenancies(pool: Pool, hashKey: string, { q, status }: SearchInput): Promise<TenancySummary[]> {
  const term = q.trim();
  const params: unknown[] = [];
  const where: string[] = [];
  if (status !== 'all') {
    params.push(status);
    where.push(`t.status = $${params.length}::tenancy_status`);
  }

  if (/^T\d+$/i.test(term)) {
    params.push(term.toUpperCase());
    where.push(`t.tid = $${params.length}`);
  } else if (isValidNi(term)) {
    params.push(secureHash(term, hashKey));
    where.push(`tn.ni_hash = $${params.length}`);
  } else if (term !== '') {
    if (term.length < 2) throw new AppError('bad_request', 'Type at least 2 characters to search');
    params.push(`%${term.replace(/[\\%_]/g, '\\$&')}%`);
    const p = `$${params.length}`;
    where.push(
      `(tn.full_name ILIKE ${p} OR u.unit_ref ILIKE ${p} OR p.property_ref ILIKE ${p} OR p.postcode ILIKE ${p})`,
    );
  }

  const sql = `${SELECT} ${where.length ? `WHERE ${where.join(' AND ')}` : ''} ORDER BY t.tid LIMIT ${SEARCH_LIMIT}`;
  const { rows } = await pool.query<Row>(sql, params);
  return rows.map(toSummary);
}

export async function getTenancy(
  pool: Pool,
  encryptionKey: Buffer,
  tid: string,
  viewerRole: Role,
): Promise<TenancyDetail> {
  const { rows } = await pool.query<Row>(`${SELECT} WHERE t.tid = $1`, [tid.trim().toUpperCase()]);
  const row = rows[0];
  if (!row) throw new AppError('not_found', 'No tenancy with that TID');
  const detail: TenancyDetail = toSummary(row);
  if (NI_VIEWER_ROLES.includes(viewerRole) && row.ni_encrypted) {
    detail.ni = decrypt(row.ni_encrypted, encryptionKey, 'tenants.ni');
  }
  return detail;
}
