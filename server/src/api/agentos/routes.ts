/**
 * /api/agentos/intake        GET recent batches (signed in)
 *                            POST multipart: file (writers) - formatted bank record CSV, all or nothing
 * /api/agentos/intake/:id    GET one batch with its lines (signed in)
 * /api/agentos/exports       POST { batchId } (writers) - Take a Payment CSV of the batch's unexported matched lines
 * /api/agentos/exports/:id.csv  GET the stored CSV (signed in)
 * /api/agentos/lines/:id/posted POST (writers) - mark an exported line as posted
 * /api/agentos/tenants       GET agentOS tenants for the reassign picker (signed in)
 * /api/agentos/lines/:id/reassign POST { tid } (writers) - move a line to another TID and re-run the match rules (audited)
 * /api/agentos/journal/transfers GET recent journal transfers (signed in)
 *                            POST { fromTid, toTid, amountPence, description, nominalCode, accountType } (writers)
 * /api/agentos/journal/exports POST (writers) - Journal Transfer CSV of all not-yet-exported transfers
 * /api/agentos/journal/exports/:id.csv GET the stored CSV (signed in)
 * /api/agentos/journal/transfers/:id/posted POST (writers) - mark an exported transfer as posted
 */
import { Router } from 'express';
import multer from 'multer';
import { z } from 'zod';
import type { Pool } from '../../db/pool.js';
import { AppError } from '../../lib/errors.js';
import { createAgentosExport, getAgentosExportCsv, markLinePosted } from '../../services/agentos/export.service.js';
import {
  createJournalExport,
  createJournalTransfer,
  getJournalExportCsv,
  listJournalTransfers,
  markTransferPosted,
} from '../../services/agentos/journal.service.js';
import { listReassignTenants, reassignLineTid } from '../../services/agentos/reassign.service.js';
import { getIntakeBatch, importIntakeCsv, listIntakeBatches } from '../../services/agentos/intake.service.js';
import { requireAuth, requireWriter } from '../auth/middleware.js';

const MAX_FILE_BYTES = 10 * 1024 * 1024;

const TID_RULE = 'must be 4 digits';
const textRule = (max: number) => `is required, max ${max} characters`;
const journalBody = z.object({
  fromTid: z.string().regex(/^\d{4}$/),
  toTid: z.string().regex(/^\d{4}$/),
  amountPence: z.number().int().positive().max(9999999999),
  description: z.string().trim().min(1).max(200),
  nominalCode: z.string().trim().min(1).max(50),
  accountType: z.string().trim().min(1).max(50),
});
const JOURNAL_RULES: Record<string, string> = {
  fromTid: TID_RULE,
  toTid: TID_RULE,
  amountPence: 'must be a whole number of pence above 0',
  description: textRule(200),
  nominalCode: textRule(50),
  accountType: textRule(50),
};

export function agentosRouter({ pool }: { pool: Pool }): Router {
  const router = Router();
  const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: MAX_FILE_BYTES, files: 1 } });
  router.use(requireAuth);

  router.get('/intake', async (_req, res) => {
    res.json({ batches: await listIntakeBatches(pool) });
  });

  router.post(
    '/intake',
    requireWriter,
    (req, res, next) => {
      upload.single('file')(req, res, (err: unknown) => {
        if (err instanceof multer.MulterError) {
          const message = err.code === 'LIMIT_FILE_SIZE' ? 'The file is larger than 10 MB' : `Upload failed: ${err.message}`;
          return next(new AppError('bad_request', message));
        }
        next(err);
      });
    },
    async (req, res) => {
      if (!req.file || req.file.size === 0) throw new AppError('bad_request', 'Choose a CSV file to upload');
      const batch = await importIntakeCsv(req.db, {
        fileName: req.file.originalname,
        content: req.file.buffer,
        userId: req.user!.id,
      });
      req.log.info({ intake: { ...batch } }, 'agentos intake imported');
      res.status(201).json({ batch });
    },
  );

  router.get('/intake/:id', async (req, res) => {
    const id = z.uuid().safeParse(req.params.id);
    if (!id.success) throw new AppError('not_found', 'No such intake batch');
    const found = await getIntakeBatch(pool, id.data);
    if (!found) throw new AppError('not_found', 'No such intake batch');
    res.json(found);
  });

  router.post('/exports', requireWriter, async (req, res) => {
    const body = z.object({ batchId: z.uuid() }).safeParse(req.body);
    if (!body.success) throw new AppError('bad_request', 'batchId must be a uuid');
    const agentosExport = await createAgentosExport(req.db, { batchId: body.data.batchId, userId: req.user!.id });
    req.log.info({ agentosExport }, 'agentos take a payment export created');
    res.status(201).json({ export: agentosExport });
  });

  router.get('/exports/:id.csv', async (req, res) => {
    const id = z.uuid().safeParse(req.params.id);
    if (!id.success) throw new AppError('not_found', 'No such export');
    const found = await getAgentosExportCsv(pool, id.data);
    if (!found) throw new AppError('not_found', 'No such export');
    res.status(200);
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="agentos-take-payment-${found.createdAt}-${id.data.slice(0, 8)}.csv"`,
    );
    res.send(Buffer.from(found.csv, 'utf8'));
  });

  router.post('/lines/:id/posted', requireWriter, async (req, res) => {
    const id = z.uuid().safeParse(req.params.id);
    if (!id.success) throw new AppError('not_found', 'No such intake line');
    const line = await markLinePosted(req.db, { lineId: id.data, userId: req.user!.id });
    res.status(200).json({ line });
  });

  router.get('/tenants', async (_req, res) => {
    res.json({ tenants: await listReassignTenants(pool) });
  });

  router.post('/lines/:id/reassign', requireWriter, async (req, res) => {
    const id = z.uuid().safeParse(req.params.id);
    if (!id.success) throw new AppError('not_found', 'No such intake line');
    const body = z.object({ tid: z.string().regex(/^\d{4}$/) }).safeParse(req.body);
    if (!body.success) throw new AppError('bad_request', 'tid must be 4 digits');
    const result = await reassignLineTid(req.db, { lineId: id.data, tid: body.data.tid });
    req.log.info({ agentosReassign: { lineId: id.data, tid: body.data.tid, status: result.line.matchStatus } }, 'agentos line reassigned');
    res.status(200).json(result);
  });

  router.get('/journal/transfers', async (_req, res) => {
    res.json({ transfers: await listJournalTransfers(pool) });
  });

  router.post('/journal/transfers', requireWriter, async (req, res) => {
    const body = journalBody.safeParse(req.body);
    if (!body.success) {
      const field = String(body.error.issues[0]?.path[0] ?? 'body');
      throw new AppError('bad_request', `Invalid ${field}: ${JOURNAL_RULES[field] ?? 'is not valid'}`);
    }
    const transfer = await createJournalTransfer(req.db, { ...body.data, userId: req.user!.id });
    req.log.info(
      { agentosJournal: { id: transfer.id, fromTid: transfer.fromTid, toTid: transfer.toTid, amountPence: transfer.amountPence } },
      'agentos journal transfer created',
    );
    res.status(201).json({ transfer });
  });

  router.post('/journal/exports', requireWriter, async (req, res) => {
    const journalExport = await createJournalExport(req.db, { userId: req.user!.id });
    req.log.info({ agentosJournalExport: journalExport }, 'agentos journal transfer export created');
    res.status(201).json({ export: journalExport });
  });

  router.get('/journal/exports/:id.csv', async (req, res) => {
    const id = z.uuid().safeParse(req.params.id);
    if (!id.success) throw new AppError('not_found', 'No such journal export');
    const found = await getJournalExportCsv(pool, id.data);
    if (!found) throw new AppError('not_found', 'No such journal export');
    res.status(200);
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="agentos-journal-transfer-${found.createdAt}-${id.data.slice(0, 8)}.csv"`,
    );
    res.send(Buffer.from(found.csv, 'utf8'));
  });

  router.post('/journal/transfers/:id/posted', requireWriter, async (req, res) => {
    const id = z.uuid().safeParse(req.params.id);
    if (!id.success) throw new AppError('not_found', 'No such journal transfer');
    const transfer = await markTransferPosted(req.db, { transferId: id.data, userId: req.user!.id });
    res.status(200).json({ transfer });
  });

  return router;
}
