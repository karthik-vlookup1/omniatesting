/**
 * /api/branches
 *   GET   /?q=     list/search (signed in)
 *   POST  /        create (admin)
 *   PATCH /:id     edit name / Xero option (admin); the code is immutable
 */
import { Router } from 'express';
import { z } from 'zod';
import type { Pool } from '../../db/pool.js';
import { AppError } from '../../lib/errors.js';
import { create, list, update } from '../../services/branch/branch.service.js';
import { requireAuth, requireRole } from '../auth/middleware.js';

const SearchQuery = z.object({ q: z.string().max(100).default('') });

const shape = {
  name: z.string().trim().min(1).max(100),
  xeroTrackingOption: z.string().trim().max(100).nullish(),
};

const CreateBody = z
  .object({ code: z.string().trim().regex(/^[A-Za-z0-9]{2,10}$/, 'letters and digits only (2-10)'), ...shape })
  .strict();

const PatchBody = z
  .object(shape)
  .partial()
  .strict()
  .refine((o) => Object.keys(o).length > 0, 'nothing to change');

export function branchesRouter({ pool }: { pool: Pool }): Router {
  const router = Router();
  router.use(requireAuth);

  router.get('/', async (req, res) => {
    res.json({ branches: await list(pool, SearchQuery.parse(req.query)) });
  });

  router.post('/', requireRole(), async (req, res) => {
    const id = await create(req.db, CreateBody.parse(req.body));
    res.status(201).json({ id });
  });

  router.patch('/:id', requireRole(), async (req, res) => {
    const id = z.uuid().safeParse(req.params.id);
    if (!id.success) throw new AppError('not_found', 'No such branch');
    const patch = PatchBody.parse(req.body);
    res.json({ branch: await update(req.db, id.data, patch as Parameters<typeof update>[2]) });
  });

  return router;
}
