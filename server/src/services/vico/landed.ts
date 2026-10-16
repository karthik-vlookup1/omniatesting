/**
 * Read-only VECO "landed" check for a Vico export: do the export's receipts show up as SLP rows in the
 * nightly VECO snapshot? Only SELECTs are sent to VECO; the result is saved in vico_landed_checks.
 */
import type { Pool } from '../../db/pool.js';
import type { ActorDb } from '../../db/context.js';
import { AppError } from '../../lib/errors.js';
import type { SqlSource } from '../../jobs/veco-sync/mcp-client.js';
import { listExports, sumPounds, type VicoExport } from './vico.service.js';

export interface LandedReceipt {
  tid: string;
  receivedOn: string;
  amount: string;
  bankCode: string | null;
}

export interface VecoSlpRow {
  tid: string;
  date: string;
  amount: string;
}

export interface BankLanded {
  bankCode: string | null;
  rows: number;
  landed: number;
  totalAmount: string;
  landedAmount: string;
}

export interface LandedCheck {
  checkedAt: string;
  /** 'YYYY-MM-DD HH:MM' in UK local time (as VECO reports it), not UTC. */
  snapshotRefreshedAt: string | null;
  rows: number;
  landed: number;
  totalAmount: string;
  landedAmount: string;
  banks: BankLanded[];
}

export type VicoExportWithLanded = VicoExport & { landedCheck: LandedCheck | null };

// The MCP takes raw SQL, so only these shapes may ever be interpolated into a query.
const TID = /^T\d{3,6}$/;
const ISO = /^\d{4}-\d{2}-\d{2}$/;
const REFRESHED = /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}$/;
const normTid = (t: string): string => t.trim().toUpperCase();
const isQueryable = (r: LandedReceipt): boolean => TID.test(normTid(r.tid)) && ISO.test(r.receivedOn);

export const TID_CHUNK = 500;

export function buildSlpQueries(receipts: LandedReceipt[]): string[] {
  const ok = receipts.filter(isQueryable);
  if (ok.length === 0) return [];
  const tids = [...new Set(ok.map((r) => normTid(r.tid)))].sort();
  const dates = ok.map((r) => r.receivedOn).sort();
  const minDate = dates[0]!;
  const maxDate = dates[dates.length - 1]!;
  const [y, m, d] = maxDate.split('-').map(Number) as [number, number, number];
  const maxNext = new Date(Date.UTC(y, m - 1, d + 1)).toISOString().slice(0, 10);
  const out: string[] = [];
  for (let i = 0; i < tids.length; i += TID_CHUNK) {
    const list = tids
      .slice(i, i + TID_CHUNK)
      .map((t) => `'${t}'`)
      .join(',');
    out.push(
      `SELECT TenancyRef AS tid, CONVERT(varchar(10), TxDate, 23) AS txDate, GrossAmount AS amount FROM snap_TenancyTransactions_24M WHERE TxType = 'SLP' AND TenancyRef IN (${list}) AND TxDate >= '${minDate}' AND TxDate < '${maxNext}'`,
    );
  }
  return out;
}

/** Style 120 gives 'YYYY-MM-DD HH:MM' in UK local time; it is deliberately not converted to UTC. */
export const SNAPSHOT_SQL =
  'SELECT CONVERT(varchar(16), MAX(last_refreshed), 120) AS refreshedAt FROM snap_TenancyTransactions_24M';

export function toVecoRow(raw: Record<string, unknown>): VecoSlpRow | null {
  const tid = normTid(String(raw.tid ?? ''));
  const date = String(raw.txDate ?? '');
  const amount = typeof raw.amount === 'number' ? raw.amount.toFixed(2) : String(raw.amount ?? '0');
  if (!ISO.test(date) || !/^-?\d+(\.\d+)?$/.test(amount)) return null;
  return { tid, date, amount: sumPounds([amount]) };
}

export function parseRefreshed(v: unknown): string | null {
  return typeof v === 'string' && REFRESHED.test(v) ? v : null;
}

const byCode = (a: string | null, b: string | null): number =>
  a === b ? 0 : a === null ? 1 : b === null ? -1 : a < b ? -1 : 1;

// Each export is checked independently, so one VECO row can satisfy receipts in two different exports'
// checks (a known limitation).
export function matchLanded(
  receipts: LandedReceipt[],
  vecoRows: VecoSlpRow[],
  checkedAt: string,
  snapshotRefreshedAt: string | null,
): LandedCheck {
  const counts = new Map<string, number>();
  for (const v of vecoRows) {
    const k = `${normTid(v.tid)}|${v.date}|${sumPounds([v.amount])}`;
    counts.set(k, (counts.get(k) ?? 0) + 1);
  }
  const flags = receipts.map((r) => {
    if (!isQueryable(r)) return false;
    const k = `${normTid(r.tid)}|${r.receivedOn}|${sumPounds([r.amount])}`;
    const n = counts.get(k) ?? 0;
    if (n <= 0) return false;
    counts.set(k, n - 1);
    return true;
  });
  const groups = new Map<string | null, { amounts: string[]; landedAmounts: string[]; landed: number }>();
  receipts.forEach((r, i) => {
    const g = groups.get(r.bankCode) ?? { amounts: [], landedAmounts: [], landed: 0 };
    g.amounts.push(r.amount);
    if (flags[i]) {
      g.landedAmounts.push(r.amount);
      g.landed += 1;
    }
    groups.set(r.bankCode, g);
  });
  const banks: BankLanded[] = [...groups.entries()]
    .sort(([a], [b]) => byCode(a, b))
    .map(([bankCode, g]) => ({
      bankCode,
      rows: g.amounts.length,
      landed: g.landed,
      totalAmount: sumPounds(g.amounts),
      landedAmount: sumPounds(g.landedAmounts),
    }));
  return {
    checkedAt,
    snapshotRefreshedAt,
    rows: receipts.length,
    landed: flags.filter(Boolean).length,
    totalAmount: sumPounds(receipts.map((r) => r.amount)),
    landedAmount: sumPounds(receipts.filter((_, i) => flags[i]).map((r) => r.amount)),
    banks,
  };
}

export async function runLandedCheck(db: ActorDb, pool: Pool, source: SqlSource, exportId: string): Promise<LandedCheck> {
  const { rows: receipts } = await pool.query<LandedReceipt>(
    `SELECT t.tid, r.amount::text AS amount, to_char(r.received_on,'YYYY-MM-DD') AS "receivedOn", b.code AS "bankCode"
       FROM external_refs e
       JOIN receipts r ON r.id = e.entity_id
       JOIN tenancies t ON t.id = r.tenancy_id
       LEFT JOIN bank_transactions bt ON bt.id = r.bank_transaction_id
       LEFT JOIN bank_accounts b ON b.id = bt.bank_account_id
      WHERE e.system='vico' AND e.entity_type='receipt' AND e.external_key2=$1
      ORDER BY r.received_on, t.tid, r.id`,
    [exportId],
  );
  if (receipts.length === 0) throw new AppError('not_found', 'No such Vico export');

  const vecoRows: VecoSlpRow[] = [];
  for (const sql of buildSlpQueries(receipts)) {
    for (const raw of await source.queryRows(sql)) {
      const row = toVecoRow(raw);
      if (row) vecoRows.push(row);
    }
  }
  const snap = await source.queryRows(SNAPSHOT_SQL);
  const check = matchLanded(receipts, vecoRows, new Date().toISOString(), parseRefreshed(snap[0]?.refreshedAt));

  await db.tx(async (c) => {
    await c.query(
      `INSERT INTO vico_landed_checks
         (export_id, checked_at, snapshot_refreshed_at, rows, landed, total_amount, landed_amount, banks)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8::jsonb)
       ON CONFLICT (export_id) DO UPDATE SET
         checked_at = EXCLUDED.checked_at, snapshot_refreshed_at = EXCLUDED.snapshot_refreshed_at,
         rows = EXCLUDED.rows, landed = EXCLUDED.landed, total_amount = EXCLUDED.total_amount,
         landed_amount = EXCLUDED.landed_amount, banks = EXCLUDED.banks`,
      [
        exportId,
        check.checkedAt,
        check.snapshotRefreshedAt,
        check.rows,
        check.landed,
        check.totalAmount,
        check.landedAmount,
        JSON.stringify(check.banks),
      ],
    );
  });
  return check;
}

export async function listExportsWithLanded(pool: Pool): Promise<VicoExportWithLanded[]> {
  const exports = await listExports(pool);
  const { rows } = await pool.query<{
    export_id: string;
    checked_at: Date;
    snapshot_refreshed_at: string | null;
    rows: number;
    landed: number;
    total_amount: string;
    landed_amount: string;
    banks: BankLanded[];
  }>(
    `SELECT export_id, checked_at, snapshot_refreshed_at, rows, landed, total_amount::text AS total_amount,
            landed_amount::text AS landed_amount, banks
       FROM vico_landed_checks WHERE export_id = ANY($1::text[])`,
    [exports.map((e) => e.exportId)],
  );
  const byId = new Map(rows.map((r) => [r.export_id, r]));
  return exports.map((e) => {
    const r = byId.get(e.exportId);
    return {
      ...e,
      landedCheck: r
        ? {
            checkedAt: r.checked_at.toISOString(),
            snapshotRefreshedAt: r.snapshot_refreshed_at ?? null,
            rows: r.rows,
            landed: r.landed,
            totalAmount: sumPounds([r.total_amount]),
            landedAmount: sumPounds([r.landed_amount]),
            banks: r.banks,
          }
        : null,
    };
  });
}
