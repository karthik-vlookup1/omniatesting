/**
 * /api/tenancies
 *   GET  /?q=&status=active|ended|all   search (any signed-in user)
 *   GET  /:tid                          detail; full NI only for admin/accounts
 *   POST /sync  { dryRun?, force? }     pull from Veco now (admin)
 */
import { Router } from 'express';
import { z } from 'zod';
import type { Pool } from '../../db/pool.js';
import { SyncRefusedError, VecoSourceError, compact, type VecoSyncRunner } from '../../jobs/veco-sync/index.js';
import { getTenancy, searchTenancies } from '../../services/tenancy/tenancy.service.js';
import { requireAuth, requireRole } from '../auth/middleware.js';

export interface TenanciesRouterDeps {
  pool: Pool;
  hashKey: string;
  encryptionKey: Buffer;
  vecoSync: VecoSyncRunner;
}

const SearchQuery = z.object({
  q: z.string().max(100).default(''),
  status: z.enum(['active', 'ended', 'all']).default('active'),
});

const SyncBody = z.object({ dryRun: z.boolean().default(false), force: z.boolean().default(false) }).strict();

export function tenanciesRouter({ pool, hashKey, encryptionKey, vecoSync }: TenanciesRouterDeps): Router {
  const router = Router();
  router.use(requireAuth);

  router.get('/', async (req, res) => {
    const query = SearchQuery.parse(req.query);
    res.json({ tenancies: await searchTenancies(pool, hashKey, query) });
  });

  router.post('/sync', requireRole(), async (req, res) => {
    const body = SyncBody.parse(req.body ?? {});
    if (!vecoSync.enabled) {
      res.status(503).json({ error: { code: 'veco_not_configured', message: 'Veco sync is not configured on this server' } });
      return;
    }
    try {
      const summary = await vecoSync.run({ actor: req.user!.email, ...body });
      req.log.info({ vecoSync: compact(summary) }, 'veco sync run by admin');
      res.json({ summary });
    } catch (err) {
      if (err instanceof SyncRefusedError) {
        res.status(409).json({ error: { code: 'sync_refused', message: err.message } });
        return;
      }
      if (err instanceof VecoSourceError) {
        res.status(502).json({ error: { code: 'veco_unavailable', message: err.message } });
        return;
      }
      throw err;
    }
  });

  router.get('/:tid', async (req, res) => {
    res.json({ tenancy: await getTenancy(pool, encryptionKey, String(req.params.tid), req.user!.role) });
  });

  return router;
}
