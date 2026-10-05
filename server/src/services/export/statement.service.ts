/**
 * Filled-in bank statement download (replaces the Google Sheet). Read-only on business data.
 *
 * Fixed rules:
 * - Row grain: one CSV row per receipt (active AND reversed) on a line; a line with no receipts gets one row.
 *   Receipts are ordered active first, then received_on, id. "Bank amount" and "Left on line" are filled on
 *   part 1 only (blank on later parts) so SUM(Bank amount) equals the statement total.
 * - Outcome = 'outgoing' when bt.amount < 0, else bt.status. The status filter works on Outcome.
 * - Limits: from and to required, from <= to, span <= 366 days, MAX_ROWS rows. Built in memory (no streaming)
 *   so row_count can be audited and X-Statement-Rows set.
 * - Privacy: never select payer_sort_code, payer_account_hash, extracted_ni_hash, raw_row or tenant NI.
 *   Payer account is '****' || payer_account_last4 only.
 * - Every download writes one statement_exports row (audited by trigger), even when it is empty.
 */
import { z } from 'zod';
import type { ActorDb } from '../../db/context.js';
import type { Pool } from '../../db/pool.js';
import { AppError } from '../../lib/errors.js';
import { externalState } from '../receipt/external-state.js';
import { buildStatementCsv, pounds, type StatementRow } from './statement-csv.js';

export const MAX_ROWS = 50000;
export const OUTCOMES = ['new', 'needs_review', 'yet_to_take', 'partially_matched', 'matched', 'excluded', 'outgoing'] as const;
export type Outcome = (typeof OUTCOMES)[number];

const isoDate = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'Use YYYY-MM-DD')
  .refine((s) => {
    const d = new Date(`${s}T00:00:00Z`);
    return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s;
  }, 'Not a real date');

export const StatementFilter = z
  .object({
    bankAccountId: z.uuid().optional(),
    from: isoDate,
    to: isoDate,
    status: z
      .string()
      .optional()
      .transform((s) =>
        s
          ? s
              .split(',')
              .map((x) => x.trim())
              .filter(Boolean)
          : [],
      )
      .pipe(z.array(z.enum(OUTCOMES))),
  })
  .superRefine((f, ctx) => {
    if (f.from > f.to) ctx.addIssue({ code: 'custom', path: ['to'], message: 'To must not be before From' });
    else if ((Date.parse(`${f.to}T00:00:00Z`) - Date.parse(`${f.from}T00:00:00Z`)) / 86_400_000 > 366) {
      ctx.addIssue({ code: 'custom', path: ['to'], message: 'The date range may span at most 366 days' });
    }
  });
export type StatementFilterParsed = z.output<typeof StatementFilter>;

type Q = Pick<Pool, 'query'>;

const OUTCOME_SQL = "(CASE WHEN bt.amount < 0 THEN 'outgoing' ELSE bt.status::text END)";

/** Validates the bank account and returns its code (null for "all banks"). */
async function bankCode(q: Q, id: string | undefined): Promise<string | null> {
  if (!id) return null;
  const { rows } = await q.query<{ code: string }>('SELECT code FROM bank_accounts WHERE id = $1', [id]);
  if (rows.length === 0) throw new AppError('bad_request', 'Unknown bank account');
  return rows[0]!.code;
}

function where(f: StatementFilterParsed): { sql: string; params: unknown[] } {
  const params: unknown[] = [f.from, f.to];
  let sql = 'bt.txn_date BETWEEN $1::date AND $2::date';
  if (f.bankAccountId) {
    params.push(f.bankAccountId);
    sql += ` AND bt.bank_account_id = $${params.length}`;
  }
  if (f.status.length > 0) {
    params.push(f.status);
    sql += ` AND ${OUTCOME_SQL} = ANY($${params.length}::text[])`;
  }
  return { sql, params };
}

export interface StatementCount {
  lines: number;
  rows: number;
  byStatus: Record<Outcome, number>;
}

export async function countStatement(pool: Q, f: StatementFilterParsed): Promise<StatementCount> {
  await bankCode(pool, f.bankAccountId);
  const w = where(f);
  const { rows } = await pool.query<{ outcome: Outcome; lines: number; rows: number }>(
    `SELECT ${OUTCOME_SQL} AS outcome, count(*)::int AS lines,
            sum(greatest(1, (SELECT count(*) FROM receipts r WHERE r.bank_transaction_id = bt.id)))::int AS rows
       FROM bank_transactions bt
      WHERE ${w.sql}
      GROUP BY 1`,
    w.params,
  );
  const byStatus = Object.fromEntries(OUTCOMES.map((o) => [o, 0])) as Record<Outcome, number>;
  let lines = 0;
  let total = 0;
  for (const r of rows) {
    byStatus[r.outcome] = r.lines;
    lines += r.lines;
    total += r.rows;
  }
  return { lines, rows: total, byStatus };
}

interface Row {
  bank_code: string;
  account_name: string;
  txn_date: string;
  description: string;
  reference: string | null;
  counterparty: string | null;
  payer_account: string | null;
  amount_pence: string;
  outcome: string;
  exclusion_reason: string | null;
  resolved_via: string | null;
  extracted_tid: string | null;
  part: string | null;
  parts: string | null;
  active_pence: string | null;
  receipt_id: string | null;
  tid: string | null;
  tenant: string | null;
  property_ref: string | null;
  branch_code: string | null;
  management_type: string | null;
  payer: string | null;
  receipt_pence: string | null;
  receipt_status: string | null;
  reversed_reason: string | null;
  received_on: string | null;
  bt_note: string | null;
  receipt_notes: string | null;
  line_id: string;
}

export interface StatementFile {
  csv: string;
  rows: number;
  fileName: string;
}

export async function buildStatement(
  db: ActorDb,
  f: StatementFilterParsed,
  opts: { maxRows?: number } = {},
): Promise<StatementFile> {
  const maxRows = opts.maxRows ?? MAX_ROWS;
  const code = await bankCode(db, f.bankAccountId);
  const count = await countStatement(db, f);
  if (count.rows > maxRows) {
    throw new AppError('bad_request', `This download has ${count.rows} rows (max ${maxRows}); narrow the dates or pick one bank`);
  }

  const w = where(f);
  const { rows } = await db.query<Row>(
    `SELECT ba.code AS bank_code, ba.account_name, to_char(bt.txn_date, 'YYYY-MM-DD') AS txn_date,
            bt.description, bt.reference, bt.counterparty,
            CASE WHEN bt.payer_account_last4 IS NOT NULL THEN '****' || bt.payer_account_last4 END AS payer_account,
            ((bt.amount * 100)::bigint)::text AS amount_pence, ${OUTCOME_SQL} AS outcome,
            bt.exclusion_reason, bt.resolved_via::text AS resolved_via, bt.extracted_tid,
            r.part::text AS part, r.parts::text AS parts, ((r.active_sum * 100)::bigint)::text AS active_pence,
            r.id AS receipt_id, t.tid, ten.full_name AS tenant, p.property_ref, b.code AS branch_code,
            t.management_type::text AS management_type, r.payer::text AS payer,
            ((r.amount * 100)::bigint)::text AS receipt_pence, r.status::text AS receipt_status,
            r.reversed_reason, to_char(r.received_on, 'YYYY-MM-DD') AS received_on,
            bt.note AS bt_note, r.notes AS receipt_notes, bt.id AS line_id
       FROM bank_transactions bt
       JOIN bank_accounts ba ON ba.id = bt.bank_account_id
       LEFT JOIN LATERAL (
              SELECT x.*,
                     row_number() OVER (ORDER BY (x.status <> 'active'), x.received_on, x.id) AS part,
                     count(*) OVER () AS parts,
                     sum(x.amount) FILTER (WHERE x.status = 'active') OVER () AS active_sum
                FROM receipts x WHERE x.bank_transaction_id = bt.id
            ) r ON true
       LEFT JOIN tenancies t ON t.id = coalesce(r.tenancy_id, bt.resolved_tenancy_id)
       LEFT JOIN properties p ON p.id = t.property_id
       LEFT JOIN branches b ON b.id = p.branch_id
       LEFT JOIN tenancy_tenants tt ON tt.tenancy_id = t.id AND tt.is_lead AND tt.left_on IS NULL
       LEFT JOIN tenants ten ON ten.id = tt.tenant_id
      WHERE ${w.sql}
      ORDER BY ba.code, bt.txn_date, bt.created_at, bt.id, r.part`,
    w.params,
  );

  const ext = await externalState(
    db as unknown as Pool,
    rows.flatMap((r) => (r.receipt_id ? [r.receipt_id] : [])),
  );

  const out: StatementRow[] = rows.map((r) => {
    const first = r.part === null || r.part === '1';
    const hasReceipt = r.receipt_id !== null;
    const state = r.receipt_id ? ext.get(r.receipt_id) : undefined;
    const left = BigInt(r.amount_pence) - BigInt(r.active_pence ?? '0');
    return [
      r.bank_code,
      r.account_name,
      r.txn_date,
      r.description,
      r.reference ?? '',
      r.counterparty ?? '',
      r.payer_account ?? '',
      first ? pounds(BigInt(r.amount_pence)) : '',
      r.outcome,
      r.exclusion_reason ?? '',
      r.resolved_via ?? '',
      r.extracted_tid ?? '',
      hasReceipt ? `${r.part} of ${r.parts}` : '',
      r.tid ?? '',
      r.tenant ?? '',
      r.property_ref ?? '',
      r.branch_code ?? '',
      r.management_type ?? '',
      r.payer ?? '',
      r.receipt_pence ? pounds(BigInt(r.receipt_pence)) : '',
      r.receipt_status ?? '',
      r.reversed_reason ?? '',
      r.received_on ?? '',
      hasReceipt ? (state?.xeroState ?? 'none') : '',
      hasReceipt ? (state?.vicoExported ? 'yes' : 'no') : '',
      first ? pounds(left) : '',
      [r.bt_note, r.receipt_notes].filter((n): n is string => !!n).join(' | '),
      r.line_id,
    ];
  });

  const csv = buildStatementCsv(out);
  await db.tx((c) =>
    c.query(
      `INSERT INTO statement_exports (requested_by, bank_account_id, date_from, date_to, statuses, row_count)
       VALUES (current_setting('app.user_email'), $1, $2::date, $3::date, $4::text[], $5)`,
      [f.bankAccountId ?? null, f.from, f.to, f.status, out.length],
    ),
  );

  const safe = (code ?? 'all').replace(/[^A-Za-z0-9_-]/g, '_');
  return { csv, rows: out.length, fileName: `statement_${safe}_${f.from}_${f.to}.csv` };
}
