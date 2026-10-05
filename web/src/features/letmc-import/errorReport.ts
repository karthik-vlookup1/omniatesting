import type { EntityType, ReportError } from './api';

const quote = (value: string | number): string => {
  const s = String(value);
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

/** The rejected rows as CSV: Row,Key,Field,Reason (fields with a comma or quote are quoted). */
export function toErrorCsv(errors: readonly ReportError[]): string {
  const lines = ['Row,Key,Field,Reason', ...errors.map((e) => [e.line, e.key, e.field, e.reason].map(quote).join(','))];
  return `${lines.join('\r\n')}\r\n`;
}

/** Saves the error report as `letmc-<type>-errors.csv` through a temporary download link. */
export function downloadErrorCsv(type: EntityType, errors: readonly ReportError[]): void {
  const url = URL.createObjectURL(new Blob([toErrorCsv(errors)], { type: 'text/csv;charset=utf-8' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = `letmc-${type}-errors.csv`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}
