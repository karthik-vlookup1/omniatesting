/** Safe SQL literals for the generated VECO batches. Every function throws on a value it cannot prove safe. */
export type ValueKind = 'guid' | 'str' | 'dt' | 'num' | 'bit';

const unsafe = (): never => {
  throw new Error('unsafe SQL value');
};

export function nstr(v: string | null): string {
  if (v === null) return 'NULL';
  if (typeof v !== 'string' || v.includes('\u0000')) return unsafe();
  return `N'${v.replace(/'/g, "''")}'`;
}

export function guid(v: string): string {
  if (typeof v !== 'string' || !/^[0-9A-F]{8}(-[0-9A-F]{4}){3}-[0-9A-F]{12}$/i.test(v)) return unsafe();
  return `'${v.toUpperCase()}'`;
}

export function dt(v: string): string {
  if (typeof v !== 'string' || !/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}$/.test(v)) return unsafe();
  return `'${v}'`;
}

export function num(v: string | number): string {
  const s = typeof v === 'number' ? String(v) : v;
  if (typeof s !== 'string' || !/^-?\d+(\.\d+)?$/.test(s)) return unsafe();
  return s;
}

export function bit(v: 0 | 1): string {
  if (v !== 0 && v !== 1) return unsafe();
  return String(v);
}

export const guidList = (pks: string[]): string => pks.map(guid).join(', ');
export const nstrList = (vs: string[]): string => vs.map((v) => nstr(v)).join(', ');

export function formatValue(kind: ValueKind, v: unknown): string {
  if (v === null || v === undefined) return 'NULL';
  switch (kind) {
    case 'guid':
      return guid(v as string);
    case 'str':
      return nstr(v as string);
    case 'dt':
      return dt(v as string);
    case 'num':
      return num(v as string | number);
    case 'bit':
      return bit(v as 0 | 1);
  }
}
