/**
 * /api/bank-accounts (admin maintenance; mounted before the ingest router, which owns GET /)
 *   POST  /        create (admin); accepts a superset of the ingest body
 *   GET   /:id     detail (admin)
 *   PATCH /:id     edit (admin); the code is immutable
 */
import { Router } from 'express';
import { z } from 'zod';
import type { Pool } from '../../db/pool.js';
import { AppError } from '../../lib/errors.js';
import { create, get, update } from '../../services/bank-account/bank-account.service.js';
import { requireAuth, requireRole } from '../auth/middleware.js';

const shape = {
  bankName: z.string().trim().min(1).max(100),
  accountName: z.string().trim().min(1).max(100),
  sortCodeLast2: z.string().regex(/^\d{2}$/, 'two digits').nullish(),
  accountLast4: z.string().regex(/^\d{4}$/, 'four digits').nullish(),
  xeroAccountId: z.string().trim().max(100).nullish(),
};

const CreateBody = z
  .object({ code: z.string().trim().regex(/^[A-Za-z0-9_]{2,20}$/, 'letters, digits and _ only (2-20)'), ...shape })
  .strict();

const PatchBody = z
  .object({ ...shape, isActive: z.boolean() })
  .partial()
  .strict()
  .refine((o) => Object.keys(o).length > 0, 'nothing to change');

function parseId(raw: unknown): string {
  const id = z.uuid().safeParse(raw);
  if (!id.success) throw new AppError('not_found', 'No such bank account');
  return id.data;
}

export function bankAccountAdminRouter({ pool }: { pool: Pool }): Router {
  const router = Router();
  router.use(requireAuth);

  router.post('/', requireRole(), async (req, res) => {
    const id = await create(req.db, CreateBody.parse(req.body));
    res.status(201).json({ id });
  });

  router.get('/:id', requireRole(), async (req, res) => {
    res.json({ bankAccount: await get(pool, parseId(req.params.id)) });
  });

  router.patch('/:id', requireRole(), async (req, res) => {
    const id = parseId(req.params.id);
    const patch = PatchBody.parse(req.body);
    res.json({ bankAccount: await update(req.db, id, patch as Parameters<typeof update>[2]) });
  });

  return router;
}
