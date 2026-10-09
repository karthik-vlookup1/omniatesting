/**
 * Matches every line of an intake batch to an agentOS tenant. Runs inside the upload transaction.
 * A TID means a council / third party paid; an NI or account reference (hash lookup in core) means
 * the tenant paid. The reference plaintext is never read here: only its stored hash is joined.
 */
import type { PoolClient } from '../../db/pool.js';
import {
  decideMatch,
  payerTypeFor,
  type LineKind,
  type MatchCandidate,
  type MatchCounts,
} from '../../domain/agentos/match.js';

export interface MatchBatchResult {
  counts: MatchCounts;
  unresolvedRefs: number;
}

interface Resolved { tids: Set<string>; names: Set<string> }

export async function matchIntakeBatch(c: PoolClient, batchId: string): Promise<MatchBatchResult> {
  const { rows: lines } = await c.query<{ id: string; tid_raw: string | null; ref_kind: 'ni' | 'account' | null }>(
    'SELECT id, tid_raw, ref_kind FROM agentos_intake_lines WHERE batch_id = $1 ORDER BY line_no',
    [batchId],
  );

  const resolved = new Map<string, Resolved>();
  const add = (rows: { id: string; tid: string; full_name: string | null }[]) => {
    for (const r of rows) {
      const e = resolved.get(r.id) ?? { tids: new Set<string>(), names: new Set<string>() };
      e.tids.add(r.tid);
      if (r.full_name) e.names.add(r.full_name);
      resolved.set(r.id, e);
    }
  };
  if (lines.some((l) => l.ref_kind === 'ni')) {
    const { rows } = await c.query<{ id: string; tid: string; full_name: string | null }>(
      `SELECT l.id, substr(t.tid, 2) AS tid, tn.full_name
         FROM agentos_intake_lines l
         JOIN tenants tn ON tn.ni_hash = l.ref_hash
         JOIN tenancy_tenants tt ON tt.tenant_id = tn.id AND tt.left_on IS NULL
         JOIN tenancies t ON t.id = tt.tenancy_id AND tenancy_live_on(t, l.received_on)
        WHERE l.batch_id = $1 AND l.ref_kind = 'ni'`,
      [batchId],
    );
    add(rows);
  }
  if (lines.some((l) => l.ref_kind === 'account')) {
    const { rows } = await c.query<{ id: string; tid: string; full_name: string | null }>(
      `SELECT l.id, substr(t.tid, 2) AS tid, tn.full_name
         FROM agentos_intake_lines l
         JOIN payer_bank_accounts p ON p.account_hash = l.ref_hash AND p.is_active AND p.tenancy_id IS NOT NULL
         JOIN tenancies t ON t.id = p.tenancy_id AND tenancy_live_on(t, l.received_on)
         LEFT JOIN tenants tn ON tn.id = p.tenant_id
        WHERE l.batch_id = $1 AND l.ref_kind = 'account'`,
      [batchId],
    );
    add(rows);
  }

  const wanted = new Set<string>();
  for (const l of lines) {
    if (l.tid_raw) wanted.add(l.tid_raw);
    for (const t of resolved.get(l.id)?.tids ?? []) wanted.add(t);
  }
  const byTid = new Map<string, MatchCandidate[]>();
  if (wanted.size > 0) {
    const { rows } = await c.query<{
      id: string; tid: string; forename: string; surname: string; agentos_ref: string | null;
      tenancy_oid: string | null; is_head_tenant: boolean;
    }>(
      `SELECT id, tid, forename, surname, agentos_ref, tenancy_oid, is_head_tenant FROM agentos_tenants
        WHERE tid = ANY($1::text[]) ORDER BY is_head_tenant DESC, agentos_ref NULLS LAST, id`,
      [[...wanted]],
    );
    for (const r of rows) {
      const list = byTid.get(r.tid) ?? [];
      list.push({
        id: r.id, tid: r.tid, forename: r.forename, surname: r.surname, agentosRef: r.agentos_ref ?? '',
        tenancyOid: r.tenancy_oid, isHeadTenant: r.is_head_tenant,
      });
      byTid.set(r.tid, list);
    }
  }

  const counts: MatchCounts = { matched: 0, ambiguous: 0, unmatched: 0 };
  let unresolvedRefs = 0;
  const ids: string[] = [];
  const statuses: string[] = [];
  const tenantIds: (string | null)[] = [];
  const payerTypes: (string | null)[] = [];
  for (const l of lines) {
    const kind: LineKind | null = l.ref_kind ?? (l.tid_raw !== null ? 'tid' : null);
    const res = resolved.get(l.id);
    if (l.ref_kind !== null && !res) unresolvedRefs++;
    const tids = new Set<string>(res?.tids ?? []);
    if (l.tid_raw !== null) tids.add(l.tid_raw);
    const candidates = [...tids].flatMap((t) => byTid.get(t) ?? []);
    const d = decideMatch({ kind, tids: [...tids], preferredNames: [...(res?.names ?? [])] }, candidates);
    counts[d.status]++;
    ids.push(l.id);
    statuses.push(d.status);
    tenantIds.push(d.tenantId);
    payerTypes.push(d.status === 'matched' ? payerTypeFor(kind) : null);
  }
  if (ids.length > 0) {
    await c.query(
      `UPDATE agentos_intake_lines l
          SET match_status = v.status, agentos_tenant_id = v.tenant_id, payer_type = v.payer_type, updated_at = now()
         FROM unnest($1::uuid[], $2::text[], $3::uuid[], $4::text[]) AS v(id, status, tenant_id, payer_type)
        WHERE l.id = v.id`,
      [ids, statuses, tenantIds, payerTypes],
    );
  }
  await c.query(
    'UPDATE agentos_intake_lines SET receiving_account_code = agentos_deposit_account(deposit_to) WHERE batch_id = $1',
    [batchId],
  );
  return { counts, unresolvedRefs };
}
