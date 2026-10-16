/**
 * /api/veco-push (admin + accounts; pushing also needs a VECO link with can_push)
 *   GET    /status                    configured?, target database, and the caller's VECO link
 *   POST   /preview                   read-only: ready / held split, per-bank totals
 *   POST   /pushes                    push to the VECO test database (idempotency key), 201 (200 on replay)
 *   GET    /batches                   history
 *   POST   /batches/:id/verify        re-read from VECO and cross-check
 *   GET    /batches/:id/readback.csv  CSV of the read-back
 *   DELETE /batches/:id               delete this push's rows from VECO (test database only)
 *   GET    /staff-links               (admin) users with their VECO link
 *   PUT    /staff-links/:userId       (admin) set / clear a user's StaffPK and can_push
 */
import { Router } from 'express';
import { z } from 'zod';
import type { Pool } from '../../db/pool.js';
import { AppError } from '../../lib/errors.js';
import type { VecoGateway } from '../../services/veco-push/gateway.js';
import {
  deleteBatch,
  getStatus,
  listBatches,
  listStaffLinks,
  previewPush,
  pushToVeco,
  readbackCsv,
  saveStaffLink,
  verifyBatch,
  type PushDeps,
} from '../../services/veco-push/veco-push.service.js';
import { MAX_PUSH_RECEIPTS } from '../../services/veco-push/settings.js';
import { requireAuth, requireRole } from '../auth/middleware.js';

const Departments = z.record(z.uuid(), z.enum(['Owner', 'Tenancy'])).default({});
const ReceiptIds = z.array(z.uuid()).min(1).max(MAX_PUSH_RECEIPTS);
const PreviewBody = z.object({ receiptIds: ReceiptIds, departments: Departments }).strict();
const PushBody = z.object({ idempotencyKey: z.uuid(), receiptIds: ReceiptIds, departments: Departments }).strict();
const LinkBody = z.object({ staffFk: z.uuid().nullable(), canPush: z.boolean() }).strict();
const Id = z.uuid();

const idParam = (value: unknown): string => {
  const id = Id.safeParse(value);
  if (!id.success) throw new AppError('not_found', 'Not found');
  return id.data;
};

export function vecoPushRouter(deps: { pool: Pool; gateway: VecoGateway | null; now: () => Date }): Router {
  const push: PushDeps = deps;
  const router = Router();
  router.use(requireAuth, requireRole('accounts'));

  router.get('/status', async (req, res) => {
    res.json(await getStatus(push, req.db, req.user!));
  });

  router.post('/preview', async (req, res) => {
    res.json(await previewPush(push, PreviewBody.parse(req.body ?? {})));
  });

  router.post('/pushes', async (req, res) => {
    const result = await pushToVeco(push, req.db, req.user!, PushBody.parse(req.body ?? {}));
    res.status(result.replay ? 200 : 201).json(result);
  });

  router.get('/batches', async (_req, res) => {
    res.json({ batches: await listBatches(deps.pool) });
  });

  router.post('/batches/:id/verify', async (req, res) => {
    res.json(await verifyBatch(push, req.db, idParam(req.params.id)));
  });

  router.get('/batches/:id/readback.csv', async (req, res) => {
    const file = await readbackCsv(push, req.db, idParam(req.params.id));
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${file.fileName}"`);
    res.setHeader('Access-Control-Expose-Headers', 'Content-Disposition');
    res.send(file.csv);
  });

  router.delete('/batches/:id', async (req, res) => {
    res.json(await deleteBatch(push, req.db, req.user!, idParam(req.params.id)));
  });

  router.get('/staff-links', requireRole(), async (_req, res) => {
    res.json({ links: await listStaffLinks(deps.pool) });
  });

  router.put('/staff-links/:userId', requireRole(), async (req, res) => {
    const links = await saveStaffLink(push, req.db, req.user!, idParam(req.params.userId), LinkBody.parse(req.body ?? {}));
    res.json({ links });
  });

  return router;
}
