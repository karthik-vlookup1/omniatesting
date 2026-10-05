/**
 * /api/payer-accounts
 *   GET   /?tid=&landlordId=   list (signed in)
 *   POST  /                    link a known payer account (writers); 201 new, 200 reactivated
 *   PATCH /:id                 edit / deactivate / reactivate (writers)
 * Full sort codes and account numbers are hashed on arrival and never returned.
 */
import { Router } from 'express';
import { z } from 'zod';
import type { Pool } from '../../db/pool.js';
import { AppError } from '../../lib/errors.js';
import { add, list, update } from '../../services/payer-account/payer-account.service.js';
import { requireAuth, requireWriter } from '../auth/middleware.js';

const TID = /^[Tt]\d{3,6}$/;
const PAYERS = ['tenant', 'council_hb', 'dwp_uc', 'other_third_party'] as const;

const ListQuery = z.object({ tid: z.string().regex(TID, 'invalid tenancy ID').optional(), landlordId: z.uuid().optional() });

const holderName = z.string().trim().min(1).max(100).nullish();

const CreateBody = z
  .object({
    tid: z.string().regex(TID, 'invalid tenancy ID').optional(),
    landlordId: z.uuid().optional(),
    sortCode: z.string().regex(/^\d{2}[- ]?\d{2}[- ]?\d{2}$/, 'invalid sort code'),
    accountNumber: z
      .string()
      .transform((s) => s.replace(/\s/g, ''))
      .pipe(z.string().regex(/^\d{6,10}$/, 'invalid account number')),
    holderType: z.enum(['tenant', 'relative', 'landlord']),
    holderName,
    payer: z.enum(PAYERS).default('tenant'),
  })
  .strict()
  .refine((o) => (o.tid === undefined) !== (o.landlordId === undefined), 'give exactly one of tid or landlordId');

const PatchBody = z
  .object({ holderName, payer: z.enum(PAYERS), isActive: z.boolean() })
  .partial()
  .strict()
  .refine((o) => Object.keys(o).length > 0, 'nothing to change');

export function payerAccountsRouter({ pool, hashKey }: { pool: Pool; hashKey: string }): Router {
  const router = Router();
  router.use(requireAuth);

  router.get('/', async (req, res) => {
    res.json({ payerAccounts: await list(pool, ListQuery.parse(req.query)) });
  });

  router.post('/', requireWriter, async (req, res) => {
    const { row, created } = await add(req.db, hashKey, CreateBody.parse(req.body) as Parameters<typeof add>[2]);
    res.status(created ? 201 : 200).json({ payerAccount: row });
  });

  router.patch('/:id', requireWriter, async (req, res) => {
    const id = z.uuid().safeParse(req.params.id);
    if (!id.success) throw new AppError('not_found', 'No such payer account');
    const patch = PatchBody.parse(req.body);
    res.json({ payerAccount: await update(req.db, id.data, patch as Parameters<typeof update>[2]) });
  });

  return router;
}
