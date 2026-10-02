import { humanize } from '../../lib/format';
import { AUTO_MATCH_THRESHOLD, type LineStatus, type LineStatusFilter, type Payer } from './types';

/** Status colours from FRONTEND_REFERENCE.md §7. Always shown with the label, never colour alone. */
export const LINE_STATUS: Record<LineStatus, { label: string; color: string }> = {
  matched: { label: 'Matched', color: 'green' },
  partially_matched: { label: 'Part matched', color: 'teal' },
  needs_review: { label: 'Needs review', color: 'yellow' },
  yet_to_take: { label: 'Yet to take', color: 'orange' },
  excluded: { label: 'Excluded', color: 'gray' },
  new: { label: 'New', color: 'blue' },
};

/** The status tabs of the review queue, in the reference's order. */
export const STATUS_FILTERS: { value: LineStatusFilter; label: string }[] = [
  { value: 'open', label: 'Open' },
  { value: 'needs_review', label: 'Needs review' },
  { value: 'yet_to_take', label: 'Yet to take' },
  { value: 'partially_matched', label: 'Part matched' },
  { value: 'matched', label: 'Matched' },
  { value: 'excluded', label: 'Excluded' },
];

export const PAYER_LABEL: Record<Payer, string> = {
  tenant: 'Tenant',
  council_hb: 'Council (Housing Benefit)',
  dwp_uc: 'DWP (Universal Credit)',
  other_third_party: 'Other third party',
};

const METHOD_LABEL: Record<string, string> = {
  tid_in_reference: 'TID in reference',
  ni_in_reference: 'NI number',
  payer_account: 'Remembered payer account',
  reference_rule: 'Reference rule',
  amount_and_name: 'Name and amount',
  remittance_line: 'Remittance',
  manual: 'Manual',
};

export function methodLabel(method: string): string {
  return METHOD_LABEL[method] ?? humanize(method);
}

/** ≥ 0.95 green (auto-match level), ≥ 0.6 yellow, else grey (FRONTEND_REFERENCE.md §5.6). */
export function confidenceColor(confidence: number): string {
  if (confidence >= AUTO_MATCH_THRESHOLD) return 'green';
  if (confidence >= 0.6) return 'yellow';
  return 'gray';
}

export const STATUS_FILTER_VALUES = STATUS_FILTERS.map((s) => s.value);
