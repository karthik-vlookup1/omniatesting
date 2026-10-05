/** Pounds typed by staff <-> whole pence. Parsing is by string split, so no float ever holds money. */
const POUNDS = /^\d{1,7}(\.\d{1,2})?$/;

/** '650' / '650.5' / '650.50' -> pence; null when it is not a valid amount. */
export function parsePounds(text: string): number | null {
  const t = text.trim().replace(/^£/, '');
  if (!POUNDS.test(t)) return null;
  const [pounds = '0', pennies = ''] = t.split('.');
  return Number(pounds) * 100 + Number(pennies.padEnd(2, '0') || '0');
}

const gbp = new Intl.NumberFormat('en-GB', { style: 'currency', currency: 'GBP', minimumFractionDigits: 2, maximumFractionDigits: 2 });

/** 21667 -> £216.67; negative -> -£12.00. */
export function formatPence(pence: number): string {
  const sign = pence < 0 ? '-' : '';
  const abs = Math.abs(pence);
  // Format whole pounds and pence separately so the division never rounds a penny.
  const pounds = Math.floor(abs / 100);
  const pennies = abs % 100;
  return sign + gbp.format(pounds).replace(/\.00$/, `.${String(pennies).padStart(2, '0')}`);
}
