/**
 * /api/agentos/intake        GET recent batches (signed in)
 *                            POST multipart: file (writers) - formatted bank record CSV, all or nothing
 * /api/agentos/intake/:id    GET one batch with its lines (signed in)
 */
import { Router } from 'express';
import multer from 'multer';
import { z } from 'zod';
import type { Pool } from '../../db/pool.js';
import { AppError } from '../../lib/errors.js';
import { getIntakeBatch, importIntakeCsv, listIntakeBatches } from '../../services/agentos/intake.service.js';
import { requireAuth, requireWriter } from '../auth/middleware.js';

const MAX_FILE_BYTES = 10 * 1024 * 1024;

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

  return router;
}
