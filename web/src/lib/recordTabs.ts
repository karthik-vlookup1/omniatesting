import { createContext, useContext } from 'react';

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

export const STORAGE_KEY = 'omnia.recordTabs';
export const MAX_TABS = 8;

export interface RecordTabsValue {
  tabs: RecordTab[];
  open: (tab: RecordTab) => void;
  close: (tid: string) => void;
  clear: () => void;
}

export const RecordTabsContext = createContext<RecordTabsValue | null>(null);

/** Outside the provider (e.g. isolated component tests) this is a harmless no-op. */
export function useRecordTabs(): RecordTabsValue {
  return useContext(RecordTabsContext) ?? NOOP;
}

const NOOP: RecordTabsValue = { tabs: [], open: () => {}, close: () => {}, clear: () => {} };
