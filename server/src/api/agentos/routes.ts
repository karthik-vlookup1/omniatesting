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
 *                            POST { clientRequestId, description, nominalCode, entries[2-20]: { agentosTenantId, accountType, amountPence } }
 *                            or the legacy { fromTid, toTid, amountPence, description, nominalCode, accountType } (accounts, admin);
 *                            entries must add up to 0; 201 new, 200 replay of the same clientRequestId
 * /api/agentos/journal/exports POST (accounts, admin) - Journal Transfer CSV of all not-yet-exported transfers
 * /api/agentos/journal/exports/:id.csv GET the stored CSV (signed in)
 * /api/agentos/journal/transfers/:id/posted POST (accounts, admin) - mark an exported transfer as posted
 * /api/agentos/payments/options GET deposit accounts and payment types (signed in)
 * /api/agentos/payments      GET recent single payments (signed in)
 *                            POST { clientRequestId, agentosTenantId, depositAccountCode, paymentType, amountPence, description?, cardAuthCode? }
 *                            (accounts, admin) - take one payment, post it to the Omnia ledger; 201 new, 200 replay
 * /api/agentos/payments/exports POST (accounts, admin) - Take a Payment CSV of all not-yet-exported payments (download via /exports/:id.csv)
 * /api/agentos/payments/:id/posted POST (accounts, admin) - mark an exported payment as posted
 * /api/agentos/ledger/:tid   GET Omnia ledger balance and recent postings for a TID (signed in)
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
  createLegacyJournalTransfer,
  getJournalExportCsv,
  listJournalTransfers,
  markTransferPosted,
} from '../../services/agentos/journal.service.js';
import {
  createPayment,
  createPaymentExport,
  listPaymentOptions,
  listPayments,
  markPaymentPosted,
} from '../../services/agentos/payment.service.js';
import { getTenantLedger } from '../../services/ledger/ledger.service.js';
import { listReassignTenants, reassignLineTid } from '../../services/agentos/reassign.service.js';
import { getIntakeBatch, importIntakeCsv, listIntakeBatches } from '../../services/agentos/intake.service.js';
import { requireAuth, requireRole, requireWriter } from '../auth/middleware.js';

const requireAccounts = requireRole('accounts');
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
const multiJournalBody = z.object({
  clientRequestId: z.uuid(),
  description: z.string().trim().min(1).max(200),
  nominalCode: z.string().trim().min(1).max(50),
  entries: z
    .array(
      z.object({
        agentosTenantId: z.uuid(),
        accountType: z.string().trim().min(1).max(50),
        amountPence: z.number().int().refine((n) => n !== 0, 'must not be 0'),
      }),
    )
    .min(2)
    .max(20),
});
const JOURNAL_RULES: Record<string, string> = {
  fromTid: TID_RULE,
  toTid: TID_RULE,
  amountPence: 'must be a whole number of pence above 0',
  description: textRule(200),
  nominalCode: textRule(50),
  accountType: textRule(50),
};

type JournalReq = Parameters<Parameters<Router['post']>[1]>[0];

async function createMulti(req: JournalReq) {
  const body = multiJournalBody.safeParse(req.body);
  if (!body.success) {
    const issue = body.error.issues[0];
    const path = issue?.path.join('.') || 'body';
    throw new AppError('bad_request', `Invalid ${path}: ${issue?.message ?? 'is not valid'}`);
  }
  return createJournalTransfer(req.db, { ...body.data, userId: req.user!.id });
}

async function createLegacy(req: JournalReq) {
  const body = journalBody.safeParse(req.body);
  if (!body.success) {
    const field = String(body.error.issues[0]?.path[0] ?? 'body');
    throw new AppError('bad_request', `Invalid ${field}: ${JOURNAL_RULES[field] ?? 'is not valid'}`);
  }
  return createLegacyJournalTransfer(req.db, { ...body.data, userId: req.user!.id });
}

const paymentBody = z.object({
  clientRequestId: z.uuid(),
  agentosTenantId: z.uuid(),
  depositAccountCode: z.string().min(1).max(30),
  paymentType: z.string().min(1).max(20),
  amountPence: z.number().int().min(1).max(9999999999),
  description: z.string().trim().max(500).default(''),
  cardAuthCode: z
    .string()
    .trim()
    .transform((v) => (v === '' ? undefined : v))
    .pipe(z.string().regex(/^[A-Za-z0-9]{1,20}$/).optional())
    .optional(),
});
const PAYMENT_RULES: Record<string, string> = {
  clientRequestId: 'must be a uuid',
  agentosTenantId: 'must be a uuid',
  depositAccountCode: 'is required, max 30 characters',
  paymentType: 'is required, max 20 characters',
  amountPence: 'must be a whole number of pence from 1 to 9999999999',
  description: 'max 500 characters',
  cardAuthCode: 'must be 1-20 letters or digits',
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

  router.post('/journal/transfers', requireAccounts, async (req, res) => {
    const isMulti = typeof req.body === 'object' && req.body !== null && 'entries' in req.body;
    const result = isMulti ? await createMulti(req) : await createLegacy(req);
    const { transfer, created } = result;
    req.log.info(
      { agentosJournal: { id: transfer.id, entries: transfer.entries.length, amountPence: transfer.amountPence, created } },
      'agentos journal transfer created',
    );
    res.status(created ? 201 : 200).json({ transfer });
  });

  router.post('/journal/exports', requireAccounts, async (req, res) => {
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

  router.post('/journal/transfers/:id/posted', requireAccounts, async (req, res) => {
    const id = z.uuid().safeParse(req.params.id);
    if (!id.success) throw new AppError('not_found', 'No such journal transfer');
    const transfer = await markTransferPosted(req.db, { transferId: id.data, userId: req.user!.id });
    res.status(200).json({ transfer });
  });

  router.get('/payments/options', async (_req, res) => {
    res.json(await listPaymentOptions(pool));
  });

  router.get('/payments', async (_req, res) => {
    res.json({ payments: await listPayments(pool) });
  });

  router.post('/payments', requireAccounts, async (req, res) => {
    const body = paymentBody.safeParse(req.body);
    if (!body.success) {
      const field = String(body.error.issues[0]?.path[0] ?? 'body');
      throw new AppError('bad_request', `Invalid ${field}: ${PAYMENT_RULES[field] ?? 'is not valid'}`);
    }
    const { payment, balancePence, created } = await createPayment(req.db, { ...body.data, userId: req.user!.id });
    req.log.info({ agentosPayment: { id: payment.id, tid: payment.tid, amountPence: payment.amountPence, created } }, 'agentos payment taken');
    res.status(created ? 201 : 200).json({ payment, balancePence });
  });

  router.post('/payments/exports', requireAccounts, async (req, res) => {
    const paymentExport = await createPaymentExport(req.db, { userId: req.user!.id });
    req.log.info({ agentosPaymentExport: paymentExport }, 'agentos payment export created');
    res.status(201).json({ export: paymentExport });
  });

  router.post('/payments/:id/posted', requireAccounts, async (req, res) => {
    const id = z.uuid().safeParse(req.params.id);
    if (!id.success) throw new AppError('not_found', 'No such payment');
    const payment = await markPaymentPosted(req.db, { paymentId: id.data, userId: req.user!.id });
    res.status(200).json({ payment });
  });

  router.get('/ledger/:tid', async (req, res) => {
    const tid = req.params.tid ?? '';
    if (!/^\d{4,5}$/.test(tid)) throw new AppError('not_found', 'No such ledger account');
    res.json(await getTenantLedger(pool, tid));
  });

  return router;
}
