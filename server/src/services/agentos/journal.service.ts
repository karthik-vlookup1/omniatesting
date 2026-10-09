/**
 * agentOS Journal Transfer: a move stored as one transfer with 2-20 entries (tenant, account type, signed
 * amount) that net to zero (side = the sign: from = negative). Every transfer also posts to the Omnia ledger. Each transfer is exported at most once
 * (not_exported -> exported -> posted). The CSV is stored so re-downloads are byte-stable.
 */
import type { QueryResult, QueryResultRow } from 'pg';
import type { ActorDb } from '../../db/context.js';
import type { Pool } from '../../db/pool.js';
import { AppError } from '../../lib/errors.js';
import { validateJournalEntries } from '../../domain/agentos/journal.js';
import { postTransaction } from '../ledger/ledger.service.js';
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
  lineNo: number;
  accountType: string;
  side: 'from' | 'to';
  tid: string;
  person: string;
  branch: string;
  property: string;
  amountPence: number;
}

export interface JournalTransferDto {
  id: string;
  fromTid: string | null;
  toTid: string | null;
  amountPence: number;
  description: string;
  nominalCode: string;
  accountType: string | null;
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
  from_tid: string | null;
  to_tid: string | null;
  amount_pence: string | number;
  description: string;
  nominal_code: string;
  account_type: string | null;
  posting_status: 'not_exported' | 'exported' | 'posted';
  export_id: string | null;
  posted_at: Date | null;
  created_at: Date;
}

interface EntryRow {
  transfer_id: string;
  line_no: number;
  account_type: string;
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
  lineNo: e.line_no,
  accountType: e.account_type,
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
    `SELECT transfer_id, line_no, account_type, side, tid, person, branch, property, amount_pence
       FROM agentos_journal_entries WHERE transfer_id = ANY($1::uuid[]) ORDER BY transfer_id, line_no`,
    [transfers.map((t) => t.id)],
  );
  return transfers.map((t) => transferDto(t, entries));
}

export async function listJournalTransfers(pool: Pool): Promise<JournalTransferDto[]> {
  return loadTransfers(pool, '', [], 'LIMIT 200');
}

export interface MultiJournalInput {
  clientRequestId?: string;
  description: string;
  nominalCode: string;
  entries: { agentosTenantId: string; accountType: string; amountPence: number }[];
  userId: string;
}

export interface JournalCreateResult {
  transfer: JournalTransferDto;
  created: boolean;
}

interface TenantRow {
  id: string;
  tid: string | null;
  forename: string;
  surname: string;
  managed_by: string;
  residence: string;
}

async function createInTx(c: Queryable, input: MultiJournalInput): Promise<JournalCreateResult> {
  const { rows: tenants } = await c.query<TenantRow>(
    'SELECT id, tid, forename, surname, managed_by, residence FROM agentos_tenants WHERE id = ANY($1::uuid[])',
    [[...new Set(input.entries.map((e) => e.agentosTenantId))]],
  );
  const byId = new Map(tenants.map((t) => [t.id, t]));
  const resolved = input.entries.map((e, i) => {
    const t = byId.get(e.agentosTenantId);
    if (!t) throw new AppError('bad_request', `Entry ${i + 1}: no such agentOS tenant`);
    if (!t.tid) throw new AppError('bad_request', `Entry ${i + 1}: tenant has no TID`);
    return { ...e, tenant: t, tid: t.tid };
  });
  validateJournalEntries(resolved.map((r) => ({ tid: r.tid, accountType: r.accountType, amountPence: r.amountPence })));

  const amount = resolved.reduce((s, r) => s + (r.amountPence > 0 ? r.amountPence : 0), 0);
  const fromTid = resolved.length === 2 ? resolved.find((r) => r.amountPence < 0)?.tid : undefined;
  const toTid = resolved.length === 2 ? resolved.find((r) => r.amountPence > 0)?.tid : undefined;
  const pair = fromTid && toTid && fromTid !== toTid && /^\d{4}$/.test(fromTid) && /^\d{4}$/.test(toTid);
  const types = new Set(resolved.map((r) => r.accountType));
  const ins = await c.query<{ id: string }>(
    `INSERT INTO agentos_journal_transfers
       (from_tid, to_tid, amount_pence, description, nominal_code, account_type, created_by, client_request_id)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
     ON CONFLICT (client_request_id) DO NOTHING RETURNING id`,
    [
      pair ? fromTid : null,
      pair ? toTid : null,
      amount,
      input.description,
      input.nominalCode,
      types.size === 1 ? resolved[0]!.accountType : null,
      input.userId,
      input.clientRequestId ?? null,
    ],
  );
  const row = ins.rows[0];
  if (!row) {
    const { rows } = await c.query<{ id: string }>('SELECT id FROM agentos_journal_transfers WHERE client_request_id = $1', [
      input.clientRequestId,
    ]);
    const [existing] = await loadTransfers(c, 'WHERE t.id = $1', [rows[0]!.id]);
    const same =
      existing!.description === input.description &&
      existing!.nominalCode === input.nominalCode &&
      existing!.entries.length === resolved.length &&
      existing!.entries.every((e, i) => {
        const r = resolved[i]!;
        return e.tid === r.tid && e.accountType === r.accountType && e.amountPence === r.amountPence;
      });
    if (!same) throw new AppError('conflict', 'clientRequestId was already used for a different journal');
    return { transfer: existing!, created: false };
  }
  const transferId = row.id;
  for (const [i, r] of resolved.entries()) {
    await c.query(
      `INSERT INTO agentos_journal_entries
         (transfer_id, line_no, side, agentos_tenant_id, tid, person, branch, property, account_type, amount_pence)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
      [
        transferId,
        i + 1,
        r.amountPence < 0 ? 'from' : 'to',
        r.tenant.id,
        r.tid,
        paymentFrom(r.tid, r.tenant.forename, r.tenant.surname),
        r.tenant.managed_by,
        r.tenant.residence,
        r.accountType,
        r.amountPence,
      ],
    );
  }
  await postTransaction(c, {
    kind: 'journal_transfer',
    sourceId: transferId,
    description: `Journal Transfer - ${input.description}`.slice(0, 300),
    createdBy: input.userId,
    postings: resolved.map((r) => ({
      accountKind: 'tenant' as const,
      accountRef: r.tid,
      accountType: r.accountType,
      amountPence: r.amountPence,
    })),
  });
  const [dto] = await loadTransfers(c, 'WHERE t.id = $1', [transferId]);
  return { transfer: dto!, created: true };
}

export async function createJournalTransfer(db: ActorDb, input: MultiJournalInput): Promise<JournalCreateResult> {
  return db.tx((c) => createInTx(c, input));
}

export async function createLegacyJournalTransfer(
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
): Promise<JournalCreateResult> {
  if (input.fromTid === input.toTid) throw new AppError('bad_request', 'From and to tenant must be different');
  return db.tx(async (c) => {
    const { rows } = await c.query<{ id: string; tid: string }>(
      `SELECT DISTINCT ON (tid) id, tid FROM agentos_tenants WHERE tid = ANY($1)
        ORDER BY tid, (source = 'seed') DESC, agentos_ref NULLS LAST, id`,
      [[input.fromTid, input.toTid]],
    );
    const byTid = new Map(rows.map((r) => [r.tid, r.id]));
    for (const tid of [input.fromTid, input.toTid]) {
      if (!byTid.has(tid)) throw new AppError('bad_request', `No agentOS tenant has TID ${tid}`);
    }
    return createInTx(c, {
      description: input.description,
      nominalCode: input.nominalCode,
      userId: input.userId,
      entries: [
        { agentosTenantId: byTid.get(input.fromTid)!, accountType: input.accountType, amountPence: -input.amountPence },
        { agentosTenantId: byTid.get(input.toTid)!, accountType: input.accountType, amountPence: input.amountPence },
      ],
    });
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
    }>(
      `SELECT id, amount_pence, description, nominal_code
         FROM agentos_journal_transfers WHERE posting_status = 'not_exported'
        ORDER BY created_at, id FOR UPDATE`,
    );
    const ids = transfers.map((t) => t.id);
    const { rows: entries } = ids.length
      ? await c.query<EntryRow>(
          `SELECT transfer_id, line_no, account_type, side, tid, person, branch, property, amount_pence
             FROM agentos_journal_entries WHERE transfer_id = ANY($1::uuid[]) ORDER BY transfer_id, line_no`,
          [ids],
        )
      : { rows: [] as EntryRow[] };
    const csvRows: string[][] = [];
    for (const t of transfers) {
      for (const e of entries.filter((x) => x.transfer_id === t.id)) {
        csvRows.push([
          `${t.description} | Recon ${t.id}`,
          t.nominal_code,
          e.branch,
          e.person,
          e.property,
          e.account_type,
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
