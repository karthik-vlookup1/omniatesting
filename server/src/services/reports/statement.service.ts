/**
 * Tenant rent statement for one tenancy and a date range. Read-only on business data.
 *
 * Fixed rules:
 * - Day D: the default and the upper bound for `to` is today in Europe/London, from SQL
 *   `(now() AT TIME ZONE 'Europe/London')::date`.
 * - Statement: by TID; `from`/`to` are required ISO dates, from<=to, to<=London today, span<=1827 days.
 *   Unknown TID gives 404 "Unknown TID X". A tenancy with no charges_from gives 409
 *   "X has no rent account yet; set its rent first".
 *   Events per payer: charges with due_date<=to, signed +amt. The description is
 *   `Rent <period_start> to <period_end>`, or 'Opening balance from LetMC' when source is opening_balance.
 *   Adjustments, signed: `<kind with spaces>: <reason>` ('Opening credit from LetMC' when kind is
 *   opening_balance). Receipts of BOTH statuses: -amt on received_on, described 'Payment received' plus
 *   ` (<bank code> <txn_date>)` when the receipt has a bank line (LEFT JOIN). A reversed receipt also gets
 *   a +amt event 'Payment reversed: <reversed_reason>' dated
 *   `coalesce((reversed_at AT TIME ZONE 'Europe/London')::date, received_on)`, but only when that date <= to.
 *   Sort order: date, then kind (charge 0, adjustment 1, receipt 2, reversal 3), then created_at, id.
 *   opening = sum of events before `from`; lines are the events from `from` to `to` with a running balance;
 *   closing = opening + the lines. Payer order is tenant, council_hb, dwp_uc, other_third_party, and a payer
 *   is listed only if it has an event <= to. When to = today, closing equals the Rent page balance.
 * - Roles: all statement routes use requireWriter. Only the CSV and PDF downloads are logged (one
 *   report_downloads row each, audited by trigger). JSON preview calls are not logged.
 * - Privacy: no NI, no sort codes, no payer account numbers anywhere. The header shows TID, lead tenant
 *   full_name, property_ref and branch code.
 */
import { z } from 'zod';
import type { ActorDb } from '../../db/context.js';
import type { Pool } from '../../db/pool.js';
import { AppError } from '../../lib/errors.js';
import { ISO_DATE, londonToday } from './dates.js';

type Q = Pick<Pool, 'query'>;

export const MAX_SPAN_DAYS = 1827;

export const StatementQuery = z
  .object({ from: ISO_DATE, to: ISO_DATE })
  .strict()
  .superRefine((f, ctx) => {
    if (f.from > f.to) ctx.addIssue({ code: 'custom', path: ['to'], message: 'To must not be before From' });
    else if ((Date.parse(`${f.to}T00:00:00Z`) - Date.parse(`${f.from}T00:00:00Z`)) / 86_400_000 > MAX_SPAN_DAYS) {
      ctx.addIssue({ code: 'custom', path: ['to'], message: `The date range may span at most ${MAX_SPAN_DAYS} days` });
    }
  });
export type StatementQueryParsed = z.output<typeof StatementQuery>;

export const PAYER_ORDER = ['tenant', 'council_hb', 'dwp_uc', 'other_third_party'] as const;
export type Payer = (typeof PAYER_ORDER)[number];
const LABEL: Record<Payer, string> = {
  tenant: 'Tenant',
  council_hb: 'Council (HB)',
  dwp_uc: 'DWP (UC)',
  other_third_party: 'Other third party',
};

export type LineType = 'Rent charge' | 'Adjustment' | 'Payment' | 'Reversal';

export interface StatementLine {
  date: string;
  type: LineType;
  description: string;
  debitPence: number | null;
  creditPence: number | null;
  balancePence: number;
}

export interface StatementPayer {
  payer: Payer;
  label: string;
  openingPence: number;
  chargesPence: number;
  paymentsPence: number;
  reversalsPence: number;
  adjustmentsPence: number;
  closingPence: number;
  lines: StatementLine[];
}

export interface TenantStatement {
  tenancy: { id: string; tid: string; tenant: string | null; propertyRef: string | null; branch: string | null; chargesFrom: string };
  from: string;
  to: string;
  generatedAt: string;
  payers: StatementPayer[];
}

interface EventRow {
  payer: Payer;
  kind: number;
  d: string;
  pence: string;
  description: string;
  created_at: string;
  id: string;
}

const KIND_TYPE: LineType[] = ['Rent charge', 'Adjustment', 'Payment', 'Reversal'];

export async function getTenantStatement(q: Q, tid: string, query: StatementQueryParsed): Promise<TenantStatement> {
  const { from, to } = query;
  const today = await londonToday(q);
  if (to > today) throw new AppError('bad_request', 'To cannot be in the future');

  const t = (
    await q.query<{
      id: string;
      charges_from: string | null;
      tenant: string | null;
      property_ref: string | null;
      branch: string | null;
    }>(
      `SELECT t.id, to_char(t.charges_from, 'YYYY-MM-DD') AS charges_from, ten.full_name AS tenant,
              p.property_ref, b.code AS branch
         FROM tenancies t
         LEFT JOIN properties p ON p.id = t.property_id
         LEFT JOIN branches b ON b.id = p.branch_id
         LEFT JOIN tenancy_tenants tt ON tt.tenancy_id = t.id AND tt.is_lead AND tt.left_on IS NULL
         LEFT JOIN tenants ten ON ten.id = tt.tenant_id
        WHERE t.tid = $1`,
      [tid],
    )
  ).rows[0];
  if (!t) throw new AppError('not_found', `Unknown TID ${tid}`);
  if (t.charges_from === null) throw new AppError('conflict', `${tid} has no rent account yet; set its rent first`);

  const events = (
    await q.query<EventRow>(
      `SELECT payer::text AS payer, kind, to_char(d, 'YYYY-MM-DD') AS d, ((pence * 100)::bigint)::text AS pence,
              description, created_at::text AS created_at, id::text AS id
         FROM (
           SELECT c.payer, 0 AS kind, c.due_date AS d, c.amount AS pence,
                  CASE WHEN c.source = 'opening_balance' THEN 'Opening balance from LetMC'
                       ELSE 'Rent ' || to_char(c.period_start, 'YYYY-MM-DD') || ' to ' || to_char(c.period_end, 'YYYY-MM-DD') END AS description,
                  c.created_at, c.id
             FROM rent_charges c WHERE c.tenancy_id = $1 AND c.due_date <= $2::date
           UNION ALL
           SELECT a.payer, 1, a.effective_on, a.amount,
                  CASE WHEN a.kind::text = 'opening_balance' THEN 'Opening credit from LetMC'
                       ELSE replace(a.kind::text, '_', ' ') || ': ' || a.reason END,
                  a.created_at, a.id
             FROM adjustments a WHERE a.tenancy_id = $1 AND a.effective_on <= $2::date
           UNION ALL
           SELECT r.payer, 2, r.received_on, -r.amount,
                  'Payment received' || CASE WHEN ba.code IS NOT NULL
                       THEN ' (' || ba.code || ' ' || to_char(bt.txn_date, 'YYYY-MM-DD') || ')' ELSE '' END,
                  r.created_at, r.id
             FROM receipts r
             LEFT JOIN bank_transactions bt ON bt.id = r.bank_transaction_id
             LEFT JOIN bank_accounts ba ON ba.id = bt.bank_account_id
            WHERE r.tenancy_id = $1 AND r.received_on <= $2::date
           UNION ALL
           SELECT r.payer, 3, coalesce((r.reversed_at AT TIME ZONE 'Europe/London')::date, r.received_on), r.amount,
                  'Payment reversed: ' || coalesce(r.reversed_reason, ''), coalesce(r.reversed_at, r.created_at), r.id
             FROM receipts r
            WHERE r.tenancy_id = $1 AND r.status = 'reversed' AND r.received_on <= $2::date
              AND coalesce((r.reversed_at AT TIME ZONE 'Europe/London')::date, r.received_on) <= $2::date
         ) e`,
      [t.id, to],
    )
  ).rows;

  const payers: StatementPayer[] = [];
  for (const payer of PAYER_ORDER) {
    const mine = events
      .filter((e) => e.payer === payer)
      .sort((a, b) =>
        a.d !== b.d ? (a.d < b.d ? -1 : 1) : a.kind !== b.kind ? a.kind - b.kind : a.created_at !== b.created_at ? (a.created_at < b.created_at ? -1 : 1) : a.id < b.id ? -1 : 1,
      );
    if (mine.length === 0) continue;
    let opening = 0;
    let balance = 0;
    let charges = 0;
    let payments = 0;
    let reversals = 0;
    let adjustments = 0;
    const lines: StatementLine[] = [];
    for (const e of mine) {
      const signed = Number(e.pence);
      if (e.d < from) {
        opening += signed;
        balance = opening;
        continue;
      }
      balance += signed;
      if (e.kind === 0) charges += signed;
      else if (e.kind === 1) adjustments += signed;
      else if (e.kind === 2) payments -= signed;
      else reversals += signed;
      lines.push({
        date: e.d,
        type: KIND_TYPE[e.kind]!,
        description: e.description,
        debitPence: signed > 0 ? signed : null,
        creditPence: signed < 0 ? -signed : null,
        balancePence: balance,
      });
    }
    payers.push({
      payer,
      label: LABEL[payer],
      openingPence: opening,
      chargesPence: charges,
      paymentsPence: payments,
      reversalsPence: reversals,
      adjustmentsPence: adjustments,
      closingPence: balance,
      lines,
    });
  }

  return {
    tenancy: { id: t.id, tid, tenant: t.tenant, propertyRef: t.property_ref, branch: t.branch, chargesFrom: t.charges_from },
    from,
    to,
    generatedAt: new Date().toISOString(),
    payers,
  };
}

export function lineCount(s: TenantStatement): number {
  return s.payers.reduce((n, p) => n + p.lines.length, 0);
}

/** Writes the download log row (audited by trigger as the current user). */
export async function logDownload(db: ActorDb, s: TenantStatement, format: 'csv' | 'pdf', rowCount: number): Promise<void> {
  await db.tx((c) =>
    c.query(
      `INSERT INTO report_downloads (report, format, tenancy_id, tid, date_from, date_to, row_count, requested_by)
       VALUES ('tenant_statement', $1, $2, $3, $4::date, $5::date, $6, current_setting('app.user_email'))`,
      [format, s.tenancy.id, s.tenancy.tid, s.from, s.to, rowCount],
    ),
  );
}
