/**
 * agentOS single Take a Payment: one payment for one agentOS tenant, posted to the Omnia ledger
 * (tenant +amount, bank -amount) and exported at most once (not_exported -> exported -> posted)
 * through the Take a Payment CSV. The CSV is stored in agentos_exports (source 'manual').
 */
import type { ActorDb } from '../../db/context.js';
import type { Pool } from '../../db/pool.js';
import { takePaymentPostings } from '../../domain/ledger/posting.js';
import { AppError } from '../../lib/errors.js';
import { pounds } from '../export/statement-csv.js';
import { getTenantBalance, postTransaction } from '../ledger/ledger.service.js';
import { buildTakePaymentCsv, paymentFrom } from './export.service.js';

export interface PaymentOptionsDto {
  depositAccounts: { code: string; label: string }[];
  paymentTypes: { code: string; label: string }[];
}

export interface PaymentDto {
  id: string;
  clientRequestId: string;
  tid: string;
  paymentFrom: string;
  depositAccountCode: string;
  depositTo: string;
  paymentType: string;
  amountPence: number;
  description: string;
  cardAuthCode: string | null;
  postingStatus: 'not_exported' | 'exported' | 'posted';
  exportId: string | null;
  postedAt: string | null;
  createdAt: string;
}

export interface PaymentExportDto {
  id: string;
  rowsTotal: number;
  amountTotalPence: number;
  createdAt: string;
}

interface PaymentRow {
  id: string;
  client_request_id: string;
  agentos_tenant_id: string | null;
  tid: string;
  payment_from: string;
  receiving_account_code: string;
  deposit_to: string;
  payment_type: string;
  amount_pence: string | number;
  description: string;
  card_auth_code: string | null;
  posting_status: 'not_exported' | 'exported' | 'posted';
  export_id: string | null;
  posted_at: Date | null;
  created_at: Date;
}

const PAYMENT_COLS =
  'id, client_request_id, agentos_tenant_id, tid, payment_from, receiving_account_code, deposit_to, payment_type, amount_pence, description, card_auth_code, posting_status, export_id, posted_at, created_at';

function paymentDto(r: PaymentRow): PaymentDto {
  return {
    id: r.id,
    clientRequestId: r.client_request_id,
    tid: r.tid,
    paymentFrom: r.payment_from,
    depositAccountCode: r.receiving_account_code,
    depositTo: r.deposit_to,
    paymentType: r.payment_type,
    amountPence: Number(r.amount_pence),
    description: r.description,
    cardAuthCode: r.card_auth_code,
    postingStatus: r.posting_status,
    exportId: r.export_id,
    postedAt: r.posted_at ? r.posted_at.toISOString() : null,
    createdAt: r.created_at.toISOString(),
  };
}

export async function listPaymentOptions(pool: Pool): Promise<PaymentOptionsDto> {
  const accounts = await pool.query<{ code: string; label: string }>(
    'SELECT code, account_name AS label FROM bank_accounts WHERE is_active ORDER BY code',
  );
  const types = await pool.query<{ code: string; label: string }>(
    'SELECT code, label FROM agentos_payment_types WHERE is_active ORDER BY code',
  );
  return { depositAccounts: accounts.rows, paymentTypes: types.rows };
}

export interface CreatePaymentInput {
  clientRequestId: string;
  agentosTenantId: string;
  depositAccountCode: string;
  paymentType: string;
  amountPence: number;
  description: string;
  cardAuthCode?: string | undefined;
  userId: string;
}

export async function createPayment(
  db: ActorDb,
  input: CreatePaymentInput,
): Promise<{ payment: PaymentDto; balancePence: number; created: boolean }> {
  return db.tx(async (c) => {
    const tenantRes = await c.query<{ id: string; tid: string | null; forename: string; surname: string }>(
      'SELECT id, tid, forename, surname FROM agentos_tenants WHERE id = $1',
      [input.agentosTenantId],
    );
    const tenant = tenantRes.rows[0];
    if (!tenant) throw new AppError('bad_request', 'No such agentOS tenant');
    if (!tenant.tid) throw new AppError('bad_request', 'This agentOS tenant has no TID');
    const tid = tenant.tid;
    const bank = await c.query<{ account_name: string }>(
      'SELECT account_name FROM bank_accounts WHERE code = $1 AND is_active',
      [input.depositAccountCode],
    );
    if (!bank.rows[0]) throw new AppError('bad_request', 'Unknown or inactive deposit account');
    const type = await c.query<{ label: string }>('SELECT label FROM agentos_payment_types WHERE code = $1 AND is_active', [
      input.paymentType,
    ]);
    const typeLabel = type.rows[0]?.label;
    if (typeLabel === undefined) throw new AppError('bad_request', 'Unknown payment type');

    const ins = await c.query<PaymentRow>(
      `INSERT INTO agentos_payments (client_request_id, agentos_tenant_id, tid, payment_from, receiving_account_code,
                                     deposit_to, payment_type, amount_pence, description, card_auth_code, created_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
       ON CONFLICT (client_request_id) DO NOTHING RETURNING ${PAYMENT_COLS}`,
      [
        input.clientRequestId,
        tenant.id,
        tid,
        paymentFrom(tid, tenant.forename, tenant.surname),
        input.depositAccountCode,
        bank.rows[0].account_name,
        input.paymentType,
        input.amountPence,
        input.description,
        input.cardAuthCode ?? null,
        input.userId,
      ],
    );
    const row = ins.rows[0];
    if (!row) {
      const ex = await c.query<PaymentRow>(`SELECT ${PAYMENT_COLS} FROM agentos_payments WHERE client_request_id = $1`, [
        input.clientRequestId,
      ]);
      const e = ex.rows[0]!;
      const same =
        e.agentos_tenant_id === tenant.id &&
        e.receiving_account_code === input.depositAccountCode &&
        e.payment_type === input.paymentType &&
        Number(e.amount_pence) === input.amountPence &&
        e.description === input.description &&
        e.card_auth_code === (input.cardAuthCode ?? null);
      if (!same) throw new AppError('conflict', 'clientRequestId was already used for a different payment');
      return { payment: paymentDto(e), balancePence: await getTenantBalance(c, e.tid), created: false };
    }
    const description = (`Take a Payment (${typeLabel})` + (input.description ? ` - ${input.description}` : '')).slice(0, 300);
    await postTransaction(c, {
      kind: 'take_payment',
      sourceId: row.id,
      description,
      createdBy: input.userId,
      postings: takePaymentPostings(tid, input.depositAccountCode, input.amountPence),
    });
    return { payment: paymentDto(row), balancePence: await getTenantBalance(c, tid), created: true };
  });
}

export async function createPaymentExport(db: ActorDb, input: { userId: string }): Promise<PaymentExportDto> {
  return db.tx(async (c) => {
    await c.query("SELECT pg_advisory_xact_lock(hashtext('agentos-payment-export'))");
    const { rows } = await c.query<{
      id: string;
      tid: string;
      payment_from: string;
      deposit_to: string;
      type_label: string;
      amount_pence: string | number;
      description: string;
      card_auth_code: string | null;
    }>(
      `SELECT p.id, p.tid, p.payment_from, p.deposit_to, t.label AS type_label, p.amount_pence, p.description, p.card_auth_code
         FROM agentos_payments p JOIN agentos_payment_types t ON t.code = p.payment_type
        WHERE p.posting_status = 'not_exported'
        ORDER BY p.created_at, p.id FOR UPDATE OF p`,
    );
    const csvRows = rows.map((p) => [
      p.tid,
      p.payment_from,
      p.deposit_to,
      p.type_label,
      pounds(BigInt(p.amount_pence)),
      [p.description, p.card_auth_code ? `Auth ${p.card_auth_code}` : '', `Recon ${p.id}`].filter((s) => s !== '').join(' | '),
    ]);
    const total = rows.reduce((s, p) => s + Number(p.amount_pence), 0);
    const ins = await c.query<{ id: string; created_at: Date }>(
      `INSERT INTO agentos_exports (batch_id, source, rows_total, amount_total_pence, csv, created_by)
       VALUES (NULL, 'manual', $1, $2, $3, $4) RETURNING id, created_at`,
      [rows.length, total, buildTakePaymentCsv(csvRows), input.userId],
    );
    const exp = ins.rows[0]!;
    if (rows.length > 0) {
      await c.query(
        `UPDATE agentos_payments SET posting_status = 'exported', export_id = $1, updated_at = now()
          WHERE id = ANY($2::uuid[])`,
        [exp.id, rows.map((p) => p.id)],
      );
    }
    return { id: exp.id, rowsTotal: rows.length, amountTotalPence: total, createdAt: exp.created_at.toISOString() };
  });
}

export async function listPayments(pool: Pool): Promise<PaymentDto[]> {
  const { rows } = await pool.query<PaymentRow>(
    `SELECT ${PAYMENT_COLS} FROM agentos_payments ORDER BY created_at DESC, id LIMIT 200`,
  );
  return rows.map(paymentDto);
}

export async function markPaymentPosted(db: ActorDb, input: { paymentId: string; userId: string }): Promise<PaymentDto> {
  return db.tx(async (c) => {
    const upd = await c.query<PaymentRow>(
      `UPDATE agentos_payments SET posting_status = 'posted', posted_at = now(), posted_by = $2, updated_at = now()
        WHERE id = $1 AND posting_status = 'exported' RETURNING ${PAYMENT_COLS}`,
      [input.paymentId, input.userId],
    );
    if (upd.rows[0]) return paymentDto(upd.rows[0]);
    const cur = await c.query<{ posting_status: string }>('SELECT posting_status FROM agentos_payments WHERE id = $1', [
      input.paymentId,
    ]);
    const s = cur.rows[0]?.posting_status;
    if (s === undefined) throw new AppError('not_found', 'No such payment');
    if (s === 'posted') throw new AppError('conflict', 'This payment is already marked posted');
    throw new AppError('conflict', 'Only exported payments can be marked posted');
  });
}
