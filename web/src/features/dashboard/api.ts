/** Dashboard API client: the aggregates, the tenant statement preview and the CSV/PDF downloads. */
import { useQuery } from '@tanstack/react-query';
import { ApiError, apiRequest, buildUrl, CSRF_HEADER, CSRF_HEADER_VALUE, type ApiErrorCode } from '../../lib/api';

export type PayerKey = 'tenant' | 'council_hb' | 'dwp_uc' | 'other_third_party';

export interface ImportsRow {
  files: number;
  lines: number;
  incoming: number;
  autoMatched: number;
  ratePct: number | null;
  lastUpload: string | null;
}
export interface ImportsBank extends ImportsRow {
  bankAccountId: string;
  code: string;
  accountName: string;
}
export interface BacklogCounts {
  new: number;
  needsReview: number;
  partiallyMatched: number;
  yetToTake: number;
  backlog: number;
  oldestDays: number | null;
}
export interface Dashboard {
  date: string;
  imports: { banks: ImportsBank[]; total: ImportsRow };
  backlog: BacklogCounts & { banks: (BacklogCounts & { code: string })[] };
  balances: { payer: PayerKey | 'total'; accounts: number; arrearsPence: number; creditPence: number; netPence: number }[];
  ageing: {
    payer: PayerKey | 'total';
    d0_30: number;
    d31_60: number;
    d61_90: number;
    d91Plus: number;
    totalPence: number;
    accountsInArrears: number;
  }[];
}

export interface StatementPayer {
  payer: PayerKey;
  label: string;
  openingPence: number;
  chargesPence: number;
  paymentsPence: number;
  reversalsPence: number;
  adjustmentsPence: number;
  closingPence: number;
  lines: {
    date: string;
    type: 'Rent charge' | 'Adjustment' | 'Payment' | 'Reversal';
    description: string;
    debitPence: number | null;
    creditPence: number | null;
    balancePence: number;
  }[];
}
export interface TenantStatement {
  tenancy: { id: string; tid: string; tenant: string | null; propertyRef: string | null; branch: string | null; chargesFrom: string };
  from: string;
  to: string;
  generatedAt: string;
  payers: StatementPayer[];
}

export interface Downloaded {
  fileName: string;
  rows: number;
}

export const PAYER_LABEL: Record<PayerKey | 'total', string> = {
  tenant: 'Tenant',
  council_hb: 'Council (HB)',
  dwp_uc: 'DWP (UC)',
  other_third_party: 'Other third party',
  total: 'Total',
};

const money = new Intl.NumberFormat('en-GB', { style: 'currency', currency: 'GBP' });
export const gbp = (pence: number): string => money.format(pence / 100);

export function useDashboard() {
  return useQuery({
    queryKey: ['dashboard'],
    queryFn: ({ signal }) => apiRequest<Dashboard>('/reports/dashboard', { signal }),
    refetchInterval: 60000,
  });
}

export function useTenantStatement(tid: string, from: string, to: string, enabled: boolean) {
  return useQuery({
    queryKey: ['tenant-statement', tid, from, to],
    queryFn: ({ signal }) =>
      apiRequest<TenantStatement>(`/reports/statement/${encodeURIComponent(tid)}`, { query: { from, to }, signal }),
    enabled,
    retry: false,
  });
}

/** Fetches the CSV or PDF and hands it to the browser as a download. */
export async function downloadTenantStatement(tid: string, from: string, to: string, format: 'csv' | 'pdf'): Promise<Downloaded> {
  const res = await fetch(buildUrl(`/reports/statement/${encodeURIComponent(tid)}/${format}`, { from, to }), {
    method: 'GET',
    credentials: 'same-origin',
    headers: { [CSRF_HEADER]: CSRF_HEADER_VALUE, 'Content-Type': 'application/json' },
  });
  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as { error?: { code?: string; message?: string } };
    throw new ApiError({
      status: res.status,
      code: (body.error?.code as ApiErrorCode | undefined) ?? (res.status >= 500 ? 'internal' : 'unknown'),
      message: body.error?.message ?? 'Download failed',
    });
  }
  const fileName = /filename="([^"]+)"/.exec(res.headers.get('Content-Disposition') ?? '')?.[1] ?? `rent_statement.${format}`;
  const url = URL.createObjectURL(await res.blob());
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  return { fileName, rows: Number(res.headers.get('X-Statement-Rows') ?? 0) };
}
