/**
 * LetMC import: landlords, properties, tenants, tenancies (+ opening balances) from one CSV at a time,
 * previewed as a dry run and then committed atomically (any rejected row = nothing is imported).
 *
 * Precedence between Veco and LetMC (fixed):
 *  - Veco owns active tenancies, their property/unit/start/status/lead tenant/rent, and a property's
 *    branch, address line 1, postcode and management type.
 *  - The LetMC import NEVER overwrites a non-empty Recon value. On an existing record it only fills
 *    empty fields (action 'update', `changes` = the filled fields); a differing non-empty value is
 *    kept and reported as a warning.
 *  - An unknown TID with no End Date (or one on or after today) is REJECTED ("Active tenancy not in
 *    Recon; Veco owns active tenancies - run the Veco sync first"), so an import never creates an
 *    active tenancy that the nightly sync would end (or that would trip its 20% guard). An unknown
 *    TID with a past End Date is created with status 'ended'.
 *  - Assumption: LetMC "Property Ref" = the Veco property_ref (base portfolio ref). LetMC tenants are
 *    keyed 'letmc:<ref>' (own namespace) and linked to an existing tenant when the NI hash matches.
 *
 * Re-committing a file changes nothing. Opening arrears become rent_charges (source
 * 'opening_balance'); opening credits become negative adjustments (kind 'opening_balance').
 */
import { createHash } from 'node:crypto';
import type { ActorDb } from '../../db/context.js';
import type { Pool } from '../../db/pool.js';
import { AppError } from '../../lib/errors.js';
import type { ProtectionKeys } from '../../lib/crypto.js';
import { APPLIERS, type ApplyCtx, type RowAction, type RowResult } from './apply.js';
import { ENTITY_TYPES, type EntityType } from './layout.js';
import { parseLetmcCsv } from './parse.js';

export { ENTITY_TYPES, LAYOUTS, type EntityType, type FieldSpec } from './layout.js';

export interface ReportCounts {
  rows: number;
  create: number;
  update: number;
  unchanged: number;
  duplicate: number;
  rejected: number;
}

export interface ReportRow {
  line: number;
  key: string;
  action: Exclude<RowAction, 'reject'>;
  changes: string[];
  warnings: string[];
}

export interface ReportError {
  line: number;
  key: string;
  field: string;
  reason: string;
}

export interface LetmcReport {
  entityType: EntityType;
  fileName: string;
  fileSha256: string;
  cutoverDate: string | null;
  dryRun: boolean;
  counts: ReportCounts;
  rows: ReportRow[];
  errors: ReportError[];
  openingBalances: {
    charges: { count: number; totalPence: number };
    credits: { count: number; totalPence: number };
  };
}

export interface RunInput {
  entityType: EntityType;
  fileName: string;
  content: Buffer;
  cutoverDate?: string | null;
  dryRun: boolean;
  userId: string;
  /** Commit only: the sha256 the preview returned. */
  previewSha256?: string;
}

export interface LetmcRunRow {
  id: string;
  entityType: EntityType;
  fileName: string;
  fileSha256: string;
  cutoverDate: string | null;
  counts: ReportCounts;
  createdAt: string;
}

class DryRunRollback extends Error {
  constructor(readonly report: LetmcReport) {
    super('dry run');
  }
}

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

export function buildReport(
  input: { entityType: EntityType; fileName: string; fileSha256: string; cutoverDate: string | null; dryRun: boolean },
  results: RowResult[],
): LetmcReport {
  const counts: ReportCounts = { rows: results.length, create: 0, update: 0, unchanged: 0, duplicate: 0, rejected: 0 };
  const rows: ReportRow[] = [];
  const errors: ReportError[] = [];
  const opening = { charges: { count: 0, totalPence: 0 }, credits: { count: 0, totalPence: 0 } };
  for (const r of results) {
    if (r.action === 'reject') {
      counts.rejected += 1;
      for (const e of r.errors) errors.push({ line: r.line, key: r.key, field: e.field, reason: e.reason });
      continue;
    }
    counts[r.action] += 1;
    rows.push({ line: r.line, key: r.key, action: r.action, changes: r.changes, warnings: r.warnings });
    if (r.opening) {
      const bucket = r.opening.pence > 0 ? opening.charges : opening.credits;
      bucket.count += 1;
      bucket.totalPence += r.opening.pence;
    }
  }
  return { ...input, counts, rows, errors, openingBalances: opening };
}

export async function runLetmcImport(
  db: ActorDb,
  keys: ProtectionKeys,
  input: RunInput,
): Promise<{ runId: string | null; report: LetmcReport }> {
  const { entityType, fileName, content, dryRun, userId } = input;
  if (!ENTITY_TYPES.includes(entityType)) throw new AppError('bad_request', 'Unknown record type');
  const sha = createHash('sha256').update(content).digest('hex');
  if (!dryRun && input.previewSha256 !== sha) {
    throw new AppError('conflict', 'The file changed since the preview; preview it again');
  }

  const { rows: dateRows } = await db.query<{ today: string }>("SELECT to_char(current_date, 'YYYY-MM-DD') AS today");
  const today = dateRows[0]!.today;

  let cutover: string | null = null;
  if (entityType === 'tenancies') {
    cutover = input.cutoverDate ?? null;
    if (!cutover) throw new AppError('bad_request', 'Choose a cutover date for the tenancies import');
    if (!ISO_DATE.test(cutover) || Number.isNaN(Date.parse(cutover))) {
      throw new AppError('bad_request', 'The cutover date must be a date (YYYY-MM-DD)');
    }
    if (cutover > today) throw new AppError('bad_request', 'The cutover date cannot be in the future');
    if (cutover < '2000-01-01') throw new AppError('bad_request', 'The cutover date must be on or after 2000-01-01');
  }

  const parsed = parseLetmcCsv(content, entityType);

  try {
    return await db.tx(async (client) => {
      await client.query("SELECT pg_advisory_xact_lock(hashtext('letmc-import'))");
      if (cutover) {
        const { rows: earlier } = await client.query<{ d: string }>(
          `SELECT to_char(cutover_date, 'YYYY-MM-DD') AS d FROM letmc_import_runs
            WHERE entity_type = 'tenancies' ORDER BY created_at LIMIT 1`,
        );
        if (earlier[0] && earlier[0].d !== cutover) {
          throw new AppError('bad_request', `Cutover date already set to ${earlier[0].d}`);
        }
      }
      const { rows: run } = await client.query<{ id: string }>(
        `INSERT INTO letmc_import_runs (entity_type, file_name, file_sha256, cutover_date, counts, created_by)
         VALUES ($1, $2, $3, $4, '{}'::jsonb, $5) RETURNING id`,
        [entityType, fileName, sha, cutover, userId],
      );
      const runId = run[0]!.id;
      const ctx: ApplyCtx = { keys, userId, runId, cutover, today };
      const apply = APPLIERS[entityType] as (c: typeof client, rows: typeof parsed, x: ApplyCtx) => Promise<RowResult[]>;
      const results = await apply(client, parsed, ctx);
      const report = buildReport({ entityType, fileName, fileSha256: sha, cutoverDate: cutover, dryRun }, results);
      if (dryRun) throw new DryRunRollback(report);
      if (report.counts.rejected > 0) {
        throw new AppError(
          'conflict',
          `${report.counts.rejected} rows were rejected; nothing was imported. Fix them and preview again`,
        );
      }
      await client.query('UPDATE letmc_import_runs SET counts = $2::jsonb WHERE id = $1', [runId, JSON.stringify(report.counts)]);
      return { runId, report };
    });
  } catch (err) {
    if (err instanceof DryRunRollback) return { runId: null, report: err.report };
    throw err;
  }
}

export async function listRuns(pool: Pool): Promise<LetmcRunRow[]> {
  const { rows } = await pool.query<{
    id: string;
    entity_type: EntityType;
    file_name: string;
    file_sha256: string;
    cutover: string | null;
    counts: ReportCounts;
    created_at: Date;
  }>(
    `SELECT id, entity_type, file_name, file_sha256, to_char(cutover_date, 'YYYY-MM-DD') AS cutover, counts, created_at
       FROM letmc_import_runs ORDER BY created_at DESC LIMIT 50`,
  );
  return rows.map((r) => ({
    id: r.id,
    entityType: r.entity_type,
    fileName: r.file_name,
    fileSha256: r.file_sha256,
    cutoverDate: r.cutover,
    counts: r.counts,
    createdAt: r.created_at.toISOString(),
  }));
}
