/**
 * /api/receipts
 *   GET    /                    ?tid&status&bankTransactionId&page   receipts (signed in)
 *   GET    /bank-lines/:id      a bank line with its receipts and remittance (signed in)
 *   GET    /:id                 one receipt with allocations and open charges (signed in)
 *   POST   /split               { bankTransactionId, parts[{tid,payer,amountPence}] } (accounts)
 *   PUT    /:id/allocations     { allocations[{rentChargeId,amountPence}] } pin by hand (accounts)
 *   DELETE /:id/allocations     back to automatic oldest-first (accounts)
 *   POST   /:id/reverse         { reason, xeroCreditRef?, vicoNote? } (accounts)
 */
import { Router } from 'express';
import { z } from 'zod';
import type { Pool } from '../../db/pool.js';
import {
  getBankLine,
  getReceipt,
  listReceipts,
  overrideAllocations,
  resetAllocations,
  reverseReceipt,
  splitLine,
} from '../../services/receipt/receipt.service.js';
import { requireAuth, requireRole } from '../auth/middleware.js';

const PAYERS = ['tenant', 'council_hb', 'dwp_uc', 'other_third_party'] as const;
const Id = z.uuid();
const NIL = '00000000-0000-0000-0000-000000000000';
/** A malformed id can't exist: map it to the nil uuid so the service answers 404, not a DB error. */
const uuidOrNil = (value: unknown): string => (Id.safeParse(value).success ? String(value) : NIL);

const ListQuery = z.object({
  tid: z.string().trim().max(20).optional(),
  status: z.enum(['active', 'reversed']).optional(),
  bankTransactionId: z.uuid().optional(),
  page: z.coerce.number().int().min(1).max(10000).default(1),
});
const SplitBody = z
  .object({
    bankTransactionId: z.uuid(),
    parts: z
      .array(
        z
          .object({
            tid: z.string().trim().min(1).max(20),
            payer: z.enum(PAYERS),
            amountPence: z.number().int().min(1).max(999_999_999_999),
          })
          .strict(),
      )
      .min(2)
      .max(200),
  })
  .strict();
const AllocationsBody = z
  .object({
    allocations: z
      .array(z.object({ rentChargeId: z.uuid(), amountPence: z.number().int().min(1).max(999_999_999_999) }).strict())
      .max(100),
  })
  .strict();
const ReverseBody = z
  .object({
    reason: z.string().trim().min(3).max(500),
    xeroCreditRef: z.string().trim().min(1).max(50).optional(),
    vicoNote: z.string().trim().min(1).max(200).optional(),
  })
  .strict();

export function receiptRouter({ pool }: { pool: Pool }): Router {
  const router = Router();
  router.use(requireAuth);
  const accounts = requireRole('accounts');

  router.get('/', async (req, res) => {
    res.json(await listReceipts(pool, ListQuery.parse(req.query)));
  });

  router.get('/bank-lines/:id', async (req, res) => {
    res.json({ line: await getBankLine(pool, uuidOrNil(req.params.id)) });
  });

  router.get('/:id', async (req, res) => {
    res.json({ receipt: await getReceipt(pool, uuidOrNil(req.params.id)) });
  });

  router.post('/split', accounts, async (req, res) => {
    const body = SplitBody.parse(req.body);
    res.json({ line: await splitLine(req.db, req.user!.id, body) });
  });

  router.put('/:id/allocations', accounts, async (req, res) => {
    const body = AllocationsBody.parse(req.body);
    res.json({ receipt: await overrideAllocations(req.db, req.user!.id, uuidOrNil(req.params.id), body.allocations) });
  });

  router.delete('/:id/allocations', accounts, async (req, res) => {
    res.json({ receipt: await resetAllocations(req.db, uuidOrNil(req.params.id)) });
  });

  router.post('/:id/reverse', accounts, async (req, res) => {
    const body = ReverseBody.parse(req.body);
    res.json({ receipt: await reverseReceipt(req.db, req.user!.id, uuidOrNil(req.params.id), body) });
  });

  return router;
}
