/** Display helpers for the review queue. The API sends money as pound strings; maths stays on the server. */
import type { LineStatus, Payer } from './api';
import { PAYERS } from './api';

const GBP = new Intl.NumberFormat('en-GB', { style: 'currency', currency: 'GBP' });

export const money = (amount: string): string => GBP.format(Number(amount));

/** YYYY-MM-DD → DD/MM/YYYY without going through Date (no time-zone shifts). */
export const ukDate = (iso: string): string => {
  const [y, m, d] = iso.split('-');
  return y && m && d ? `${d}/${m}/${y}` : iso;
};

export const percent = (confidence: number): string => `${Math.round(confidence * 100)}%`;

export const confidenceColor = (confidence: number): string =>
  confidence >= 0.95 ? 'green' : confidence >= 0.6 ? 'yellow' : 'gray';

export const STATUS_LABEL: Record<LineStatus, string> = {
  new: 'New',
  needs_review: 'Needs review',
  yet_to_take: 'Yet to take',
  partially_matched: 'Part matched',
  matched: 'Matched',
  excluded: 'Excluded',
};

export const STATUS_COLOR: Record<LineStatus, string> = {
  new: 'blue',
  needs_review: 'yellow',
  yet_to_take: 'orange',
  partially_matched: 'teal',
  matched: 'green',
  excluded: 'gray',
};

export const payerLabel = (payer: Payer): string => PAYERS.find((p) => p.value === payer)?.label ?? payer;

const METHOD_LABEL: Record<string, string> = {
  tid_in_reference: 'TID in reference',
  ni_in_reference: 'NI number',
  payer_account: 'Known payer account',
  reference_rule: 'Reference rule',
  remittance_line: 'Remittance',
  amount_and_name: 'Amount and name',
  name_fuzzy: 'Similar name',
  manual: 'Manual',
};

export const methodLabel = (method: string): string => METHOD_LABEL[method] ?? method.replace(/_/g, ' ');
