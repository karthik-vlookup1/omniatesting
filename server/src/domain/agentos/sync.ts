/** Pure mapping of agentOS v4 API records to agentos_tenants rows. No IO. */
import {
  SYNC_FLAGS,
  type ApiDeposit,
  type ApiTenancy,
  type ApiTenant,
  type SyncFlag,
  type SyncTenantRow,
} from './types.js';

export interface ParsedTid {
  tid: string | null;
  firstName: string;
  flags: SyncFlag[];
}

export function parseTid(forename: string | null | undefined): ParsedTid {
  const text = (forename ?? '').trim();
  const m = /^T?(\d{4,5})(\s+|$)/.exec(text);
  if (!m) return { tid: null, firstName: text, flags: ['no_tid'] };
  const tid = m[1]!;
  const firstName = text.slice(m[0].length).trim();
  const flags: SyncFlag[] = [];
  if (firstName === '') flags.push('tid_only_forename');
  if (tid.length === 5) flags.push('tid_5_digit');
  return { tid, firstName, flags };
}

/** Forename without its leading TID, trimmed. */
export function stripTid(forename: string | null | undefined): string {
  return parseTid(forename).firstName;
}

const clean = (s: string | null | undefined): string | null => {
  const t = (s ?? '').trim();
  return t === '' ? null : t;
};

function ukDate(iso: string | null): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso ?? '');
  return m ? `${m[3]}/${m[2]}/${m[1]}` : 'Unknown';
}

export function normalisePhone(mobile: string | null | undefined, landline: string | null | undefined): string | null {
  const raw = clean(mobile) ?? clean(landline);
  if (raw === null) return null;
  const p = raw.replace(/\s+/g, '');
  return p.startsWith('+44') ? `0${p.slice(3)}` : p;
}

export function tenancyDescriptor(t: ApiTenancy | undefined): string {
  if (!t) return 'Unknown Tenancy';
  const status = t.IsAbandoned
    ? 'Abandoned'
    : t.IsTenancyClosed
      ? 'Closed'
      : t.IsTenancyEnded
        ? 'Ended'
        : t.IsSigned
          ? 'Signed'
          : t.IsProposed
            ? 'Proposed'
            : 'Unknown';
  const end = t.TermEndDate ? ukDate(t.TermEndDate) : 'No End Date';
  return `${status} Tenancy ${ukDate(t.TermStartDate)} - ${end}${t.IsPeriodic ? ' Periodic' : ''}`;
}

export function residence(t: ApiTenancy | undefined): string {
  if (!t) return '';
  const display = clean(t.DisplayAddress);
  if (display) return display;
  const a = t.Address;
  if (!a) return '';
  return [a.Address1, a.Address2, a.Address3, a.Address4, a.Postcode]
    .map(clean)
    .filter((x): x is string => x !== null)
    .join(', ');
}

export interface BuildOptions {
  managedBy: string;
  depositTo: string;
}

export function buildRows(
  tenants: ApiTenant[],
  tenancies: ApiTenancy[],
  deposits: ApiDeposit[],
  opts: BuildOptions,
): SyncTenantRow[] {
  const tenancyByOid = new Map(tenancies.map((t) => [t.OID, t]));
  const depositByOid = new Map(deposits.map((d) => [d.OID, d]));

  // tenants grouped per tenancy; a tenant without a tenancy forms its own group
  const groups = new Map<string, ApiTenant[]>();
  for (const t of tenants) {
    const key = t.TenancyOID ?? `none:${t.OID}`;
    const g = groups.get(key);
    if (g) g.push(t);
    else groups.set(key, [t]);
  }
  const leadOid = new Map<string, { oid: string; inferred: boolean }>();
  for (const [key, group] of groups) {
    const flagged = new Set(
      (depositByOid.get(key)?.TenancyDetails ?? []).filter((d) => d.TenantIsLeadTenant).map((d) => d.TenantOID),
    );
    const real = group.filter((t) => flagged.has(t.OID)).map((t) => t.OID).sort();
    if (real.length > 0) leadOid.set(key, { oid: real[0]!, inferred: false });
    else leadOid.set(key, { oid: group.map((t) => t.OID).sort()[0]!, inferred: true });
  }

  const tenanciesPerTid = new Map<string, Set<string>>();
  const parsed = new Map<string, ParsedTid>();
  for (const t of tenants) {
    const p = parseTid(t.Forename);
    parsed.set(t.OID, p);
    if (p.tid && t.TenancyOID) {
      const s = tenanciesPerTid.get(p.tid) ?? new Set<string>();
      s.add(t.TenancyOID);
      tenanciesPerTid.set(p.tid, s);
    }
  }

  return tenants.map((t) => {
    const p = parsed.get(t.OID)!;
    const key = t.TenancyOID ?? `none:${t.OID}`;
    const tenancy = t.TenancyOID ? tenancyByOid.get(t.TenancyOID) : undefined;
    const flags = new Set<SyncFlag>(p.flags);
    if (p.tid && (tenanciesPerTid.get(p.tid)?.size ?? 0) > 1) flags.add('tid_shared_across_tenancies');
    if (!tenancy) flags.add('no_reporting_tenancy');
    if (!depositByOid.has(key)) flags.add('no_deposit_record');
    const lead = leadOid.get(key)!;
    const isHead = lead.oid === t.OID;
    if (isHead && lead.inferred) flags.add('lead_inferred');
    if (t.Forename == null && t.Surname == null) flags.add('gdpr_withheld');
    return {
      agentosOid: t.OID,
      tenancyOid: t.TenancyOID ?? null,
      propertyOid: t.PropertyID ?? tenancy?.TenancyPorpertyOID ?? null,
      globalReference: clean(t.GlobalReference),
      title: clean(t.Title),
      tid: p.tid,
      forename: (t.Forename ?? '').trim(),
      surname: (t.Surname ?? '').trim(),
      email: clean(t.EmailAddress),
      phone: normalisePhone(t.MobileNumber, t.Landline),
      managedBy: opts.managedBy,
      residence: residence(tenancy),
      tenancyDescriptor: tenancyDescriptor(tenancy),
      isHeadTenant: isHead,
      depositTo: opts.depositTo,
      isArchived: t.IsArchived === true,
      flags: SYNC_FLAGS.filter((f) => flags.has(f)),
    };
  });
}
