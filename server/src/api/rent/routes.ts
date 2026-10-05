/**
 * /api/rent
 *   GET  /:tid                         rent terms, awards, splits, payment methods, periods, balances
 *   POST /:tid/schedules               set the rent from a date (writers)
 *   POST /:tid/benefit-awards          add an award; landlord-direct also adds a payer split (writers)
 *   POST /benefit-awards/:id/end       end an award (writers)
 *   POST /:tid/payer-splits            add a manual payer split (writers)
 *   POST /payer-splits/:id/end         end a manual payer split (writers)
 *   POST /:tid/payment-methods         add a payment method (writers)
 *   POST /payment-methods/:id/end      end a payment method (writers)
 *   POST /generate                     run the charge generation now (admin)
 * Writes answer 201 with the refreshed rent account.
 */
import { Router, type Request, type Response } from 'express';
import { z } from 'zod';
import type { Pool } from '../../db/pool.js';
import { runChargeGeneration } from '../../jobs/generate-charges.js';
import { AppError } from '../../lib/errors.js';
import { addAward, endAward } from '../../services/benefit/benefit.service.js';
import { FREQUENCIES } from '../../services/rent/money.js';
import { getRentAccount, setRent } from '../../services/rent/rent.service.js';
import { addSplit, endSplit } from '../../services/payer-split/payer-split.service.js';
import { addMethod, endMethod, PAY_METHODS } from '../../services/payment-method/payment-method.service.js';
import { requireAuth, requireRole, requireWriter } from '../auth/middleware.js';

const date = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'use YYYY-MM-DD')
  .refine((s) => {
    const d = new Date(`${s}T00:00:00Z`);
    return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s;
  }, 'not a real date');
const pence = z.number().int().min(0).max(10_000_000);
const frequency = z.enum(FREQUENCIES);
const optionalText = (max: number) => z.string().trim().max(max).nullish();

const RentBody = z.object({ amountPence: pence, frequency, effectiveFrom: date }).strict();
const AwardBody = z
  .object({
    benefit: z.enum(['UC', 'HB', 'DHP']),
    payingBody: z.string().trim().min(1).max(100),
    claimReference: optionalText(50),
    awardPence: pence,
    awardFrequency: frequency,
    paidTo: z.enum(['landlord_direct', 'tenant']),
    effectiveFrom: date,
  })
  .strict();
const SplitBody = z
  .object({
    payer: z.enum(['council_hb', 'dwp_uc', 'other_third_party']),
    sharePercent: z.number().min(0.01).max(100).nullish(),
    fixedAmountPence: pence.nullish(),
    effectiveFrom: date,
  })
  .strict()
  .refine((b) => (b.sharePercent == null) !== (b.fixedAmountPence == null), 'Give either a percentage or a fixed amount');
const MethodBody = z
  .object({
    payer: z.enum(['tenant', 'council_hb', 'dwp_uc', 'other_third_party']),
    method: z.enum(PAY_METHODS),
    expectedPence: pence.nullish(),
    expectedFrequency: frequency.nullish(),
    expectedDay: z.number().int().min(1).max(31).nullish(),
    referenceHint: optionalText(50),
    effectiveFrom: date,
  })
  .strict();
const EndBody = z.object({ effectiveTo: date }).strict();

export function rentRouter({ pool }: { pool: Pool }): Router {
  const router = Router();
  router.use(requireAuth);

  const tidOf = (req: Request): string => {
    const tid = z.string().regex(/^[A-Za-z0-9-]{1,30}$/).safeParse(req.params.tid);
    if (!tid.success) throw new AppError('not_found', 'No such tenancy');
    return tid.data;
  };
  const idOf = (req: Request): string => {
    const id = z.uuid().safeParse(req.params.id);
    if (!id.success) throw new AppError('not_found', 'Not found');
    return id.data;
  };
  const created = async (res: Response, tid: string) => {
    res.status(201).json({ account: await getRentAccount(pool, tid) });
  };

  router.post('/generate', requireRole(), async (_req, res) => {
    res.json({ summary: await runChargeGeneration(pool) });
  });

  router.get('/:tid', async (req, res) => {
    res.json({ account: await getRentAccount(pool, tidOf(req)) });
  });

  router.post('/:tid/schedules', requireWriter, async (req, res) => {
    await created(res, await setRent(req.db, tidOf(req), RentBody.parse(req.body)));
  });

  router.post('/:tid/benefit-awards', requireWriter, async (req, res) => {
    await created(res, await addAward(req.db, tidOf(req), AwardBody.parse(req.body)));
  });
  router.post('/benefit-awards/:id/end', requireWriter, async (req, res) => {
    await created(res, await endAward(req.db, idOf(req), EndBody.parse(req.body).effectiveTo));
  });

  router.post('/:tid/payer-splits', requireWriter, async (req, res) => {
    await created(res, await addSplit(req.db, tidOf(req), SplitBody.parse(req.body)));
  });
  router.post('/payer-splits/:id/end', requireWriter, async (req, res) => {
    await created(res, await endSplit(req.db, idOf(req), EndBody.parse(req.body).effectiveTo));
  });

  router.post('/:tid/payment-methods', requireWriter, async (req, res) => {
    await created(res, await addMethod(req.db, tidOf(req), MethodBody.parse(req.body)));
  });
  router.post('/payment-methods/:id/end', requireWriter, async (req, res) => {
    await created(res, await endMethod(req.db, idOf(req), EndBody.parse(req.body).effectiveTo));
  });

  return router;
}
