/**
 * Money in whole pence. Postgres numeric(12,2) arrives as text ('650.00') and is turned into
 * integer pence by string handling only, so no amount ever passes through a float.
 */
export type RentFrequency = 'weekly' | 'fortnightly' | 'four_weekly' | 'monthly' | 'quarterly';

export const FREQUENCIES = ['weekly', 'fortnightly', 'four_weekly', 'monthly', 'quarterly'] as const;

export const PERIODS_PER_YEAR: Record<RentFrequency, number> = {
  weekly: 52,
  fortnightly: 26,
  four_weekly: 13,
  monthly: 12,
  quarterly: 4,
};

/** '650', '650.5', '650.50', '-1.20' -> pence. Throws on anything else (e.g. three decimals). */
export function toPence(numericText: string): number {
  const m = /^(-)?(\d{1,10})(?:\.(\d{1,2}))?$/.exec(numericText.trim());
  if (!m) throw new Error(`Not a money amount: ${numericText}`);
  const pence = Number(m[2]) * 100 + Number((m[3] ?? '').padEnd(2, '0') || '0');
  return m[1] ? -pence : pence;
}

/** The same money over another rent cycle, rounded half up to the penny. 5000 weekly -> 21667 monthly. */
export function convertPence(pence: number, from: RentFrequency, to: RentFrequency): number {
  if (from === to) return pence;
  return Math.floor((2 * pence * PERIODS_PER_YEAR[from] + PERIODS_PER_YEAR[to]) / (2 * PERIODS_PER_YEAR[to]));
}
