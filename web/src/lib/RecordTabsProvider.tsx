import { useCallback, useMemo, useState, type ReactNode } from 'react';
import { MAX_TABS, RecordTabsContext, STORAGE_KEY, type RecordTab } from './recordTabs';

/** Holds the open-record tabs for the signed-in frame (see recordTabs.ts). */
function load(): RecordTab[] {
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    const parsed: unknown = raw ? JSON.parse(raw) : [];
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter((t): t is RecordTab => typeof t?.tid === 'string' && typeof t?.label === 'string')
      .slice(0, MAX_TABS);
  } catch {
    return [];
  }
}

function save(tabs: RecordTab[]): void {
  try {
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(tabs));
  } catch {
    // Storage can be unavailable (private mode, blocked site data); tabs then last for this page only.
  }
}

export function RecordTabsProvider({ children }: { children: ReactNode }) {
  const [tabs, setTabs] = useState<RecordTab[]>(load);

  const update = useCallback((next: (prev: RecordTab[]) => RecordTab[]) => {
    setTabs((prev) => {
      const value = next(prev);
      save(value);
      return value;
    });
  }, []);

  const open = useCallback(
    (tab: RecordTab) =>
      update((prev) => {
        const existing = prev.find((t) => t.tid === tab.tid);
        if (existing) return existing.label === tab.label ? prev : prev.map((t) => (t.tid === tab.tid ? tab : t));
        // Newest last, like LetMC; the oldest tab drops off past the limit.
        return [...prev, tab].slice(-MAX_TABS);
      }),
    [update],
  );
  const close = useCallback((tid: string) => update((prev) => prev.filter((t) => t.tid !== tid)), [update]);
  const clear = useCallback(() => update(() => []), [update]);

  const value = useMemo(() => ({ tabs, open, close, clear }), [tabs, open, close, clear]);
  return <RecordTabsContext.Provider value={value}>{children}</RecordTabsContext.Provider>;
}

