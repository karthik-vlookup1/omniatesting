/**
 * Council / DWP remittance import: one bank line plus a CSV listing who the money is for. The file is
 * previewed as a dry run (nothing is written) and then committed atomically: any rejected row, a total
 * that differs from the bank line, or a line that already has receipts refuses the commit.
 *
 * Rows are matched by TID, or by claim reference against the benefit award effective on the remittance
 * date. Committing creates one receipt per row (method 'remittance_line'). Re-committing the same file
 * for the same line changes nothing and answers alreadyImported.
 */
import { createHash } from 'node:crypto';
import type { ActorDb } from '../../db/context.js';
import type { Pool, PoolClient } from '../../db/pool.js';
import { parseRemittanceCsv, type ParsedRemittanceRow } from '../../domain/remittance/parse.js';
import { AppError } from '../../lib/errors.js';
import { PAYERS, isCalendarDate, money, mapRuleError, type Payer } from '../receipt/receipt.service.js';

export const REMITTANCE_PAYERS: Payer[] = ['council_hb', 'dwp_uc', 'other_third_party'];

export interface RemittanceInput {
  bankTransactionId: string;
  payer?: Payer;
  payingBody: string;
  remittanceRef?: string;
  remittanceDate: string;
  fileName: string;
  content: Buffer;
  dryRun: boolean;
  /** Commit only: the sha256 the preview returned. */
  previewSha256?: string;
}

export interface RemittanceReport {
  fileName: string;
  fileSha256: string;
  dryRun: boolean;
  counts: { rows: number; matched: number; rejected: number };
  totalPence: number;
  linePence: number;
  totalMismatch: boolean;
  rows: { line: number; tid: string | null; claimRef: string | null; amountPence: number; tenancyTid: string }[];
  errors: { line: number; key: string; field: string; reason: string }[];
}

export type RemittanceResult =
  | { alreadyImported: true; remittanceId: string; report: null }
  | { alreadyImported: false; remittanceId: string | null; report: RemittanceReport };

class DryRunRollback extends Error {
  constructor(readonly report: RemittanceReport) {
    super('dry run');
  }
}

interface Resolved {
  row: ParsedRemittanceRow;
  tenancyId: string;
  tenancyTid: string;
}

async function resolveRows(
  c: PoolClient,
  parsed: ParsedRemittanceRow[],
  remittanceDate: string,
): Promise<{ resolved: Resolved[]; errors: RemittanceReport['errors'] }> {
  const tids = [...new Set(parsed.flatMap((p) => (p.data.tid ? [p.data.tid] : [])))];
  const claims = [...new Set(parsed.flatMap((p) => (p.data.claimRef ? [p.data.claimRef] : [])))];
  const { rows: tenancies } = await c.query<{ id: string; tid: string }>('SELECT id, tid FROM tenancies WHERE tid = ANY($1::text[])', [tids]);
  const byTid = new Map(tenancies.map((t) => [t.tid, t.id]));
  const { rows: awards } = await c.query<{ ref: string; tenancy_id: string; tid: string }>(
    `SELECT DISTINCT upper(trim(b.claim_reference)) AS ref, b.tenancy_id, t.tid
       FROM benefit_awards b JOIN tenancies t ON t.id = b.tenancy_id
      WHERE upper(trim(b.claim_reference)) = ANY($1::text[])
        AND b.effective_from <= $2::date AND (b.effective_to IS NULL OR b.effective_to >= $2::date)`,
    [claims, remittanceDate],
  );
  const byClaim = new Map<string, { id: string; tid: string }[]>();
  for (const a of awards) byClaim.set(a.ref, [...(byClaim.get(a.ref) ?? []), { id: a.tenancy_id, tid: a.tid }]);

  const resolved: Resolved[] = [];
  const errors: RemittanceReport['errors'] = [];
  for (const row of parsed) {
    const key = row.data.tid ?? row.data.claimRef ?? '';
    for (const e of row.errors) errors.push({ line: row.line, key, field: e.field, reason: e.reason });
    if (row.errors.length > 0) continue;
    const reject = (field: string, reason: string) => errors.push({ line: row.line, key, field, reason });

    const claimHits = row.data.claimRef ? (byClaim.get(row.data.claimRef) ?? []) : [];
    if (row.data.tid) {
      const id = byTid.get(row.data.tid);
      if (!id) {
        reject('TID', 'Unknown TID');
        continue;
      }
      if (claimHits.length > 0 && !claimHits.some((h) => h.id === id)) {
        reject('Claim Ref', 'TID and claim ref point to different tenancies');
        continue;
      }
      resolved.push({ row, tenancyId: id, tenancyTid: row.data.tid });
    } else {
      if (claimHits.length === 0) {
        reject('Claim Ref', 'No tenancy for claim ref');
        continue;
      }
      if (claimHits.length > 1) {
        reject('Claim Ref', 'Claim ref matches several tenancies');
        continue;
      }
      resolved.push({ row, tenancyId: claimHits[0]!.id, tenancyTid: claimHits[0]!.tid });
    }
  }
  return { resolved, errors };
}

interface SeenFile {
  batchId: string;
  /** Advices from this file that are still in force (not superseded by a full reversal). */
  active: { adviceId: string; lineId: string | null }[];
}

async function seenFile(c: PoolClient, sha: string): Promise<SeenFile | null> {
  const { rows } = await c.query<{ batch_id: string; advice_id: string | null; line_id: string | null }>(
    `SELECT b.id AS batch_id, ra.id AS advice_id, ra.bank_transaction_id AS line_id
       FROM import_batches b
       LEFT JOIN remittance_advices ra ON ra.import_batch_id = b.id AND ra.superseded_at IS NULL
      WHERE b.file_sha256 = $1`,
    [sha],
  );
  if (!rows[0]) return null;
  return {
    batchId: rows[0].batch_id,
    active: rows.flatMap((r) => (r.advice_id ? [{ adviceId: r.advice_id, lineId: r.line_id }] : [])),
  };
}

export async function runRemittance(db: ActorDb, userId: string, input: RemittanceInput): Promise<RemittanceResult> {
  const { bankTransactionId, dryRun, fileName, content } = input;
  const payer: Payer = input.payer ?? 'council_hb';
  if (!PAYERS.includes(payer) || !REMITTANCE_PAYERS.includes(payer)) throw new AppError('bad_request', 'Payer must be council_hb, dwp_uc or other_third_party');
  const payingBody = input.payingBody.trim();
  if (payingBody.length < 1 || payingBody.length > 100) throw new AppError('bad_request', 'Paying body is 1 to 100 characters');
  const remittanceRef = input.remittanceRef?.trim() || null;
  if (remittanceRef && remittanceRef.length > 100) throw new AppError('bad_request', 'Remittance reference is at most 100 characters');
  if (!isCalendarDate(input.remittanceDate)) {
    throw new AppError('bad_request', 'The remittance date must be a date (YYYY-MM-DD)');
  }
  const sha = createHash('sha256').update(content).digest('hex');
  if (!dryRun && input.previewSha256 !== sha) {
    throw new AppError('conflict', 'The file changed since the preview; preview it again');
  }
  const parsed = parseRemittanceCsv(content);

  try {
    return await db.tx(async (c): Promise<RemittanceResult> => {
      await c.query("SELECT pg_advisory_xact_lock(hashtext('remittance:' || $1::text))", [bankTransactionId]);
      const { rows: lines } = await c.query<{ status: string; amount_pence: string; bank_account_id: string }>(
        'SELECT status::text AS status, (amount * 100)::bigint AS amount_pence, bank_account_id FROM bank_transactions WHERE id = $1 FOR UPDATE',
        [bankTransactionId],
      );
      const line = lines[0];
      if (!line) throw new AppError('not_found', 'No such bank line');
      if (line.status === 'excluded') throw new AppError('conflict', 'This line is excluded; include it again first');
      const linePence = Number(line.amount_pence);
      if (linePence <= 0) throw new AppError('conflict', 'Money going out cannot be matched to rent');

      const existing = await seenFile(c, sha);
      if (existing && !dryRun) {
        const here = existing.active.find((a) => a.lineId === bankTransactionId);
        if (here) return { alreadyImported: true, remittanceId: here.adviceId, report: null };
        if (existing.active.length > 0) throw new AppError('conflict', 'This file was already imported for another bank line');
      }
      const { rows: active } = await c.query<{ n: number }>(
        "SELECT count(*)::int AS n FROM receipts WHERE bank_transaction_id = $1 AND status = 'active'",
        [bankTransactionId],
      );
      if (active[0]!.n > 0) throw new AppError('conflict', 'This line already has receipts; reverse them first');

      const { resolved, errors } = await resolveRows(c, parsed, input.remittanceDate);
      const totalPence = resolved.reduce((s, r) => s + r.row.data.amountPence, 0);
      const report: RemittanceReport = {
        fileName,
        fileSha256: sha,
        dryRun,
        counts: { rows: parsed.length, matched: resolved.length, rejected: parsed.length - resolved.length },
        totalPence,
        linePence,
        totalMismatch: totalPence !== linePence,
        rows: resolved.map((r) => ({
          line: r.row.line,
          tid: r.row.data.tid,
          claimRef: r.row.data.claimRef,
          amountPence: r.row.data.amountPence,
          tenancyTid: r.tenancyTid,
        })),
        errors,
      };
      if (dryRun) throw new DryRunRollback(report);
      if (report.counts.rejected > 0) {
        throw new AppError('conflict', `${report.counts.rejected} rows were rejected; nothing was imported. Fix them and preview again`);
      }
      if (report.totalMismatch) {
        throw new AppError('conflict', `Remittance total ${money(totalPence)} does not equal the bank line ${money(linePence)}`);
      }

      const { rows: dupAdvice } = await c.query('SELECT 1 FROM remittance_advices WHERE bank_transaction_id = $1 AND superseded_at IS NULL', [bankTransactionId]);
      if (dupAdvice.length > 0) throw new AppError('conflict', 'This bank line already has a remittance imported');

      // The same file again after a full reversal reuses its batch (file_sha256 is unique).
      let batchId: string | undefined = existing?.batchId;
      if (!batchId) {
        await c.query('SAVEPOINT remit_batch');
        try {
          const { rows } = await c.query<{ id: string }>(
            `INSERT INTO import_batches (source, bank_account_id, file_name, file_sha256, rows_total, rows_inserted, rows_duplicate, status, uploaded_by)
             VALUES ('remittance', $1, $2, $3, $4, $4, 0, 'parsed', $5) RETURNING id`,
            [line.bank_account_id, fileName, sha, parsed.length, userId],
          );
          batchId = rows[0]!.id;
        } catch (err) {
          await c.query('ROLLBACK TO SAVEPOINT remit_batch');
          if ((err as { code?: string }).code === '23505') {
            const again = await seenFile(c, sha);
            const here = again?.active.find((a) => a.lineId === bankTransactionId);
            if (here) return { alreadyImported: true, remittanceId: here.adviceId, report: null };
            throw new AppError('conflict', 'This file was already imported for another bank line');
          }
          throw err;
        }
      }

      const { rows: adv } = await c.query<{ id: string }>(
        `INSERT INTO remittance_advices (import_batch_id, bank_transaction_id, paying_body, remittance_ref, remittance_date, total_amount)
         VALUES ($1, $2, $3, $4, $5::date, ($6::bigint)::numeric / 100) RETURNING id`,
        [batchId, bankTransactionId, payingBody, remittanceRef, input.remittanceDate, totalPence],
      );
      const remittanceId = adv[0]!.id;
      for (const r of resolved) {
        const d = r.row.data;
        const { rows: rl } = await c.query<{ id: string }>(
          `INSERT INTO remittance_lines (remittance_id, claim_reference, tenant_name, period_from, period_to, amount, matched_tenancy_id, raw_row)
           VALUES ($1, $2, $3, $4::date, $5::date, ($6::bigint)::numeric / 100, $7, $8::jsonb) RETURNING id`,
          [remittanceId, d.claimRef, d.tenantName, d.periodFrom, d.periodTo, d.amountPence, r.tenancyId, JSON.stringify({ line: r.row.line, ...d })],
        );
        try {
          const { rows: rc } = await c.query<{ id: string }>(
            "SELECT confirm_match($1, $2, $3::payer_type, 'remittance_line', false, $4, ($5::bigint)::numeric / 100) AS id",
            [bankTransactionId, r.tenancyId, payer, userId, d.amountPence],
          );
          await c.query('UPDATE receipts SET remittance_line_id = $2 WHERE id = $1', [rc[0]!.id, rl[0]!.id]);
        } catch (err) {
          mapRuleError(err);
        }
      }
      return { alreadyImported: false, remittanceId, report };
    });
  } catch (err) {
    if (err instanceof DryRunRollback) return { alreadyImported: false, remittanceId: null, report: err.report };
    throw err;
  }
}

export async function getRemittance(pool: Pool | PoolClient, id: string) {
  const { rows } = await pool.query<{
    id: string;
    bank_transaction_id: string | null;
    paying_body: string;
    remittance_ref: string | null;
    remittance_date: string;
    total_pence: string;
  }>(
    `SELECT id, bank_transaction_id, paying_body, remittance_ref, to_char(remittance_date, 'YYYY-MM-DD') AS remittance_date,
            (total_amount * 100)::bigint AS total_pence
       FROM remittance_advices WHERE id = $1`,
    [id],
  );
  const a = rows[0];
  if (!a) throw new AppError('not_found', 'No such remittance');
  const { rows: lines } = await pool.query<{
    id: string;
    claim_reference: string | null;
    tenant_name: string | null;
    period_from: string | null;
    period_to: string | null;
    amount_pence: string;
    tid: string | null;
  }>(
    `SELECT l.id, l.claim_reference, l.tenant_name, to_char(l.period_from, 'YYYY-MM-DD') AS period_from,
            to_char(l.period_to, 'YYYY-MM-DD') AS period_to, (l.amount * 100)::bigint AS amount_pence, t.tid
       FROM remittance_lines l LEFT JOIN tenancies t ON t.id = l.matched_tenancy_id
      WHERE l.remittance_id = $1 ORDER BY l.period_from NULLS LAST, t.tid, l.id`,
    [id],
  );
  return {
    id: a.id,
    bankTransactionId: a.bank_transaction_id,
    payingBody: a.paying_body,
    remittanceRef: a.remittance_ref,
    remittanceDate: a.remittance_date,
    totalPence: Number(a.total_pence),
    lines: lines.map((l) => ({
      id: l.id,
      claimReference: l.claim_reference,
      tenantName: l.tenant_name,
      periodFrom: l.period_from,
      periodTo: l.period_to,
      amountPence: Number(l.amount_pence),
      tid: l.tid,
    })),
  };
}
