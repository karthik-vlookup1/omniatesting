/**
 * Read-only agentOS v4 -> agentos_tenants sync (source='api'). Never writes to agentOS and never
 * deletes api rows that vanish from the feed. A dry run does the full work and rolls it back.
 */
import type { Pool } from '../../db/pool.js';
import { buildRows } from '../../domain/agentos/sync.js';
import { AgentosSyncError, SYNC_FLAGS, type SyncFlag, type SyncReport } from '../../domain/agentos/types.js';
import type { AgentosClient } from './api-client.js';

export interface SyncOptions {
  dryRun: boolean;
  replaceSeed: boolean;
  managedBy?: string;
}

const T = 'agentos_tenants';
// Core stores tenancies as 'T1234' while agentOS gives the bare '1234'; both forms match.
// What an existing api row becomes on re-sync. Nulls and empty values never overwrite stored data.
const EFFECTIVE: Record<string, string> = {
  tenancy_oid: `COALESCE(EXCLUDED.tenancy_oid, ${T}.tenancy_oid)`,
  property_oid: `COALESCE(EXCLUDED.property_oid, ${T}.property_oid)`,
  global_reference: `COALESCE(EXCLUDED.global_reference, ${T}.global_reference)`,
  title: `COALESCE(EXCLUDED.title, ${T}.title)`,
  tid: `CASE WHEN EXCLUDED.forename = '' THEN ${T}.tid ELSE EXCLUDED.tid END`,
  forename: `CASE WHEN EXCLUDED.forename = '' THEN ${T}.forename ELSE EXCLUDED.forename END`,
  surname: `CASE WHEN EXCLUDED.surname = '' THEN ${T}.surname ELSE EXCLUDED.surname END`,
  email: `COALESCE(EXCLUDED.email, ${T}.email)`,
  phone: `COALESCE(EXCLUDED.phone, ${T}.phone)`,
  residence: `COALESCE(NULLIF(EXCLUDED.residence, ''), ${T}.residence)`,
  tenancy_descriptor: 'EXCLUDED.tenancy_descriptor',
  is_head_tenant: 'EXCLUDED.is_head_tenant',
  is_archived: 'EXCLUDED.is_archived',
  sync_flags: `CASE WHEN EXCLUDED.forename = '' THEN ${T}.sync_flags ELSE EXCLUDED.sync_flags END`,
  tenancy_id: `CASE WHEN EXCLUDED.forename = '' THEN ${T}.tenancy_id ELSE COALESCE(EXCLUDED.tenancy_id, ${T}.tenancy_id) END`,
};
const COLS = Object.keys(EFFECTIVE);
const UPSERT = `
INSERT INTO ${T} (agentos_oid, tenancy_oid, property_oid, global_reference, title, tid, forename, surname, email, phone,
                  managed_by, residence, tenancy_descriptor, is_head_tenant, is_archived, sync_flags,
                  source, tenancy_id, last_synced_at)
VALUES ($1,$2,$3,$4,$5,$6::text,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16::text[],
        'api', (SELECT id FROM tenancies WHERE tid IN ($6::text, 'T' || $6::text) ORDER BY tid LIMIT 1), now())
ON CONFLICT (agentos_oid) DO UPDATE SET
  ${COLS.map((c) => `${c} = ${EFFECTIVE[c]}`).join(',\n  ')},
  last_synced_at = now(), updated_at = now()
WHERE (${COLS.map((c) => `${T}.${c}`).join(', ')})
  IS DISTINCT FROM (${COLS.map((c) => EFFECTIVE[c]).join(', ')})
RETURNING (xmax = 0) AS inserted`;

export async function syncAgentosTenants(pool: Pool, api: AgentosClient, opts: SyncOptions): Promise<SyncReport> {
  const startedAt = new Date();
  const tenants = await api.listTenants();
  const tenancies = await api.listTenancies();
  const deposits = await api.listDeposits();
  const rows = buildRows(tenants, tenancies, deposits, { managedBy: opts.managedBy ?? 'Investing Solutions' });

  const flags = Object.fromEntries(SYNC_FLAGS.map((f) => [f, 0])) as Record<SyncFlag, number>;
  for (const r of rows) for (const f of r.flags) flags[f]++;

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const seedCount = Number(
      (await client.query<{ n: string }>(`SELECT count(*) AS n FROM ${T} WHERE source = 'seed'`)).rows[0]?.n ?? 0,
    );
    let seedDeleted = 0;
    if (seedCount > 0) {
      if (!opts.replaceSeed) throw new AgentosSyncError('seed rows present: rerun with --replace-seed');
      const { rows: refs } = await client.query<{ n: string }>(
        `SELECT (SELECT count(*) FROM agentos_intake_lines l JOIN ${T} t ON t.id = l.agentos_tenant_id WHERE t.source = 'seed')
              + (SELECT count(*) FROM agentos_journal_entries e JOIN ${T} t ON t.id = e.agentos_tenant_id WHERE t.source = 'seed') AS n`,
      );
      if (Number(refs[0]?.n ?? 0) > 0) {
        throw new AgentosSyncError('seed rows are referenced by intake lines or journal entries: cannot replace them');
      }
      seedDeleted = (await client.query(`DELETE FROM ${T} WHERE source = 'seed'`)).rowCount ?? 0;
    }

    let created = 0;
    let updated = 0;
    let unchanged = 0;
    for (const r of rows) {
      const { rows: res } = await client.query<{ inserted: boolean }>(UPSERT, [
        r.agentosOid, r.tenancyOid, r.propertyOid, r.globalReference, r.title, r.tid, r.forename, r.surname, r.email,
        r.phone, r.managedBy, r.residence, r.tenancyDescriptor, r.isHeadTenant, r.isArchived, r.flags,
      ]);
      if (res[0]?.inserted) created++;
      else if (res[0]) updated++;
      else unchanged++;
    }

    const missing = await client.query<{ n: string }>(
      `SELECT count(*) AS n FROM ${T} WHERE source = 'api' AND NOT (agentos_oid = ANY($1::text[]))`,
      [rows.map((r) => r.agentosOid)],
    );
    const report: SyncReport = {
      dryRun: opts.dryRun,
      fetched: { tenants: tenants.length, tenancies: tenancies.length, deposits: deposits.length },
      created,
      updated,
      unchanged,
      seedDeleted,
      missingFromApi: Number(missing.rows[0]?.n ?? 0),
      flags,
    };
    await client.query('INSERT INTO agentos_sync_runs (started_at, finished_at, counts) VALUES ($1, now(), $2)', [
      startedAt,
      JSON.stringify(report),
    ]);
    await client.query(opts.dryRun ? 'ROLLBACK' : 'COMMIT');
    return report;
  } catch (e) {
    await client.query('ROLLBACK').catch(() => undefined);
    throw e;
  } finally {
    client.release();
  }
}
