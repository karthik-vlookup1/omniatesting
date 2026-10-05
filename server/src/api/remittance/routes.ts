/**
 * /api/remittances
 *   POST /preview   multipart: bankTransactionId, payer?, payingBody, remittanceRef?, remittanceDate, file
 *                   -> dry-run report (accounts); nothing is written
 *   POST /commit    the same fields + previewSha256 -> 201 {remittanceId, report}, or 200 {alreadyImported, remittanceId}
 *                   when this file was already imported for this line (accounts)
 *   GET  /:id       a committed remittance with its lines (signed in)
 */
import { Router, type RequestHandler } from 'express';
import multer from 'multer';
import { z } from 'zod';
import type { Pool } from '../../db/pool.js';
import { AppError } from '../../lib/errors.js';
import { getRemittance, runRemittance } from '../../services/remittance/remittance.service.js';
import { requireAuth, requireRole } from '../auth/middleware.js';

const MAX_FILE_BYTES = 10 * 1024 * 1024;
const Id = z.uuid();
const NIL = '00000000-0000-0000-0000-000000000000';
const uuidOrNil = (value: unknown): string => (Id.safeParse(value).success ? String(value) : NIL);

const PreviewFields = z
  .object({
    bankTransactionId: z.uuid(),
    payer: z.enum(['council_hb', 'dwp_uc', 'other_third_party']).default('council_hb'),
    payingBody: z.string().trim().min(1).max(100),
    remittanceRef: z.string().trim().max(100).optional(),
    remittanceDate: z.string().trim().regex(/^\d{4}-\d{2}-\d{2}$/, 'remittanceDate must be YYYY-MM-DD'),
  })
  .strict();
const CommitFields = PreviewFields.extend({ previewSha256: z.string().regex(/^[0-9a-f]{64}$/, 'invalid preview checksum') }).strict();

export function remittanceRouter({ pool }: { pool: Pool }): Router {
  const router = Router();
  const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: MAX_FILE_BYTES, files: 1 } });
  router.use(requireAuth);

  const parseUpload: RequestHandler = (req, res, next) => {
    upload.single('file')(req, res, (err: unknown) => {
      if (err instanceof multer.MulterError) {
        const message = err.code === 'LIMIT_FILE_SIZE' ? 'The file is larger than 10 MB' : `Upload failed: ${err.message}`;
        return next(new AppError('bad_request', message));
      }
      next(err);
    });
  };
  const accept = [requireRole('accounts'), parseUpload];

  router.post('/preview', ...accept, async (req, res) => {
    const f = PreviewFields.parse(req.body);
    if (!req.file || req.file.size === 0) throw new AppError('bad_request', 'Choose a CSV file to upload');
    const result = await runRemittance(req.db, req.user!.id, {
      ...f,
      fileName: req.file.originalname,
      content: req.file.buffer,
      dryRun: true,
    });
    res.json({ report: result.report });
  });

  router.post('/commit', ...accept, async (req, res) => {
    const f = CommitFields.parse(req.body);
    if (!req.file || req.file.size === 0) throw new AppError('bad_request', 'Choose a CSV file to upload');
    const result = await runRemittance(req.db, req.user!.id, {
      ...f,
      fileName: req.file.originalname,
      content: req.file.buffer,
      dryRun: false,
    });
    if (result.alreadyImported) {
      res.status(200).json({ alreadyImported: true, remittanceId: result.remittanceId });
      return;
    }
    req.log.info({ remittance: { id: result.remittanceId, counts: result.report.counts } }, 'remittance committed');
    res.status(201).json({ alreadyImported: false, remittanceId: result.remittanceId, report: result.report });
  });

  router.get('/:id', async (req, res) => {
    res.json({ remittance: await getRemittance(pool, uuidOrNil(req.params.id)) });
  });

  return router;
}
