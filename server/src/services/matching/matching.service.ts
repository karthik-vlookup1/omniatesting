/**
 * Matching: runs the SQL cascade (suggest_matches / auto_match / confirm_match from migration
 * 002, tested by db/tests/002) over imported bank lines, and the actions staff take on them.
 *
 *   auto      every new line: one suggestion at or above AUTO_MATCH_THRESHOLD -> receipt created
 *   review    lines with suggestions: confirm one (optionally "remember" the payer), reject it,
 *             or pick another tenancy by TID
 *   yet to take  no suggestion: match manually by TID, or exclude (not rent)
 *
 * Xero is the ledger: a confirmed match creates a receipt (with its Xero ledger code); with no
 * local rent charges, allocate_oldest_first() has nothing to allocate and does nothing.
 */
import type { ActorDb } from '../../db/context.js';
import type { Pool, PoolClient } from '../../db/pool.js';
import { AppError } from '../../lib/errors.js';

export type LineStatus = 'new' | 'excluded' | 'needs_review' | 'yet_to_take' | 'partially_matched' | 'matched';
export type Payer = 'tenant' | 'council_hb' | 'dwp_uc' | 'other_third_party';

export interface MatchSummary {
  lines: number;
  autoMatched: number;
  matched: number;
  partiallyMatched: number;
  needsReview: number;
  yetToTake: number;
  excluded: number;
  unprocessed: number;
}

const OPEN_STATUSES: LineStatus[] = ['needs_review', 'yet_to_take', 'partially_matched'];

/** Runs auto_match on every still-new line (optionally only one import). */
export async function autoMatchPending(
  db: ActorDb,
  threshold: number,
  batchId?: string,
): Promise<{ processed: number; autoMatched: number }> {
  return db.tx(async (c) => {
    const { rows } = await c.query<{ id: string }>(
      `SELECT id FROM bank_transactions
        WHERE status = 'new' AND ($1::uuid IS NULL OR import_batch_id = $1)
        ORDER BY txn_date, created_at
        FOR UPDATE SKIP LOCKED`,
      [batchId ?? null],
    );
    let autoMatched = 0;
    for (const { id } of rows) {
      const { rows: r } = await c.query<{ status: LineStatus }>('SELECT auto_match($1, $2) AS status', [id, threshold]);
      if (r[0]!.status === 'matched') autoMatched += 1;
    }
    return { processed: rows.length, autoMatched };
  });
}

/** Where every line of one import stands now. */
export async function batchSummary(pool: Pool | PoolClient, batchId: string): Promise<MatchSummary> {
  const { rows } = await pool.query<Record<string, number>>(
    `SELECT count(*)::int AS lines,
            count(*) FILTER (WHERE bt.status = 'matched' AND auto.receipts > 0)::int AS auto_matched,
            count(*) FILTER (WHERE bt.status = 'matched')::int AS matched,
            count(*) FILTER (WHERE bt.status = 'partially_matched')::int AS partially_matched,
            count(*) FILTER (WHERE bt.status = 'needs_review')::int AS needs_review,
            count(*) FILTER (WHERE bt.status = 'yet_to_take')::int AS yet_to_take,
            count(*) FILTER (WHERE bt.status = 'excluded')::int AS excluded,
            count(*) FILTER (WHERE bt.status = 'new')::int AS unprocessed
       FROM bank_transactions bt
       LEFT JOIN LATERAL (SELECT count(*) AS receipts FROM receipts r
                           WHERE r.bank_transaction_id = bt.id AND r.matched_by IS NULL AND r.status = 'active') auto ON true
      WHERE bt.import_batch_id = $1`,
    [batchId],
  );
  const r = rows[0]!;
  if (r.lines === 0) {
    const { rows: b } = await pool.query('SELECT 1 FROM import_batches WHERE id = $1', [batchId]);
    if (b.length === 0) throw new AppError('not_found', 'No such import');
  }
  return {
    lines: r.lines!,
    autoMatched: r.auto_matched!,
    matched: r.matched!,
    partiallyMatched: r.partially_matched!,
    needsReview: r.needs_review!,
    yetToTake: r.yet_to_take!,
    excluded: r.excluded!,
    unprocessed: r.unprocessed!,
  };
}

export interface Suggestion {
  id: string;
  tid: string;
  tenantName: string | null;
  payer: Payer;
  method: string;
  confidence: number;
  reason: string | null;
  status: 'open' | 'accepted' | 'rejected';
}

export interface ReceiptView {
  id: string;
  tid: string;
  payer: Payer;
  amount: string;
  ledgerCode: string | null;
  matchedVia: string;
  matchedBy: string | null;
}

export interface BankLine {
  id: string;
  bankCode: string;
  importBatchId: string;
  txnDate: string;
  amount: string;
  remaining: string;
  description: string;
  reference: string | null;
  counterparty: string | null;
  payerAccountLast4: string | null;
  extractedTid: string | null;
  status: LineStatus;
  exclusionReason: string | null;
  note: string | null;
  suggestions: Suggestion[];
  receipts: ReceiptView[];
}

const LINE_SELECT = `
SELECT bt.id, b.code AS bank_code, bt.import_batch_id, to_char(bt.txn_date, 'YYYY-MM-DD') AS txn_date,
       bt.amount::text AS amount,
       (bt.amount - coalesce((SELECT sum(amount) FROM receipts r WHERE r.bank_transaction_id = bt.id AND r.status = 'active'), 0))::text AS remaining,
       bt.description, bt.reference, bt.counterparty, bt.payer_account_last4, bt.extracted_tid,
       bt.status::text AS status, bt.exclusion_reason, bt.note,
       coalesce((SELECT json_agg(json_build_object(
                   'id', s.id, 'tid', t.tid, 'tenantName', tn.full_name, 'payer', s.payer, 'method', s.method,
                   'confidence', s.confidence, 'reason', s.reason, 'status', s.status)
                   -- Fuzzy suggestions are all capped at 0.6: within a tie, the closest name first.
                   ORDER BY s.confidence DESC,
                            word_similarity(upper(coalesce(tn.full_name, '')),
                                            upper(bt.description || ' ' || coalesce(bt.reference, '') || ' ' || coalesce(bt.counterparty, ''))) DESC,
                            t.tid)
                  FROM match_suggestions s JOIN tenancies t ON t.id = s.tenancy_id
                  LEFT JOIN tenancy_tenants tt ON tt.tenancy_id = t.id AND tt.is_lead AND tt.left_on IS NULL
                  LEFT JOIN tenants tn ON tn.id = tt.tenant_id
                 WHERE s.bank_transaction_id = bt.id), '[]') AS suggestions,
       coalesce((SELECT json_agg(json_build_object(
                   'id', r.id, 'tid', t.tid, 'payer', r.payer, 'amount', r.amount::text, 'ledgerCode', r.ledger_code,
                   'matchedVia', r.matched_via, 'matchedBy', u.full_name) ORDER BY r.created_at)
                  FROM receipts r JOIN tenancies t ON t.id = r.tenancy_id LEFT JOIN app_users u ON u.id = r.matched_by
                 WHERE r.bank_transaction_id = bt.id AND r.status = 'active'), '[]') AS receipts
  FROM bank_transactions bt JOIN bank_accounts b ON b.id = bt.bank_account_id`;

interface LineRow {
  id: string;
  bank_code: string;
  import_batch_id: string;
  txn_date: string;
  amount: string;
  remaining: string;
  description: string;
  reference: string | null;
  counterparty: string | null;
  payer_account_last4: string | null;
  extracted_tid: string | null;
  status: LineStatus;
  exclusion_reason: string | null;
  note: string | null;
  suggestions: (Omit<Suggestion, 'confidence'> & { confidence: number | string })[];
  receipts: ReceiptView[];
}

function toLine(r: LineRow): BankLine {
  return {
    id: r.id,
    bankCode: r.bank_code,
    importBatchId: r.import_batch_id,
    txnDate: r.txn_date,
    amount: r.amount,
    remaining: r.remaining,
    description: r.description,
    reference: r.reference,
    counterparty: r.counterparty,
    payerAccountLast4: r.payer_account_last4,
    extractedTid: r.extracted_tid,
    status: r.status,
    exclusionReason: r.exclusion_reason,
    note: r.note,
    suggestions: r.suggestions.map((s) => ({ ...s, confidence: Number(s.confidence) })),
    receipts: r.receipts,
  };
}

export interface QueueQuery {
  status: LineStatus | 'open';
  bankAccountId?: string;
  batchId?: string;
  limit: number;
  offset: number;
}

export async function listLines(pool: Pool, q: QueueQuery): Promise<{ lines: BankLine[]; total: number }> {
  const statuses = q.status === 'open' ? OPEN_STATUSES : [q.status];
  const params: unknown[] = [statuses, q.bankAccountId ?? null, q.batchId ?? null];
  const where = `bt.status = ANY($1::txn_status[]) AND ($2::uuid IS NULL OR bt.bank_account_id = $2)
                 AND ($3::uuid IS NULL OR bt.import_batch_id = $3)`;
  const { rows } = await pool.query<LineRow>(
    `${LINE_SELECT} WHERE ${where} ORDER BY bt.txn_date, bt.created_at, bt.id LIMIT ${q.limit} OFFSET ${q.offset}`,
    params,
  );
  const { rows: count } = await pool.query<{ n: number }>(
    `SELECT count(*)::int AS n FROM bank_transactions bt WHERE ${where}`,
    params,
  );
  return { lines: rows.map(toLine), total: count[0]!.n };
}

export async function getLine(pool: Pool | PoolClient, id: string): Promise<BankLine> {
  const { rows } = await pool.query<LineRow>(`${LINE_SELECT} WHERE bt.id = $1`, [id]);
  if (!rows[0]) throw new AppError('not_found', 'No such bank line');
  return toLine(rows[0]);
}

async function lockLine(c: PoolClient, id: string) {
  const { rows } = await c.query<{ status: LineStatus; amount: string }>(
    'SELECT status::text AS status, amount::text AS amount FROM bank_transactions WHERE id = $1 FOR UPDATE',
    [id],
  );
  if (!rows[0]) throw new AppError('not_found', 'No such bank line');
  return rows[0];
}

export interface ConfirmInput {
  /** Either a suggestion to accept, or a TID to match to (manual / "pick another tenancy"). */
  suggestionId?: string;
  tid?: string;
  payer?: Payer;
  remember: boolean;
  /** Part of the line (bulk council payment); default the whole remaining amount. */
  amount?: string;
}

export async function confirmLine(db: ActorDb, lineId: string, userId: string, input: ConfirmInput): Promise<BankLine> {
  return db.tx(async (c) => {
    const line = await lockLine(c, lineId);
    if (line.status === 'matched') throw new AppError('conflict', 'This line is already fully matched');
    if (line.status === 'excluded') throw new AppError('conflict', 'This line is excluded; include it again first');
    if (Number(line.amount) <= 0) throw new AppError('bad_request', 'Money going out cannot be matched to rent');

    let tenancyId: string;
    let payer: Payer;
    let method: string;
    if (input.suggestionId) {
      const { rows } = await c.query<{ tenancy_id: string; payer: Payer; method: string; status: string }>(
        `SELECT tenancy_id, payer::text AS payer, method::text AS method, status::text AS status
           FROM match_suggestions WHERE id = $1 AND bank_transaction_id = $2`,
        [input.suggestionId, lineId],
      );
      const s = rows[0];
      if (!s) throw new AppError('not_found', 'No such suggestion on this line');
      if (s.status !== 'open') throw new AppError('conflict', 'That suggestion was already decided');
      tenancyId = s.tenancy_id;
      payer = input.payer ?? s.payer;
      method = s.method;
    } else {
      const tid = input.tid?.trim().toUpperCase() ?? '';
      const { rows } = await c.query<{ id: string }>('SELECT id FROM tenancies WHERE tid = $1', [tid]);
      if (!rows[0]) throw new AppError('bad_request', `No tenancy with TID ${tid || '(blank)'}`);
      tenancyId = rows[0].id;
      payer = input.payer ?? 'tenant';
      method = 'manual';
    }

    try {
      await c.query('SAVEPOINT confirm');
      await c.query('SELECT confirm_match($1, $2, $3::payer_type, $4::match_method, $5, $6, $7::numeric)', [
        lineId,
        tenancyId,
        payer,
        method,
        input.remember,
        userId,
        input.amount ?? null,
      ]);
    } catch (err) {
      await c.query('ROLLBACK TO SAVEPOINT confirm');
      const e = err as { code?: string; message?: string };
      // RAISE EXCEPTION from confirm_match / check triggers: a business rule, not a crash.
      if (e.code === 'P0001') throw new AppError('bad_request', e.message ?? 'This match is not allowed');
      throw err;
    }
    return getLine(c, lineId);
  });
}

export async function rejectSuggestion(db: ActorDb, lineId: string, suggestionId: string, userId: string): Promise<BankLine> {
  return db.tx(async (c) => {
    const line = await lockLine(c, lineId);
    const { rowCount } = await c.query(
      `UPDATE match_suggestions SET status = 'rejected', decided_by = $3, decided_at = now()
        WHERE id = $1 AND bank_transaction_id = $2 AND status = 'open'`,
      [suggestionId, lineId, userId],
    );
    if (!rowCount) throw new AppError('not_found', 'No open suggestion with that id on this line');
    const { rows } = await c.query<{ n: number }>(
      "SELECT count(*)::int AS n FROM match_suggestions WHERE bank_transaction_id = $1 AND status = 'open'",
      [lineId],
    );
    if (rows[0]!.n === 0 && line.status === 'needs_review') {
      await c.query("UPDATE bank_transactions SET status = 'yet_to_take', note = 'Yet to take' WHERE id = $1", [lineId]);
    }
    return getLine(c, lineId);
  });
}

export async function excludeLine(db: ActorDb, lineId: string, reason: string): Promise<BankLine> {
  return db.tx(async (c) => {
    const line = await lockLine(c, lineId);
    if (line.status === 'matched' || line.status === 'partially_matched') {
      throw new AppError('conflict', 'This line already has receipts; reverse them first');
    }
    // Suggestions are left as they are: the excluded status keeps the line out of the queue and
    // blocks confirming, and "include" can bring the line back with its suggestions intact.
    await c.query(
      `UPDATE bank_transactions SET status = 'excluded', exclusion_reason = $2 WHERE id = $1`,
      [lineId, reason],
    );
    return getLine(c, lineId);
  });
}

/** Puts an excluded money-in line back through the cascade. */
export async function includeLine(db: ActorDb, lineId: string, threshold: number): Promise<BankLine> {
  return db.tx(async (c) => {
    const line = await lockLine(c, lineId);
    if (line.status !== 'excluded') throw new AppError('conflict', 'Only an excluded line can be included again');
    if (Number(line.amount) <= 0) throw new AppError('bad_request', 'Money going out stays excluded');
    await c.query(
      "UPDATE bank_transactions SET status = 'new', exclusion_reason = NULL WHERE id = $1",
      [lineId],
    );
    await c.query('SELECT auto_match($1, $2)', [lineId, threshold]);
    // suggest_matches only counts suggestions it newly inserts; ones still open from before the
    // exclusion (UNIQUE per line/tenancy/method) mean the line belongs in review, not yet to take.
    await c.query(
      `UPDATE bank_transactions SET status = 'needs_review', note = NULL
        WHERE id = $1 AND status = 'yet_to_take'
          AND EXISTS (SELECT 1 FROM match_suggestions WHERE bank_transaction_id = $1 AND status = 'open')`,
      [lineId],
    );
    return getLine(c, lineId);
  });
}
