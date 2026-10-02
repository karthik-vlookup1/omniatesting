/**
 * Veco -> Postgres tenancy sync. Veco is the source of truth for who lives where and the rent;
 * Recon keeps a local copy so matching is fast and works when Veco is unreachable.
 *
 * One transaction, audited as `veco-sync` (or the admin who pressed "Sync now"):
 *   branches (by code) -> properties (by building ref) -> property_units (by room ref)
 *   -> tenants (by Veco contact) -> tenancies (by TID) -> lead tenant link -> rent schedule.
 * Active tenancies missing from the feed are ended. Rows are only written when something changed,
 * so a quiet night leaves the audit log quiet.
 *
 * Safety: an empty feed is refused, and so is a feed that would end more than
 * `maxEndFraction` of the active tenancies (a half-refreshed warehouse must not end real
 * tenancies). `force` overrides the second check; `dryRun` rolls everything back.
 */
import { withTransaction } from '../../db/context.js';
import type { Pool, PoolClient } from '../../db/pool.js';
import { isValidNi, protectNi, type ProtectionKeys } from '../../lib/crypto.js';
import { parseVecoRows, type RejectedRow, type VecoTenancy } from './source.js';

export const VECO_SYNC_ACTOR = 'veco-sync';
/** Any constant works; it just has to be the same for every sync so two runs never overlap. */
const SYNC_LOCK_KEY = 7_102_001;

export interface SyncOptions {
  keys: ProtectionKeys;
  actor?: string;
  dryRun?: boolean;
  force?: boolean;
  maxEndFraction?: number;
  /** "Today" for end dates and rent changes, YYYY-MM-DD. Defaults to the database's current_date. */
  today?: string;
}

export interface SyncSummary {
  dryRun: boolean;
  fetched: number;
  rejected: RejectedRow[];
  branches: { inserted: number };
  properties: { inserted: number; updated: number };
  units: { inserted: number };
  tenants: { inserted: number; updated: number };
  tenancies: { inserted: number; updated: number; reactivated: number; ended: number };
  rentChanges: number;
  ni: { missing: number; invalid: number; conflicts: number };
  namesMissing: number;
  managementType: { IRG: number; RG: number; defaultedToRG: number };
}

export class SyncRefusedError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SyncRefusedError';
  }
}

class DryRunRollback extends Error {}

export async function syncTenancies(pool: Pool, rawRows: unknown[], opts: SyncOptions): Promise<SyncSummary> {
  const { valid, rejected, presentTids } = parseVecoRows(rawRows);
  if (valid.length === 0) {
    throw new SyncRefusedError(
      `Veco returned ${rawRows.length} rows and none were usable; refusing to sync (nothing was changed)`,
    );
  }

  const summary = emptySummary(Boolean(opts.dryRun), rawRows.length, rejected);
  try {
    await withTransaction(pool, opts.actor ?? VECO_SYNC_ACTOR, async (client) => {
      const { rows: lock } = await client.query<{ ok: boolean }>('SELECT pg_try_advisory_xact_lock($1) AS ok', [
        SYNC_LOCK_KEY,
      ]);
      if (!lock[0]?.ok) throw new SyncRefusedError('Another Veco sync is already running');

      const today = opts.today ?? (await currentDate(client));
      await guardAgainstMassEnding(client, presentTids, opts);

      const branchIds = await upsertBranches(client, valid, summary);
      const propertyIds = await upsertProperties(client, valid, branchIds, summary);
      for (const t of valid) {
        const propertyId = propertyIds.get(t.propertyRef)!;
        const unitId = await upsertUnit(client, propertyId, t.unitRef, summary);
        const tenantId = await upsertTenant(client, t, opts.keys, summary);
        const tenancyId = await upsertTenancy(client, t, propertyId, unitId, summary);
        await linkLeadTenant(client, tenancyId, tenantId, t.startDate, today);
        await syncRent(client, tenancyId, t, today, summary);
        summary.managementType[t.managementType] += 1;
        if (t.managementTypeDefaulted) summary.managementType.defaultedToRG += 1;
      }
      summary.tenancies.ended = await endMissingTenancies(client, presentTids, today);

      if (opts.dryRun) throw new DryRunRollback();
    });
  } catch (err) {
    if (!(err instanceof DryRunRollback)) throw err;
  }
  return summary;
}

function emptySummary(dryRun: boolean, fetched: number, rejected: RejectedRow[]): SyncSummary {
  return {
    dryRun,
    fetched,
    rejected,
    branches: { inserted: 0 },
    properties: { inserted: 0, updated: 0 },
    units: { inserted: 0 },
    tenants: { inserted: 0, updated: 0 },
    tenancies: { inserted: 0, updated: 0, reactivated: 0, ended: 0 },
    rentChanges: 0,
    ni: { missing: 0, invalid: 0, conflicts: 0 },
    namesMissing: 0,
    managementType: { IRG: 0, RG: 0, defaultedToRG: 0 },
  };
}

async function currentDate(client: PoolClient): Promise<string> {
  const { rows } = await client.query<{ d: string }>("SELECT to_char(current_date, 'YYYY-MM-DD') AS d");
  return rows[0]!.d;
}

async function guardAgainstMassEnding(client: PoolClient, presentTids: string[], opts: SyncOptions): Promise<void> {
  const { rows } = await client.query<{ active: number; missing: number }>(
    `SELECT count(*)::int AS active,
            count(*) FILTER (WHERE NOT (tid = ANY($1::text[])))::int AS missing
       FROM tenancies WHERE status = 'active'`,
    [presentTids],
  );
  const { active, missing } = rows[0]!;
  const limit = opts.maxEndFraction ?? 0.2;
  if (!opts.force && active > 0 && missing / active > limit) {
    throw new SyncRefusedError(
      `This sync would end ${missing} of ${active} active tenancies (more than ${Math.round(limit * 100)}%). ` +
        'The Veco feed may be incomplete; nothing was changed. Re-run with force if this is expected.',
    );
  }
}

async function upsertBranches(client: PoolClient, valid: VecoTenancy[], summary: SyncSummary) {
  const codes = [...new Set(valid.map((t) => t.branchCode))];
  const { rows: inserted } = await client.query<{ code: string }>(
    `INSERT INTO branches (code, name) SELECT c, c FROM unnest($1::text[]) AS c
     ON CONFLICT (code) DO NOTHING RETURNING code`,
    [codes],
  );
  summary.branches.inserted = inserted.length;
  const { rows } = await client.query<{ id: string; code: string }>(
    'SELECT id, code FROM branches WHERE code = ANY($1::text[])',
    [codes],
  );
  return new Map(rows.map((r) => [r.code, r.id]));
}

/** One row per building. Rooms of one building can disagree on branch; the most common wins. */
async function upsertProperties(
  client: PoolClient,
  valid: VecoTenancy[],
  branchIds: Map<string, string>,
  summary: SyncSummary,
) {
  const byRef = new Map<string, VecoTenancy[]>();
  for (const t of valid) byRef.set(t.propertyRef, [...(byRef.get(t.propertyRef) ?? []), t]);

  const ids = new Map<string, string>();
  for (const [ref, rooms] of byRef) {
    const branchCode = mostCommon(rooms.map((r) => r.branchCode));
    const mgmt = mostCommon(rooms.map((r) => r.managementType));
    const first = rooms[0]!;
    const { rows } = await client.query<{ id: string; inserted: boolean }>(
      `WITH existing AS (SELECT id FROM properties WHERE property_ref = $1)
       INSERT INTO properties (property_ref, branch_id, address_line1, postcode, default_management_type, is_active)
       VALUES ($1, $2, $3, $4, $5, true)
       ON CONFLICT (property_ref) DO UPDATE
          SET branch_id = EXCLUDED.branch_id, address_line1 = EXCLUDED.address_line1,
              postcode = EXCLUDED.postcode, default_management_type = EXCLUDED.default_management_type,
              is_active = true
        WHERE (properties.branch_id, properties.address_line1, properties.postcode,
               properties.default_management_type, properties.is_active)
              IS DISTINCT FROM
              (EXCLUDED.branch_id, EXCLUDED.address_line1, EXCLUDED.postcode,
               EXCLUDED.default_management_type, true)
       RETURNING id, NOT EXISTS (SELECT 1 FROM existing) AS inserted`,
      [ref, branchIds.get(branchCode), first.address ?? ref, first.postcode, mgmt],
    );
    if (rows[0]) {
      ids.set(ref, rows[0].id);
      if (rows[0].inserted) summary.properties.inserted += 1;
      else summary.properties.updated += 1;
    } else {
      const { rows: found } = await client.query<{ id: string }>('SELECT id FROM properties WHERE property_ref = $1', [
        ref,
      ]);
      ids.set(ref, found[0]!.id);
    }
  }
  return ids;
}

async function upsertUnit(client: PoolClient, propertyId: string, unitRef: string, summary: SyncSummary) {
  const { rows } = await client.query<{ id: string }>(
    `INSERT INTO property_units (property_id, unit_ref) VALUES ($1, $2)
     ON CONFLICT (property_id, unit_ref) DO NOTHING RETURNING id`,
    [propertyId, unitRef],
  );
  if (rows[0]) {
    summary.units.inserted += 1;
    return rows[0].id;
  }
  const { rows: found } = await client.query<{ id: string }>(
    'SELECT id FROM property_units WHERE property_id = $1 AND unit_ref = $2',
    [propertyId, unitRef],
  );
  return found[0]!.id;
}

/** "Mr A B Sample" -> first "Mr A B", last "Sample". Veco gives one display string. */
export function splitName(name: string | null): { first: string; last: string } | null {
  const parts = name?.trim().split(/\s+/).filter(Boolean) ?? [];
  if (parts.length === 0) return null;
  if (parts.length === 1) return { first: parts[0]!, last: '' };
  return { first: parts.slice(0, -1).join(' '), last: parts[parts.length - 1]! };
}

/** Tenants are keyed by their Veco contact (`tenant_ref = 'veco:<contactPk>'`), else by TID. */
async function upsertTenant(client: PoolClient, t: VecoTenancy, keys: ProtectionKeys, summary: SyncSummary) {
  const tenantRef = t.contactPk ? `veco:${t.contactPk.toLowerCase()}` : `veco-tid:${t.tid}`;
  const name = splitName(t.tenantName);
  if (!name) summary.namesMissing += 1;
  const first = name?.first ?? 'Unknown';
  const last = name?.last ?? '';

  // NI: hash for matching, ciphertext for authorised display, last 3 for everyone else.
  let ni: { hash: string; encrypted: Buffer; last: string } | null = null;
  if (!t.ni) summary.ni.missing += 1;
  else if (!isValidNi(t.ni)) summary.ni.invalid += 1;
  else ni = protectNi(t.ni, keys);

  const { rows: existing } = await client.query<{ id: string; first_name: string; last_name: string; ni_hash: string | null }>(
    'SELECT id, first_name, last_name, ni_hash FROM tenants WHERE tenant_ref = $1',
    [tenantRef],
  );
  const current = existing[0];

  if (ni && ni.hash !== current?.ni_hash) {
    const { rows: holder } = await client.query<{ id: string }>('SELECT id FROM tenants WHERE ni_hash = $1', [ni.hash]);
    if (holder[0] && holder[0].id !== current?.id) {
      // The same NI already belongs to another Veco contact: keep it there, flag it, don't guess.
      summary.ni.conflicts += 1;
      ni = null;
    }
  }

  if (!current) {
    const { rows } = await client.query<{ id: string }>(
      `INSERT INTO tenants (tenant_ref, first_name, last_name, ni_encrypted, ni_hash, ni_last3)
       VALUES ($1, $2, $3, $4, $5, $6) RETURNING id`,
      [tenantRef, first, last, ni?.encrypted ?? null, ni?.hash ?? null, ni?.last ?? null],
    );
    summary.tenants.inserted += 1;
    return rows[0]!.id;
  }

  const niChanged = ni !== null && ni.hash !== current.ni_hash;
  if (current.first_name !== first || current.last_name !== last || niChanged) {
    await client.query(
      `UPDATE tenants SET first_name = $2, last_name = $3,
              ni_encrypted = CASE WHEN $4::boolean THEN $5 ELSE ni_encrypted END,
              ni_hash      = CASE WHEN $4::boolean THEN $6 ELSE ni_hash END,
              ni_last3     = CASE WHEN $4::boolean THEN $7 ELSE ni_last3 END
        WHERE id = $1`,
      [current.id, first, last, niChanged, ni?.encrypted ?? null, ni?.hash ?? null, ni?.last ?? null],
    );
    summary.tenants.updated += 1;
  }
  return current.id;
}

async function upsertTenancy(
  client: PoolClient,
  t: VecoTenancy,
  propertyId: string,
  unitId: string,
  summary: SyncSummary,
) {
  const { rows: existing } = await client.query<{
    id: string;
    property_id: string;
    unit_id: string | null;
    management_type: string;
    start: string;
    status: string;
  }>(
    `SELECT id, property_id, unit_id, management_type::text, to_char(start_date, 'YYYY-MM-DD') AS start, status::text
       FROM tenancies WHERE tid = $1`,
    [t.tid],
  );
  const current = existing[0];
  if (!current) {
    const { rows } = await client.query<{ id: string }>(
      `INSERT INTO tenancies (tid, property_id, unit_id, management_type, start_date, status)
       VALUES ($1, $2, $3, $4, $5, 'active') RETURNING id`,
      [t.tid, propertyId, unitId, t.managementType, t.startDate],
    );
    summary.tenancies.inserted += 1;
    return rows[0]!.id;
  }
  const changed =
    current.property_id !== propertyId ||
    current.unit_id !== unitId ||
    current.management_type !== t.managementType ||
    current.start !== t.startDate ||
    current.status !== 'active';
  if (changed) {
    await client.query(
      `UPDATE tenancies SET property_id = $2, unit_id = $3, management_type = $4, start_date = $5,
              status = 'active', end_date = NULL
        WHERE id = $1`,
      [current.id, propertyId, unitId, t.managementType, t.startDate],
    );
    if (current.status !== 'active') summary.tenancies.reactivated += 1;
    else summary.tenancies.updated += 1;
  }
  return current.id;
}

/** Veco names one tenant per tenancy: make them the current lead, closing any previous lead. */
async function linkLeadTenant(client: PoolClient, tenancyId: string, tenantId: string, startDate: string, today: string) {
  const { rows } = await client.query<{ tenant_id: string }>(
    'SELECT tenant_id FROM tenancy_tenants WHERE tenancy_id = $1 AND is_lead AND left_on IS NULL',
    [tenancyId],
  );
  if (rows[0]?.tenant_id === tenantId) return;
  if (rows[0]) {
    await client.query(
      'UPDATE tenancy_tenants SET left_on = $3 WHERE tenancy_id = $1 AND tenant_id = $2',
      [tenancyId, rows[0].tenant_id, today],
    );
  }
  await client.query(
    `INSERT INTO tenancy_tenants (tenancy_id, tenant_id, is_lead, joined_on) VALUES ($1, $2, true, $3)
     ON CONFLICT (tenancy_id, tenant_id) DO UPDATE SET is_lead = true, left_on = NULL`,
    [tenancyId, tenantId, rows[0] ? today : startDate],
  );
}

/**
 * Keeps one open rent schedule per tenancy matching Veco. A change closes the open schedule
 * yesterday and opens a new one today, so history is kept and periods never overlap.
 */
async function syncRent(client: PoolClient, tenancyId: string, t: VecoTenancy, today: string, summary: SyncSummary) {
  const { rows } = await client.query<{ id: string; amount: string; frequency: string; from: string }>(
    `SELECT id, amount::text, frequency::text, to_char(effective_from, 'YYYY-MM-DD') AS from
       FROM rent_schedules WHERE tenancy_id = $1 AND effective_to IS NULL`,
    [tenancyId],
  );
  const open = rows[0];
  const amount = t.rent.toFixed(2);
  if (open && Number(open.amount).toFixed(2) === amount && open.frequency === t.frequency) return;

  if (!open) {
    // A reactivated tenancy has only closed schedules: reopen the last one if the rent is the
    // same, otherwise start the new rent the day after it closed (periods must never overlap).
    const { rows: closed } = await client.query<{ id: string; amount: string; frequency: string; next: string }>(
      `SELECT id, amount::text, frequency::text, to_char(effective_to + 1, 'YYYY-MM-DD') AS next
         FROM rent_schedules WHERE tenancy_id = $1 ORDER BY effective_to DESC LIMIT 1`,
      [tenancyId],
    );
    const last = closed[0];
    if (last && Number(last.amount).toFixed(2) === amount && last.frequency === t.frequency) {
      await client.query('UPDATE rent_schedules SET effective_to = NULL WHERE id = $1', [last.id]);
      return;
    }
    const from = last ? (last.next > today ? last.next : today) : t.startDate;
    if (last) summary.rentChanges += 1;
    await client.query(
      `INSERT INTO rent_schedules (tenancy_id, amount, frequency, effective_from, reason)
       VALUES ($1, $2, $3, $4, 'veco sync')`,
      [tenancyId, amount, t.frequency, from],
    );
    return;
  }
  summary.rentChanges += 1;
  if (open.from >= today) {
    await client.query(`UPDATE rent_schedules SET amount = $2, frequency = $3, reason = 'veco sync' WHERE id = $1`, [
      open.id,
      amount,
      t.frequency,
    ]);
    return;
  }
  await client.query(`UPDATE rent_schedules SET effective_to = $2::date - 1 WHERE id = $1`, [open.id, today]);
  await client.query(
    `INSERT INTO rent_schedules (tenancy_id, amount, frequency, effective_from, reason)
     VALUES ($1, $2, $3, $4, 'veco sync: rent change')`,
    [tenancyId, amount, t.frequency, today],
  );
}

async function endMissingTenancies(client: PoolClient, presentTids: string[], today: string): Promise<number> {
  const { rowCount } = await client.query(
    `UPDATE tenancies SET status = 'ended', end_date = GREATEST(start_date, $2::date)
      WHERE status = 'active' AND NOT (tid = ANY($1::text[]))`,
    [presentTids, today],
  );
  // The lead tenant leaves with the tenancy; a reactivation reopens the link.
  await client.query(
    `UPDATE tenancy_tenants tt SET left_on = t.end_date
       FROM tenancies t
      WHERE tt.tenancy_id = t.id AND t.status = 'ended' AND tt.left_on IS NULL`,
  );
  await client.query(
    `UPDATE rent_schedules rs SET effective_to = GREATEST(rs.effective_from, t.end_date)
       FROM tenancies t
      WHERE rs.tenancy_id = t.id AND t.status = 'ended' AND rs.effective_to IS NULL`,
  );
  return rowCount ?? 0;
}

function mostCommon<T>(values: T[]): T {
  const counts = new Map<T, number>();
  for (const v of values) counts.set(v, (counts.get(v) ?? 0) + 1);
  return [...counts.entries()].sort((a, b) => b[1] - a[1])[0]![0];
}
