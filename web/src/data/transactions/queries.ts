import { keepPreviousData, useQuery, useQueryClient, type QueryClient } from '@tanstack/react-query';
import { getLine, listLines } from './api';
import type { BankLine, LinesPage, LinesQuery } from './types';

/** Everything under ['matching', 'lines'] is invalidated after any review action. */
export const linesKeys = {
  all: ['matching', 'lines'] as const,
  list: (q: LinesQuery) => ['matching', 'lines', 'list', q] as const,
  line: (id: string) => ['matching', 'lines', 'line', id] as const,
};

export function useLines(query: LinesQuery) {
  return useQuery({
    queryKey: linesKeys.list(query),
    queryFn: ({ signal }) => listLines(query, signal),
    // Keep the current page on screen while the next page or filter loads.
    placeholderData: keepPreviousData,
  });
}

/** One line, seeded from whichever list page already holds it so the drawer opens instantly. */
export function useLine(id: string | null) {
  const qc = useQueryClient();
  return useQuery({
    queryKey: linesKeys.line(id ?? ''),
    queryFn: ({ signal }) => getLine(id!, signal),
    enabled: Boolean(id),
    initialData: () => (id ? findCachedLine(qc, id) : undefined),
    initialDataUpdatedAt: () => (id ? qc.getQueryState(linesKeys.all)?.dataUpdatedAt : undefined),
  });
}

function findCachedLine(qc: QueryClient, id: string): BankLine | undefined {
  for (const [, page] of qc.getQueriesData<LinesPage>({ queryKey: [...linesKeys.all, 'list'] })) {
    const hit = page?.lines.find((l) => l.id === id);
    if (hit) return hit;
  }
  return undefined;
}

/** After an action: put the server's returned line everywhere it is cached, then refetch lists. */
export function applyLineUpdate(qc: QueryClient, line: BankLine): void {
  qc.setQueryData(linesKeys.line(line.id), line);
  qc.setQueriesData<LinesPage>({ queryKey: [...linesKeys.all, 'list'] }, (page) =>
    page ? { ...page, lines: page.lines.map((l) => (l.id === line.id ? line : l)) } : page,
  );
  void qc.invalidateQueries({ queryKey: [...linesKeys.all, 'list'] });
}
