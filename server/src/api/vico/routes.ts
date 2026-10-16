/**
 * /api/vico (admin + accounts)
 *   GET  /settings              sort code + account number on every Vico row
 *   PUT  /settings              (admin) set them
 *   GET  /pending               confirmed receipts not yet in Vico
 *   POST /exports               export pending receipts (all, or { receiptIds }) → CSV download
 *   GET  /exports               export history
 *   GET  /exports/:id/file      download an earlier export again
 * File responses carry X-Vico-Export-Id, X-Vico-Rows, X-Vico-Total and, when the shared folder holds a copy,
 * X-Vico-Shared-Path (URI-encoded display path).
 */
import { Router, type Response } from 'express';
import { z } from 'zod';
import type { Pool } from '../../db/pool.js';
import {
  createExport,
  getExportFile,
  getVicoSettings,
  listExports,
  listPending,
  saveVicoSettings,
  type VicoFile,
} from '../../services/vico/vico.service.js';
import { AppError } from '../../lib/errors.js';
import type { VicoSharedDir } from '../../services/vico/shared-folder.js';
import { requireAuth, requireRole } from '../auth/middleware.js';

const SettingsBody = z.object({ sortCode: z.string().max(20), accountNumber: z.string().max(20) }).strict();
const ExportBody = z.object({ receiptIds: z.array(z.uuid()).min(1).max(5000).optional() }).strict();
const Id = z.uuid();

function sendFile(res: Response, file: VicoFile) {
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="${file.fileName}"`);
  res.setHeader('X-Vico-Export-Id', file.exportId);
  res.setHeader('X-Vico-Rows', String(file.rows));
  res.setHeader('X-Vico-Total', file.totalAmount);
  if (file.sharedPath) res.setHeader('X-Vico-Shared-Path', encodeURIComponent(file.sharedPath));
  res.setHeader(
    'Access-Control-Expose-Headers',
    'Content-Disposition, X-Vico-Export-Id, X-Vico-Rows, X-Vico-Total, X-Vico-Shared-Path',
  );
  res.send(file.csv);
}

export function vicoRouter({ pool, shared }: { pool: Pool; shared: VicoSharedDir }): Router {
  const router = Router();
  router.use(requireAuth, requireRole('accounts'));

  router.get('/settings', async (_req, res) => {
    res.json({ settings: await getVicoSettings(pool) });
  });

  router.put('/settings', requireRole(), async (req, res) => {
    res.json({ settings: await saveVicoSettings(req.db, SettingsBody.parse(req.body)) });
  });

  router.get('/pending', async (_req, res) => {
    res.json(await listPending(pool));
  });

  router.post('/exports', async (req, res) => {
    const { receiptIds } = ExportBody.parse(req.body ?? {});
    sendFile(res, await createExport(req.db, receiptIds, { shared }));
  });

  router.get('/exports', async (_req, res) => {
    res.json({ exports: await listExports(pool, shared) });
  });

  router.get('/exports/:id/file', async (req, res) => {
    const id = Id.safeParse(req.params.id);
    if (!id.success) throw new AppError('not_found', 'No such Vico export');
    sendFile(res, await getExportFile(pool, id.data, shared));
  });

  return router;
}
