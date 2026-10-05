/**
 * Benefit awards (HB / UC / DHP). A landlord-direct award also becomes a payer split: the paying
 * body owes a fixed amount per rent period, restated in the rent cycle in force on the start date.
 * An award paid to the tenant is only a record; the tenant still owes the whole rent.
 */
import type { ActorDb } from '../../db/context.js';
import { AppError } from '../../lib/errors.js';
import { convertPence, type RentFrequency } from '../rent/money.js';
import { leadTenantId, lockTenancy, lockTenancyOf, overlapError, refreshCharges, type Payer } from '../rent/rent.service.js';

export type Benefit = 'UC' | 'HB' | 'DHP';

const PAYER_OF: Record<Benefit, Payer> = { HB: 'council_hb', UC: 'dwp_uc', DHP: 'other_third_party' };

export interface AddAwardInput {
  benefit: Benefit;
  payingBody: string;
  claimReference?: string | null;
  awardPence: number;
  awardFrequency: RentFrequency;
  paidTo: 'landlord_direct' | 'tenant';
  effectiveFrom: string;
}

/** Adds an award (and its payer split when paid direct); returns the tenancy's TID. */
export async function addAward(db: ActorDb, tid: string, input: AddAwardInput): Promise<string> {
  let what = 'benefit award';
  try {
    return await db.tx(async (c) => {
      const t = await lockTenancy(c, tid);
      const tenantId = await leadTenantId(c, t.id);

      let rentFrequency: RentFrequency | null = null;
      if (input.paidTo === 'landlord_direct') {
        const { rows } = await c.query<{ frequency: RentFrequency }>(
          `SELECT frequency FROM rent_schedules
            WHERE tenancy_id = $1 AND effective_from <= $2::date AND (effective_to IS NULL OR effective_to >= $2::date)`,
          [t.id, input.effectiveFrom],
        );
        if (!rows[0]) throw new AppError('bad_request', 'Set the rent first');
        rentFrequency = rows[0].frequency;
      }

      const award = await c.query<{ id: string }>(
        `INSERT INTO benefit_awards (tenant_id, tenancy_id, benefit, paying_body, claim_reference, award_amount,
                                     award_frequency, paid_to, effective_from)
         VALUES ($1, $2, $3, $4, $5, ($6::int)::numeric / 100, $7, $8, $9) RETURNING id`,
        [tenantId, t.id, input.benefit, input.payingBody, input.claimReference ?? null, input.awardPence, input.awardFrequency, input.paidTo, input.effectiveFrom],
      );

      if (rentFrequency) {
        what = 'payer split';
        await c.query(
          `INSERT INTO payer_splits (tenancy_id, payer, benefit_award_id, fixed_amount, effective_from)
           VALUES ($1, $2, $3, ($4::int)::numeric / 100, $5)`,
          [t.id, PAYER_OF[input.benefit], award.rows[0]!.id, convertPence(input.awardPence, input.awardFrequency, rentFrequency), input.effectiveFrom],
        );
      }
      await refreshCharges(c, t.id);
      return t.tid;
    });
  } catch (err) {
    throw overlapError(err, what);
  }
}

/** Ends an open award (and its split) on `effectiveTo`; returns the tenancy's TID. */
export async function endAward(db: ActorDb, awardId: string, effectiveTo: string): Promise<string> {
  return db.tx(async (c) => {
    const t = await lockTenancyOf(c, 'benefit_awards', awardId);
    const { rows } = await c.query<{ effective_from: string; effective_to: string | null }>(
      'SELECT effective_from, effective_to FROM benefit_awards WHERE id = $1 FOR UPDATE',
      [awardId],
    );
    const a = rows[0]!;
    if (a.effective_to !== null) throw new AppError('bad_request', 'Already ended');
    if (effectiveTo < a.effective_from) throw new AppError('bad_request', 'Before the award started');
    await c.query('UPDATE benefit_awards SET effective_to = $2 WHERE id = $1', [awardId, effectiveTo]);
    // A split restated after the end date has nothing left to cover.
    await c.query('DELETE FROM payer_splits WHERE benefit_award_id = $1 AND effective_from > $2::date', [awardId, effectiveTo]);
    await c.query(
      'UPDATE payer_splits SET effective_to = $2 WHERE benefit_award_id = $1 AND (effective_to IS NULL OR effective_to > $2::date)',
      [awardId, effectiveTo],
    );
    await refreshCharges(c, t.id);
    return t.tid;
  });
}
