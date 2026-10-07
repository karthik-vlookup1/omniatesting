import type { RentAccount } from '../rent-terms/api';
import type { ReceiptSummary } from '../receipts/api';

/**
 * Display helpers for the tenant record (plans/recon-601.md). They only pick and add up figures
 * the server already returned; no rent, arrears or allocation rule is computed here.
 */

export type RecordView = 'overview' | 'details' | 'account' | 'receipts' | 'adjustments' | 'payers' | 'terms' | 'statement';
export type DetailsTab = 'personal' | 'bank' | 'tenancy' | 'chasing';
export type RentAction = 'rent' | 'award' | 'split' | 'method';

export const RECORD_VIEWS: RecordView[] = ['overview', 'details', 'account', 'receipts', 'adjustments', 'payers', 'terms', 'statement'];
export const DETAILS_TABS: DetailsTab[] = ['personal', 'bank', 'tenancy', 'chasing'];

export function parseView(value: string | null): RecordView {
  return RECORD_VIEWS.includes(value as RecordView) ? (value as RecordView) : 'overview';
}

export function parseDetailsTab(value: string | null): DetailsTab {
  return DETAILS_TABS.includes(value as DetailsTab) ? (value as DetailsTab) : 'personal';
}

/** Total of the server's per-payer balances (positive = owed, negative = in credit). */
export function totalBalancePence(account: RentAccount | undefined): number | null {
  if (!account) return null;
  return account.payers.reduce((sum, p) => sum + p.balancePence, 0);
}

/** The most recent active receipt on the page the server returned (newest date wins). */
export function lastReceipt(receipts: ReceiptSummary[] | undefined): ReceiptSummary | null {
  const active = (receipts ?? []).filter((r) => r.status === 'active');
  if (active.length === 0) return null;
  return active.reduce((best, r) => (r.receivedOn > best.receivedOn ? r : best));
}

/** The rent schedule in force today (effectiveFrom ≤ today < effectiveTo), else the latest one. */
export function currentSchedule(account: RentAccount | undefined, today: string): RentAccount['schedules'][number] | null {
  const schedules = account?.schedules ?? [];
  const live = schedules.filter((s) => s.effectiveFrom <= today && (s.effectiveTo === null || s.effectiveTo >= today));
  const pool = live.length > 0 ? live : schedules;
  if (pool.length === 0) return null;
  return pool.reduce((best, s) => (s.effectiveFrom > best.effectiveFrom ? s : best));
}

/** The latest due date the server has charged up to (for "Date of last rent due"). */
export function lastDuePeriod(account: RentAccount | undefined): RentAccount['periods'][number] | null {
  const periods = account?.periods ?? [];
  if (periods.length === 0) return null;
  return periods.reduce((best, p) => (p.dueDate > best.dueDate ? p : best));
}

/** "T6568" -> "6568": agentOS uses bare 4-digit TIDs (server/src/api/agentos/routes.ts). */
export function agentosTid(tid: string): string {
  return tid.replace(/^T/i, '');
}

export function todayIso(now = new Date()): string {
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
}
