/** Bank account reference data. Only the last digits are stored, never full sort codes or account numbers. */
import type { ActorDb } from '../../db/context.js';
import type { Pool } from '../../db/pool.js';
import { AppError } from '../../lib/errors.js';

export interface BankAccountDetail {
  id: string;
  code: string;
  bankName: string;
  accountName: string;
  sortCodeLast2: string | null;
  accountLast4: string | null;
  xeroAccountId: string | null;
  isActive: boolean;
}

export interface BankAccountCreate {
  code: string;
  bankName: string;
  accountName: string;
  sortCodeLast2?: string | null;
  accountLast4?: string | null;
  xeroAccountId?: string | null;
}

export type BankAccountPatch = Partial<{
  bankName: string;
  accountName: string;
  sortCodeLast2: string | null;
  accountLast4: string | null;
  xeroAccountId: string | null;
  isActive: boolean;
}>;

const COLUMNS: Record<keyof BankAccountPatch, string> = {
  bankName: 'bank_name',
  accountName: 'account_name',
  sortCodeLast2: 'sort_code_last2',
  accountLast4: 'account_last4',
  xeroAccountId: 'xero_account_id',
  isActive: 'is_active',
};

const SELECT =
  'SELECT id, code, bank_name, account_name, sort_code_last2, account_last4, xero_account_id, is_active FROM bank_accounts';

interface Row {
  id: string;
  code: string;
  bank_name: string;
  account_name: string;
  sort_code_last2: string | null;
  account_last4: string | null;
  xero_account_id: string | null;
  is_active: boolean;
}

const toDetail = (r: Row): BankAccountDetail => ({
  id: r.id,
  code: r.code,
  bankName: r.bank_name,
  accountName: r.account_name,
  sortCodeLast2: r.sort_code_last2,
  accountLast4: r.account_last4,
  xeroAccountId: r.xero_account_id,
  isActive: r.is_active,
});

export async function get(pool: Pool, id: string): Promise<BankAccountDetail> {
  const { rows } = await pool.query<Row>(`${SELECT} WHERE id = $1`, [id]);
  if (rows.length === 0) throw new AppError('not_found', 'No such bank account');
  return toDetail(rows[0]!);
}

export async function create(db: ActorDb, input: BankAccountCreate): Promise<string> {
  try {
    return await db.tx(async (c) => {
      const { rows } = await c.query<{ id: string }>(
        `INSERT INTO bank_accounts (code, bank_name, account_name, sort_code_last2, account_last4, xero_account_id)
         VALUES ($1, $2, $3, $4, $5, $6) RETURNING id`,
        [
          input.code.toUpperCase(),
          input.bankName,
          input.accountName,
          input.sortCodeLast2 ?? null,
          input.accountLast4 ?? null,
          input.xeroAccountId ?? null,
        ],
      );
      return rows[0]!.id;
    });
  } catch (err) {
    if ((err as { code?: string }).code === '23505') throw new AppError('conflict', 'A bank account with that code exists');
    throw err;
  }
}

export async function update(db: ActorDb, id: string, patch: BankAccountPatch): Promise<BankAccountDetail> {
  const keys = (Object.keys(COLUMNS) as (keyof BankAccountPatch)[]).filter((k) => patch[k] !== undefined);
  if (keys.length === 0) throw new AppError('bad_request', 'nothing to change');
  const sets = keys.map((k, i) => `${COLUMNS[k]} = $${i + 2}`).join(', ');
  const values = keys.map((k) => patch[k]);
  return db.tx(async (c) => {
    const { rows } = await c.query<{ id: string }>(`UPDATE bank_accounts SET ${sets} WHERE id = $1 RETURNING id`, [
      id,
      ...values,
    ]);
    if (rows.length === 0) throw new AppError('not_found', 'No such bank account');
    const after = await c.query<Row>(`${SELECT} WHERE id = $1`, [id]);
    return toDetail(after.rows[0]!);
  });
}
