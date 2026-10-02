/**
 * /api/matching
 *   POST /run                                   { batchId? } auto-match new lines (writers)
 *   GET  /imports/:batchId/summary              where one import's lines stand
 *   GET  /lines?status=open|needs_review|...    review queue (signed in)
 *   GET  /lines/:id                             one line with suggestions + receipts
 *   POST /lines/:id/confirm                     { suggestionId | tid, payer?, remember?, amount? } (writers)
 *   POST /lines/:id/suggestions/:sid/reject     (writers)
 *   POST /lines/:id/exclude                     { reason } (writers)
 *   POST /lines/:id/include                     put an excluded line back through matching (writers)
 */
import { Router } from 'express';
import { z } from 'zod';
import type { Pool } from '../../db/pool.js';
import {
  autoMatchPending,
  batchSummary,
  confirmLine,
  excludeLine,
  getLine,
  includeLine,
  listLines,
  rejectSuggestion,
} from '../../services/matching/matching.service.js';
import { requireAuth, requireWriter } from '../auth/middleware.js';

const PAYERS = ['tenant', 'council_hb', 'dwp_uc', 'other_third_party'] as const;
const STATUSES = ['open', 'new', 'needs_review', 'yet_to_take', 'partially_matched', 'matched', 'excluded'] as const;

const Id = z.uuid();
const RunBody = z.object({ batchId: z.uuid().optional() }).strict();
const QueueQuery = z.object({
  status: z.enum(STATUSES).default('open'),
  bankAccountId: z.uuid().optional(),
  batchId: z.uuid().optional(),
  limit: z.coerce.number().int().min(1).max(200).default(50),
  offset: z.coerce.number().int().min(0).default(0),
});
const ConfirmBody = z
  .object({
    suggestionId: z.uuid().optional(),
    tid: z.string().trim().regex(/^[Tt]\d{3,6}$/, 'TID must look like T1234').optional(),
    payer: z.enum(PAYERS).optional(),
    remember: z.boolean().default(false),
    amount: z
      .string()
      .regex(/^\d{1,10}(\.\d{1,2})?$/, 'amount must be pounds and pence, e.g. 325.00')
      .optional(),
  })
  .strict()
  .refine((b) => Boolean(b.suggestionId) !== Boolean(b.tid), 'give either suggestionId or tid');
const ExcludeBody = z.object({ reason: z.string().trim().min(2).max(200) }).strict();

/** A malformed id can't exist: map it to the nil uuid so the service answers 404, not a DB error. */
const NIL = '00000000-0000-0000-0000-000000000000';
const uuidOrNil = (value: unknown): string => (Id.safeParse(value).success ? String(value) : NIL);

export function matchingRouter({ pool, threshold }: { pool: Pool; threshold: number }): Router {
  const router = Router();
  router.use(requireAuth);

  router.post('/run', requireWriter, async (req, res) => {
    const { batchId } = RunBody.parse(req.body ?? {});
    const result = await autoMatchPending(req.db, threshold, batchId);
    res.json({ ...result, summary: batchId ? await batchSummary(pool, batchId) : undefined });
  });

  router.get('/imports/:batchId/summary', async (req, res) => {
    res.json({ summary: await batchSummary(pool, uuidOrNil(req.params.batchId)) });
  });

  router.get('/lines', async (req, res) => {
    res.json(await listLines(pool, QueueQuery.parse(req.query)));
  });

  router.get('/lines/:id', async (req, res) => {
    res.json({ line: await getLine(pool, uuidOrNil(req.params.id)) });
  });

  router.post('/lines/:id/confirm', requireWriter, async (req, res) => {
    res.json({ line: await confirmLine(req.db, uuidOrNil(req.params.id), req.user!.id, ConfirmBody.parse(req.body)) });
  });

  router.post('/lines/:id/suggestions/:sid/reject', requireWriter, async (req, res) => {
    res.json({ line: await rejectSuggestion(req.db, uuidOrNil(req.params.id), uuidOrNil(req.params.sid), req.user!.id) });
  });

  router.post('/lines/:id/exclude', requireWriter, async (req, res) => {
    res.json({ line: await excludeLine(req.db, uuidOrNil(req.params.id), ExcludeBody.parse(req.body).reason) });
  });

  router.post('/lines/:id/include', requireWriter, async (req, res) => {
    res.json({ line: await includeLine(req.db, uuidOrNil(req.params.id), threshold) });
  });

  return router;
}

