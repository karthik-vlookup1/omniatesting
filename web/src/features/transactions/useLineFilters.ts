import { useCallback, useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
import { PAGE_SIZE, STATUS_FILTER_VALUES, type LineStatusFilter, type LinesQuery } from '../../data/transactions';

export interface LineFilters {
  status: LineStatusFilter;
  bankAccountId: string | null;
  batchId: string | null;
  page: number;
  /** The line open in the drawer. */
  lineId: string | null;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Filters live in the URL (FRONTEND_REFERENCE.md §6.1) so a view can be shared or bookmarked:
 * ?status=&bank=&batchId=&page=&line=. Unknown or malformed values fall back to defaults instead of
 * reaching the API as a 400.
 */
export function useLineFilters() {
  const [params, setParams] = useSearchParams();

  const filters = useMemo<LineFilters>(() => {
    const status = params.get('status');
    const bank = params.get('bank');
    const batch = params.get('batchId');
    const page = Number(params.get('page'));
    return {
      status: STATUS_FILTER_VALUES.includes(status as LineStatusFilter) ? (status as LineStatusFilter) : 'open',
      bankAccountId: bank && UUID.test(bank) ? bank : null,
      batchId: batch && UUID.test(batch) ? batch : null,
      page: Number.isInteger(page) && page > 0 ? page : 1,
      lineId: params.get('line'),
    };
  }, [params]);

  const update = useCallback(
    (patch: Partial<LineFilters>, options?: { replace?: boolean }) => {
      setParams(
        (prev) => {
          const next = new URLSearchParams(prev);
          const set = (key: string, value: string | null | undefined, fallback?: string) => {
            if (value === null || value === undefined || value === fallback) next.delete(key);
            else next.set(key, value);
          };
          if ('status' in patch) set('status', patch.status, 'open');
          if ('bankAccountId' in patch) set('bank', patch.bankAccountId);
          if ('batchId' in patch) set('batchId', patch.batchId);
          if ('page' in patch) set('page', patch.page ? String(patch.page) : null, '1');
          if ('lineId' in patch) set('line', patch.lineId);
          // Changing what is listed starts again at page 1.
          if (('status' in patch || 'bankAccountId' in patch || 'batchId' in patch) && !('page' in patch)) next.delete('page');
          return next;
        },
        { replace: options?.replace },
      );
    },
    [setParams],
  );

  const query = useMemo<LinesQuery>(
    () => ({
      status: filters.status,
      bankAccountId: filters.bankAccountId ?? undefined,
      batchId: filters.batchId ?? undefined,
      limit: PAGE_SIZE,
      offset: (filters.page - 1) * PAGE_SIZE,
    }),
    [filters.status, filters.bankAccountId, filters.batchId, filters.page],
  );

  return { filters, query, update };
}
