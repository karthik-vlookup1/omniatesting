/**
 * /api/adjustments
 *   GET  /?tid=T1234     balances per payer and the adjustment history (signed in)
 *   POST /               { tid, payer, kind: write_off|refund, amountPence, reason, effectiveOn? } (accounts)
 *   POST /:id/reverse    { reason } (accounts)
 */
import { Router } from 'express';
import { z } from 'zod';
import type { Pool } from '../../db/pool.js';
import { createAdjustment, listAdjustments, reverseAdjustment } from '../../services/adjustment/adjustment.service.js';
import { requireAuth, requireRole } from '../auth/middleware.js';

const Id = z.uuid();
const NIL = '00000000-0000-0000-0000-000000000000';
const uuidOrNil = (value: unknown): string => (Id.safeParse(value).success ? String(value) : NIL);

const ListQuery = z.object({ tid: z.string().trim().min(1).max(20) });
const CreateBody = z
  .object({
    tid: z.string().trim().min(1).max(20),
    payer: z.enum(['tenant', 'council_hb', 'dwp_uc', 'other_third_party']),
    kind: z.enum(['write_off', 'refund']),
    amountPence: z.number().int().min(1).max(999_999_999_999),
    reason: z.string().trim().min(3).max(500),
    effectiveOn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'effectiveOn must be YYYY-MM-DD').optional(),
  })
  .strict();
const ReverseBody = z.object({ reason: z.string().trim().min(3).max(500) }).strict();

export function adjustmentRouter({ pool }: { pool: Pool }): Router {
  const router = Router();
  router.use(requireAuth);
  const accounts = requireRole('accounts');

  router.get('/', async (req, res) => {
    res.json(await listAdjustments(pool, ListQuery.parse(req.query).tid));
  });

  router.post('/', accounts, async (req, res) => {
    res.status(201).json(await createAdjustment(req.db, req.user!.id, CreateBody.parse(req.body)));
  });

  router.post('/:id/reverse', accounts, async (req, res) => {
    res.json(await reverseAdjustment(req.db, req.user!.id, uuidOrNil(req.params.id), ReverseBody.parse(req.body)));
  });

  return router;
}
