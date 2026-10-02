/**
 * /api/bank-accounts                     GET list with active CSV profile (signed in)
 *                                        POST create (admin)
 * /api/bank-accounts/defaults            POST create the 7 default banks + profiles (admin)
 * /api/bank-accounts/:id/profile         POST save a new profile version (admin, accounts)
 * /api/imports                           GET recent imports (signed in)
 *                                        POST multipart: bankAccountId + file (writers); the new
 *                                        lines are auto-matched straight away and the response
 *                                        carries the match summary
 */
import { Router } from 'express';
import multer from 'multer';
import { z } from 'zod';
import type { Pool } from '../../db/pool.js';
import { AppError } from '../../lib/errors.js';
import { CANONICAL_FIELDS, DATE_FORMATS } from '../../domain/ingest/profiles.js';
import {
  createBankAccount,
  importBankCsv,
  installDefaultBanks,
  listBankAccounts,
  listImports,
  saveProfileVersion,
} from '../../services/ingest/ingest.service.js';
import { autoMatchPending, batchSummary } from '../../services/matching/matching.service.js';
import { requireAuth, requireRole, requireWriter } from '../auth/middleware.js';

const MAX_FILE_BYTES = 10 * 1024 * 1024;

const BankAccountBody = z
  .object({
    code: z.string().trim().regex(/^[A-Za-z0-9_]{2,20}$/, 'letters, digits and _ only (2-20)'),
    bankName: z.string().trim().min(1).max(100),
    accountName: z.string().trim().min(1).max(100),
  })
  .strict();

const ProfileBody = z
  .object({
    headerAliases: z.partialRecord(z.enum(CANONICAL_FIELDS), z.array(z.string().trim().min(1).max(100)).max(10)),
    requiredFields: z.array(z.enum(CANONICAL_FIELDS)).default(['txn_date', 'description']),
    amountMode: z.enum(['signed', 'split_in_out']),
    dateFormat: z.enum(DATE_FORMATS),
    skipRows: z.number().int().min(0).max(50).default(0),
    notes: z.string().trim().max(500).nullish(),
  })
  .strict();

const ImportFields = z.object({ bankAccountId: z.uuid('choose a bank account') });

export function bankAccountsRouter({ pool }: { pool: Pool }): Router {
  const router = Router();
  router.use(requireAuth);

  router.get('/', async (_req, res) => {
    res.json({ bankAccounts: await listBankAccounts(pool) });
  });

  router.post('/', requireRole(), async (req, res) => {
    const id = await createBankAccount(req.db, BankAccountBody.parse(req.body));
    res.status(201).json({ id });
  });

  router.post('/defaults', requireRole(), async (req, res) => {
    res.json(await installDefaultBanks(req.db));
  });

  router.post('/:id/profile', requireRole('accounts'), async (req, res) => {
    const id = z.uuid().safeParse(req.params.id);
    if (!id.success) throw new AppError('not_found', 'No such bank account');
    const { notes, ...profile } = ProfileBody.parse(req.body);
    res.status(201).json(await saveProfileVersion(req.db, id.data, profile, notes ?? null));
  });

  return router;
}

export function importsRouter({ pool, hashKey, threshold }: { pool: Pool; hashKey: string; threshold: number }): Router {
  const router = Router();
  const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: MAX_FILE_BYTES, files: 1 } });
  router.use(requireAuth);

  router.get('/', async (_req, res) => {
    res.json({ imports: await listImports(pool) });
  });

  router.post(
    '/',
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
      const { bankAccountId } = ImportFields.parse(req.body);
      if (!req.file || req.file.size === 0) throw new AppError('bad_request', 'Choose a CSV file to upload');
      const result = await importBankCsv(req.db, hashKey, {
        bankAccountId,
        fileName: req.file.originalname,
        content: req.file.buffer,
        userId: req.user!.id,
      });
      // The import is committed first; if matching fails the lines stay 'new' and can be re-run.
      let matching = null;
      try {
        await autoMatchPending(req.db, threshold, result.batchId);
        matching = await batchSummary(pool, result.batchId);
      } catch (err) {
        req.log.error({ err, batchId: result.batchId }, 'auto-match after import failed');
      }
      req.log.info({ import: { ...result }, matching }, 'bank csv imported');
      res.status(201).json({ import: result, matching });
    },
  );

  return router;
}
