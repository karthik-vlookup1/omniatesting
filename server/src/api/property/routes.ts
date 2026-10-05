/**
 * /api/properties
 *   GET   /?q=&branchId=&status=active|inactive|all   list/search (signed in)
 *   POST  /        create (writers)
 *   PATCH /:id     edit (writers); property_ref is immutable
 */
import { Router } from 'express';
import { z } from 'zod';
import type { Pool } from '../../db/pool.js';
import { AppError } from '../../lib/errors.js';
import { create, list, update } from '../../services/property/property.service.js';
import { requireAuth, requireWriter } from '../auth/middleware.js';

const SearchQuery = z.object({
  q: z.string().max(100).default(''),
  branchId: z.uuid().optional(),
  status: z.enum(['active', 'inactive', 'all']).default('all'),
});

const shape = {
  branchId: z.uuid(),
  landlordId: z.uuid().nullish(),
  addressLine1: z.string().trim().min(1).max(200),
  addressLine2: z.string().trim().max(200).nullish(),
  town: z.string().trim().max(100).nullish(),
  postcode: z
    .string()
    .trim()
    .toUpperCase()
    .regex(/^[A-Z]{1,2}\d[A-Z\d]? ?\d[A-Z]{2}$/, 'enter a valid UK postcode'),
  bedrooms: z.number().int().min(0).max(50).nullish(),
  brma: z.string().trim().max(100).nullish(),
  defaultManagementType: z.enum(['RG', 'MG', 'IRG']).nullish(),
};

const CreateBody = z
  .object({ propertyRef: z.string().trim().regex(/^[A-Za-z0-9-]{1,30}$/, 'letters, digits and - only (1-30)'), ...shape })
  .strict();

const PatchBody = z
  .object({ ...shape, isActive: z.boolean() })
  .partial()
  .strict()
  .refine((o) => Object.keys(o).length > 0, 'nothing to change');

export function propertiesRouter({ pool }: { pool: Pool }): Router {
  const router = Router();
  router.use(requireAuth);

  router.get('/', async (req, res) => {
    res.json({ properties: await list(pool, SearchQuery.parse(req.query)) });
  });

  router.post('/', requireWriter, async (req, res) => {
    const id = await create(req.db, CreateBody.parse(req.body));
    res.status(201).json({ id });
  });

  router.patch('/:id', requireWriter, async (req, res) => {
    const id = z.uuid().safeParse(req.params.id);
    if (!id.success) throw new AppError('not_found', 'No such property');
    const patch = PatchBody.parse(req.body);
    res.json({ property: await update(req.db, id.data, patch as Parameters<typeof update>[2]) });
  });

  return router;
}
