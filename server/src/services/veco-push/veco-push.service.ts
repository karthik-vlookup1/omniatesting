/**
 * Push confirmed receipts straight into VECO's TEST database, read them back, list and delete them.
 *
 * Omnia Recon keeps its own history (veco_push_batch / veco_push_item). A receipt counts as "sent" through an
 * external_refs row (system 'vico', external_id 'veco-push:<TransactionPK>', external_key2 NULL), so v_vico_export
 * stops offering it and the manual Vico export cannot send it twice; the export history queries ignore it.
 * Success is judged by reading the rows back from VECO, never by the write's own answer.
 */
import { createHash } from 'node:crypto';
import type { ActorDb } from '../../db/context.js';
import type { Pool, PoolClient } from '../../db/pool.js';
import { VecoSourceError } from '../../jobs/veco-sync/mcp-client.js';
import { AppError } from '../../lib/errors.js';
import type { AuthUser } from '../auth.service.js';
import { getVicoSettings, normaliseSortCode } from '../vico/vico.service.js';
import { classify, HELD_MESSAGES, type Candidate, type Held, type ReadyInput } from './classify.js';
import { crossCheck, totalsOf, type BankTotal, type StoredItem, type VerifyResult } from './crosscheck.js';
import type { VecoGateway } from './gateway.js';
import { buildRows, type BuiltRow } from './row-builder.js';
import { BANK_ACCOUNT, BANK_SORT, MAX_PUSH_RECEIPTS, TARGET_DB, type Department } from './settings.js';

export interface PushDeps {
  pool: Pool;
  gateway: VecoGateway | null;
  now: () => Date;
}

/** Same lock key as the manual Vico export: the two options must never race for the same receipts. */
const EXPORT_LOCK = 0x7631c0;
const SYSTEM = 'vico';

// ---------------------------------------------------------------------------------------------------------------------
// helpers

const conflict = (message: string, reason: string, extra: object = {}) =>
  new AppError('conflict', message, { reason, ...extra });

function requireGateway(deps: PushDeps): VecoGateway {
  if (!deps.gateway) throw conflict('VECO push is not configured', 'veco_push_not_configured');
  return deps.gateway;
}

/** Runs a gateway call; a VECO failure becomes a 409 with a short message (never the URL). */
async function viaVeco<T>(fn: () => Promise<T>): Promise<T> {
  try {
    return await fn();
  } catch (err) {
    if (err instanceof AppError) throw err;
    const message = err instanceof VecoSourceError || err instanceof Error ? err.message : 'unknown error';
    throw conflict(`VECO error: ${message.slice(0, 300)}`, 'veco_error');
  }
}

const errText = (err: unknown): string => (err instanceof Error ? err.message : String(err)).slice(0, 300);

type Queryable = Pool | PoolClient;

// ---------------------------------------------------------------------------------------------------------------------
// staff link

export interface StaffLink {
  userId: string;
  staffFk: string;
  source: 'email' | 'admin';
  canPush: boolean;
}

export interface VecoPushStatus {
  configured: boolean;
  targetDb: string;
  me: {
    linked: boolean;
    staffFk: string | null;
    canPush: boolean;
    source: 'email' | 'admin' | null;
    linkProblem: string | null;
  };
}

async function readLink(q: Queryable, userId: string): Promise<StaffLink | null> {
  const { rows } = await q.query<{ user_id: string; staff_fk: string; source: 'email' | 'admin'; can_push: boolean }>(
    'SELECT user_id, staff_fk, source, can_push FROM veco_staff_link WHERE user_id = $1',
    [userId],
  );
  const r = rows[0];
  return r ? { userId: r.user_id, staffFk: r.staff_fk.toUpperCase(), source: r.source, canPush: r.can_push } : null;
}

/** The user's link, creating an e-mail link (push NOT allowed yet) when VECO has exactly one Staff row for them. */
async function resolveLink(
  deps: PushDeps,
  db: ActorDb,
  user: AuthUser,
): Promise<{ link: StaffLink | null; problem: string | null }> {
  const existing = await readLink(deps.pool, user.id);
  if (existing) return { link: existing, problem: null };
  if (!deps.gateway) return { link: null, problem: null };
  let matches: string[];
  try {
    matches = await deps.gateway.findStaffByEmail(user.email);
  } catch {
    return { link: null, problem: 'VECO could not be reached to look you up' };
  }
  if (matches.length === 0) return { link: null, problem: 'No VECO staff member has your e-mail address' };
  if (matches.length > 1) return { link: null, problem: 'More than one VECO staff member has your e-mail address' };
  await db.tx(async (c) => {
    await c.query(
      `INSERT INTO veco_staff_link (user_id, staff_fk, source, can_push, updated_by)
       VALUES ($1, $2, 'email', false, $3) ON CONFLICT (user_id) DO NOTHING`,
      [user.id, matches[0], user.email],
    );
  });
  return { link: await readLink(deps.pool, user.id), problem: null };
}

export async function getStatus(deps: PushDeps, db: ActorDb, user: AuthUser): Promise<VecoPushStatus> {
  const { link, problem } = await resolveLink(deps, db, user);
  return {
    configured: deps.gateway !== null,
    targetDb: TARGET_DB,
    me: {
      linked: link !== null,
      staffFk: link?.staffFk ?? null,
      canPush: link?.canPush ?? false,
      source: link?.source ?? null,
      linkProblem: problem,
    },
  };
}

async function requirePushLink(deps: PushDeps, db: ActorDb, user: AuthUser): Promise<StaffLink> {
  const { link } = await resolveLink(deps, db, user);
  if (!link) throw new AppError('forbidden', 'No VECO user linked to your account');
  if (!link.canPush) throw new AppError('forbidden', 'You have no VECO push permission');
  return link;
}

// ---------------------------------------------------------------------------------------------------------------------
// candidates and preview

const CANDIDATE_SELECT = `
SELECT v.receipt_id, v.tid, v.amount::text AS amount, to_char(v.date, 'YYYY-MM-DD') AS payment_date,
       COALESCE(b.code, 'MANUAL') AS source_bank, tn.full_name AS tenant_name,
       concat_ws(', ', p.address_line1, p.postcode) AS property, l.name AS landlord
  FROM v_vico_export v
  JOIN receipts r ON r.id = v.receipt_id
  JOIN tenancies t ON t.id = r.tenancy_id
  JOIN properties p ON p.id = t.property_id
  LEFT JOIN landlords l ON l.id = p.landlord_id
  LEFT JOIN bank_transactions bt ON bt.id = r.bank_transaction_id
  LEFT JOIN bank_accounts b ON b.id = bt.bank_account_id
  LEFT JOIN tenancy_tenants tt ON tt.tenancy_id = r.tenancy_id AND tt.is_lead AND tt.left_on IS NULL
  LEFT JOIN tenants tn ON tn.id = tt.tenant_id
 WHERE v.receipt_id = ANY($1::uuid[])
 ORDER BY v.date, v.tid, v.receipt_id`;

interface CandidateRow {
  receipt_id: string;
  tid: string;
  amount: string;
  payment_date: string;
  source_bank: string;
  tenant_name: string | null;
  property: string | null;
  landlord: string | null;
}

async function loadCandidates(q: Queryable, ids: string[]): Promise<Candidate[]> {
  const { rows } = await q.query<CandidateRow>(CANDIDATE_SELECT, [ids]);
  return rows.map((r) => ({
    receiptId: r.receipt_id,
    tid: r.tid,
    amount: r.amount,
    paymentDate: r.payment_date,
    sourceBank: r.source_bank,
    tenantName: r.tenant_name,
    property: r.property,
    landlord: r.landlord,
  }));
}

export interface PreviewReady {
  receiptId: string;
  tid: string;
  tenantName: string | null;
  amount: string;
  paymentDate: string;
  sourceBank: string;
  department: string;
  departmentFromVeco: boolean;
}

export interface PreviewResult {
  ready: PreviewReady[];
  held: Held[];
  /** Every receipt that was selected and still exists, ready or held. */
  byBank: BankTotal[];
  total: string;
  readyTotal: string;
}

interface Classified {
  ready: ReadyInput[];
  held: Held[];
  candidates: Candidate[];
}

async function bankMatches(q: Queryable): Promise<boolean> {
  const s = await getVicoSettings(q as Pool);
  return Boolean(s.sortCode && normaliseSortCode(s.sortCode) === BANK_SORT && s.accountNumber === BANK_ACCOUNT);
}

/** Reads the receipts, asks VECO (read-only), and sorts them into ready and held. Writes nothing anywhere. */
async function classifyReceipts(
  deps: PushDeps,
  q: Queryable,
  receiptIds: string[],
  departments: Record<string, Department>,
): Promise<Classified> {
  const gateway = requireGateway(deps);
  const ids = [...new Set(receiptIds)];
  const candidates = await loadCandidates(q, ids);
  const found = new Set(candidates.map((c) => c.receiptId));
  const missing: Held[] = ids
    .filter((id) => !found.has(id))
    .map((id) => ({
      receiptId: id,
      tid: '',
      amount: '0.00',
      paymentDate: '',
      sourceBank: '',
      code: 'already_sent',
      message: HELD_MESSAGES.already_sent,
      needsDepartment: false,
    }));
  const bankOk = await bankMatches(q);
  await viaVeco(() => gateway.assertTargetDb());
  const lookups = candidates.length ? await viaVeco(() => gateway.lookupTenants(candidates.map((c) => c.tid))) : [];
  const { ready, held } = classify(candidates, lookups, { bankOk, sentIds: new Set(), departments });
  return { ready, held: [...missing, ...held], candidates };
}

const toPreviewReady = (r: ReadyInput): PreviewReady => ({
  receiptId: r.candidate.receiptId,
  tid: r.candidate.tid,
  tenantName: r.candidate.tenantName,
  amount: r.candidate.amount,
  paymentDate: r.candidate.paymentDate,
  sourceBank: r.candidate.sourceBank,
  department: r.department,
  departmentFromVeco: r.departmentFromVeco,
});

export interface PushRequest {
  receiptIds: string[];
  departments: Record<string, Department>;
}

export async function previewPush(deps: PushDeps, req: PushRequest): Promise<PreviewResult> {
  const { ready, held, candidates } = await classifyReceipts(deps, deps.pool, req.receiptIds, req.departments);
  const all = totalsOf(candidates.map((c) => ({ bank: c.sourceBank, amount: c.amount })));
  return {
    ready: ready.map(toPreviewReady),
    held,
    byBank: all.byBank,
    total: all.total,
    readyTotal: totalsOf(ready.map((r) => ({ bank: r.candidate.sourceBank, amount: r.candidate.amount }))).total,
  };
}

// ---------------------------------------------------------------------------------------------------------------------
// batches

export type BatchStatus = 'previewed' | 'pushing' | 'pushed' | 'verified' | 'failed' | 'deleted';

export interface VecoPushBatch {
  id: string;
  batchReference: string;
  status: BatchStatus;
  receipts: number;
  total: string;
  totalsByBank: BankTotal[];
  held: Held[];
  pushedBy: string;
  createdAt: string;
  pushedAt: string | null;
  verifiedAt: string | null;
  deletedAt: string | null;
  error: string | null;
  /** true / false after a cross-check, null when none has run (or the push failed). */
  verifyOk: boolean | null;
}

interface BatchRow {
  id: string;
  idempotency_key: string;
  target_db: string;
  batch_reference: string;
  pushed_by: string;
  pushed_by_name: string;
  staff_fk: string;
  status: BatchStatus;
  receipts: number;
  total: string;
  totals_by_bank: BankTotal[];
  held: Held[];
  verify_result: VerifyResult | null;
  error: string | null;
  created_at: Date;
  pushed_at: Date | null;
  verified_at: Date | null;
  deleted_at: Date | null;
}

const BATCH_SELECT = `
SELECT b.id, b.idempotency_key, b.target_db, b.batch_reference, b.pushed_by, COALESCE(u.full_name, '') AS pushed_by_name,
       b.staff_fk, b.status, b.receipts, b.total::text AS total, b.totals_by_bank, b.held, b.verify_result, b.error,
       b.created_at, b.pushed_at, b.verified_at, b.deleted_at
  FROM veco_push_batch b LEFT JOIN app_users u ON u.id = b.pushed_by`;

const iso = (d: Date | null) => (d ? d.toISOString() : null);

const toBatch = (r: BatchRow): VecoPushBatch => ({
  id: r.id,
  batchReference: r.batch_reference,
  status: r.status,
  receipts: r.receipts,
  total: r.total,
  totalsByBank: r.totals_by_bank,
  held: r.held,
  pushedBy: r.pushed_by_name,
  createdAt: r.created_at.toISOString(),
  pushedAt: iso(r.pushed_at),
  verifiedAt: iso(r.verified_at),
  deletedAt: iso(r.deleted_at),
  error: r.error,
  verifyOk: r.verify_result ? r.verify_result.ok : null,
});

async function loadBatch(q: Queryable, id: string): Promise<BatchRow> {
  const { rows } = await q.query<BatchRow>(`${BATCH_SELECT} WHERE b.id = $1`, [id]);
  if (!rows[0]) throw new AppError('not_found', 'No such VECO push');
  return rows[0];
}

interface ItemRow {
  id: string;
  payment_id: string;
  source_bank: string;
  tid: string;
  amount: string;
  payment_date: string;
  transaction_pk: string;
  allocation_pk: string;
  banking_ref: string;
  veco_row: Record<string, unknown>;
  allocation_row: Record<string, unknown>;
  status: string;
  property: string | null;
  landlord: string | null;
}

async function loadItems(q: Queryable, batchId: string): Promise<ItemRow[]> {
  const { rows } = await q.query<ItemRow>(
    `SELECT i.id, i.payment_id, i.source_bank, i.tid, i.amount::text AS amount, to_char(i.payment_date, 'YYYY-MM-DD') AS payment_date,
            i.transaction_pk, i.allocation_pk, i.banking_ref, i.veco_row, i.allocation_row, i.status,
            concat_ws(', ', p.address_line1, p.postcode) AS property, l.name AS landlord
       FROM veco_push_item i
       JOIN receipts r ON r.id = i.payment_id
       JOIN tenancies t ON t.id = r.tenancy_id
       JOIN properties p ON p.id = t.property_id
       LEFT JOIN landlords l ON l.id = p.landlord_id
      WHERE i.batch_id = $1
      ORDER BY i.payment_date, i.tid, i.payment_id`,
    [batchId],
  );
  return rows;
}

const toStored = (i: ItemRow): StoredItem => ({
  receiptId: i.payment_id,
  transactionPk: i.transaction_pk.toUpperCase(),
  allocationPk: i.allocation_pk.toUpperCase(),
  tid: i.tid,
  amount: i.amount,
  paymentDate: i.payment_date,
  sourceBank: i.source_bank,
  bankingRef: i.banking_ref,
  vecoRow: i.veco_row,
  allocationRow: i.allocation_row,
  property: i.property,
  landlord: i.landlord,
});

const refId = (transactionPk: string) => `veco-push:${transactionPk.toUpperCase()}`;

async function removeRefs(c: PoolClient, transactionPks: string[]): Promise<void> {
  await c.query(
    `DELETE FROM external_refs
      WHERE system = $1 AND entity_type = 'receipt' AND external_key2 IS NULL AND external_id = ANY($2::text[])`,
    [SYSTEM, transactionPks.map(refId)],
  );
}

export interface PushResult {
  batch: VecoPushBatch;
  verify: VerifyResult | null;
  held: Held[];
  replay: boolean;
}

export interface PushInput extends PushRequest {
  idempotencyKey: string;
}

async function replayResult(q: Queryable, key: string, user: AuthUser): Promise<PushResult | null> {
  const { rows } = await q.query<BatchRow>(`${BATCH_SELECT} WHERE b.idempotency_key = $1`, [key]);
  const row = rows[0];
  if (!row) return null;
  if (row.pushed_by !== user.id) throw conflict('That push key was used by someone else', 'idempotency_key_used');
  return { batch: toBatch(row), verify: row.verify_result, held: row.held, replay: true };
}

export async function pushToVeco(deps: PushDeps, db: ActorDb, user: AuthUser, input: PushInput): Promise<PushResult> {
  const gateway = requireGateway(deps);
  const replayed = await replayResult(deps.pool, input.idempotencyKey, user);
  if (replayed) return replayed;

  const link = await requirePushLink(deps, db, user);
  const at = deps.now();
  const first = await classifyReceipts(deps, deps.pool, input.receiptIds, input.departments);
  if (first.ready.length === 0) {
    throw conflict('Nothing can be pushed: every selected receipt is held back', 'nothing_ready', { held: first.held });
  }

  // Claim the receipts (and re-check they are still pending) under the same lock as the manual export.
  const claimed = await db.tx(async (c): Promise<PushResult | { batchId: string; rows: BuiltRow[]; held: Held[] }> => {
    await c.query('SELECT pg_advisory_xact_lock($1)', [EXPORT_LOCK]);
    const again = await replayResult(c, input.idempotencyKey, user);
    if (again) return again;

    const { rows: pending } = await c.query<{ receipt_id: string }>(
      'SELECT receipt_id FROM v_vico_export WHERE receipt_id = ANY($1::uuid[])',
      [first.ready.map((r) => r.candidate.receiptId)],
    );
    const stillPending = new Set(pending.map((p) => p.receipt_id));
    const ready = first.ready.filter((r) => stillPending.has(r.candidate.receiptId));
    const held: Held[] = [
      ...first.held,
      ...first.ready
        .filter((r) => !stillPending.has(r.candidate.receiptId))
        .map((r): Held => ({
          receiptId: r.candidate.receiptId,
          tid: r.candidate.tid,
          amount: r.candidate.amount,
          paymentDate: r.candidate.paymentDate,
          sourceBank: r.candidate.sourceBank,
          code: 'already_sent',
          message: HELD_MESSAGES.already_sent,
          needsDepartment: false,
        })),
    ];
    if (ready.length === 0) throw conflict('Nothing can be pushed: every selected receipt was just sent', 'nothing_ready', { held });
    if (ready.length > MAX_PUSH_RECEIPTS) throw new AppError('bad_request', `At most ${MAX_PUSH_RECEIPTS} receipts per push`);

    const built = buildRows(ready, { at, staffFk: link.staffFk });
    const same = await c.query(
      "SELECT 1 FROM veco_push_batch WHERE batch_reference = $1 AND status IN ('pushing', 'pushed', 'verified') LIMIT 1",
      [built.batchReference],
    );
    if (same.rowCount) {
      throw conflict('A push was already made in this minute: wait until the next minute', 'same_minute');
    }

    const totals = totalsOf(built.rows.map((r) => ({ bank: r.sourceBank, amount: r.amount })));
    const { rows: ins } = await c.query<{ id: string }>(
      `INSERT INTO veco_push_batch (idempotency_key, target_db, batch_reference, pushed_by, staff_fk, status, receipts, total,
                                    totals_by_bank, held)
       VALUES ($1, $2, $3, $4, $5, 'pushing', $6, $7, $8::jsonb, $9::jsonb) RETURNING id`,
      [
        input.idempotencyKey,
        TARGET_DB,
        built.batchReference,
        user.id,
        link.staffFk,
        built.rows.length,
        totals.total,
        JSON.stringify(totals.byBank),
        JSON.stringify(held),
      ],
    );
    const batchId = ins[0]!.id;
    for (const r of built.rows) {
      await c.query(
        `INSERT INTO veco_push_item (batch_id, payment_id, source_bank, tid, amount, payment_date, transaction_pk, allocation_pk,
                                     banking_ref, veco_row, allocation_row, status)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10::jsonb, $11::jsonb, 'pushing')`,
        [
          batchId,
          r.receiptId,
          r.sourceBank,
          r.tid,
          r.amount,
          r.paymentDate,
          r.transactionPk,
          r.allocationPk,
          r.bankingRef,
          JSON.stringify(r.tx),
          JSON.stringify(r.alloc),
        ],
      );
    }
    await c.query(
      `INSERT INTO external_refs (system, entity_type, entity_id, external_id, external_key2, last_synced_at, last_synced_hash)
       SELECT $1, 'receipt', r.id, r.ext, NULL, $2, r.hash FROM unnest($3::uuid[], $4::text[], $5::text[]) AS r(id, ext, hash)`,
      [
        SYSTEM,
        at,
        built.rows.map((r) => r.receiptId),
        built.rows.map((r) => refId(r.transactionPk)),
        built.rows.map((r) => createHash('sha256').update(`${r.tid}|${r.amount}`).digest('hex')),
      ],
    );
    return { batchId, rows: built.rows, held };
  });
  if ('replay' in claimed) return claimed;

  const { batchId, rows, held } = claimed;
  const txPks = rows.map((r) => r.transactionPk);
  const alPks = rows.map((r) => r.allocationPk);

  let pushError: string | null = null;
  try {
    await gateway.assertTargetDb();
    await gateway.insertReceipts(rows);
  } catch (err) {
    pushError = errText(err);
  }

  let present: Record<string, unknown>[];
  try {
    present = await gateway.readBack(txPks, alPks);
  } catch (err) {
    // Unknown outcome: leave the batch 'pushing' (the receipts stay marked) and let View reconcile it.
    throw conflict(
      `VECO did not answer the cross-check (${errText(err)}). The push is saved as "pushing": open it from Earlier VECO pushes to check.`,
      'veco_error',
      { batchId },
    );
  }
  await settle(deps, db, batchId, rows.length, present, pushError);
  const batch = await loadBatch(deps.pool, batchId);
  const items = await loadItems(deps.pool, batchId);
  const verify = batch.status === 'failed' ? null : await recordVerify(db, batch, items, present, deps.now());
  const final = verify ? await loadBatch(deps.pool, batchId) : batch;
  return { batch: toBatch(final), verify, held, replay: false };
}

/** Moves a 'pushing' batch to pushed / failed according to how many rows VECO really holds. */
async function settle(
  deps: PushDeps,
  db: ActorDb,
  batchId: string,
  expected: number,
  present: Record<string, unknown>[],
  pushError: string | null,
): Promise<void> {
  const found = new Set(present.map((r) => String(r.TransactionPK).toUpperCase()));
  await db.tx(async (c) => {
    const { rows: items } = await c.query<{ id: string; transaction_pk: string }>(
      'SELECT id, transaction_pk FROM veco_push_item WHERE batch_id = $1',
      [batchId],
    );
    if (found.size === expected) {
      await c.query("UPDATE veco_push_item SET status = 'pushed' WHERE batch_id = $1", [batchId]);
      await c.query("UPDATE veco_push_batch SET status = 'pushed', pushed_at = $2, error = NULL WHERE id = $1", [batchId, deps.now()]);
      return;
    }
    if (found.size === 0) {
      await removeRefs(c, items.map((i) => i.transaction_pk));
      await c.query("UPDATE veco_push_item SET status = 'failed', error = $2 WHERE batch_id = $1", [batchId, pushError]);
      await c.query("UPDATE veco_push_batch SET status = 'failed', error = $2 WHERE id = $1", [
        batchId,
        pushError ?? 'VECO has none of the rows after the push',
      ]);
      return;
    }
    // Partial: keep the markers so nothing can be sent twice, and make a person look.
    for (const i of items) {
      await c.query('UPDATE veco_push_item SET status = $2 WHERE id = $1', [i.id, found.has(i.transaction_pk.toUpperCase()) ? 'pushed' : 'failed']);
    }
    await c.query("UPDATE veco_push_batch SET status = 'failed', error = $2 WHERE id = $1", [
      batchId,
      `partial: only ${found.size} of ${expected} rows are in VECO. Check VECO${pushError ? ` (${pushError})` : ''}`.slice(0, 500),
    ]);
  });
}

async function recordVerify(
  db: ActorDb,
  batch: BatchRow,
  items: ItemRow[],
  present: Record<string, unknown>[],
  now: Date,
): Promise<VerifyResult> {
  const live = items.filter((i) => i.status === 'pushed' || i.status === 'pushing');
  const verify = crossCheck(live.map(toStored), present, now);
  await db.tx(async (c) => {
    await c.query(
      `UPDATE veco_push_batch SET verify_result = $2::jsonb, verified_at = $3,
              status = CASE WHEN status IN ('pushed', 'verified') THEN $4 ELSE status END
        WHERE id = $1`,
      [batch.id, JSON.stringify(verify), now, verify.ok ? 'verified' : 'pushed'],
    );
  });
  return verify;
}

export interface VerifyOutcome {
  batch: VecoPushBatch;
  verify: VerifyResult | null;
}

/** Re-reads the rows from VECO (and reconciles a batch left 'pushing') and runs the cross-check. */
export async function verifyBatch(deps: PushDeps, db: ActorDb, batchId: string): Promise<VerifyOutcome> {
  const gateway = requireGateway(deps);
  const batch = await loadBatch(deps.pool, batchId);
  if (batch.status === 'deleted') throw conflict('This push was deleted from VECO', 'already_deleted');
  if (batch.status === 'failed') return { batch: toBatch(batch), verify: batch.verify_result };
  if (batch.target_db !== TARGET_DB) throw conflict('This push is not for the test database', 'wrong_database');
  const items = await loadItems(deps.pool, batchId);
  const txPks = items.map((i) => i.transaction_pk.toUpperCase());
  const alPks = items.map((i) => i.allocation_pk.toUpperCase());
  await viaVeco(() => gateway.assertTargetDb());
  const present = await viaVeco(() => gateway.readBack(txPks, alPks));
  if (batch.status === 'pushing') {
    await settle(deps, db, batchId, items.length, present, null);
    const settled = await loadBatch(deps.pool, batchId);
    if (settled.status === 'failed') return { batch: toBatch(settled), verify: null };
    const verify = await recordVerify(db, settled, await loadItems(deps.pool, batchId), present, deps.now());
    return { batch: toBatch(await loadBatch(deps.pool, batchId)), verify };
  }
  const verify = await recordVerify(db, batch, items, present, deps.now());
  return { batch: toBatch(await loadBatch(deps.pool, batchId)), verify };
}

/** A CSV cell: quote when needed, and never let a spreadsheet read it as a formula. */
function cell(value: string): string {
  const safe = /^[=+\-@\t\r]/.test(value) && !/^-?\d+(\.\d+)?$/.test(value) ? `'${value}` : value;
  return /[",\r\n]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
}

export async function readbackCsv(
  deps: PushDeps,
  db: ActorDb,
  batchId: string,
): Promise<{ fileName: string; csv: string }> {
  const { batch, verify } = await verifyBatch(deps, db, batchId);
  if (!verify) throw conflict('There is nothing to read back for this push', 'no_readback');
  const header = ['Date', 'TID', 'Tenant', 'Property', 'Landlord', 'Department', 'Amount', 'Banking ref', 'TransactionPK', 'Check', 'Differences'];
  const lines = [
    header,
    ...verify.rows.map((r) => [
      r.date,
      r.tid,
      r.tenantName ?? '',
      r.property ?? '',
      r.landlord ?? '',
      r.department ?? '',
      r.amount,
      r.bankingRef,
      r.transactionPk,
      r.ok ? 'OK' : 'DIFFERENT',
      r.diffs.join('; '),
    ]),
  ];
  return {
    fileName: `veco-push-${batch.batchReference}.csv`,
    csv: lines.map((l) => l.map(cell).join(',')).join('\r\n') + '\r\n',
  };
}

export interface DeleteResult {
  batch: VecoPushBatch;
  remaining: { transactions: number; allocations: number; total: string };
}

/** Deletes only the rows this push created (by stored PKs), proves none remain, then frees the receipts. */
export async function deleteBatch(deps: PushDeps, db: ActorDb, user: AuthUser, batchId: string): Promise<DeleteResult> {
  const gateway = requireGateway(deps);
  const batch = await loadBatch(deps.pool, batchId);
  if (batch.status !== 'pushed' && batch.status !== 'verified') {
    throw conflict(`A push that is "${batch.status}" cannot be deleted`, 'not_deletable');
  }
  if (batch.target_db !== TARGET_DB) throw conflict('This push is not for the test database', 'wrong_database');
  await requirePushLink(deps, db, user);

  const items = (await loadItems(deps.pool, batchId)).filter((i) => i.status === 'pushed');
  const txPks = items.map((i) => i.transaction_pk.toUpperCase());
  const alPks = items.map((i) => i.allocation_pk.toUpperCase());
  await viaVeco(() => gateway.assertTargetDb());
  await viaVeco(() => gateway.deleteReceipts(txPks, alPks));
  const remaining = await viaVeco(() => gateway.countRemaining(txPks, alPks));
  if (remaining.transactions !== 0 || remaining.allocations !== 0 || Number(remaining.total) !== 0) {
    throw conflict('Some rows are still in VECO after the delete; nothing was changed here', 'rows_remain', { remaining });
  }
  await db.tx(async (c) => {
    await c.query("UPDATE veco_push_batch SET status = 'deleted', deleted_at = $2 WHERE id = $1", [batchId, deps.now()]);
    await c.query("UPDATE veco_push_item SET status = 'deleted' WHERE batch_id = $1 AND status = 'pushed'", [batchId]);
    await removeRefs(c, txPks);
  });
  return { batch: toBatch(await loadBatch(deps.pool, batchId)), remaining };
}

export async function listBatches(pool: Pool): Promise<VecoPushBatch[]> {
  const { rows } = await pool.query<BatchRow>(`${BATCH_SELECT} ORDER BY b.created_at DESC LIMIT 100`);
  return rows.map(toBatch);
}

// ---------------------------------------------------------------------------------------------------------------------
// admin: staff links

export interface StaffLinkRow {
  userId: string;
  fullName: string;
  email: string;
  role: string;
  staffFk: string | null;
  canPush: boolean;
  source: 'email' | 'admin' | null;
}

export async function listStaffLinks(pool: Pool): Promise<StaffLinkRow[]> {
  const { rows } = await pool.query<{
    user_id: string;
    full_name: string;
    email: string;
    role: string;
    staff_fk: string | null;
    can_push: boolean | null;
    source: 'email' | 'admin' | null;
  }>(
    `SELECT u.id AS user_id, u.full_name, u.email, u.role, l.staff_fk, l.can_push, l.source
       FROM app_users u LEFT JOIN veco_staff_link l ON l.user_id = u.id
      WHERE u.is_active AND u.role IN ('admin', 'accounts')
      ORDER BY u.full_name, u.email`,
  );
  return rows.map((r) => ({
    userId: r.user_id,
    fullName: r.full_name,
    email: r.email,
    role: r.role,
    staffFk: r.staff_fk ? r.staff_fk.toUpperCase() : null,
    canPush: r.can_push ?? false,
    source: r.source,
  }));
}

/** Admin sets (or, with staffFk null, removes) a user's VECO StaffPK and push permission. */
export async function saveStaffLink(
  deps: PushDeps,
  db: ActorDb,
  actor: AuthUser,
  userId: string,
  input: { staffFk: string | null; canPush: boolean },
): Promise<StaffLinkRow[]> {
  const { rows: users } = await deps.pool.query('SELECT 1 FROM app_users WHERE id = $1', [userId]);
  if (users.length === 0) throw new AppError('not_found', 'No such user');
  if (input.staffFk === null) {
    await db.tx(async (c) => {
      await c.query('DELETE FROM veco_staff_link WHERE user_id = $1', [userId]);
    });
  } else {
    const gateway = requireGateway(deps);
    await viaVeco(() => gateway.assertTargetDb());
    const exists = await viaVeco(() => gateway.staffExists(input.staffFk!));
    if (!exists) throw new AppError('bad_request', 'No VECO staff member has that StaffPK');
    await db.tx(async (c) => {
      await c.query(
        `INSERT INTO veco_staff_link (user_id, staff_fk, source, can_push, updated_by)
         VALUES ($1, $2, 'admin', $3, $4)
         ON CONFLICT (user_id) DO UPDATE SET staff_fk = EXCLUDED.staff_fk, source = 'admin', can_push = EXCLUDED.can_push,
                                             updated_by = EXCLUDED.updated_by, updated_at = now()`,
        [userId, input.staffFk!.toUpperCase(), input.canPush, actor.email],
      );
    });
  }
  return listStaffLinks(deps.pool);
}
