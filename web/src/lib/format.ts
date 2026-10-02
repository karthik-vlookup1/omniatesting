import dayjs from 'dayjs';
import relativeTime from 'dayjs/plugin/relativeTime';
import 'dayjs/locale/en-gb';

dayjs.extend(relativeTime);
dayjs.locale('en-gb');

/**
 * Display formatting only. Amounts arrive from the server already calculated (Postgres numeric
 * comes over JSON as a string); these helpers never round, sum or otherwise change money.
 */
const EMPTY = '—';

const gbp = new Intl.NumberFormat('en-GB', {
  style: 'currency',
  currency: 'GBP',
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

const integer = new Intl.NumberFormat('en-GB', { maximumFractionDigits: 0 });

function toNumber(value: number | string | null | undefined): number | null {
  if (value === null || value === undefined || value === '') return null;
  const n = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(n) ? n : null;
}

/** £1,234.50 / −£12.00. Returns an em dash for missing values. */
export function formatMoney(value: number | string | null | undefined): string {
  const n = toNumber(value);
  return n === null ? EMPTY : gbp.format(n).replace('-', '−');
}

export function formatCount(value: number | null | undefined): string {
  return value === null || value === undefined ? EMPTY : integer.format(value);
}

/** Confidence 0..1 as a whole percentage: 0.95 → "95%". */
export function formatPercent(value: number | string | null | undefined): string {
  const n = toNumber(value);
  return n === null ? EMPTY : `${Math.round(n * 100)}%`;
}

/** 2 Oct 2026 */
export function formatDate(value: string | Date | null | undefined): string {
  if (!value) return EMPTY;
  const d = dayjs(value);
  return d.isValid() ? d.format('D MMM YYYY') : EMPTY;
}

/** 2 Oct 2026, 14:05 */
export function formatDateTime(value: string | Date | null | undefined): string {
  if (!value) return EMPTY;
  const d = dayjs(value);
  return d.isValid() ? d.format('D MMM YYYY, HH:mm') : EMPTY;
}

/** "3 minutes ago" */
export function formatRelative(value: string | Date | null | undefined, now?: Date): string {
  if (!value) return EMPTY;
  const d = dayjs(value);
  if (!d.isValid()) return EMPTY;
  return now ? d.from(now) : d.fromNow();
}

/** Turns `needs_review` into "Needs review" for labels that have no explicit mapping. */
export function humanize(value: string): string {
  const text = value.replace(/[_-]+/g, ' ').trim();
  return text.charAt(0).toUpperCase() + text.slice(1);
}

export { EMPTY as EMPTY_VALUE };
