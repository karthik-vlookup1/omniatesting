/**
 * Seeds agentos_tenants from the agentOS-format CSV. All-or-nothing: any bad row rejects the file.
 * Idempotent: upserts on TID. Links tenancy_id via tenancies.tid when present, else NULL.
 */
import { parse } from 'csv-parse/sync';
import type { Pool } from '../../db/pool.js';
import { AgentosSeedError, type AgentosTenantInput, type SeedResult, type SeedRowError } from '../../domain/agentos/types.js';

const HEADERS = ['TID', 'Tenant ID', 'CRM ID', 'Forename', 'Surname', 'Managed by', 'Residence', 'Tenancy', 'Is Head Tenant', 'Will deposit to'];

export function parseAgentosTenants(csv: string): AgentosTenantInput[] {
  const records = parse(csv, { columns: true, skip_empty_lines: true, trim: true, bom: true }) as Record<string, string>[];
  const errors: SeedRowError[] = [];
  const out: AgentosTenantInput[] = [];
  const seenTid = new Set<string>();
  const seenRef = new Set<string>();
  records.forEach((r, i) => {
    const line = i + 2;
    const bad = (field: string, reason: string) => errors.push({ line, field, reason });
    for (const h of HEADERS) if (r[h] === undefined) bad(h, 'column missing');
    const tid = r['TID'] ?? '';
    const ref = r['Tenant ID'] ?? '';
    const forename = r['Forename'] ?? '';
    if (!/^\d{4}$/.test(tid)) bad('TID', 'must be 4 digits');
    if (!/^ten-\d+$/.test(ref)) bad('Tenant ID', 'must look like ten-<n>');
    if (!/^crm-\d+$/.test(r['CRM ID'] ?? '')) bad('CRM ID', 'must look like crm-<n>');
    if (!forename.startsWith(`${tid} `) || forename.length <= 5) bad('Forename', 'must be "<TID> <First>"');
    for (const f of ['Surname', 'Managed by', 'Residence', 'Tenancy', 'Will deposit to']) if (!(r[f] ?? '')) bad(f, 'required');
    if (seenTid.has(tid)) bad('TID', 'duplicate in file');
    if (seenRef.has(ref)) bad('Tenant ID', 'duplicate in file');
    seenTid.add(tid);
    seenRef.add(ref);
    out.push({
      tid,
      agentosRef: ref,
      crmRef: r['CRM ID'] ?? '',
      forename,
      surname: r['Surname'] ?? '',
      managedBy: r['Managed by'] ?? '',
      residence: r['Residence'] ?? '',
      tenancyDescriptor: r['Tenancy'] ?? '',
      isHeadTenant: (r['Is Head Tenant'] ?? 'YES').toUpperCase() !== 'NO',
      depositTo: r['Will deposit to'] ?? '',
    });
  });
  if (errors.length > 0) throw new AgentosSeedError(errors);
  return out;
}

export async function seedAgentosTenants(pool: Pool, csv: string): Promise<SeedResult> {
  const rows = parseAgentosTenants(csv);
  const client = await pool.connect();
  let created = 0;
  let updated = 0;
  try {
    await client.query('BEGIN');
    for (const t of rows) {
      const { rows: res } = await client.query<{ inserted: boolean }>(
        `INSERT INTO agentos_tenants (tid, agentos_ref, crm_ref, forename, surname, managed_by, residence,
                                      tenancy_descriptor, is_head_tenant, deposit_to, tenancy_id)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,(SELECT id FROM tenancies WHERE tid = $1))
         ON CONFLICT (tid) DO UPDATE SET agentos_ref = EXCLUDED.agentos_ref, crm_ref = EXCLUDED.crm_ref,
           forename = EXCLUDED.forename, surname = EXCLUDED.surname, managed_by = EXCLUDED.managed_by,
           residence = EXCLUDED.residence, tenancy_descriptor = EXCLUDED.tenancy_descriptor,
           is_head_tenant = EXCLUDED.is_head_tenant, deposit_to = EXCLUDED.deposit_to,
           tenancy_id = EXCLUDED.tenancy_id, updated_at = now()
         WHERE (agentos_tenants.agentos_ref, agentos_tenants.crm_ref, agentos_tenants.forename, agentos_tenants.surname,
                agentos_tenants.managed_by, agentos_tenants.residence, agentos_tenants.tenancy_descriptor,
                agentos_tenants.is_head_tenant, agentos_tenants.deposit_to, agentos_tenants.tenancy_id)
           IS DISTINCT FROM
               (EXCLUDED.agentos_ref, EXCLUDED.crm_ref, EXCLUDED.forename, EXCLUDED.surname, EXCLUDED.managed_by,
                EXCLUDED.residence, EXCLUDED.tenancy_descriptor, EXCLUDED.is_head_tenant, EXCLUDED.deposit_to,
                EXCLUDED.tenancy_id)
         RETURNING (xmax = 0) AS inserted`,
        [t.tid, t.agentosRef, t.crmRef, t.forename, t.surname, t.managedBy, t.residence, t.tenancyDescriptor, t.isHeadTenant, t.depositTo],
      );
      if (res[0]?.inserted) created++;
      else if (res[0]) updated++;
    }
    const { rows: l } = await client.query<{ n: string }>('SELECT count(*) AS n FROM agentos_tenants WHERE tenancy_id IS NOT NULL');
    await client.query('COMMIT');
    return { rows: rows.length, created, updated, linked: Number(l[0]?.n ?? 0) };
  } catch (e) {
    await client.query('ROLLBACK');
    throw e;
  } finally {
    client.release();
  }
}
