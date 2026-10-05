/**
 * /api/export (admin, accounts, staff; read-only users get 403)
 *   GET /statement/summary   bank-line and row counts for the filter, per outcome
 *   GET /statement.csv       the filled-in bank statement as a CSV download (audited in statement_exports)
 */
import { Router } from 'express';
import type { Pool } from '../../db/pool.js';
import { buildStatement, countStatement, StatementFilter } from '../../services/export/statement.service.js';
import { requireAuth, requireWriter } from '../auth/middleware.js';

export function statementExportRouter({ pool }: { pool: Pool }): Router {
  const router = Router();
  router.use(requireAuth, requireWriter);

  router.get('/statement/summary', async (req, res) => {
    res.json(await countStatement(pool, StatementFilter.parse(req.query)));
  });

  router.get('/statement.csv', async (req, res) => {
    const file = await buildStatement(req.db, StatementFilter.parse(req.query));
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${file.fileName}"`);
    res.setHeader('X-Statement-Rows', String(file.rows));
    res.setHeader('Access-Control-Expose-Headers', 'Content-Disposition, X-Statement-Rows');
    res.send(file.csv);
  });

  return router;
}
