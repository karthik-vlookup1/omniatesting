/** Pure matching of a formatted intake line to an agentOS tenant: exact TID, normalised name and deposit-to. Never fuzzy. */
export type MatchStatus = 'matched' | 'name_mismatch' | 'deposit_mismatch' | 'unmatched';
export interface MatchCandidate { id: string; tid: string; forename: string; surname: string; depositTo: string; agentosRef: string }
export interface MatchLine { tid: string | null; payerName: string; depositTo: string }
export interface MatchDecision { status: MatchStatus; tenantId: string | null }
export type MatchCounts = Record<MatchStatus, number>;

export function normaliseText(s: string): string {
  return s.trim().toLowerCase().replace(/\s+/g, ' ');
}

export function expectedTenantName(t: Pick<MatchCandidate, 'tid' | 'forename' | 'surname'>): string {
  let rest = t.forename.trimStart();
  if (rest.startsWith(t.tid) && /^\s/.test(rest.slice(t.tid.length))) rest = rest.slice(t.tid.length);
  return normaliseText(`${rest} ${t.surname}`);
}

export function decideMatch(line: MatchLine, candidates: MatchCandidate[]): MatchDecision {
  const same = line.tid === null ? [] : candidates.filter((c) => c.tid === line.tid);
  if (same.length === 0) return { status: 'unmatched', tenantId: null };
  const payer = normaliseText(line.payerName);
  const hits = same.filter((c) => expectedTenantName(c) === payer);
  if (hits.length !== 1) {
    return { status: 'name_mismatch', tenantId: same.length === 1 ? same[0]!.id : null };
  }
  const hit = hits[0]!;
  if (normaliseText(line.depositTo) !== normaliseText(hit.depositTo)) {
    return { status: 'deposit_mismatch', tenantId: hit.id };
  }
  return { status: 'matched', tenantId: hit.id };
}
