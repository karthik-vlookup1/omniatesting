/**
 * How each payer actually pays (standing order, direct debit, UC managed payment, ...). Used to
 * recognise an expected payment; it never changes what is charged.
 */
import type { ActorDb } from '../../db/context.js';
import { AppError } from '../../lib/errors.js';
import type { RentFrequency } from '../rent/money.js';
import { leadTenantId, lockTenancy, lockTenancyOf, overlapError, type Payer } from '../rent/rent.service.js';

export const PAY_METHODS = [
  'standing_order',
  'bank_transfer',
  'direct_debit',
  'uc_managed_payment',
  'hb_direct',
  'card',
  'cash',
  'cheque',
  'other',
] as const;
export type PayMethod = (typeof PAY_METHODS)[number];

export interface AddMethodInput {
  payer: Payer;
  method: PayMethod;
  expectedPence?: number | null;
  expectedFrequency?: RentFrequency | null;
  expectedDay?: number | null;
  referenceHint?: string | null;
  effectiveFrom: string;
}

export async function addMethod(db: ActorDb, tid: string, input: AddMethodInput): Promise<string> {
  try {
    return await db.tx(async (c) => {
      const t = await lockTenancy(c, tid);
      const tenantId = input.payer === 'tenant' ? await leadTenantId(c, t.id) : null;
      await c.query(
        `INSERT INTO payment_methods (tenancy_id, tenant_id, payer, method, expected_amount, expected_frequency,
                                      expected_day, reference_hint, effective_from)
         VALUES ($1, $2, $3, $4, ($5::int)::numeric / 100, $6, $7, $8, $9)`,
        [
          t.id,
          tenantId,
          input.payer,
          input.method,
          input.expectedPence ?? null,
          input.expectedFrequency ?? null,
          input.expectedDay ?? null,
          input.referenceHint ?? null,
          input.effectiveFrom,
        ],
      );
      return t.tid;
    });
  } catch (err) {
    throw overlapError(err, 'payment method');
  }
}

export async function endMethod(db: ActorDb, methodId: string, effectiveTo: string): Promise<string> {
  return db.tx(async (c) => {
    const t = await lockTenancyOf(c, 'payment_methods', methodId);
    const { rows } = await c.query<{ effective_from: string; effective_to: string | null }>(
      'SELECT effective_from, effective_to FROM payment_methods WHERE id = $1 FOR UPDATE',
      [methodId],
    );
    const m = rows[0]!;
    if (m.effective_to !== null) throw new AppError('bad_request', 'Already ended');
    if (effectiveTo < m.effective_from) throw new AppError('bad_request', 'Before the payment method started');
    await c.query('UPDATE payment_methods SET effective_to = $2 WHERE id = $1', [methodId, effectiveTo]);
    return t.tid;
  });
}
