/**
 * agentOS formatted bank record intake: whole-file validation, SHA-256 dedupe, batch + line insert.
 * Lines are matched to an agentOS tenant in the same transaction (recon-503).
 */
import { createHash } from 'node:crypto';
import type { ActorDb } from '../../db/context.js';
import type { Pool } from '../../db/pool.js';
import { AppError } from '../../lib/errors.js';
import { londonToday, parseIntakeCsv } from '../../domain/agentos/intake.js';
import type { MatchCounts } from '../../domain/agentos/match.js';
import { matchIntakeBatch } from './match.service.js';

export interface IntakeImportResult {
  batchId: string;
  fileName: string;
  rowsTotal: number;
  amountTotalPence: number;
  periodFrom: string;
  periodTo: string;
  linesWithWarnings: number;
  matchCounts: MatchCounts;
  unresolvedRefs: number;
}

export interface IntakeBatchDto {
  id: string;
  fileName: string;
  rowsTotal: number;
  amountTotalPence: number;
  periodFrom: string;
  periodTo: string;
  uploadedAt: string;
  uploadedBy: string | null;
}

export interface IntakeLineDto {
  id: string;
  lineNo: number;
  receivedOn: string;
  tid: string | null;
  payerName: string;
  amountPence: number;
  paymentType: string;
  depositTo: string;
  description: string;
  warnings: string[];
  matchStatus: string;
  agentosTenantId: string | null;
  postingStatus: string;
  payerType: string | null;
  reference: string | null;
  receivingAccount: string | null;
}

const CHUNK = 500;
/** Masked display of the stored reference: last characters only. */
export const REFERENCE_SQL = "CASE ref_kind WHEN 'ni' THEN '•••••' || ref_last WHEN 'account' THEN '****' || ref_last END";

export async function importIntakeCsv(
  db: ActorDb,
  input: { fileName: string; content: Buffer; userId: string },
  today = londonToday(),
): Promise<IntakeImportResult> {
  try {
    return await importInTx(db, input, today);
  } catch (err) {
    // Two uploads of the same file at the same moment: the second loses the UNIQUE race.
    if (
      (err as { code?: string }).code === '23505' &&
      (err as { constraint?: string }).constraint === 'agentos_intake_batches_file_sha256_key'
    ) {
      throw new AppError('conflict', 'This exact file is already being imported');
    }
    throw err;
  }
}

async function importInTx(
  db: ActorDb,
  input: { fileName: string; content: Buffer; userId: string },
  today: string,
): Promise<IntakeImportResult> {
  const sha256 = createHash('sha256').update(input.content).digest('hex');
  return db.tx(async (c) => {
    const { rows: existing } = await c.query<{ id: string; file_name: string; uploaded_on: string }>(
      `SELECT id, file_name, to_char(uploaded_at, 'YYYY-MM-DD') AS uploaded_on
         FROM agentos_intake_batches WHERE file_sha256 = $1`,
      [sha256],
    );
    if (existing[0]) {
      throw new AppError(
        'conflict',
        `This exact file was already uploaded (as "${existing[0].file_name}" on ${existing[0].uploaded_on})`,
        { batchId: existing[0].id },
      );
    }

    const parsed = parseIntakeCsv(input.content, today);
    if (!parsed.ok) {
      throw new AppError('bad_request', parsed.message, {
        reason: parsed.code,
        rowErrors: parsed.rowErrors,
        errorCount: parsed.errorCount,
      });
    }

    const lines = parsed.lines;
    const dates = lines.map((l) => l.receivedOn).sort();
    const periodFrom = dates[0]!;
    const periodTo = dates[dates.length - 1]!;
    const amountTotalPence = lines.reduce((s, l) => s + l.amountPence, 0);
    const fileName = input.fileName.slice(0, 255);

    const { rows: batch } = await c.query<{ id: string }>(
      `INSERT INTO agentos_intake_batches
         (file_name, file_sha256, rows_total, amount_total_pence, period_from, period_to, uploaded_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING id`,
      [fileName, sha256, lines.length, amountTotalPence, periodFrom, periodTo, input.userId],
    );
    const batchId = batch[0]!.id;

    for (let i = 0; i < lines.length; i += CHUNK) {
      const chunk = lines.slice(i, i + CHUNK);
      const params: unknown[] = [];
      const tuples = chunk.map((l, k) => {
        const o = k * 13;
        params.push(
          batchId, l.lineNo, l.receivedOn, l.tid, l.payerName,
          l.amountPence, l.paymentType, l.depositTo, l.description, l.warnings,
          l.ref?.kind ?? null, l.ref?.key ?? null, l.ref?.last ?? null,
        );
        const ph = Array.from({ length: 10 }, (_, j) => `$${o + j + 1}`).join(',');
        // The plaintext key is only ever a SQL parameter into secure_hash (same as core ingest).
        return `(${ph},$${o + 11}::text,secure_hash($${o + 12}::text),$${o + 13}::text)`;
      });
      await c.query(
        `INSERT INTO agentos_intake_lines
           (batch_id, line_no, received_on, tid_raw, payer_name, amount_pence, payment_type, deposit_to, description, warnings,
            ref_kind, ref_hash, ref_last)
         VALUES ${tuples.join(',')}`,
        params,
      );
    }

    const { counts: matchCounts, unresolvedRefs } = await matchIntakeBatch(c, batchId);

    return {
      batchId,
      fileName,
      rowsTotal: lines.length,
      amountTotalPence,
      periodFrom,
      periodTo,
      linesWithWarnings: lines.filter((l) => l.warnings.length > 0).length,
      matchCounts,
      unresolvedRefs,
    };
  });
}

const BATCH_SELECT = `
  SELECT b.id, b.file_name, b.rows_total, b.amount_total_pence::text AS amount_total_pence,
         to_char(b.period_from, 'YYYY-MM-DD') AS period_from,
         to_char(b.period_to, 'YYYY-MM-DD') AS period_to,
         b.uploaded_at, u.full_name AS uploaded_by
    FROM agentos_intake_batches b LEFT JOIN app_users u ON u.id = b.uploaded_by`;

interface BatchRow {
  id: string;
  file_name: string;
  rows_total: number;
  amount_total_pence: string;
  period_from: string;
  period_to: string;
  uploaded_at: Date;
  uploaded_by: string | null;
}

function toBatchDto(r: BatchRow): IntakeBatchDto {
  return {
    id: r.id,
    fileName: r.file_name,
    rowsTotal: r.rows_total,
    amountTotalPence: Number(r.amount_total_pence),
    periodFrom: r.period_from,
    periodTo: r.period_to,
    uploadedAt: r.uploaded_at.toISOString(),
    uploadedBy: r.uploaded_by,
  };
}

export async function listIntakeBatches(pool: Pool, limit = 50): Promise<IntakeBatchDto[]> {
  const { rows } = await pool.query<BatchRow>(`${BATCH_SELECT} ORDER BY b.uploaded_at DESC, b.id LIMIT $1`, [limit]);
  return rows.map(toBatchDto);
}

export async function getIntakeBatch(
  pool: Pool,
  id: string,
): Promise<{ batch: IntakeBatchDto; lines: IntakeLineDto[] } | null> {
  const { rows } = await pool.query<BatchRow>(`${BATCH_SELECT} WHERE b.id = $1`, [id]);
  if (!rows[0]) return null;
  const { rows: lines } = await pool.query<{
    id: string; line_no: number; received_on: string; tid_raw: string | null; payer_name: string;
    amount_pence: number; payment_type: string; deposit_to: string; description: string;
    warnings: string[]; match_status: string; agentos_tenant_id: string | null; posting_status: string;
    payer_type: string | null; reference: string | null; receiving_account_code: string | null;
  }>(
    `SELECT id, line_no, to_char(received_on, 'YYYY-MM-DD') AS received_on, tid_raw, payer_name, amount_pence,
            payment_type, deposit_to, description, warnings, match_status, agentos_tenant_id, posting_status,
            payer_type, ${REFERENCE_SQL} AS reference, receiving_account_code
       FROM agentos_intake_lines WHERE batch_id = $1 ORDER BY line_no`,
    [id],
  );
  return {
    batch: toBatchDto(rows[0]),
    lines: lines.map((l) => ({
      id: l.id,
      lineNo: l.line_no,
      receivedOn: l.received_on,
      tid: l.tid_raw,
      payerName: l.payer_name,
      amountPence: l.amount_pence,
      paymentType: l.payment_type,
      depositTo: l.deposit_to,
      description: l.description,
      warnings: l.warnings,
      matchStatus: l.match_status,
      agentosTenantId: l.agentos_tenant_id,
      postingStatus: l.posting_status,
      payerType: l.payer_type,
      reference: l.reference,
      receivingAccount: l.receiving_account_code,
    })),
  };
}
