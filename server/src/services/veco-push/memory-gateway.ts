/**
 * In-memory stand-in for VECO, used only by tests (never wired in main()). Behaves like the real batches:
 * an insert is all or nothing and refuses a primary key that already exists.
 */
import type { TenantLookupRow } from './classify.js';
import { ALLOCATION_FILLED_COLUMNS, TRANSACTION_FILLED_COLUMNS } from './columns.js';
import { wrongDatabase, type RemainingCounts, type VecoGateway } from './gateway.js';
import type { AllocationRow, BuiltRow, TransactionRow } from './row-builder.js';
import { TARGET_DB } from './settings.js';

export interface MemorySeed {
  dbName?: string;
  staff: { staffPk: string; email: string }[];
  lookups: TenantLookupRow[];
}

export interface MemoryGateway extends VecoGateway {
  dbName: string;
  transactions: Map<string, TransactionRow>;
  allocations: Map<string, AllocationRow>;
  /** One entry per gateway call that writes or reads rows: 'insert', 'delete:Allocation', 'delete:Transaction', ... */
  calls: string[];
  failNextInsert?: Error;
}

export function createMemoryGateway(seed: MemorySeed): MemoryGateway {
  const transactions = new Map<string, TransactionRow>();
  const allocations = new Map<string, AllocationRow>();
  const calls: string[] = [];
  const gw: MemoryGateway = {
    dbName: seed.dbName ?? TARGET_DB,
    transactions,
    allocations,
    calls,
    async assertTargetDb() {
      calls.push('assertTargetDb');
      if (gw.dbName !== TARGET_DB) throw wrongDatabase(gw.dbName);
    },
    async findStaffByEmail(email) {
      return seed.staff.filter((s) => s.email.toLowerCase() === email.toLowerCase()).map((s) => s.staffPk.toUpperCase());
    },
    async staffExists(pk) {
      return seed.staff.some((s) => s.staffPk.toUpperCase() === pk.toUpperCase());
    },
    async lookupTenants(tids) {
      calls.push('lookup');
      const wanted = new Set(tids.map((t) => t.trim().toUpperCase()));
      return seed.lookups.filter((l) => wanted.has(l.tid.trim().toUpperCase()));
    },
    async insertReceipts(rows) {
      calls.push('insert');
      if (gw.dbName !== TARGET_DB) throw wrongDatabase(gw.dbName);
      if (gw.failNextInsert) {
        const err = gw.failNextInsert;
        gw.failNextInsert = undefined;
        throw err;
      }
      for (const r of rows) {
        if (transactions.has(r.transactionPk) || allocations.has(r.allocationPk)) throw new Error('A primary key already exists');
      }
      for (const r of rows) {
        transactions.set(r.transactionPk, { ...r.tx });
        allocations.set(r.allocationPk, { ...r.alloc });
      }
    },
    async readBack(tx, al) {
      calls.push('readBack');
      const txSet = new Set(tx);
      const alSet = new Set(al);
      const out: Record<string, unknown>[] = [];
      for (const [pk, t] of transactions) {
        if (!txSet.has(pk)) continue;
        const a = [...allocations.entries()].find(([apk, row]) => alSet.has(apk) && row.DebitTransactionFK === pk)?.[1];
        const rec: Record<string, unknown> = {};
        for (const c of TRANSACTION_FILLED_COLUMNS) rec[c] = t[c];
        for (const c of ALLOCATION_FILLED_COLUMNS) rec[`a_${c}`] = a ? a[c] : null;
        rec.tenantName = seed.lookups.find((l) => l.contactFk === t.ContactFK)?.addressTitle ?? null;
        out.push(rec);
      }
      return out;
    },
    async deleteReceipts(tx, al) {
      if (gw.dbName !== TARGET_DB) throw wrongDatabase(gw.dbName);
      calls.push('delete:Allocation');
      for (const pk of al) allocations.delete(pk);
      calls.push('delete:Transaction');
      for (const pk of tx) transactions.delete(pk);
    },
    async countRemaining(tx, al): Promise<RemainingCounts> {
      calls.push('countRemaining');
      const txRows = tx.filter((pk) => transactions.has(pk));
      const cents = txRows.reduce((s, pk) => s + Math.round(Number(transactions.get(pk)!.dblAmount) * 100), 0);
      return {
        transactions: txRows.length,
        allocations: al.filter((pk) => allocations.has(pk)).length,
        total: (cents / 100).toFixed(2),
      };
    },
  };
  return gw;
}

export type { BuiltRow };
