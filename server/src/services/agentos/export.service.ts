/**
 * agentOS Take a Payment CSV export: each matched intake line is exported at most once
 * (not_ready|ready -> exported -> posted). The CSV is stored so re-downloads are byte-stable.
 */
import type { ActorDb } from '../../db/context.js';
import type { Pool } from '../../db/pool.js';
import { AppError } from '../../lib/errors.js';
import { BOM, pounds } from '../export/statement-csv.js';

export const TAKE_PAYMENT_HEADER = [
  'TID',
  'Payment From',
  'Will deposit to',
  'Type',
  'Amount',
  'Description and Card Authorisation Code',
] as const;

export interface AgentosExportDto {
  id: string;
  batchId: string;
  rowsTotal: number;
  amountTotalPence: number;
  createdAt: string;
}

export interface PostedLineDto {
  id: string;
  postingStatus: 'posted';
  exportId: string;
  postedAt: string;
}

/** A CSV cell: quote when needed, and never let a spreadsheet read it as a formula. (Copy of statement-csv.ts.) */
function cell(value: string): string {
  const safe = /^[=+\-@\t\r]/.test(value) && !/^-?\d+(\.\d+)?$/.test(value) ? `'${value}` : value;
  return /[",\r\n]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
}

/** "<tid> <forename without a leading tid> <surname>", whitespace collapsed. */
export function paymentFrom(tid: string, forename: string, surname: string): string {
  let rest = forename.trimStart();
  if (rest.startsWith(tid) && /\s/.test(rest.charAt(tid.length))) rest = rest.slice(tid.length);
  return `${tid} ${rest} ${surname}`.replace(/\s+/g, ' ').trim();
}

export function buildTakePaymentCsv(rows: string[][]): string {
  return BOM + [[...TAKE_PAYMENT_HEADER], ...rows].map((r) => r.map(cell).join(',')).join('\r\n') + '\r\n';
}

export async function createAgentosExport(db: ActorDb, input: { batchId: string; userId: string }): Promise<AgentosExportDto> {
  return db.tx(async (c) => {
    await c.query("SELECT pg_advisory_xact_lock(hashtext('agentos-export'))");
    const batch = await c.query('SELECT 1 FROM agentos_intake_batches WHERE id = $1', [input.batchId]);
    if (batch.rowCount === 0) throw new AppError('not_found', 'No such intake batch');

    const { rows: lines } = await c.query<{
      id: string;
      payment_type: string;
      amount_pence: number;
      description: string;
      tid: string;
      forename: string;
      surname: string;
      deposit_to: string;
    }>(
      `SELECT l.id, l.payment_type, l.amount_pence, l.description, t.tid, t.forename, t.surname, l.deposit_to
         FROM agentos_intake_lines l JOIN agentos_tenants t ON t.id = l.agentos_tenant_id
        WHERE l.batch_id = $1 AND l.match_status = 'matched' AND l.posting_status IN ('not_ready','ready')
        ORDER BY l.line_no FOR UPDATE OF l`,
      [input.batchId],
    );
    const csvRows = lines.map((l) => [
      l.tid,
      paymentFrom(l.tid, l.forename, l.surname),
      l.deposit_to,
      l.payment_type,
      pounds(BigInt(l.amount_pence)),
      l.description === '' ? `Recon ${l.id}` : `${l.description} | Recon ${l.id}`,
    ]);
    const total = lines.reduce((s, l) => s + l.amount_pence, 0);
    const ins = await c.query<{ id: string; created_at: Date }>(
      `INSERT INTO agentos_exports (batch_id, rows_total, amount_total_pence, csv, created_by)
       VALUES ($1, $2, $3, $4, $5) RETURNING id, created_at`,
      [input.batchId, lines.length, total, buildTakePaymentCsv(csvRows), input.userId],
    );
    const exp = ins.rows[0]!;
    if (lines.length > 0) {
      await c.query(
        `UPDATE agentos_intake_lines SET posting_status = 'exported', export_id = $1, updated_at = now()
          WHERE id = ANY($2::uuid[])`,
        [exp.id, lines.map((l) => l.id)],
      );
    }
    return {
      id: exp.id,
      batchId: input.batchId,
      rowsTotal: lines.length,
      amountTotalPence: total,
      createdAt: exp.created_at.toISOString(),
    };
  });
}

export async function getAgentosExportCsv(pool: Pool, id: string): Promise<{ csv: string; createdAt: string } | null> {
  const { rows } = await pool.query<{ csv: string; created: string }>(
    "SELECT csv, to_char(created_at, 'YYYY-MM-DD') AS created FROM agentos_exports WHERE id = $1",
    [id],
  );
  const r = rows[0];
  return r ? { csv: r.csv, createdAt: r.created } : null;
}

export async function markLinePosted(db: ActorDb, input: { lineId: string; userId: string }): Promise<PostedLineDto> {
  return db.tx(async (c) => {
    const upd = await c.query<{ id: string; export_id: string; posted_at: Date }>(
      `UPDATE agentos_intake_lines SET posting_status = 'posted', posted_at = now(), posted_by = $2, updated_at = now()
        WHERE id = $1 AND posting_status = 'exported' RETURNING id, export_id, posted_at`,
      [input.lineId, input.userId],
    );
    const r = upd.rows[0];
    if (r) return { id: r.id, postingStatus: 'posted' as const, exportId: r.export_id, postedAt: r.posted_at.toISOString() };
    const cur = await c.query<{ posting_status: string }>('SELECT posting_status FROM agentos_intake_lines WHERE id = $1', [input.lineId]);
    const s = cur.rows[0]?.posting_status;
    if (s === undefined) throw new AppError('not_found', 'No such intake line');
    if (s === 'posted') throw new AppError('conflict', 'This line is already marked posted');
    throw new AppError('conflict', 'Only exported lines can be marked posted');
  });
}
