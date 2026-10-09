/**
 * Pure matching of a formatted intake line to an agentOS tenant, driven by who paid:
 * a TID means a council or third party paid; an NI / account reference means the tenant paid.
 * Payer name and deposit-to are never compared. Never fuzzy.
 */
export type MatchStatus = 'matched' | 'ambiguous' | 'unmatched';
export type LineKind = 'ni' | 'account' | 'tid';
export type PayerType = 'tenant' | 'third_party';
export interface MatchCandidate {
  id: string;
  tid: string;
  forename: string;
  surname: string;
  agentosRef: string;
  tenancyOid: string | null;
  isHeadTenant: boolean;
}
export interface MatchInput {
  kind: LineKind | null;
  tids: string[];
  preferredNames: string[];
}
export interface MatchDecision { status: MatchStatus; tenantId: string | null }
export type MatchCounts = Record<MatchStatus, number>;

export function payerTypeFor(kind: LineKind | null): PayerType | null {
  if (kind === null) return null;
  return kind === 'tid' ? 'third_party' : 'tenant';
}

export function normaliseText(s: string): string {
  return s.trim().toLowerCase().replace(/\s+/g, ' ');
}

export function expectedTenantName(t: Pick<MatchCandidate, 'tid' | 'forename' | 'surname'>): string {
  let rest = t.forename.trimStart();
  if (rest.startsWith(t.tid) && /^\s/.test(rest.slice(t.tid.length))) rest = rest.slice(t.tid.length);
  return normaliseText(`${rest} ${t.surname}`);
}

export function decideMatch(input: MatchInput, candidates: MatchCandidate[]): MatchDecision {
  const unmatched: MatchDecision = { status: 'unmatched', tenantId: null };
  const tids = [...new Set(input.tids)];
  if (input.kind === null || tids.length === 0) return unmatched;
  if (tids.length > 1) return { status: 'ambiguous', tenantId: null };
  const same = candidates.filter((c) => c.tid === tids[0]);
  if (same.length === 0) return unmatched;
  if (input.kind !== 'tid') {
    const names = new Set(input.preferredNames.map(normaliseText));
    const hits = same.filter((c) => names.has(expectedTenantName(c)));
    if (hits.length === 1) return { status: 'matched', tenantId: hits[0]!.id };
  }
  const oid = same[0]!.tenancyOid;
  if (same.length === 1 || (oid !== null && same.every((c) => c.tenancyOid === oid))) {
    const lead = same.find((c) => c.isHeadTenant) ?? same[0]!;
    return { status: 'matched', tenantId: lead.id };
  }
  return { status: 'ambiguous', tenantId: null };
}
