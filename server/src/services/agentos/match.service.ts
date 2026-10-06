/** Matches every line of an intake batch to an agentOS tenant. Runs inside the upload transaction. */
import type { PoolClient } from '../../db/pool.js';
import { decideMatch, type MatchCandidate, type MatchCounts } from '../../domain/agentos/match.js';

export async function matchIntakeBatch(c: PoolClient, batchId: string): Promise<MatchCounts> {
  const { rows: lines } = await c.query<{ id: string; tid_raw: string | null; payer_name: string; deposit_to: string }>(
    'SELECT id, tid_raw, payer_name, deposit_to FROM agentos_intake_lines WHERE batch_id = $1 ORDER BY line_no',
    [batchId],
  );
  const tids = [...new Set(lines.map((l) => l.tid_raw).filter((t): t is string => t !== null))];
  const byTid = new Map<string, MatchCandidate[]>();
  if (tids.length > 0) {
    const { rows } = await c.query<{ id: string; tid: string; forename: string; surname: string; deposit_to: string; agentos_ref: string }>(
      `SELECT id, tid, forename, surname, deposit_to, agentos_ref FROM agentos_tenants
        WHERE tid = ANY($1::text[]) ORDER BY agentos_ref`,
      [tids],
    );
    for (const r of rows) {
      const list = byTid.get(r.tid) ?? [];
      list.push({ id: r.id, tid: r.tid, forename: r.forename, surname: r.surname, depositTo: r.deposit_to, agentosRef: r.agentos_ref });
      byTid.set(r.tid, list);
    }
  }

  const counts: MatchCounts = { matched: 0, name_mismatch: 0, deposit_mismatch: 0, unmatched: 0 };
  const ids: string[] = [];
  const statuses: string[] = [];
  const tenantIds: (string | null)[] = [];
  for (const l of lines) {
    const d = decideMatch(
      { tid: l.tid_raw, payerName: l.payer_name, depositTo: l.deposit_to },
      l.tid_raw === null ? [] : (byTid.get(l.tid_raw) ?? []),
    );
    counts[d.status]++;
    ids.push(l.id);
    statuses.push(d.status);
    tenantIds.push(d.tenantId);
  }
  if (ids.length > 0) {
    await c.query(
      `UPDATE agentos_intake_lines l
          SET match_status = v.status, agentos_tenant_id = v.tenant_id, updated_at = now()
         FROM unnest($1::uuid[], $2::text[], $3::uuid[]) AS v(id, status, tenant_id)
        WHERE l.id = v.id`,
      [ids, statuses, tenantIds],
    );
  }
  return counts;
}
