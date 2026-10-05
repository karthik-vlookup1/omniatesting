/**
 * Write-offs and refunds on a tenancy's rent account (per payer), and reversing them.
 *
 * Sign convention (adjustments.amount): + increases what is owed, - reduces it.
 *  - write_off: reduces arrears, so it is stored negative; at most the current arrears for that payer.
 *  - refund (kind refund_paid): money paid back out of a credit, stored positive; at most the credit.
 *  - A reversal is a 'correction' row with the opposite sign and reverses_adjustment_id set; each
 *    write-off / refund can be reversed once (UNIQUE).
 * These are Recon-only records: nothing is posted to Xero.
 */
import type { ActorDb } from '../../db/context.js';
import type { Pool, PoolClient } from '../../db/pool.js';
import { AppError } from '../../lib/errors.js';
import { PAYERS, isCalendarDate, money, type Payer } from '../receipt/receipt.service.js';

export interface AdjustmentRow {
  id: string;
  payer: Payer;
  kind: string;
  amountPence: number;
  effectiveOn: string;
  reason: string;
  reversesAdjustmentId: string | null;
  reversedByAdjustmentId: string | null;
  approvedBy: string | null;
  createdAt: string;
}

export interface PayerBalance {
  payer: Payer;
  balancePence: number;
}

export async function listAdjustments(
  pool: Pool | PoolClient,
  tid: string,
): Promise<{ tid: string; balances: PayerBalance[]; adjustments: AdjustmentRow[] }> {
  const t = tid.trim().toUpperCase();
  const { rows: ten } = await pool.query<{ id: string }>('SELECT id FROM tenancies WHERE tid = $1', [t]);
  if (!ten[0]) throw new AppError('not_found', `No tenancy with TID ${t}`);
  const { rows: bal } = await pool.query<{ payer: Payer; balance_pence: string }>(
    'SELECT payer::text AS payer, (balance * 100)::bigint AS balance_pence FROM v_tenancy_balance WHERE tenancy_id = $1 ORDER BY payer',
    [ten[0].id],
  );
  const { rows } = await pool.query<{
    id: string;
    payer: Payer;
    kind: string;
    amount_pence: string;
    effective_on: string;
    reason: string;
    reverses_adjustment_id: string | null;
    reversed_by: string | null;
    approved_by: string | null;
    created_at: Date;
  }>(
    `SELECT a.id, a.payer::text AS payer, a.kind::text AS kind, (a.amount * 100)::bigint AS amount_pence,
            to_char(a.effective_on, 'YYYY-MM-DD') AS effective_on, a.reason, a.reverses_adjustment_id,
            (SELECT x.id FROM adjustments x WHERE x.reverses_adjustment_id = a.id) AS reversed_by,
            u.full_name AS approved_by, a.created_at
       FROM adjustments a LEFT JOIN app_users u ON u.id = a.approved_by
      WHERE a.tenancy_id = $1 ORDER BY a.created_at DESC, a.id`,
    [ten[0].id],
  );
  return {
    tid: t,
    balances: bal.map((b) => ({ payer: b.payer, balancePence: Number(b.balance_pence) })),
    adjustments: rows.map((r) => ({
      id: r.id,
      payer: r.payer,
      kind: r.kind,
      amountPence: Number(r.amount_pence),
      effectiveOn: r.effective_on,
      reason: r.reason,
      reversesAdjustmentId: r.reverses_adjustment_id,
      reversedByAdjustmentId: r.reversed_by,
      approvedBy: r.approved_by,
      createdAt: r.created_at.toISOString(),
    })),
  };
}

export interface CreateAdjustmentInput {
  tid: string;
  payer: Payer;
  kind: 'write_off' | 'refund';
  amountPence: number;
  reason: string;
  effectiveOn?: string;
}

export async function createAdjustment(db: ActorDb, userId: string, input: CreateAdjustmentInput): Promise<ReturnType<typeof listAdjustments>> {
  const reason = input.reason.trim();
  if (reason.length < 3 || reason.length > 500) throw new AppError('bad_request', 'Give a reason of 3 to 500 characters');
  if (!Number.isInteger(input.amountPence) || input.amountPence < 1) throw new AppError('bad_request', 'The amount must be at least 1p');
  if (!PAYERS.includes(input.payer)) throw new AppError('bad_request', 'Unknown payer');
  if (input.kind !== 'write_off' && input.kind !== 'refund') throw new AppError('bad_request', 'Kind must be write_off or refund');
  const tid = input.tid.trim().toUpperCase();
  return db.tx(async (c) => {
    const { rows: ten } = await c.query<{ id: string }>('SELECT id FROM tenancies WHERE tid = $1 FOR UPDATE', [tid]);
    if (!ten[0]) throw new AppError('not_found', `No tenancy with TID ${tid}`);
    const effectiveOn = input.effectiveOn;
    if (effectiveOn !== undefined) {
      if (!isCalendarDate(effectiveOn)) throw new AppError('bad_request', 'The effective date must be a date (YYYY-MM-DD)');
      const { rows: future } = await c.query<{ f: boolean }>('SELECT $1::date > current_date AS f', [effectiveOn]);
      if (future[0]!.f) throw new AppError('bad_request', 'The effective date cannot be in the future');
    }
    const { rows: bal } = await c.query<{ balance_pence: string }>(
      'SELECT (balance * 100)::bigint AS balance_pence FROM v_tenancy_balance WHERE tenancy_id = $1 AND payer = $2::payer_type',
      [ten[0].id, input.payer],
    );
    const balance = bal[0] ? Number(bal[0].balance_pence) : 0;
    if (input.kind === 'write_off') {
      if (input.amountPence > balance) throw new AppError('bad_request', `Write-off is more than the arrears (${money(Math.max(balance, 0))})`);
    } else if (input.amountPence > -balance) {
      throw new AppError('bad_request', `Refund is more than the credit (${money(Math.max(-balance, 0))})`);
    }
    const signed = input.kind === 'write_off' ? -input.amountPence : input.amountPence;
    await c.query(
      `INSERT INTO adjustments (tenancy_id, payer, kind, amount, effective_on, reason, approved_by)
       VALUES ($1, $2::payer_type, $3::adjustment_kind, ($4::bigint)::numeric / 100, coalesce($5::date, current_date), $6, $7)`,
      [ten[0].id, input.payer, input.kind === 'write_off' ? 'write_off' : 'refund_paid', signed, effectiveOn ?? null, reason, userId],
    );
    return listAdjustments(c, tid);
  });
}

export async function reverseAdjustment(db: ActorDb, userId: string, id: string, input: { reason: string }): Promise<ReturnType<typeof listAdjustments>> {
  const reason = input.reason.trim();
  if (reason.length < 3 || reason.length > 500) throw new AppError('bad_request', 'Give a reason of 3 to 500 characters');
  return db.tx(async (c) => {
    const { rows } = await c.query<{ tenancy_id: string; payer: Payer; kind: string; amount_pence: string; tid: string }>(
      `SELECT a.tenancy_id, a.payer::text AS payer, a.kind::text AS kind, (a.amount * 100)::bigint AS amount_pence, t.tid
         FROM adjustments a JOIN tenancies t ON t.id = a.tenancy_id WHERE a.id = $1 FOR UPDATE OF a`,
      [id],
    );
    const a = rows[0];
    if (!a) throw new AppError('not_found', 'No such adjustment');
    if (a.kind !== 'write_off' && a.kind !== 'refund_paid') throw new AppError('conflict', 'Only a write-off or a refund can be reversed');
    const { rows: done } = await c.query('SELECT 1 FROM adjustments WHERE reverses_adjustment_id = $1', [id]);
    if (done.length > 0) throw new AppError('conflict', 'This adjustment was already reversed');
    await c.query(
      `INSERT INTO adjustments (tenancy_id, payer, kind, amount, effective_on, reason, approved_by, reverses_adjustment_id)
       VALUES ($1, $2::payer_type, 'correction', ($3::bigint)::numeric / 100, current_date, $4, $5, $6)`,
      [a.tenancy_id, a.payer, -Number(a.amount_pence), `Reverses ${a.kind}: ${reason}`, userId, id],
    );
    return listAdjustments(c, a.tid);
  });
}
