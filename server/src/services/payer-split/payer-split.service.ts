/**
 * Manual payer splits: a third party (never the tenant) pays a percentage or a fixed amount of
 * each rent period. The tenant always owes the remainder. Award-linked splits are managed by the
 * benefit service.
 */
import type { ActorDb } from '../../db/context.js';
import { AppError } from '../../lib/errors.js';
import { lockTenancy, lockTenancyOf, overlapError, refreshCharges, type Payer } from '../rent/rent.service.js';

export interface AddSplitInput {
  payer: Exclude<Payer, 'tenant'>;
  sharePercent?: number | null;
  fixedAmountPence?: number | null;
  effectiveFrom: string;
}

export async function addSplit(db: ActorDb, tid: string, input: AddSplitInput): Promise<string> {
  const hasPercent = input.sharePercent !== undefined && input.sharePercent !== null;
  const hasFixed = input.fixedAmountPence !== undefined && input.fixedAmountPence !== null;
  if (hasPercent === hasFixed) throw new AppError('bad_request', 'Give either a percentage or a fixed amount');
  try {
    return await db.tx(async (c) => {
      const t = await lockTenancy(c, tid);
      await c.query(
        `INSERT INTO payer_splits (tenancy_id, payer, share_percent, fixed_amount, effective_from)
         VALUES ($1, $2, $3::numeric, ($4::int)::numeric / 100, $5)`,
        [t.id, input.payer, hasPercent ? input.sharePercent : null, hasFixed ? input.fixedAmountPence : null, input.effectiveFrom],
      );
      await refreshCharges(c, t.id);
      return t.tid;
    });
  } catch (err) {
    throw overlapError(err, 'payer split');
  }
}

export async function endSplit(db: ActorDb, splitId: string, effectiveTo: string): Promise<string> {
  return db.tx(async (c) => {
    const t = await lockTenancyOf(c, 'payer_splits', splitId);
    const { rows } = await c.query<{ effective_from: string; effective_to: string | null; benefit_award_id: string | null }>(
      'SELECT effective_from, effective_to, benefit_award_id FROM payer_splits WHERE id = $1 FOR UPDATE',
      [splitId],
    );
    const s = rows[0]!;
    if (s.benefit_award_id) throw new AppError('bad_request', 'End the benefit award instead');
    if (s.effective_to !== null) throw new AppError('bad_request', 'Already ended');
    if (effectiveTo < s.effective_from) throw new AppError('bad_request', 'Before the split started');
    await c.query('UPDATE payer_splits SET effective_to = $2 WHERE id = $1', [splitId, effectiveTo]);
    await refreshCharges(c, t.id);
    return t.tid;
  });
}
