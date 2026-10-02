/**
 * /api/xero (admin + accounts)
 *   GET  /status                   bridge configured? demo or live target? bridge health
 *   GET  /settings                 Xero contact per bank, extended fields on/off
 *   PUT  /settings                 (admin)
 *   GET  /pending                  confirmed receipts not yet in Xero, as the invoices they'd become
 *   POST /stage                    turn them into invoice batches (one per bank per bank date)
 *   POST /run                      push ready batches { dryRun?, confirmLive? } — live needs confirmLive
 *   GET  /outbox?status=           batches: open|pending|in_flight|done|failed|dead
 *   POST /outbox/:id/retry         send a failed / dead batch again
 *   POST /property-map/refresh     (admin) reload Xero property tracking options from Veco
 */
import { Router, type Response } from 'express';
import { z } from 'zod';
import type { Pool } from '../../db/pool.js';
import type { SqlSource } from '../../jobs/veco-sync/mcp-client.js';
import { AppError } from '../../lib/errors.js';
import type { XeroBridge, XeroConfig } from '../../services/xero/bridge.js';
import { refreshPropertyMap } from '../../services/xero/property-map.js';
import {
  draftInvoices,
  getXeroSettings,
  listOutbox,
  readyCount,
  retryBatch,
  runOutbox,
  saveXeroSettings,
  stageInvoices,
  sumPounds,
} from '../../services/xero/xero.service.js';
import { requireAuth, requireRole } from '../auth/middleware.js';

const SettingsBody = z
  .object({
    contacts: z.record(z.string().trim().min(1).max(20), z.string().trim().min(1).max(200)),
    extendedFields: z.boolean(),
  })
  .strict();
const RunBody = z
  .object({
    dryRun: z.boolean().default(false),
    confirmLive: z.boolean().default(false),
  })
  .strict();
const OutboxQuery = z.object({
  status: z.enum(['open', 'pending', 'in_flight', 'done', 'failed', 'dead']).optional(),
});

export interface XeroRouterDeps {
  pool: Pool;
  bridge: XeroBridge | null;
  config: XeroConfig;
  /** Veco read source, for the property map; null when VECO_MCP_URL is not set. */
  vecoSource: SqlSource | null;
}

const refuse = (res: Response, status: number, code: string, message: string) =>
  res.status(status).json({ error: { code, message } });

export function xeroRouter({ pool, bridge, config, vecoSource }: XeroRouterDeps): Router {
  const router = Router();
  router.use(requireAuth, requireRole('accounts'));

  router.get('/status', async (_req, res) => {
    let health: {
      reachable: boolean;
      tenantId: string | null;
      error?: string;
    } | null = null;
    if (bridge) {
      try {
        const h = await bridge.health();
        health = { reachable: h.status === 'ok', tenantId: h.tenantId };
      } catch (err) {
        health = {
          reachable: false,
          tenantId: null,
          error: (err as Error).message,
        };
      }
    }
    res.json({
      configured: Boolean(bridge),
      targetEnv: config.targetEnv,
      bridge: health,
    });
  });

  router.get('/settings', async (_req, res) => {
    res.json({ settings: await getXeroSettings(pool) });
  });

  router.put('/settings', requireRole(), async (req, res) => {
    res.json({
      settings: await saveXeroSettings(req.db, SettingsBody.parse(req.body)),
    });
  });

  router.get('/pending', async (_req, res) => {
    const invoices = await draftInvoices(pool);
    res.json({
      invoices,
      receipts: invoices.reduce((n, i) => n + i.lines.length, 0),
      total: sumPounds(invoices.map((i) => i.total)),
    });
  });

  router.post('/stage', async (req, res) => {
    const batches = await stageInvoices(req.db);
    if (batches.length === 0)
      throw new AppError('conflict', 'Nothing to send: every confirmed receipt is already in Xero');
    res.status(201).json({ batches });
  });

  router.post('/run', async (req, res) => {
    const { dryRun, confirmLive } = RunBody.parse(req.body ?? {});
    if (dryRun) {
      res.json({
        dryRun: true,
        targetEnv: config.targetEnv,
        configured: Boolean(bridge),
        wouldSend: await readyCount(pool),
      });
      return;
    }
    if (!bridge) {
      refuse(
        res,
        503,
        'xero_not_configured',
        'The Xero bridge is not configured on this server (XERO_BRIDGE_URL and key)',
      );
      return;
    }
    if (config.targetEnv !== 'demo' && !confirmLive) {
      refuse(res, 409, 'live_requires_confirmation', 'This server posts to a LIVE Xero organisation: confirm to send');
      return;
    }
    const result = await runOutbox(req.db, bridge);
    res.json({ dryRun: false, targetEnv: config.targetEnv, ...result });
  });

  router.get('/outbox', async (req, res) => {
    res.json(await listOutbox(pool, OutboxQuery.parse(req.query).status));
  });

  router.post('/outbox/:id/retry', async (req, res) => {
    const id = String(req.params.id);
    if (!/^\d{1,18}$/.test(id)) throw new AppError('not_found', 'No such Xero batch');
    res.json({ item: await retryBatch(req.db, id) });
  });

  router.post('/property-map/refresh', requireRole(), async (req, res) => {
    if (!vecoSource) {
      refuse(res, 503, 'veco_not_configured', 'Veco is not configured on this server');
      return;
    }
    try {
      res.json({ summary: await refreshPropertyMap(req.db, vecoSource) });
    } catch (err) {
      if ((err as Error).name === 'VecoSourceError') {
        refuse(res, 502, 'veco_unavailable', (err as Error).message);
        return;
      }
      throw err;
    }
  });

  return router;
}
