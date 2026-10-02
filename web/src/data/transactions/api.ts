import { apiRequest } from '../../lib/api';
import type { BankLine, LinesPage, LinesQuery } from './types';

/** Real endpoints: Omnia_recon-backend server/src/api/matching/routes.ts. */

export async function listLines(query: LinesQuery, signal?: AbortSignal): Promise<LinesPage> {
  return apiRequest<LinesPage>('/matching/lines', {
    signal,
    query: {
      status: query.status,
      bankAccountId: query.bankAccountId,
      batchId: query.batchId,
      limit: query.limit,
      offset: query.offset,
    },
  });
}

export async function getLine(id: string, signal?: AbortSignal): Promise<BankLine> {
  const { line } = await apiRequest<{ line: BankLine }>(`/matching/lines/${encodeURIComponent(id)}`, { signal });
  return line;
}
