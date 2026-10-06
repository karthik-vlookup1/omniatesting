/**
 * agentOS Journal Transfer: a tenant-to-tenant move stored as one transfer with two entries
 * (from = -amount, to = +amount). Each transfer is exported at most once
 * (not_exported -> exported -> posted). The CSV is stored so re-downloads are byte-stable.
 */
import type { QueryResult, QueryResultRow } from 'pg';
import type { ActorDb } from '../../db/context.js';
import type { Pool } from '../../db/pool.js';
import { AppError } from '../../lib/errors.js';
import { BOM, pounds } from '../export/statement-csv.js';
import { paymentFrom } from './export.service.js';

export const JOURNAL_HEADER = [
  'Description',
  'Nominal Code',
  'Branch',
  'Person',
  'Property',
  'Account Type',
  'Account Balance',
  'Amount',
] as const;

export interface JournalEntryDto {
  side: 'from' | 'to';
  tid: string;
  person: string;
  branch: string;
  property: string;
  amountPence: number;
}

export interface JournalTransferDto {
  id: string;
  fromTid: string;
  toTid: string;
  amountPence: number;
  description: string;
  nominalCode: string;
  accountType: string;
  postingStatus: 'not_exported' | 'exported' | 'posted';
  exportId: string | null;
  postedAt: string | null;
  createdAt: string;
  entries: JournalEntryDto[];
}

export interface JournalExportDto {
  id: string;
  transfersTotal: number;
  amountTotalPence: number;
  createdAt: string;
}

/** A CSV cell: quote when needed, and never let a spreadsheet read it as a formula. (Copy of statement-csv.ts.) */
function cell(value: string): string {
  const safe = /^[=+\-@\t\r]/.test(value) && !/^-?\d+(\.\d+)?$/.test(value) ? `'${value}` : value;
  return /[",\r\n]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
}

export function buildJournalCsv(rows: string[][]): string {
  return BOM + [[...JOURNAL_HEADER], ...rows].map((r) => r.map(cell).join(',')).join('\r\n') + '\r\n';
}

interface TransferRow {
  id: string;
  from_tid: string;
  to_tid: string;
  amount_pence: string | number;
  description: string;
  nominal_code: string;
  account_type: string;
  posting_status: 'not_exported' | 'exported' | 'posted';
  export_id: string | null;
  posted_at: Date | null;
  created_at: Date;
}

interface EntryRow {
  transfer_id: string;
  side: 'from' | 'to';
  tid: string;
  person: string;
  branch: string;
  property: string;
  amount_pence: string | number;
}

interface Queryable {
  query<R extends QueryResultRow = QueryResultRow>(text: string, values?: unknown[]): Promise<QueryResult<R>>;
}

const TRANSFER_COLS =
  't.id, t.from_tid, t.to_tid, t.amount_pence, t.description, t.nominal_code, t.account_type, t.posting_status, t.export_id, t.posted_at, t.created_at';

const entryDto = (e: EntryRow): JournalEntryDto => ({
  side: e.side,
  tid: e.tid,
  person: e.person,
  branch: e.branch,
  property: e.property,
  amountPence: Number(e.amount_pence),
});

function transferDto(t: TransferRow, entries: EntryRow[]): JournalTransferDto {
  return {
    id: t.id,
    fromTid: t.from_tid,
    toTid: t.to_tid,
    amountPence: Number(t.amount_pence),
    description: t.description,
    nominalCode: t.nominal_code,
    accountType: t.account_type,
    postingStatus: t.posting_status,
    exportId: t.export_id,
    postedAt: t.posted_at ? t.posted_at.toISOString() : null,
    createdAt: t.created_at.toISOString(),
    entries: entries.filter((e) => e.transfer_id === t.id).map(entryDto),
  };
}

async function loadTransfers(q: Queryable, where: string, params: unknown[], limit = ''): Promise<JournalTransferDto[]> {
  const { rows: transfers } = await q.query<TransferRow>(
    `SELECT ${TRANSFER_COLS} FROM agentos_journal_transfers t ${where} ORDER BY t.created_at DESC, t.id ${limit}`,
    params,
  );
  if (transfers.length === 0) return [];
  const { rows: entries } = await q.query<EntryRow>(
    `SELECT transfer_id, side, tid, person, branch, property, amount_pence
       FROM agentos_journal_entries WHERE transfer_id = ANY($1::uuid[]) ORDER BY transfer_id, side`,
    [transfers.map((t) => t.id)],
  );
  return transfers.map((t) => transferDto(t, entries));
}

export async function listJournalTransfers(pool: Pool): Promise<JournalTransferDto[]> {
  return loadTransfers(pool, '', [], 'LIMIT 200');
}

export async function createJournalTransfer(
  db: ActorDb,
  input: {
    fromTid: string;
    toTid: string;
    amountPence: number;
    description: string;
    nominalCode: string;
    accountType: string;
    userId: string;
  },
): Promise<JournalTransferDto> {
  return db.tx(async (c) => {
    if (input.fromTid === input.toTid) throw new AppError('bad_request', 'From and to tenant must be different');
    const { rows: tenants } = await c.query<{
      id: string;
      tid: string;
      forename: string;
      surname: string;
      managed_by: string;
      residence: string;
    }>('SELECT id, tid, forename, surname, managed_by, residence FROM agentos_tenants WHERE tid = ANY($1)', [
      [input.fromTid, input.toTid],
    ]);
    const byTid = new Map(tenants.map((t) => [t.tid, t]));
    for (const tid of [input.fromTid, input.toTid]) {
      if (!byTid.has(tid)) throw new AppError('bad_request', `No agentOS tenant has TID ${tid}`);
    }
    const ins = await c.query<{ id: string }>(
      `INSERT INTO agentos_journal_transfers (from_tid, to_tid, amount_pence, description, nominal_code, account_type, created_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING id`,
      [input.fromTid, input.toTid, input.amountPence, input.description, input.nominalCode, input.accountType, input.userId],
    );
    const transferId = ins.rows[0]!.id;
    for (const [side, tid, amount] of [
      ['from', input.fromTid, -input.amountPence],
      ['to', input.toTid, input.amountPence],
    ] as const) {
      const t = byTid.get(tid)!;
      await c.query(
        `INSERT INTO agentos_journal_entries (transfer_id, side, agentos_tenant_id, tid, person, branch, property, amount_pence)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
        [transferId, side, t.id, tid, paymentFrom(tid, t.forename, t.surname), t.managed_by, t.residence, amount],
      );
    }
    const [dto] = await loadTransfers(c, 'WHERE t.id = $1', [transferId]);
    return dto!;
  });
}

export async function createJournalExport(db: ActorDb, input: { userId: string }): Promise<JournalExportDto> {
  return db.tx(async (c) => {
    await c.query("SELECT pg_advisory_xact_lock(hashtext('agentos-journal-export'))");
    const { rows: transfers } = await c.query<{
      id: string;
      amount_pence: string | number;
      description: string;
      nominal_code: string;
      account_type: string;
    }>(
      `SELECT id, amount_pence, description, nominal_code, account_type
         FROM agentos_journal_transfers WHERE posting_status = 'not_exported'
        ORDER BY created_at, id FOR UPDATE`,
    );
    const ids = transfers.map((t) => t.id);
    const { rows: entries } = ids.length
      ? await c.query<EntryRow>(
          `SELECT transfer_id, side, tid, person, branch, property, amount_pence
             FROM agentos_journal_entries WHERE transfer_id = ANY($1::uuid[])`,
          [ids],
        )
      : { rows: [] as EntryRow[] };
    const csvRows: string[][] = [];
    for (const t of transfers) {
      for (const side of ['from', 'to'] as const) {
        const e = entries.find((x) => x.transfer_id === t.id && x.side === side)!;
        csvRows.push([
          `${t.description} | Recon ${t.id}`,
          t.nominal_code,
          e.branch,
          e.person,
          e.property,
          t.account_type,
          '',
          pounds(BigInt(e.amount_pence)),
        ]);
      }
    }
    const total = transfers.reduce((s, t) => s + Number(t.amount_pence), 0);
    const ins = await c.query<{ id: string; created_at: Date }>(
      `INSERT INTO agentos_journal_exports (transfers_total, amount_total_pence, csv, created_by)
       VALUES ($1, $2, $3, $4) RETURNING id, created_at`,
      [transfers.length, total, buildJournalCsv(csvRows), input.userId],
    );
    const exp = ins.rows[0]!;
    if (ids.length > 0) {
      await c.query(
        `UPDATE agentos_journal_transfers SET posting_status = 'exported', export_id = $1, updated_at = now()
          WHERE id = ANY($2::uuid[])`,
        [exp.id, ids],
      );
    }
    return { id: exp.id, transfersTotal: transfers.length, amountTotalPence: total, createdAt: exp.created_at.toISOString() };
  });
}

export async function getJournalExportCsv(pool: Pool, id: string): Promise<{ csv: string; createdAt: string } | null> {
  const { rows } = await pool.query<{ csv: string; created: string }>(
    "SELECT csv, to_char(created_at, 'YYYY-MM-DD') AS created FROM agentos_journal_exports WHERE id = $1",
    [id],
  );
  const r = rows[0];
  return r ? { csv: r.csv, createdAt: r.created } : null;
}

export async function markTransferPosted(db: ActorDb, input: { transferId: string; userId: string }): Promise<JournalTransferDto> {
  return db.tx(async (c) => {
    const upd = await c.query(
      `UPDATE agentos_journal_transfers SET posting_status = 'posted', posted_at = now(), posted_by = $2, updated_at = now()
        WHERE id = $1 AND posting_status = 'exported' RETURNING id`,
      [input.transferId, input.userId],
    );
    if (upd.rows[0]) {
      const [dto] = await loadTransfers(c, 'WHERE t.id = $1', [input.transferId]);
      return dto!;
    }
    const cur = await c.query<{ posting_status: string }>('SELECT posting_status FROM agentos_journal_transfers WHERE id = $1', [
      input.transferId,
    ]);
    const s = cur.rows[0]?.posting_status;
    if (s === undefined) throw new AppError('not_found', 'No such journal transfer');
    if (s === 'posted') throw new AppError('conflict', 'This transfer is already marked posted');
    throw new AppError('conflict', 'Only exported transfers can be marked posted');
  });
}
