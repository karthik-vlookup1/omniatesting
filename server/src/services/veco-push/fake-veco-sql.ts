/**
 * In-memory VECO that speaks SQL text: the same SqlSource / SqlBatchRunner the real MCP client offers, so the real
 * gateway and the real batch builders run against it. It enforces the MCP rules at text level: a write batch may
 * not contain BEGIN TRAN / COMMIT / plain ROLLBACK (error 3902), must start with the DB_NAME() guard, and a read
 * returns rows only if it starts with SELECT. It never touches a network.
 */
import { VecoSourceError, type SqlBatchRunner, type SqlSource } from '../../jobs/veco-sync/mcp-client.js';
import type { TenantLookupRow } from './classify.js';
import { ALLOCATION_FILLED_COLUMNS, TRANSACTION_FILLED_COLUMNS } from './columns.js';
import { TARGET_DB } from './settings.js';
import { GUARD } from './sql-batches.js';

export interface FakeSeed {
  dbName?: string;
  staff: { staffPk: string; email: string }[];
  lookups: TenantLookupRow[];
}

type Row = Record<string, unknown>;

export type FakeVecoSql = SqlSource &
  SqlBatchRunner & {
    dbName: string;
    transactions: Map<string, Row>;
    allocations: Map<string, Row>;
    /** One entry per read, named by its omnia tag. */
    calls: string[];
    batches: string[];
    failNextWrite?: Error;
  };

/** True when the SQL (outside string literals and comments) opens/ends a transaction the MCP already owns. */
export function forbiddenTransactionSql(sql: string): boolean {
  const bare = sql.replace(/N?'(?:[^']|'')*'/g, "''").replace(/\/\*[\s\S]*?\*\//g, ' ');
  return (
    /\bBEGIN\s+TRAN(SACTION)?\b/i.test(bare) ||
    /\bCOMMIT\b/i.test(bare) ||
    /\bROLLBACK\b(?!\s+TRAN(?:SACTION)?\s+\w)/i.test(bare)
  );
}

const fail = (code: number, msg: string): VecoSourceError => new VecoSourceError(`Veco query failed: (${code}) ${msg}`);
const GUID = /[0-9A-F]{8}(?:-[0-9A-F]{4}){3}-[0-9A-F]{12}/gi;
const guidsAfter = (sql: string, marker: string): string[] => {
  const at = sql.indexOf(marker);
  if (at < 0) return [];
  const end = sql.indexOf(')', at + marker.length);
  return (sql.slice(at + marker.length, end).match(GUID) ?? []).map((g) => g.toUpperCase());
};

/** Reads (...) tuples from `from` up to the first top-level ';'. */
function parseValues(text: string, from: number): unknown[][] {
  const tuples: unknown[][] = [];
  let i = from;
  let current: unknown[] | null = null;
  while (i < text.length) {
    const ch = text[i]!;
    if (current === null) {
      if (ch === ';') break;
      if (ch === '(') current = [];
      i++;
      continue;
    }
    if (/\s|,/.test(ch)) {
      i++;
    } else if (ch === ')') {
      tuples.push(current);
      current = null;
      i++;
    } else if (ch === "'" || (ch === 'N' && text[i + 1] === "'")) {
      i += ch === 'N' ? 2 : 1;
      let out = '';
      for (;;) {
        if (i >= text.length) throw new Error('fake VECO: unterminated string');
        if (text[i] === "'") {
          if (text[i + 1] === "'") {
            out += "'";
            i += 2;
            continue;
          }
          i++;
          break;
        }
        out += text[i++];
      }
      current.push(out);
    } else {
      const m = /^(NULL|-?\d+(?:\.\d+)?)/i.exec(text.slice(i, i + 40));
      if (!m) throw new Error('fake VECO: cannot read a value');
      current.push(m[1]!.toUpperCase() === 'NULL' ? null : Number(m[1]));
      i += m[1]!.length;
    }
  }
  return tuples;
}

export function createFakeVecoSql(seed: FakeSeed): FakeVecoSql {
  const transactions = new Map<string, Row>();
  const allocations = new Map<string, Row>();
  const calls: string[] = [];
  const batches: string[] = [];
  const fake: FakeVecoSql = {
    dbName: seed.dbName ?? TARGET_DB,
    transactions,
    allocations,
    calls,
    batches,
    async queryRows(sql) {
      if (!/^SELECT\b/i.test(sql.trimStart())) return [];
      const tag = /\/\* omnia:([a-z-]+) \*\//.exec(sql)?.[1];
      switch (tag) {
        case 'db':
          calls.push(tag);
          return [{ db: fake.dbName }];
        case 'staff': {
          calls.push(tag);
          const email = /strEmailAddress1 = N'((?:[^']|'')*)'/.exec(sql)?.[1]?.replace(/''/g, "'") ?? '';
          return seed.staff
            .filter((s) => s.email.toLowerCase() === email.toLowerCase())
            .map((s) => ({ staffPk: s.staffPk.toUpperCase() }));
        }
        case 'staff-exists': {
          calls.push(tag);
          const pk = (/StaffPK = '([^']+)'/.exec(sql)?.[1] ?? '').toUpperCase();
          return [{ n: seed.staff.filter((s) => s.staffPk.toUpperCase() === pk).length }];
        }
        case 'lookup': {
          calls.push(tag);
          const list = /strStandingOrderReference IN \(([\s\S]*)\)\s*$/.exec(sql)?.[1] ?? '';
          const wanted = new Set(
            [...list.matchAll(/N'((?:[^']|'')*)'/g)].map((m) => m[1]!.replace(/''/g, "'").trim().toUpperCase()),
          );
          return seed.lookups.filter((l) => wanted.has(l.tid.trim().toUpperCase())).map((l) => ({ ...l }));
        }
        case 'readback': {
          calls.push(tag);
          const tx = new Set(guidsAfter(sql, 't.TransactionPK IN ('));
          const al = new Set(guidsAfter(sql, 'a.AllocationPK IN ('));
          const out: Row[] = [];
          for (const [pk, t] of transactions) {
            if (!tx.has(pk)) continue;
            const a = [...allocations.entries()].find(
              ([apk, row]) => al.has(apk) && String(row.DebitTransactionFK).toUpperCase() === pk,
            )?.[1];
            const rec: Row = {};
            for (const c of TRANSACTION_FILLED_COLUMNS) rec[c] = t[c] ?? null;
            for (const c of ALLOCATION_FILLED_COLUMNS) rec[`a_${c}`] = a ? (a[c] ?? null) : null;
            rec.tenantName =
              seed.lookups.find((l) => l.contactFk?.toUpperCase() === String(t.ContactFK).toUpperCase())?.addressTitle ?? null;
            out.push(rec);
          }
          return out;
        }
        case 'remaining': {
          calls.push(tag);
          const tx = guidsAfter(sql, 'FROM dbo.[Transaction] WHERE TransactionPK IN (');
          const al = guidsAfter(sql, 'FROM dbo.Allocation WHERE AllocationPK IN (');
          const txRows = tx.filter((pk) => transactions.has(pk));
          const cents = txRows.reduce((s, pk) => s + Math.round(Number(transactions.get(pk)!.dblAmount) * 100), 0);
          return [{ transactions: txRows.length, allocations: al.filter((pk) => allocations.has(pk)).length, total: cents / 100 }];
        }
        default:
          throw new Error('fake VECO: unsupported query');
      }
    },
    async executeBatch(sql) {
      batches.push(sql);
      if (forbiddenTransactionSql(sql)) {
        throw new VecoSourceError('Veco query failed: (3902) The COMMIT TRANSACTION request has no corresponding BEGIN TRANSACTION.');
      }
      if (!sql.trimStart().startsWith(GUARD)) throw new Error('fake VECO: write batch must start with the DB_NAME() guard');
      if (fake.dbName !== TARGET_DB) throw fail(50001, `Omnia Recon refuses to write outside ${TARGET_DB}`);
      if (fake.failNextWrite) {
        const err = fake.failNextWrite;
        fake.failNextWrite = undefined;
        throw err;
      }
      const tag = /\/\* omnia:([a-z-]+) \*\//.exec(sql)?.[1];
      if (tag === 'insert') {
        const txRows: Row[] = [];
        const alRows: Row[] = [];
        for (const m of sql.matchAll(/INSERT INTO (dbo\.\[Transaction\]|dbo\.Allocation) \(([^)]*)\) VALUES /g)) {
          const cols = m[2]!.split(',').map((c) => c.trim());
          for (const values of parseValues(sql, m.index! + m[0].length)) {
            const row: Row = {};
            cols.forEach((c, i) => (row[c] = values[i] ?? null));
            (m[1] === 'dbo.Allocation' ? alRows : txRows).push(row);
          }
        }
        const refs = new Set([...transactions.values()].map((t) => t.strReference));
        if (txRows.some((r) => transactions.has(String(r.TransactionPK).toUpperCase()))) {
          throw fail(50002, 'A TransactionPK already exists');
        }
        if (alRows.some((r) => allocations.has(String(r.AllocationPK).toUpperCase()))) {
          throw fail(50003, 'An AllocationPK already exists');
        }
        if (txRows.some((r) => refs.has(r.strReference))) throw fail(50004, 'A strReference already exists');
        for (const r of txRows) transactions.set(String(r.TransactionPK).toUpperCase(), r);
        for (const r of alRows) allocations.set(String(r.AllocationPK).toUpperCase(), r);
      } else if (tag === 'delete') {
        const al = new Set(guidsAfter(sql, 'DELETE FROM dbo.Allocation WHERE AllocationPK IN ('));
        const tx = new Set(guidsAfter(sql, 'DELETE FROM dbo.[Transaction] WHERE TransactionPK IN ('));
        for (const [apk, a] of allocations) {
          if (al.has(apk)) continue;
          if (tx.has(String(a.DebitTransactionFK).toUpperCase()) || tx.has(String(a.CreditTransactionFK).toUpperCase())) {
            throw fail(50006, 'Other VECO rows now reference these receipts; delete refused');
          }
        }
        for (const pk of al) allocations.delete(pk);
        for (const pk of tx) transactions.delete(pk);
      } else {
        throw new Error('fake VECO: unsupported write batch');
      }
      return '';
    },
  };
  return fake;
}
