/** Compares what Omnia Recon sent with what VECO now holds, column by column (30 Transaction + 7 Allocation values). */
import {
  ALLOCATION_KINDS,
  TRANSACTION_KINDS,
  type FilledAllocationColumn,
  type FilledTransactionColumn,
} from './columns.js';
import type { ValueKind } from './sql-literal.js';

export interface StoredItem {
  receiptId: string;
  transactionPk: string;
  allocationPk: string;
  tid: string;
  amount: string;
  paymentDate: string;
  sourceBank: string;
  bankingRef: string;
  /** The Transaction values as sent. */
  vecoRow: Record<string, unknown>;
  /** The Allocation values as sent. */
  allocationRow: Record<string, unknown>;
  /** From Omnia Recon (VECO's own columns for these are unverified). */
  property: string | null;
  landlord: string | null;
}

export interface BankTotal {
  bank: string;
  count: number;
  total: string;
}

export interface Totals {
  count: number;
  total: string;
  byBank: BankTotal[];
}

export interface CrossCheckRow {
  receiptId: string;
  transactionPk: string;
  tid: string;
  date: string;
  tenantName: string | null;
  property: string | null;
  landlord: string | null;
  department: string | null;
  amount: string;
  bankingRef: string;
  ok: boolean;
  diffs: string[];
}

export interface VerifyResult {
  ok: boolean;
  checkedAt: string;
  rows: CrossCheckRow[];
  before: Totals;
  after: Totals;
}

export function normalise(kind: ValueKind, v: unknown): string | null {
  if (v === null || v === undefined) return null;
  switch (kind) {
    case 'guid':
      return String(v).toUpperCase();
    case 'num':
      return Number(v).toFixed(2);
    case 'bit':
      return v === true || v === 1 || v === '1' || v === 'true' ? '1' : '0';
    case 'dt': {
      const m = /^(\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d)(?:\.(\d+))?$/.exec(String(v));
      return m ? `${m[1]}.${(m[2] ?? '').padEnd(3, '0').slice(0, 3)}` : String(v);
    }
    case 'str':
      return String(v);
  }
}

const pence = (a: string): number => Math.round(Number(a) * 100);
const pounds = (p: number): string => (p / 100).toFixed(2);

export function totalsOf(entries: { bank: string; amount: string }[]): Totals {
  const byBank = new Map<string, { count: number; pence: number }>();
  let all = 0;
  for (const e of entries) {
    const cur = byBank.get(e.bank) ?? { count: 0, pence: 0 };
    cur.count += 1;
    cur.pence += pence(e.amount);
    byBank.set(e.bank, cur);
    all += pence(e.amount);
  }
  return {
    count: entries.length,
    total: pounds(all),
    byBank: [...byBank.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([bank, v]) => ({ bank, count: v.count, total: pounds(v.pence) })),
  };
}

export function crossCheck(
  items: StoredItem[],
  readBack: Record<string, unknown>[],
  checkedAt: Date = new Date(),
): VerifyResult {
  const found = new Map<string, Record<string, unknown>>();
  for (const r of readBack) found.set(String(r.TransactionPK).toUpperCase(), r);

  const rows: CrossCheckRow[] = items.map((item) => {
    const got = found.get(item.transactionPk.toUpperCase());
    if (!got) {
      return {
        receiptId: item.receiptId,
        transactionPk: item.transactionPk,
        tid: item.tid,
        date: item.paymentDate,
        tenantName: null,
        property: item.property,
        landlord: item.landlord,
        department: null,
        amount: item.amount,
        bankingRef: item.bankingRef,
        ok: false,
        diffs: ['row missing'],
      };
    }
    const diffs: string[] = [];
    for (const [col, kind] of Object.entries(TRANSACTION_KINDS) as [FilledTransactionColumn, ValueKind][]) {
      if (normalise(kind, item.vecoRow[col]) !== normalise(kind, got[col])) diffs.push(col);
    }
    if (got.a_AllocationPK === null || got.a_AllocationPK === undefined) {
      diffs.push('Allocation row missing');
    } else {
      for (const [col, kind] of Object.entries(ALLOCATION_KINDS) as [FilledAllocationColumn, ValueKind][]) {
        if (normalise(kind, item.allocationRow[col]) !== normalise(kind, got[`a_${col}`])) diffs.push(`Allocation.${col}`);
      }
    }
    const amount = normalise('num', got.dblAmount);
    return {
      receiptId: item.receiptId,
      transactionPk: item.transactionPk,
      tid: String(got.strStandingOrderReference ?? item.tid),
      date: (normalise('dt', got.dteDate) ?? item.paymentDate).slice(0, 10),
      tenantName: typeof got.tenantName === 'string' ? got.tenantName : null,
      property: item.property,
      landlord: item.landlord,
      department: typeof got.strDepartment === 'string' ? got.strDepartment : null,
      amount: amount ?? item.amount,
      bankingRef: String(got.strBankingRef ?? item.bankingRef),
      ok: diffs.length === 0,
      diffs,
    };
  });

  const present = items.filter((i) => found.has(i.transactionPk.toUpperCase()));
  return {
    ok: rows.every((r) => r.ok),
    checkedAt: checkedAt.toISOString(),
    rows,
    before: totalsOf(items.map((i) => ({ bank: i.sourceBank, amount: i.amount }))),
    after: totalsOf(
      present.map((i) => ({
        bank: i.sourceBank,
        amount: normalise('num', found.get(i.transactionPk.toUpperCase())!.dblAmount) ?? '0.00',
      })),
    ),
  };
}
