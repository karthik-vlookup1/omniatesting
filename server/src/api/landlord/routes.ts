/**
 * /api/landlords
 *   GET   /?q=     list/search (signed in)
 *   POST  /        create (writers)
 *   PATCH /:id     edit (writers)
 */
import { Router } from 'express';
import { z } from 'zod';
import type { Pool } from '../../db/pool.js';
import { AppError } from '../../lib/errors.js';
import { create, list, update } from '../../services/landlord/landlord.service.js';
import { requireAuth, requireWriter } from '../auth/middleware.js';

const SearchQuery = z.object({ q: z.string().max(100).default('') });

const shape = {
  landlordRef: z.string().trim().min(1).max(50).nullish(),
  name: z.string().trim().min(1).max(200),
  email: z.email().nullish(),
  phone: z.string().trim().regex(/^[0-9 +()-]{6,20}$/, 'digits, spaces and + ( ) - only (6-20)').nullish(),
};

const CreateBody = z.object(shape).strict();

const PatchBody = z
  .object(shape)
  .partial()
  .strict()
  .refine((o) => Object.keys(o).length > 0, 'nothing to change');

export function landlordsRouter({ pool }: { pool: Pool }): Router {
  const router = Router();
  router.use(requireAuth);

  router.get('/', async (req, res) => {
    res.json({ landlords: await list(pool, SearchQuery.parse(req.query)) });
  });

  router.post('/', requireWriter, async (req, res) => {
    const id = await create(req.db, CreateBody.parse(req.body));
    res.status(201).json({ id });
  });

  router.patch('/:id', requireWriter, async (req, res) => {
    const id = z.uuid().safeParse(req.params.id);
    if (!id.success) throw new AppError('not_found', 'No such landlord');
    const patch = PatchBody.parse(req.body);
    res.json({ landlord: await update(req.db, id.data, patch as Parameters<typeof update>[2]) });
  });

  return router;
}
