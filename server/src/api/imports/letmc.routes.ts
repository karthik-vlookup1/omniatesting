/**
 * /api/imports/letmc
 *   GET  /layout    expected columns per record type (signed in)
 *   GET  /runs      the 50 most recent committed imports (accounts)
 *   POST /preview   multipart: entityType, cutoverDate?, file -> dry-run report (accounts); nothing is written
 *   POST /commit    multipart: entityType, cutoverDate?, previewSha256, file -> 201 {runId, report} (accounts);
 *                   refused (409) when any row is rejected or the file differs from the one previewed
 */
import { Router, type RequestHandler } from 'express';
import multer from 'multer';
import { z } from 'zod';
import type { Pool } from '../../db/pool.js';
import { AppError } from '../../lib/errors.js';
import type { ProtectionKeys } from '../../lib/crypto.js';
import { ENTITY_TYPES, LAYOUTS, listRuns, runLetmcImport } from '../../jobs/letmc-import/index.js';
import { requireAuth, requireRole } from '../auth/middleware.js';

const MAX_FILE_BYTES = 10 * 1024 * 1024;

const PreviewFields = z.object({
  entityType: z.enum(ENTITY_TYPES),
  cutoverDate: z.string().trim().optional(),
});
const CommitFields = PreviewFields.extend({ previewSha256: z.string().regex(/^[0-9a-f]{64}$/, 'invalid preview checksum') });

export function letmcImportRouter({ pool, keys }: { pool: Pool; keys: ProtectionKeys }): Router {
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

  router.get('/layout', (_req, res) => {
    res.json({ layouts: LAYOUTS });
  });

  router.get('/runs', requireRole('accounts'), async (_req, res) => {
    res.json({ runs: await listRuns(pool) });
  });

  router.post('/preview', ...accept, async (req, res) => {
    const fields = PreviewFields.parse(req.body);
    if (!req.file || req.file.size === 0) throw new AppError('bad_request', 'Choose a CSV file to upload');
    const { report } = await runLetmcImport(req.db, keys, {
      entityType: fields.entityType,
      fileName: req.file.originalname,
      content: req.file.buffer,
      cutoverDate: fields.cutoverDate,
      dryRun: true,
      userId: req.user!.id,
    });
    res.json({ report });
  });

  router.post('/commit', ...accept, async (req, res) => {
    const fields = CommitFields.parse(req.body);
    if (!req.file || req.file.size === 0) throw new AppError('bad_request', 'Choose a CSV file to upload');
    const result = await runLetmcImport(req.db, keys, {
      entityType: fields.entityType,
      fileName: req.file.originalname,
      content: req.file.buffer,
      cutoverDate: fields.cutoverDate,
      dryRun: false,
      userId: req.user!.id,
      previewSha256: fields.previewSha256,
    });
    req.log.info({ letmc: { runId: result.runId, entityType: fields.entityType, counts: result.report.counts } }, 'letmc import committed');
    res.status(201).json({ runId: result.runId, report: result.report });
  });

  return router;
}
