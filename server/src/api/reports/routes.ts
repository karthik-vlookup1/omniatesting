/**
 * /api/reports
 *   GET /dashboard              any signed-in user (aggregates only)
 *   GET /statement/:tid         tenant rent statement as JSON (staff, accounts, admin; not logged)
 *   GET /statement/:tid/csv     the same as a CSV download (logged in report_downloads)
 *   GET /statement/:tid/pdf     the same as a PDF download (logged in report_downloads)
 */
import { Router, type Response } from 'express';
import { z } from 'zod';
import type { Pool } from '../../db/pool.js';
import { getDashboard } from '../../services/reports/dashboard.service.js';
import { ISO_DATE } from '../../services/reports/dates.js';
import { buildTenantStatementCsv, statementFileName } from '../../services/reports/statement-csv.js';
import { buildTenantStatementPdf } from '../../services/reports/statement-pdf.js';
import { getTenantStatement, lineCount, logDownload, StatementQuery } from '../../services/reports/statement.service.js';
import { requireAuth, requireWriter } from '../auth/middleware.js';

const DashboardQuery = z.object({ date: ISO_DATE.optional() });

function sendFile(res: Response, type: string, fileName: string, rows: number, body: string | Buffer): void {
  res.setHeader('Content-Type', type);
  res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`);
  res.setHeader('X-Statement-Rows', String(rows));
  res.setHeader('Access-Control-Expose-Headers', 'Content-Disposition, X-Statement-Rows');
  res.send(body);
}

export function reportsRouter({ pool }: { pool: Pool }): Router {
  const router = Router();
  router.use(requireAuth);

  router.get('/dashboard', async (req, res) => {
    res.json(await getDashboard(pool, DashboardQuery.parse(req.query).date));
  });

  router.get('/statement/:tid', requireWriter, async (req, res) => {
    res.json(await getTenantStatement(pool, String(req.params.tid), StatementQuery.parse(req.query)));
  });

  router.get('/statement/:tid/csv', requireWriter, async (req, res) => {
    const s = await getTenantStatement(req.db, String(req.params.tid), StatementQuery.parse(req.query));
    const file = buildTenantStatementCsv(s);
    await logDownload(req.db, s, 'csv', file.rows);
    sendFile(res, 'text/csv; charset=utf-8', statementFileName(s, 'csv'), file.rows, file.csv);
  });

  router.get('/statement/:tid/pdf', requireWriter, async (req, res) => {
    const s = await getTenantStatement(req.db, String(req.params.tid), StatementQuery.parse(req.query));
    const rows = lineCount(s);
    const pdf = await buildTenantStatementPdf(s);
    await logDownload(req.db, s, 'pdf', rows);
    sendFile(res, 'application/pdf', statementFileName(s, 'pdf'), rows, pdf);
  });

  return router;
}
