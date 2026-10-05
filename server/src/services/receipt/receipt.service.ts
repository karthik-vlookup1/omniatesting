/**
 * Receipt operations: read receipts and bank lines, split a bank line into exact-sum receipts, pin
 * allocations by hand, reverse a receipt.
 *
 * Fixed rules
 * - Money is whole pence (integers) in TypeScript. SQL writes `($n::bigint)::numeric/100` and reads
 *   `(amount*100)::bigint`, so no amount ever passes through a float.
 * - Roles: every GET is for any signed-in user; every write is requireRole('accounts') (+ admin) and
 *   needs the CSRF header (enforced in the routes).
 * - Xero state of a receipt (external-state.ts): none | queued | sending | stuck | sent; vicoExported
 *   when Vico has it.
 * - Reverse: none/queued -> allowed (the Xero send-time re-check drops reversed lines and deletes the
 *   claim). sending/stuck -> 409 "sort it out on the Xero page first". sent -> 409 unless
 *   body.xeroCreditRef (the number of the credit note staff raised in Xero; the bridge has no
 *   credit-note call). vicoExported -> 409 unless body.vicoNote (how it was corrected in Vico). Both are
 *   stored in receipts.external_correction.
 * - Allocation overrides and adjustments are Recon-only (Xero never receives allocations or
 *   adjustments), so they are allowed in every Xero/Vico state.
 * - Split / remittance only CREATE receipts on a bank line (never edit sent ones); to re-split a
 *   confirmed line, reverse its receipts first (same rules).
 */
import type { ActorDb } from '../../db/context.js';
import type { Pool, PoolClient } from '../../db/pool.js';
import { AppError } from '../../lib/errors.js';
import { externalState, type XeroState } from './external-state.js';

export type Payer = 'tenant' | 'council_hb' | 'dwp_uc' | 'other_third_party';
export const PAYERS: readonly Payer[] = ['tenant', 'council_hb', 'dwp_uc', 'other_third_party'];

export const PAGE_SIZE = 50;

/** True for a real YYYY-MM-DD calendar date (2026-02-30 is not). */
export function isCalendarDate(s: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(s) && !Number.isNaN(Date.parse(s)) && new Date(`${s}T00:00:00Z`).toISOString().slice(0, 10) === s;
}

export const pounds = (pence: number): string => `${Math.floor(Math.abs(pence) / 100)}.${String(Math.abs(pence) % 100).padStart(2, '0')}`;
export const money = (pence: number): string => `${pence < 0 ? '-' : ''}£${pounds(pence)}`;

export interface ReceiptSummary {
  id: string;
  tid: string;
  tenancyId: string;
  payer: Payer;
  amountPence: number;
  receivedOn: string;
  status: 'active' | 'reversed';
  matchedVia: string;
  allocationMode: 'auto' | 'manual';
  allocatedPence: number;
  bankTransactionId: string | null;
  xeroState: XeroState;
  vicoExported: boolean;
}

export interface ReceiptDetail extends ReceiptSummary {
  reversedReason: string | null;
  externalCorrection: string | null;
  bankLine: { id: string; txnDate: string; description: string; amountPence: number; remainingPence: number } | null;
  allocations: { id: string; rentChargeId: string; periodStart: string; dueDate: string; amountPence: number; allocatedBy: string }[];
  /** outstandingPence = what this receipt could still put on the charge (its own allocation excluded). */
  openCharges: { id: string; periodStart: string; dueDate: string; amountPence: number; outstandingPence: number }[];
}

export interface BankLineView {
  id: string;
  txnDate: string;
  description: string;
  amountPence: number;
  remainingPence: number;
  status: string;
  receipts: { id: string; tid: string; payer: Payer; amountPence: number }[];
  remittance: { id: string; payingBody: string; remittanceRef: string | null; remittanceDate: string; totalPence: number } | null;
}

interface SummaryRow {
  id: string;
  tid: string;
  tenancy_id: string;
  payer: Payer;
  amount_pence: string;
  received_on: string;
  status: 'active' | 'reversed';
  matched_via: string;
  allocation_mode: 'auto' | 'manual';
  allocated_pence: string;
  bank_transaction_id: string | null;
  reversed_reason: string | null;
  external_correction: string | null;
}

const SUMMARY_SELECT = `
SELECT r.id, t.tid, r.tenancy_id, r.payer::text AS payer, (r.amount * 100)::bigint AS amount_pence,
       to_char(r.received_on, 'YYYY-MM-DD') AS received_on, r.status::text AS status, r.matched_via::text AS matched_via,
       r.allocation_mode, coalesce((SELECT (sum(a.amount) * 100)::bigint FROM allocations a WHERE a.receipt_id = r.id), 0) AS allocated_pence,
       r.bank_transaction_id, r.reversed_reason, r.external_correction
  FROM receipts r
  JOIN tenancies t ON t.id = r.tenancy_id
  LEFT JOIN bank_transactions bt ON bt.id = r.bank_transaction_id`;

function toSummary(r: SummaryRow, ext: { xeroState: XeroState; vicoExported: boolean } | undefined): ReceiptSummary {
  return {
    id: r.id,
    tid: r.tid,
    tenancyId: r.tenancy_id,
    payer: r.payer,
    amountPence: Number(r.amount_pence),
    receivedOn: r.received_on,
    status: r.status,
    matchedVia: r.matched_via,
    allocationMode: r.allocation_mode,
    allocatedPence: Number(r.allocated_pence),
    bankTransactionId: r.bank_transaction_id,
    xeroState: ext?.xeroState ?? 'none',
    vicoExported: ext?.vicoExported ?? false,
  };
}

export interface ReceiptQuery {
  tid?: string;
  status?: 'active' | 'reversed';
  bankTransactionId?: string;
  page: number;
}

export async function listReceipts(
  pool: Pool | PoolClient,
  q: ReceiptQuery,
): Promise<{ receipts: ReceiptSummary[]; total: number; page: number; pageSize: number }> {
  const where = `($1::text IS NULL OR t.tid = $1) AND ($2::text IS NULL OR r.status::text = $2)
                 AND ($3::uuid IS NULL OR r.bank_transaction_id = $3)`;
  const params = [q.tid?.trim().toUpperCase() || null, q.status ?? null, q.bankTransactionId ?? null];
  const page = Math.max(1, q.page);
  const { rows } = await pool.query<SummaryRow>(
    `${SUMMARY_SELECT} WHERE ${where} ORDER BY r.received_on DESC, r.created_at DESC, r.id LIMIT ${PAGE_SIZE} OFFSET ${(page - 1) * PAGE_SIZE}`,
    params,
  );
  const { rows: count } = await pool.query<{ n: number }>(
    `SELECT count(*)::int AS n FROM receipts r JOIN tenancies t ON t.id = r.tenancy_id WHERE ${where}`,
    params,
  );
  const ext = await externalState(
    pool,
    rows.map((r) => r.id),
  );
  return { receipts: rows.map((r) => toSummary(r, ext.get(r.id))), total: count[0]!.n, page, pageSize: PAGE_SIZE };
}

export async function getReceipt(pool: Pool | PoolClient, id: string): Promise<ReceiptDetail> {
  const { rows } = await pool.query<SummaryRow>(`${SUMMARY_SELECT} WHERE r.id = $1`, [id]);
  const r = rows[0];
  if (!r) throw new AppError('not_found', 'No such receipt');
  const ext = await externalState(pool, [id]);

  let bankLine: ReceiptDetail['bankLine'] = null;
  if (r.bank_transaction_id) {
    const line = await getBankLine(pool, r.bank_transaction_id);
    bankLine = {
      id: line.id,
      txnDate: line.txnDate,
      description: line.description,
      amountPence: line.amountPence,
      remainingPence: line.remainingPence,
    };
  }
  const { rows: allocs } = await pool.query<{
    id: string;
    rent_charge_id: string;
    period_start: string;
    due_date: string;
    amount_pence: string;
    allocated_by: string;
  }>(
    `SELECT a.id, a.rent_charge_id, to_char(rc.period_start, 'YYYY-MM-DD') AS period_start,
            to_char(rc.due_date, 'YYYY-MM-DD') AS due_date, (a.amount * 100)::bigint AS amount_pence, a.allocated_by
       FROM allocations a JOIN rent_charges rc ON rc.id = a.rent_charge_id
      WHERE a.receipt_id = $1 ORDER BY rc.due_date, rc.period_start`,
    [id],
  );
  const { rows: charges } = await pool.query<{
    id: string;
    period_start: string;
    due_date: string;
    amount_pence: string;
    outstanding_pence: string;
  }>(
    `SELECT cs.id, to_char(cs.period_start, 'YYYY-MM-DD') AS period_start, to_char(cs.due_date, 'YYYY-MM-DD') AS due_date,
            (cs.amount * 100)::bigint AS amount_pence,
            ((cs.outstanding + coalesce(own.amount, 0)) * 100)::bigint AS outstanding_pence
       FROM v_charge_status cs
       LEFT JOIN allocations own ON own.rent_charge_id = cs.id AND own.receipt_id = $1
      WHERE cs.tenancy_id = $2 AND cs.payer::text = $3 AND (cs.outstanding > 0 OR own.id IS NOT NULL)
      ORDER BY cs.due_date, cs.period_start`,
    [id, r.tenancy_id, r.payer],
  );
  return {
    ...toSummary(r, ext.get(id)),
    reversedReason: r.reversed_reason,
    externalCorrection: r.external_correction,
    bankLine,
    allocations: allocs.map((a) => ({
      id: a.id,
      rentChargeId: a.rent_charge_id,
      periodStart: a.period_start,
      dueDate: a.due_date,
      amountPence: Number(a.amount_pence),
      allocatedBy: a.allocated_by,
    })),
    openCharges: charges.map((c) => ({
      id: c.id,
      periodStart: c.period_start,
      dueDate: c.due_date,
      amountPence: Number(c.amount_pence),
      outstandingPence: Number(c.outstanding_pence),
    })),
  };
}

export async function getBankLine(pool: Pool | PoolClient, id: string): Promise<BankLineView> {
  const { rows } = await pool.query<{
    id: string;
    txn_date: string;
    description: string;
    amount_pence: string;
    remaining_pence: string;
    status: string;
  }>(
    `SELECT bt.id, to_char(bt.txn_date, 'YYYY-MM-DD') AS txn_date, bt.description, (bt.amount * 100)::bigint AS amount_pence,
            ((bt.amount - coalesce((SELECT sum(r.amount) FROM receipts r WHERE r.bank_transaction_id = bt.id AND r.status = 'active'), 0)) * 100)::bigint AS remaining_pence,
            bt.status::text AS status
       FROM bank_transactions bt WHERE bt.id = $1`,
    [id],
  );
  const l = rows[0];
  if (!l) throw new AppError('not_found', 'No such bank line');
  const { rows: receipts } = await pool.query<{ id: string; tid: string; payer: Payer; amount_pence: string }>(
    `SELECT r.id, t.tid, r.payer::text AS payer, (r.amount * 100)::bigint AS amount_pence
       FROM receipts r JOIN tenancies t ON t.id = r.tenancy_id
      WHERE r.bank_transaction_id = $1 AND r.status = 'active' ORDER BY r.created_at, r.id`,
    [id],
  );
  const { rows: rem } = await pool.query<{
    id: string;
    paying_body: string;
    remittance_ref: string | null;
    remittance_date: string;
    total_pence: string;
  }>(
    `SELECT id, paying_body, remittance_ref, to_char(remittance_date, 'YYYY-MM-DD') AS remittance_date, (total_amount * 100)::bigint AS total_pence
       FROM remittance_advices WHERE bank_transaction_id = $1 AND superseded_at IS NULL`,
    [id],
  );
  return {
    id: l.id,
    txnDate: l.txn_date,
    description: l.description,
    amountPence: Number(l.amount_pence),
    remainingPence: Number(l.remaining_pence),
    status: l.status,
    receipts: receipts.map((r) => ({ id: r.id, tid: r.tid, payer: r.payer, amountPence: Number(r.amount_pence) })),
    remittance: rem[0]
      ? {
          id: rem[0].id,
          payingBody: rem[0].paying_body,
          remittanceRef: rem[0].remittance_ref,
          remittanceDate: rem[0].remittance_date,
          totalPence: Number(rem[0].total_pence),
        }
      : null,
  };
}

/** A business-rule RAISE EXCEPTION (P0001) from the database becomes a 400 with its message. */
export function mapRuleError(err: unknown): never {
  const e = err as { code?: string; message?: string };
  if (e.code === 'P0001') {
    const m = e.message ?? 'This change is not allowed';
    if (/^Allocation exceeds receipt/.test(m)) throw new AppError('bad_request', 'Allocations exceed the receipt');
    if (/^Allocation exceeds charge/.test(m)) throw new AppError('bad_request', 'Allocation exceeds what is outstanding on the charge');
    throw new AppError('bad_request', m);
  }
  throw err;
}

export interface SplitPart {
  tid: string;
  payer: Payer;
  amountPence: number;
}

export async function splitLine(
  db: ActorDb,
  userId: string,
  input: { bankTransactionId: string; parts: SplitPart[] },
): Promise<BankLineView> {
  const { bankTransactionId, parts } = input;
  if (parts.length < 2 || parts.length > 200) throw new AppError('bad_request', 'Split a line into 2 to 200 parts');
  const seen = new Set<string>();
  for (const p of parts) {
    if (!Number.isInteger(p.amountPence) || p.amountPence < 1) throw new AppError('bad_request', 'Every part needs an amount of at least 1p');
    if (!PAYERS.includes(p.payer)) throw new AppError('bad_request', 'Unknown payer');
    const key = `${p.tid.trim().toUpperCase()}|${p.payer}`;
    if (seen.has(key)) throw new AppError('bad_request', `${p.tid.trim().toUpperCase()} appears twice for the same payer; combine the parts`);
    seen.add(key);
  }
  return db.tx(async (c) => {
    const { rows: lines } = await c.query<{ status: string; amount_pence: string }>(
      'SELECT status::text AS status, (amount * 100)::bigint AS amount_pence FROM bank_transactions WHERE id = $1 FOR UPDATE',
      [bankTransactionId],
    );
    if (!lines[0]) throw new AppError('not_found', 'No such bank line');
    if (lines[0].status === 'excluded') throw new AppError('conflict', 'This line is excluded; include it again first');
    if (Number(lines[0].amount_pence) <= 0) throw new AppError('conflict', 'Money going out cannot be matched to rent');

    const tids = [...new Set(parts.map((p) => p.tid.trim().toUpperCase()))];
    const { rows: tenancies } = await c.query<{ id: string; tid: string }>('SELECT id, tid FROM tenancies WHERE tid = ANY($1::text[])', [tids]);
    const byTid = new Map(tenancies.map((t) => [t.tid, t.id]));
    for (const tid of tids) if (!byTid.has(tid)) throw new AppError('bad_request', `Unknown TID ${tid}`);

    const line = await getBankLine(c, bankTransactionId);
    const sum = parts.reduce((s, p) => s + p.amountPence, 0);
    if (sum !== line.remainingPence) {
      throw new AppError('bad_request', `Parts add up to ${money(sum)} but ${money(line.remainingPence)} is left on this bank line`);
    }
    for (const p of parts) {
      try {
        await c.query("SELECT confirm_match($1, $2, $3::payer_type, 'manual', false, $4, ($5::bigint)::numeric / 100)", [
          bankTransactionId,
          byTid.get(p.tid.trim().toUpperCase()),
          p.payer,
          userId,
          p.amountPence,
        ]);
      } catch (err) {
        mapRuleError(err);
      }
    }
    return getBankLine(c, bankTransactionId);
  });
}

export interface AllocationInput {
  rentChargeId: string;
  amountPence: number;
}

export async function overrideAllocations(
  db: ActorDb,
  _userId: string,
  receiptId: string,
  items: AllocationInput[],
): Promise<ReceiptDetail> {
  if (items.length > 100) throw new AppError('bad_request', 'At most 100 allocations');
  const ids = new Set<string>();
  for (const i of items) {
    if (!Number.isInteger(i.amountPence) || i.amountPence < 1) throw new AppError('bad_request', 'Every allocation needs an amount of at least 1p');
    if (ids.has(i.rentChargeId)) throw new AppError('bad_request', 'A rent charge can only appear once');
    ids.add(i.rentChargeId);
  }
  return db.tx(async (c) => {
    const { rows } = await c.query<{ tenancy_id: string; payer: Payer; status: string; amount_pence: string }>(
      'SELECT tenancy_id, payer::text AS payer, status::text AS status, (amount * 100)::bigint AS amount_pence FROM receipts WHERE id = $1 FOR UPDATE',
      [receiptId],
    );
    const r = rows[0];
    if (!r) throw new AppError('not_found', 'No such receipt');
    if (r.status === 'reversed') throw new AppError('conflict', 'This receipt is reversed');

    const total = items.reduce((s, i) => s + i.amountPence, 0);
    if (total > Number(r.amount_pence)) {
      throw new AppError('bad_request', `Allocations ${money(total)} exceed the receipt ${money(Number(r.amount_pence))}`);
    }
    if (items.length > 0) {
      const { rows: charges } = await c.query<{ id: string; tenancy_id: string; payer: Payer; available_pence: string }>(
        `SELECT rc.id, rc.tenancy_id, rc.payer::text AS payer,
                ((rc.amount - coalesce((SELECT sum(a.amount) FROM allocations a WHERE a.rent_charge_id = rc.id AND a.receipt_id <> $2), 0)) * 100)::bigint AS available_pence
           FROM rent_charges rc WHERE rc.id = ANY($1::uuid[])`,
        [[...ids], receiptId],
      );
      const byId = new Map(charges.map((ch) => [ch.id, ch]));
      for (const i of items) {
        const ch = byId.get(i.rentChargeId);
        if (!ch) throw new AppError('bad_request', 'Unknown rent charge');
        if (ch.tenancy_id !== r.tenancy_id || ch.payer !== r.payer) {
          throw new AppError('bad_request', 'A charge must be on the same tenancy and for the same payer as the receipt');
        }
        if (i.amountPence > Number(ch.available_pence)) {
          throw new AppError(
            'bad_request',
            `Allocation ${money(i.amountPence)} is more than the ${money(Number(ch.available_pence))} outstanding on that charge`,
          );
        }
      }
    }
    try {
      await c.query('DELETE FROM allocations WHERE receipt_id = $1', [receiptId]);
      for (const i of items) {
        await c.query(
          `INSERT INTO allocations (receipt_id, rent_charge_id, amount, allocated_by)
           VALUES ($1, $2, ($3::bigint)::numeric / 100, $4)`,
          [receiptId, i.rentChargeId, i.amountPence, db.actorEmail],
        );
      }
      await c.query("UPDATE receipts SET allocation_mode = 'manual' WHERE id = $1", [receiptId]);
      await c.query('SELECT reallocate_tenancy($1)', [r.tenancy_id]);
    } catch (err) {
      mapRuleError(err);
    }
    return getReceipt(c, receiptId);
  });
}

export async function resetAllocations(db: ActorDb, receiptId: string): Promise<ReceiptDetail> {
  return db.tx(async (c) => {
    const { rows } = await c.query<{ tenancy_id: string; status: string }>(
      'SELECT tenancy_id, status::text AS status FROM receipts WHERE id = $1 FOR UPDATE',
      [receiptId],
    );
    if (!rows[0]) throw new AppError('not_found', 'No such receipt');
    if (rows[0].status === 'reversed') throw new AppError('conflict', 'This receipt is reversed');
    try {
      await c.query("UPDATE receipts SET allocation_mode = 'auto' WHERE id = $1", [receiptId]);
      await c.query('DELETE FROM allocations WHERE receipt_id = $1', [receiptId]);
      await c.query('SELECT allocate_oldest_first($1)', [receiptId]);
      await c.query('SELECT reallocate_tenancy($1)', [rows[0].tenancy_id]);
    } catch (err) {
      mapRuleError(err);
    }
    return getReceipt(c, receiptId);
  });
}

export interface ReverseInput {
  reason: string;
  xeroCreditRef?: string;
  vicoNote?: string;
}

export async function reverseReceipt(db: ActorDb, userId: string, receiptId: string, input: ReverseInput): Promise<ReceiptDetail> {
  const reason = input.reason.trim();
  if (reason.length < 3 || reason.length > 500) throw new AppError('bad_request', 'Give a reason of 3 to 500 characters');
  const xeroRef = input.xeroCreditRef?.trim() || undefined;
  const vicoNote = input.vicoNote?.trim() || undefined;
  if (xeroRef !== undefined && xeroRef.length > 50) throw new AppError('bad_request', 'The Xero credit note number is at most 50 characters');
  if (vicoNote !== undefined && vicoNote.length > 200) throw new AppError('bad_request', 'The Vico note is at most 200 characters');

  return db.tx(async (c) => {
    const { rows } = await c.query<{ tenancy_id: string; status: string; bank_transaction_id: string | null }>(
      'SELECT tenancy_id, status::text AS status, bank_transaction_id FROM receipts WHERE id = $1 FOR UPDATE',
      [receiptId],
    );
    const r = rows[0];
    if (!r) throw new AppError('not_found', 'No such receipt');
    if (r.status === 'reversed') throw new AppError('conflict', 'This receipt is already reversed');

    const ext = (await externalState(c, [receiptId])).get(receiptId)!;
    const corrections: string[] = [];
    if (ext.xeroState === 'sending') {
      throw new AppError('conflict', 'This receipt is being sent to Xero; sort it out on the Xero page first');
    }
    if (ext.xeroState === 'stuck') {
      throw new AppError('conflict', 'Its Xero batch failed; sort it out on the Xero page first');
    }
    if (ext.xeroState === 'sent') {
      if (!xeroRef) {
        throw new AppError('conflict', 'This receipt is already in Xero; raise a credit note there and give its number (xeroCreditRef)');
      }
      corrections.push(`Xero credit note ${xeroRef}`);
    }
    if (ext.vicoExported) {
      if (!vicoNote) {
        throw new AppError('conflict', 'This receipt was exported to Vico; say how it was corrected there (vicoNote)');
      }
      corrections.push(`Vico: ${vicoNote}`);
    }

    await c.query('DELETE FROM allocations WHERE receipt_id = $1', [receiptId]);
    await c.query(
      `UPDATE receipts SET status = 'reversed', reversed_reason = $2, reversed_by = $3, reversed_at = now(), external_correction = $4
        WHERE id = $1`,
      [receiptId, reason, userId, corrections.length > 0 ? corrections.join('; ') : null],
    );
    await c.query('SELECT reallocate_tenancy($1)', [r.tenancy_id]);
    if (r.bank_transaction_id) await c.query('SELECT recompute_line_status($1)', [r.bank_transaction_id]);
    return getReceipt(c, receiptId);
  });
}
