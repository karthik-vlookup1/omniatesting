/**
 * /api/vico (admin + accounts)
 *   GET  /settings              sort code + account number on every Vico row
 *   PUT  /settings              (admin) set them
 *   GET  /pending               confirmed receipts not yet in Vico
 *   POST /exports               export pending receipts (all, or { receiptIds }) → CSV download
 *   GET  /exports               export history, each with its latest VECO landed check (or null)
 *   POST /exports/:id/landed-check  read-only check of the export's receipts against VECO SLP rows
 *   GET  /exports/:id/file      download an earlier export again
 */
import { Router, type Response } from 'express';
import { z } from 'zod';
import type { Pool } from '../../db/pool.js';
import {
  createExport,
  getExportFile,
  getVicoSettings,
  listPending,
  saveVicoSettings,
  type VicoFile,
} from '../../services/vico/vico.service.js';
import { listExportsWithLanded, runLandedCheck } from '../../services/vico/landed.js';
import { VecoSourceError, type SqlSource } from '../../jobs/veco-sync/mcp-client.js';
import { AppError } from '../../lib/errors.js';
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
  res.setHeader('Access-Control-Expose-Headers', 'Content-Disposition, X-Vico-Export-Id, X-Vico-Rows, X-Vico-Total');
  res.send(file.csv);
}

export function vicoRouter({ pool, vecoSource = null }: { pool: Pool; vecoSource?: SqlSource | null }): Router {
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
    sendFile(res, await createExport(req.db, receiptIds));
  });

  router.get('/exports', async (_req, res) => {
    res.json({ exports: await listExportsWithLanded(pool) });
  });

  router.post('/exports/:id/landed-check', async (req, res) => {
    const id = Id.safeParse(req.params.id);
    if (!id.success) throw new AppError('not_found', 'No such Vico export');
    if (!vecoSource) throw new AppError('conflict', 'VECO is not configured on this server', { reason: 'veco_not_configured' });
    try {
      res.json({ landedCheck: await runLandedCheck(req.db, pool, vecoSource, id.data) });
    } catch (err) {
      if (err instanceof VecoSourceError) {
        res.status(502).json({ error: { code: 'veco_unavailable', message: err.message } });
        return;
      }
      throw err;
    }
  });

  router.get('/exports/:id/file', async (req, res) => {
    const id = Id.safeParse(req.params.id);
    if (!id.success) throw new AppError('not_found', 'No such Vico export');
    sendFile(res, await getExportFile(pool, id.data));
  });

  return router;
}
