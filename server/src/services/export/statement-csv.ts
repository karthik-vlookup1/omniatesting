/**
 * Filled-in bank statement CSV. The column order below is STABLE: Accounts' sheets and any
 * pivot over this file depend on it. Do not reorder; append new columns at the end only.
 */

/** A CSV cell: quote when needed, and never let a spreadsheet read it as a formula. */
function cell(value: string): string {
  const safe = /^[=+\-@\t\r]/.test(value) && !/^-?\d+(\.\d+)?$/.test(value) ? `'${value}` : value;
  return /[",\r\n]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
}

/** Pence as pounds with exactly two decimals ('-12.50'). */
export function pounds(pence: bigint): string {
  const neg = pence < 0n;
  const abs = neg ? -pence : pence;
  return `${neg ? '-' : ''}${abs / 100n}.${String(abs % 100n).padStart(2, '0')}`;
}

/** Never a literal BOM in source (editors and tools strip it). */
export const BOM = String.fromCharCode(0xfeff);

export const STATEMENT_HEADER = [
  'Bank',
  'Account',
  'Date',
  'Description',
  'Reference',
  'Counterparty',
  'Payer account',
  'Bank amount',
  'Status',
  'Exclusion reason',
  'Matched via',
  'TID in text',
  'Part',
  'TID',
  'Tenant',
  'Property',
  'Branch',
  'MG/RG',
  'Payer',
  'Receipt amount',
  'Receipt status',
  'Reversed reason',
  'Received on',
  'Xero',
  'Vico',
  'Left on line',
  'Note',
  'Line ID',
] as const;

/** One CSV row: exactly STATEMENT_HEADER.length strings, already formatted. */
export type StatementRow = string[];

export function buildStatementCsv(rows: StatementRow[]): string {
  const lines = [[...STATEMENT_HEADER] as string[], ...rows];
  return BOM + lines.map((l) => l.map(cell).join(',')).join('\r\n') + '\r\n';
}
