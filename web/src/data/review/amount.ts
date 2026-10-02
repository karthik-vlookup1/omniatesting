/**
 * Input checks for a part-payment amount, done on exact pence (never floats). This only validates
 * what was typed; the server decides what is allowed and does all allocation.
 */
export const AMOUNT_PATTERN = /^\d{1,10}(\.\d{1,2})?$/;

export function toPence(value: string): number | null {
  const v = value.trim();
  if (!AMOUNT_PATTERN.test(v)) return null;
  const [pounds = '0', pence = ''] = v.split('.');
  return Number(pounds) * 100 + Number(pence.padEnd(2, '0'));
}

/** Error text for an amount field, or null. `remaining` is the server's string, e.g. "450.00". */
export function amountError(value: string, remaining: string): string | null {
  const pence = toPence(value);
  if (pence === null) return 'Enter pounds and pence, e.g. 325.00';
  if (pence === 0) return 'Enter an amount above £0.00';
  const max = toPence(remaining.replace(/^-/, ''));
  if (max !== null && pence > max) return `Cannot be more than the £${remaining} remaining`;
  return null;
}
