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
