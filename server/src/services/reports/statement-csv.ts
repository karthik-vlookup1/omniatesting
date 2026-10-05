/**
 * Tenant rent statement CSV. The column order below is STABLE; append new columns at the end only.
 */
import { BOM, pounds } from '../export/statement-csv.js';
import type { TenantStatement } from './statement.service.js';

export const TENANT_STATEMENT_HEADER = ['TID', 'Tenant', 'Property', 'Payer', 'Date', 'Type', 'Description', 'Debit', 'Credit', 'Balance'] as const;

/** A CSV cell: quote when needed, and never let a spreadsheet read it as a formula. */
function cell(value: string): string {
  const safe = /^[=+\-@\t\r]/.test(value) && !/^-?\d+(\.\d+)?$/.test(value) ? `'${value}` : value;
  return /[",\r\n]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
}

const money = (p: number | null): string => (p === null ? '' : pounds(BigInt(p)));

export function buildTenantStatementCsv(s: TenantStatement): { csv: string; rows: number } {
  const head = [s.tenancy.tid, s.tenancy.tenant ?? '', s.tenancy.propertyRef ?? ''];
  const out: string[][] = [[...TENANT_STATEMENT_HEADER]];
  let rows = 0;
  for (const p of s.payers) {
    out.push([...head, p.label, s.from, 'Opening balance', '', '', '', money(p.openingPence)]);
    for (const l of p.lines) {
      out.push([...head, p.label, l.date, l.type, l.description, money(l.debitPence), money(l.creditPence), money(l.balancePence)]);
      rows++;
    }
    out.push([...head, p.label, s.to, 'Closing balance', '', '', '', money(p.closingPence)]);
  }
  return { csv: BOM + out.map((r) => r.map(cell).join(',')).join('\r\n') + '\r\n', rows };
}

export function statementFileName(s: TenantStatement, ext: 'csv' | 'pdf'): string {
  return `rent_statement_${s.tenancy.tid.replace(/[^A-Za-z0-9_-]/g, '_')}_${s.from}_${s.to}.${ext}`;
}
