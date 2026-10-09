/** agentOS tenant record as seeded from the synthetic fixture. TID = 4-digit prefix of Forename. */
export interface AgentosTenantInput {
  tid: string;
  agentosRef: string; // ten-<n>
  crmRef: string; // crm-<n>
  forename: string; // '<TID> <First>'
  surname: string;
  managedBy: string;
  residence: string;
  tenancyDescriptor: string;
  isHeadTenant: boolean;
  depositTo: string; // 'Will deposit to' client account
}

export interface AgentosTenant extends AgentosTenantInput {
  id: string;
  tenancyId: string | null;
}

export interface SeedRowError {
  line: number;
  field: string;
  reason: string;
}

export interface SeedResult {
  rows: number;
  created: number;
  updated: number;
  linked: number;
}

export class AgentosSeedError extends Error {
  constructor(public readonly errors: SeedRowError[]) {
    super(`agentOS seed rejected: ${errors.map((e) => `line ${e.line} ${e.field}: ${e.reason}`).join('; ')}`);
    this.name = 'AgentosSeedError';
  }
}

// ---- recon-509: read-only agentOS v4 API sync ----

/** agentOS maintenance TenantModel (fields we use). */
export interface ApiTenant {
  OID: string;
  TenancyOID: string | null;
  PropertyID: string | null;
  GlobalReference: string | null;
  Title: string | null;
  Forename: string | null;
  Surname: string | null;
  EmailAddress: string | null;
  MobileNumber: string | null;
  Landline: string | null;
  IsArchived: boolean | null;
}

/** agentOS ReportingTenancyModel (fields we use). TenancyPorpertyOID is spelled that way by the API. */
export interface ApiTenancy {
  OID: string;
  DisplayAddress: string | null;
  Address: {
    Address1?: string | null;
    Address2?: string | null;
    Address3?: string | null;
    Address4?: string | null;
    Postcode?: string | null;
  } | null;
  TenancyPorpertyOID: string | null;
  TermStartDate: string | null;
  TermEndDate: string | null;
  IsPeriodic: boolean | null;
  IsProposed: boolean | null;
  IsSigned: boolean | null;
  IsTenancyEnded: boolean | null;
  IsTenancyClosed: boolean | null;
  IsAbandoned: boolean | null;
  TenancyIsArchived: boolean | null;
}

/** agentOS TenancyDepositModel (fields we use). */
export interface ApiDeposit {
  OID: string;
  TenancyDetails: { TenantOID: string; TenantIsLeadTenant: boolean | null }[] | null;
}

export const SYNC_FLAGS = [
  'no_tid',
  'tid_only_forename',
  'tid_5_digit',
  'tid_shared_across_tenancies',
  'no_reporting_tenancy',
  'no_deposit_record',
  'lead_inferred',
  'gdpr_withheld',
] as const;
export type SyncFlag = (typeof SYNC_FLAGS)[number];

export interface SyncTenantRow {
  agentosOid: string;
  tenancyOid: string | null;
  propertyOid: string | null;
  globalReference: string | null;
  title: string | null;
  tid: string | null;
  forename: string;
  surname: string;
  email: string | null;
  phone: string | null;
  managedBy: string;
  residence: string;
  tenancyDescriptor: string;
  isHeadTenant: boolean;
  isArchived: boolean;
  flags: SyncFlag[];
}

export interface SyncReport {
  dryRun: boolean;
  fetched: { tenants: number; tenancies: number; deposits: number };
  created: number;
  updated: number;
  unchanged: number;
  seedDeleted: number;
  missingFromApi: number;
  flags: Record<SyncFlag, number>;
}

/** Thrown for non-2xx API answers. The message holds only the status and path: never the key or a body. */
export class AgentosApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly path: string,
  ) {
    super(`agentOS API request failed: HTTP ${status} on ${path}`);
    this.name = 'AgentosApiError';
  }
}

export class AgentosSyncError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'AgentosSyncError';
  }
}
