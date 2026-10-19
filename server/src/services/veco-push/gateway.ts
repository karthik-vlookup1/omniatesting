/**
 * The only door to VECO. Every call is a read (SELECT) except insertReceipts and deleteReceipts, whose SQL
 * carries its own DB_NAME() guard. Anything that is not the test database is refused.
 */
import type { SqlBatchRunner, SqlSource } from '../../jobs/veco-sync/mcp-client.js';
import { AppError } from '../../lib/errors.js';
import type { TenantLookupRow } from './classify.js';
import type { BuiltRow } from './row-builder.js';
import { TARGET_DB } from './settings.js';
import {
  dbNameSql,
  deleteBatchSql,
  insertBatchSql,
  lookupSql,
  readBackSql,
  remainingSql,
  staffByEmailSql,
  staffExistsSql,
} from './sql-batches.js';

export interface RemainingCounts {
  transactions: number;
  allocations: number;
  total: string;
}

export interface VecoGateway {
  /** Refuses (409 wrong_database) unless the connection is on the test database. */
  assertTargetDb(): Promise<void>;
  findStaffByEmail(email: string): Promise<string[]>;
  staffExists(staffPk: string): Promise<boolean>;
  lookupTenants(tids: string[]): Promise<TenantLookupRow[]>;
  insertReceipts(rows: BuiltRow[]): Promise<void>;
  readBack(tx: string[], al: string[]): Promise<Record<string, unknown>[]>;
  deleteReceipts(tx: string[], al: string[]): Promise<void>;
  countRemaining(tx: string[], al: string[]): Promise<RemainingCounts>;
}

export const wrongDatabase = (found: string): AppError =>
  new AppError('conflict', `VECO push is locked to ${TARGET_DB}; this connection is on a different database`, {
    reason: 'wrong_database',
    found: found.slice(0, 60),
  });

const bad = (what: string): never => {
  throw new Error(`VECO returned an unexpected ${what}`);
};
const str = (v: unknown, what: string): string => (typeof v === 'string' ? v : bad(what));
const strOrNull = (v: unknown, what: string): string | null =>
  v === null || v === undefined ? null : typeof v === 'string' ? v : bad(what);
const int = (v: unknown, what: string): number => (typeof v === 'number' && Number.isFinite(v) ? v : bad(what));
const flag = (v: unknown): boolean => v === true || v === 1;

function chunk<T>(items: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

/** Every VECO read must start with SELECT: the RW MCP returns rows only then. */
export function assertSelect(sql: string): string {
  if (!/^SELECT\s/i.test(sql)) throw new Error('VECO read must start with SELECT');
  return sql;
}

export function createSqlGateway(sql: SqlSource & SqlBatchRunner, targetDb: string = TARGET_DB): VecoGateway {
  if (targetDb !== TARGET_DB) throw new Error('VECO push can only be pointed at the test database');
  return {
    async assertTargetDb() {
      const rows = await sql.queryRows(assertSelect(dbNameSql()));
      const db = rows[0]?.db;
      if (db !== targetDb) throw wrongDatabase(typeof db === 'string' ? db : 'unknown');
    },
    async findStaffByEmail(email) {
      const rows = await sql.queryRows(assertSelect(staffByEmailSql(email)));
      return rows.map((r) => str(r.staffPk, 'StaffPK').toUpperCase());
    },
    async staffExists(staffPk) {
      const rows = await sql.queryRows(assertSelect(staffExistsSql(staffPk)));
      return int(rows[0]?.n, 'count') > 0;
    },
    async lookupTenants(tids) {
      const out: TenantLookupRow[] = [];
      for (const group of chunk([...new Set(tids)], 500)) {
        const rows = await sql.queryRows(assertSelect(lookupSql(group)));
        for (const r of rows) {
          const up = (v: unknown, what: string) => strOrNull(v, what)?.toUpperCase() ?? null;
          out.push({
            tid: str(r.tid, 'TID'),
            tenancyFk: up(r.tenancyFk, 'TenancyFK'),
            contactFk: up(r.contactFk, 'ContactFK'),
            propertyFk: up(r.propertyFk, 'PropertyFK'),
            officeName: strOrNull(r.officeName, 'office name'),
            ownerCount: int(r.ownerCount ?? 0, 'owner count'),
            ownerFk: up(r.ownerFk, 'OwnerFK'),
            officeCount: int(r.officeCount ?? 0, 'office count'),
            officeFk: up(r.officeFk, 'OfficePK'),
            delayPayment: flag(r.delayPayment),
            addressTitle: strOrNull(r.addressTitle, 'contact name'),
            lastDescription: strOrNull(r.lastDescription, 'description'),
            lastDepartment: strOrNull(r.lastDepartment, 'department'),
          });
        }
      }
      return out;
    },
    async insertReceipts(rows) {
      // The batch returns no rows: success is proved only by readBack, never by this call.
      await sql.executeBatch(insertBatchSql(rows));
    },
    async readBack(tx, al) {
      return sql.queryRows(assertSelect(readBackSql(tx, al)));
    },
    async deleteReceipts(tx, al) {
      // The batch returns no rows: success is proved only by countRemaining, never by this call.
      await sql.executeBatch(deleteBatchSql(tx, al));
    },
    async countRemaining(tx, al) {
      const r = (await sql.queryRows(assertSelect(remainingSql(tx, al))))[0] ?? {};
      return {
        transactions: int(r.transactions, 'count'),
        allocations: int(r.allocations, 'count'),
        total: Number(int(r.total ?? 0, 'total')).toFixed(2),
      };
    },
  };
}
