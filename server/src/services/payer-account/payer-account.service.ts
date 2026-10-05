/**
 * Known payer accounts: the rows suggest_matches step 3 reads and confirm_match(remember) writes.
 *
 * Hashing: key = sort code digits (exactly 6, non-digits stripped) followed by account number digits
 * (6-10, non-digits stripped, NO zero padding), via payerAccountHash(). This equals SQL
 * secure_hash(regexp_replace(sc,'\D','','g') || acc) and the ingest readPayerAccount, so bank lines
 * hash identically. Only the hash and the last 4 digits are stored or returned; sort_code stays NULL.
 */
import type { ActorDb } from '../../db/context.js';
import type { Pool } from '../../db/pool.js';
import { AppError } from '../../lib/errors.js';
import { maskAccount, payerAccountHash } from '../../lib/crypto.js';

export type PayerKind = 'tenant' | 'council_hb' | 'dwp_uc' | 'other_third_party';

export interface PayerAccount {
  id: string;
  account: string | null;
  holderType: string;
  holderName: string | null;
  payer: string;
  isActive: boolean;
  source: 'manual' | 'learned';
  tid: string | null;
  landlordId: string | null;
  landlordName: string | null;
  sharedWith: number;
  createdAt: string;
}

export interface PayerAccountInput {
  tid?: string;
  landlordId?: string;
  sortCode: string;
  accountNumber: string;
  holderType: 'tenant' | 'relative' | 'landlord';
  holderName?: string | null;
  payer: PayerKind;
}

export type PayerAccountPatch = Partial<{ holderName: string | null; payer: PayerKind; isActive: boolean }>;

const COLUMNS: Record<keyof PayerAccountPatch, string> = {
  holderName: 'holder_name',
  payer: 'payer',
  isActive: 'is_active',
};

interface Row {
  id: string;
  account_last4: string;
  holder_type: string;
  holder_name: string | null;
  payer: string;
  is_active: boolean;
  learned: boolean;
  created_at: Date;
  tid: string | null;
  landlord_id: string | null;
  landlord_name: string | null;
  shared_with: string | number;
}

const SELECT = `
  SELECT pba.id, pba.account_last4, pba.holder_type, pba.holder_name, pba.payer::text AS payer, pba.is_active,
         pba.learned_from_txn IS NOT NULL AS learned, pba.created_at, t.tid, pba.landlord_id, l.name AS landlord_name,
         (SELECT count(*) FROM payer_bank_accounts o
           WHERE o.account_hash = pba.account_hash AND o.is_active AND o.id <> pba.id) AS shared_with
    FROM payer_bank_accounts pba
    LEFT JOIN tenancies t ON t.id = pba.tenancy_id
    LEFT JOIN landlords l ON l.id = pba.landlord_id`;

const toAccount = (r: Row): PayerAccount => ({
  id: r.id,
  account: maskAccount(r.account_last4),
  holderType: r.holder_type,
  holderName: r.holder_name,
  payer: r.payer,
  isActive: r.is_active,
  source: r.learned ? 'learned' : 'manual',
  tid: r.tid,
  landlordId: r.landlord_id,
  landlordName: r.landlord_name,
  sharedWith: Number(r.shared_with),
  createdAt: r.created_at.toISOString(),
});

export async function list(pool: Pool, { tid, landlordId }: { tid?: string; landlordId?: string }): Promise<PayerAccount[]> {
  const { rows } = await pool.query<Row>(
    `${SELECT}
      WHERE ($1::text IS NULL OR upper(t.tid) = upper($1))
        AND ($2::uuid IS NULL OR pba.landlord_id = $2)
      ORDER BY pba.created_at DESC LIMIT 200`,
    [tid ?? null, landlordId ?? null],
  );
  return rows.map(toAccount);
}

async function getOne(c: { query: Pool['query'] }, id: string): Promise<PayerAccount> {
  const { rows } = await c.query<Row>(`${SELECT} WHERE pba.id = $1`, [id]);
  return toAccount(rows[0]!);
}

export async function add(
  db: ActorDb,
  hashKey: string,
  input: PayerAccountInput,
): Promise<{ row: PayerAccount; created: boolean }> {
  const hash = payerAccountHash(input.sortCode, input.accountNumber, hashKey);
  const last4 = input.accountNumber.replace(/\D/g, '').slice(-4);
  try {
    return await db.tx(async (c) => {
      let tenancyId: string | null = null;
      let landlordId: string | null = null;
      if (input.tid) {
        const { rows } = await c.query<{ id: string }>('SELECT id FROM tenancies WHERE upper(tid) = upper($1)', [input.tid]);
        if (rows.length === 0) throw new AppError('bad_request', 'Unknown tenancy');
        tenancyId = rows[0]!.id;
      } else {
        const { rows } = await c.query<{ id: string }>('SELECT id FROM landlords WHERE id = $1', [input.landlordId]);
        if (rows.length === 0) throw new AppError('bad_request', 'Unknown landlord');
        landlordId = rows[0]!.id;
      }
      const { rows: existing } = await c.query<{ id: string; is_active: boolean }>(
        `SELECT id, is_active FROM payer_bank_accounts
          WHERE account_hash = $1
            AND (($2::uuid IS NOT NULL AND tenancy_id = $2) OR ($3::uuid IS NOT NULL AND landlord_id = $3 AND tenancy_id IS NULL))
          FOR UPDATE`,
        [hash, tenancyId, landlordId],
      );
      if (existing.length > 0) {
        const e = existing[0]!;
        if (e.is_active) throw new AppError('conflict', 'This account is already linked here');
        await c.query(
          'UPDATE payer_bank_accounts SET is_active = true, holder_type = $2, holder_name = $3, payer = $4 WHERE id = $1',
          [e.id, input.holderType, input.holderName ?? null, input.payer],
        );
        return { row: await getOne(c, e.id), created: false };
      }
      const { rows } = await c.query<{ id: string }>(
        `INSERT INTO payer_bank_accounts (account_hash, account_last4, holder_name, holder_type, tenancy_id, landlord_id, payer)
         VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING id`,
        [hash, last4, input.holderName ?? null, input.holderType, tenancyId, landlordId, input.payer],
      );
      return { row: await getOne(c, rows[0]!.id), created: true };
    });
  } catch (err) {
    if ((err as { code?: string }).code === '23505') throw new AppError('conflict', 'This account is already linked here');
    throw err;
  }
}

export async function update(db: ActorDb, id: string, patch: PayerAccountPatch): Promise<PayerAccount> {
  const keys = (Object.keys(COLUMNS) as (keyof PayerAccountPatch)[]).filter((k) => patch[k] !== undefined);
  if (keys.length === 0) throw new AppError('bad_request', 'nothing to change');
  const sets = keys.map((k, i) => `${COLUMNS[k]} = $${i + 2}`).join(', ');
  const values = keys.map((k) => patch[k]);
  return db.tx(async (c) => {
    const { rows } = await c.query<{ id: string }>(`UPDATE payer_bank_accounts SET ${sets} WHERE id = $1 RETURNING id`, [id, ...values]);
    if (rows.length === 0) throw new AppError('not_found', 'No such payer account');
    return getOne(c, id);
  });
}
