/** Omnia ledger writes and reads. Rows are append-only; a transaction is idempotent on kind:source_id. */
import type { QueryResult, QueryResultRow } from 'pg';
import type { Pool } from '../../db/pool.js';
import { validatePostings, type Posting } from '../../domain/ledger/posting.js';

export interface Queryable {
  query<R extends QueryResultRow = QueryResultRow>(text: string, values?: unknown[]): Promise<QueryResult<R>>;
}

export interface LedgerPostingDto {
  transactionId: string;
  kind: string;
  effectiveOn: string;
  description: string;
  accountType: string | null;
  amountPence: number;
  createdAt: string;
}

export interface TenantLedgerDto {
  tid: string;
  balancePence: number;
  postings: LedgerPostingDto[];
}

export async function postTransaction(
  c: Queryable,
  input: {
    kind: 'take_payment' | 'journal_transfer';
    sourceId: string;
    description: string;
    createdBy: string;
    postings: Posting[];
  },
): Promise<{ transactionId: string; created: boolean }> {
  validatePostings(input.postings);
  const key = `${input.kind}:${input.sourceId}`;
  const ins = await c.query<{ id: string }>(
    `INSERT INTO ledger_transactions (kind, source_id, idempotency_key, description, created_by)
     VALUES ($1, $2, $3, $4, $5) ON CONFLICT (idempotency_key) DO NOTHING RETURNING id`,
    [input.kind, input.sourceId, key, input.description, input.createdBy],
  );
  const row = ins.rows[0];
  if (!row) {
    const existing = await c.query<{ id: string }>('SELECT id FROM ledger_transactions WHERE idempotency_key = $1', [key]);
    return { transactionId: existing.rows[0]!.id, created: false };
  }
  for (const p of input.postings) {
    await c.query(
      `INSERT INTO ledger_postings (transaction_id, account_kind, account_ref, account_type, amount_pence)
       VALUES ($1, $2, $3, $4, $5)`,
      [row.id, p.accountKind, p.accountRef, p.accountType ?? null, p.amountPence],
    );
  }
  return { transactionId: row.id, created: true };
}

export async function getTenantBalance(c: Queryable, tid: string): Promise<number> {
  const { rows } = await c.query<{ b: string | null }>(
    "SELECT sum(amount_pence) AS b FROM ledger_postings WHERE account_kind = 'tenant' AND account_ref = $1",
    [tid],
  );
  return Number(rows[0]?.b ?? 0);
}

export async function getTenantLedger(pool: Pool, tid: string): Promise<TenantLedgerDto> {
  const { rows } = await pool.query<{
    transaction_id: string;
    kind: string;
    effective_on: string;
    description: string;
    account_type: string | null;
    amount_pence: string | number;
    created_at: Date;
  }>(
    `SELECT p.transaction_id, t.kind, to_char(t.effective_on, 'YYYY-MM-DD') AS effective_on, t.description,
            p.account_type, p.amount_pence, p.created_at
       FROM ledger_postings p JOIN ledger_transactions t ON t.id = p.transaction_id
      WHERE p.account_kind = 'tenant' AND p.account_ref = $1
      ORDER BY p.created_at DESC, p.id LIMIT 100`,
    [tid],
  );
  return {
    tid,
    balancePence: await getTenantBalance(pool, tid),
    postings: rows.map((r) => ({
      transactionId: r.transaction_id,
      kind: r.kind,
      effectiveOn: r.effective_on,
      description: r.description,
      accountType: r.account_type,
      amountPence: Number(r.amount_pence),
      createdAt: r.created_at.toISOString(),
    })),
  };
}
