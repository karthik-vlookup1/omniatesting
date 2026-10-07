import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react';

/**
 * LetMC-style "open record" tabs shown in the search strip (plans/recon-601.md). Opening a tenant
 * record adds a tab; the × closes it. This is a per-viewer convenience, so it lives in
 * sessionStorage (cleared with the browser session) and the app works the same without it.
 */
export interface RecordTab {
  /** Tenancy id, e.g. "6568" — also the route `/tenancies/:tid`. */
  tid: string;
  /** Short label, e.g. "6568 Jason Morgan". */
  label: string;
}

const STORAGE_KEY = 'omnia.recordTabs';
const MAX_TABS = 8;

interface RecordTabsValue {
  tabs: RecordTab[];
  open: (tab: RecordTab) => void;
  close: (tid: string) => void;
  clear: () => void;
}

const RecordTabsContext = createContext<RecordTabsValue | null>(null);

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

/** Outside the provider (e.g. isolated component tests) this is a harmless no-op. */
export function useRecordTabs(): RecordTabsValue {
  return useContext(RecordTabsContext) ?? NOOP;
}

const NOOP: RecordTabsValue = { tabs: [], open: () => {}, close: () => {}, clear: () => {} };
