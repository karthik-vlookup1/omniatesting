/**
 * Mirrors Omnia_recon-backend server/src/services/tenancy/tenancy.service.ts and
 * jobs/veco-sync/sync.ts (FRONTEND_REFERENCE.md §5.3).
 */

export type TenancyStatus = 'pending' | 'active' | 'ended';
/** Management status code; drives the Xero ledger code. Shown as the code itself. */
export type ManagementType = 'RG' | 'MG' | 'IRG';
export type TenancyStatusFilter = 'active' | 'ended' | 'all';

export interface TenancySummary {
  tid: string;
  status: TenancyStatus;
  startDate: string;
  endDate: string | null;
  managementType: ManagementType;
  tenantName: string | null;
  /** e.g. "•••••12C" — the only NI form search results ever carry. */
  niMasked: string | null;
  propertyRef: string;
  unitRef: string | null;
  postcode: string;
  address: string;
  branchCode: string;
  /** Rent amount is a string in pounds. */
  rent: { amount: string; frequency: string } | null;
}

export interface TenancyDetail extends TenancySummary {
  /** Full NI number: present only for admin / accounts, and only when one is on file. */
  ni?: string;
}

export interface SyncSummary {
  dryRun: boolean;
  fetched: number;
  rejected: { tid: string | null; reason: string }[];
  branches?: { inserted: number };
  properties?: { inserted: number; updated: number };
  units?: { inserted: number };
  tenants: { inserted: number; updated: number };
  tenancies: { inserted: number; updated: number; reactivated: number; ended: number };
  rentChanges: number;
  ni: { missing: number; invalid: number; conflicts: number };
  namesMissing: number;
  managementType: { IRG: number; RG: number; defaultedToRG: number };
}

/** The server caps a search at 50 results (SEARCH_LIMIT). */
export const TENANCY_SEARCH_LIMIT = 50;
/** Server limit on the search text. */
export const TENANCY_QUERY_MAX = 100;
