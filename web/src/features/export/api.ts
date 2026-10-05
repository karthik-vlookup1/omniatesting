/** Statement download API client: summary counts and the CSV file download. */
import { useQuery } from '@tanstack/react-query';
import { ApiError, apiRequest, buildUrl, CSRF_HEADER, CSRF_HEADER_VALUE, type ApiErrorCode } from '../../lib/api';

export const MAX_ROWS = 50000;

export const OUTCOMES = ['new', 'needs_review', 'yet_to_take', 'partially_matched', 'matched', 'excluded', 'outgoing'] as const;
export type Outcome = (typeof OUTCOMES)[number];

export interface StatementFilter {
  bankAccountId: string;
  from: string;
  to: string;
  status: string[];
}

export interface StatementSummary {
  lines: number;
  rows: number;
  byStatus: Record<Outcome, number>;
}

export interface Downloaded {
  fileName: string;
  rows: number;
}

const query = (f: StatementFilter) => ({
  bankAccountId: f.bankAccountId,
  from: f.from,
  to: f.to,
  status: f.status.length > 0 ? f.status.join(',') : undefined,
});

export function useStatementSummary(filter: StatementFilter) {
  return useQuery({
    queryKey: ['statement-summary', filter],
    queryFn: ({ signal }) =>
      apiRequest<StatementSummary>('/export/statement/summary', { query: query(filter), signal }),
    enabled: Boolean(filter.from && filter.to),
  });
}

/** Fetches the CSV and hands it to the browser as a download. */
export async function downloadStatement(filter: StatementFilter): Promise<Downloaded> {
  const res = await fetch(buildUrl('/export/statement.csv', query(filter)), {
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
  const fileName = /filename="([^"]+)"/.exec(res.headers.get('Content-Disposition') ?? '')?.[1] ?? 'statement.csv';
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
