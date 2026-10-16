/**
 * Vico export. The upload file has one row per confirmed receipt, in the accounts team's "G-Sheet VECO"
 * layout: Sort code, Account number (OHG's, the same on every row, kept in integration_settings), Date,
 * Amount, Standing order reference (the TID) and MG/RG (the tenancy's management type). v_vico_export lists receipts not yet
 * exported; exporting writes one external_refs row per receipt (system 'vico'), whose
 * UNIQUE (system, entity_type, entity_id) guarantees a receipt goes to Vico once. external_key2 holds the
 * export id, so an export's file can be downloaded again later.
 */
import { createHash, randomUUID } from 'node:crypto';
import { promises as fs } from 'node:fs';
import type { Pool, PoolClient } from '../../db/pool.js';
import type { ActorDb } from '../../db/context.js';
import { AppError } from '../../lib/errors.js';
import {
  NO_SHARED_DIR,
  sharedDisplayPath,
  sharedPathIfPresent,
  writeSharedFile,
  type VicoSharedDir,
} from './shared-folder.js';

export interface VicoSettings {
  sortCode: string | null;
  accountNumber: string | null;
}

export interface PendingReceipt {
  receiptId: string;
  tid: string;
  tenantName: string | null;
  amount: string;
  receivedOn: string;
  bankCode: string | null;
  managementType: string;
}

export interface VicoExport {
  exportId: string;
  fileName: string;
  createdAt: string;
  rows: number;
  totalAmount: string;
  /** Full path of the copy in the shared folder, as staff see it; null when off or absent. */
  sharedPath: string | null;
}

export interface VicoFile extends VicoExport {
  csv: string;
}

/** Lock key for pg_advisory_xact_lock: two exports at once would race for the same receipts. */
const EXPORT_LOCK = 0x7631c0;

const SORT_CODE = /^\d{2}-?\d{2}-?\d{2}$/;
const ACCOUNT_NUMBER = /^\d{8}$/;

export function normaliseSortCode(value: string): string {
  const digits = value.replace(/-/g, '');
  return `${digits.slice(0, 2)}-${digits.slice(2, 4)}-${digits.slice(4, 6)}`;
}

export async function getVicoSettings(pool: Pool | PoolClient): Promise<VicoSettings> {
  const { rows } = await pool.query<{ key: string; value: string }>(
    "SELECT key, value FROM integration_settings WHERE system = 'vico' AND key IN ('sort_code', 'account_number')",
  );
  const get = (k: string) => rows.find((r) => r.key === k)?.value ?? null;
  return { sortCode: get('sort_code'), accountNumber: get('account_number') };
}

export async function saveVicoSettings(db: ActorDb, input: { sortCode: string; accountNumber: string }): Promise<VicoSettings> {
  const sortCode = input.sortCode.trim();
  const accountNumber = input.accountNumber.trim();
  if (!SORT_CODE.test(sortCode)) throw new AppError('bad_request', 'Sort code must be six digits, e.g. 12-34-56');
  if (!ACCOUNT_NUMBER.test(accountNumber)) throw new AppError('bad_request', 'Account number must be eight digits');
  const settings = { sortCode: normaliseSortCode(sortCode), accountNumber };
  await db.tx(async (c) => {
    await c.query(
      `INSERT INTO integration_settings (system, key, value) VALUES ('vico', 'sort_code', $1), ('vico', 'account_number', $2)
       ON CONFLICT (system, key) DO UPDATE SET value = EXCLUDED.value, updated_at = now()`,
      [settings.sortCode, settings.accountNumber],
    );
  });
  return settings;
}

const PENDING_SELECT = `
SELECT v.receipt_id, v.tid, tn.full_name AS tenant_name, v.amount::text AS amount,
       to_char(v.date, 'YYYY-MM-DD') AS received_on, b.code AS bank_code, t.management_type::text AS management_type
  FROM v_vico_export v
  JOIN receipts r ON r.id = v.receipt_id
  JOIN tenancies t ON t.id = r.tenancy_id
  -- LEFT: a manual / legacy receipt may have no bank line, and must still reach Vico.
  LEFT JOIN bank_transactions bt ON bt.id = r.bank_transaction_id
  LEFT JOIN bank_accounts b ON b.id = bt.bank_account_id
  LEFT JOIN tenancy_tenants tt ON tt.tenancy_id = r.tenancy_id AND tt.is_lead AND tt.left_on IS NULL
  LEFT JOIN tenants tn ON tn.id = tt.tenant_id`;

interface PendingRow {
  receipt_id: string;
  tid: string;
  tenant_name: string | null;
  amount: string;
  received_on: string;
  bank_code: string | null;
  management_type: string;
}

const toPending = (r: PendingRow): PendingReceipt => ({
  receiptId: r.receipt_id,
  tid: r.tid,
  tenantName: r.tenant_name,
  amount: r.amount,
  receivedOn: r.received_on,
  bankCode: r.bank_code,
  managementType: r.management_type,
});

/** Sum pound strings exactly, in pence. */
export function sumPounds(amounts: string[]): string {
  const pence = amounts.reduce((acc, a) => {
    const neg = a.startsWith('-');
    const [whole = '0', frac = ''] = a.replace('-', '').split('.');
    const p = BigInt(whole) * 100n + BigInt((frac + '00').slice(0, 2));
    return acc + (neg ? -p : p);
  }, 0n);
  const neg = pence < 0n;
  const abs = neg ? -pence : pence;
  return `${neg ? '-' : ''}${abs / 100n}.${String(abs % 100n).padStart(2, '0')}`;
}

/** Amount with exactly two decimals, as Vico expects. */
const twoDp = (amount: string): string => sumPounds([amount]);

export async function listPending(pool: Pool): Promise<{ rows: PendingReceipt[]; total: number; totalAmount: string }> {
  const { rows } = await pool.query<PendingRow>(`${PENDING_SELECT} ORDER BY v.date, v.tid, v.receipt_id`);
  const pending = rows.map(toPending);
  return { rows: pending, total: pending.length, totalAmount: sumPounds(pending.map((p) => p.amount)) };
}

/** A CSV cell: quote when needed, and never let a spreadsheet read it as a formula. */
function cell(value: string): string {
  const safe = /^[=+\-@\t\r]/.test(value) && !/^-?\d+(\.\d+)?$/.test(value) ? `'${value}` : value;
  return /[",\r\n]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
}

export const VICO_HEADER = ['Sort code', 'Account number', 'Date', 'Amount', 'Standing order reference', 'MG/RG'];

export interface VicoRow {
  tid: string;
  amount: string;
  /** YYYY-MM-DD */
  receivedOn: string;
  managementType: string;
}

/** YYYY-MM-DD -> DD/MM/YYYY, without going through Date (no time-zone shifts). */
const ukDate = (iso: string): string => iso.split('-').reverse().join('/');

export function buildVicoCsv(rows: VicoRow[], settings: { sortCode: string; accountNumber: string }): string {
  const sortCode = settings.sortCode.replace(/-/g, ''); // the sheet holds the six digits
  const lines = [
    VICO_HEADER,
    ...rows.map((r) => [sortCode, settings.accountNumber, ukDate(r.receivedOn), twoDp(r.amount), r.tid, r.managementType]),
  ];
  return lines.map((l) => l.map(cell).join(',')).join('\r\n') + '\r\n';
}

const fileName = (createdAt: Date): string => {
  const p = (n: number) => String(n).padStart(2, '0');
  // UTC, like createdAt, so the name and the history time never disagree across BST.
  const d = createdAt;
  return `vico-${d.getUTCFullYear()}${p(d.getUTCMonth() + 1)}${p(d.getUTCDate())}-${p(d.getUTCHours())}${p(d.getUTCMinutes())}${p(d.getUTCSeconds())}.csv`;
};

function requireSettings(s: VicoSettings): { sortCode: string; accountNumber: string } {
  if (!s.sortCode || !s.accountNumber) {
    throw new AppError('conflict', 'Set the Vico sort code and account number before exporting', {
      reason: 'vico_not_configured',
    });
  }
  return { sortCode: s.sortCode, accountNumber: s.accountNumber };
}

/**
 * Exports every pending receipt (or just `receiptIds`) to a new Vico file and marks each one exported.
 * Asking for a receipt that isn't pending (already exported, reversed, unknown) refuses the whole export.
 */
export async function createExport(
  db: ActorDb,
  receiptIds?: string[],
  opts: { shared?: VicoSharedDir; now?: () => Date } = {},
): Promise<VicoFile> {
  const shared = opts.shared ?? NO_SHARED_DIR;
  let written: string | null = null;
  try {
    return await db.tx(async (c) => {
      await c.query('SELECT pg_advisory_xact_lock($1)', [EXPORT_LOCK]);
      const settings = requireSettings(await getVicoSettings(c));
      const ids = receiptIds ? [...new Set(receiptIds)] : null;
      const { rows } = await c.query<PendingRow>(
        `${PENDING_SELECT} ${ids ? 'WHERE v.receipt_id = ANY($1::uuid[])' : ''} ORDER BY v.date, v.tid, v.receipt_id`,
        ids ? [ids] : [],
      );
      if (ids && rows.length !== ids.length) {
        const found = new Set(rows.map((r) => r.receipt_id));
        throw new AppError('conflict', 'Some receipts are already exported to Vico or are not confirmed receipts', {
          notPending: ids.filter((id) => !found.has(id)),
        });
      }
      if (rows.length === 0) throw new AppError('conflict', 'Nothing to export: every confirmed receipt is already in Vico');

      const exportId = randomUUID();
      const createdAt = (opts.now ?? (() => new Date()))();
      const csv = buildVicoCsv(rows.map(toPending), settings);
      const name = fileName(createdAt);
      await c.query(
        `INSERT INTO external_refs (system, entity_type, entity_id, external_id, external_key2, last_synced_at, last_synced_hash)
         SELECT 'vico', 'receipt', r.id, $1 || ':' || r.id, $1, $2, r.hash
           FROM unnest($3::uuid[], $4::text[]) AS r(id, hash)`,
        [
          exportId,
          createdAt,
          rows.map((r) => r.receipt_id),
          rows.map((r) => createHash('sha256').update(`${r.tid}|${twoDp(r.amount)}`).digest('hex')),
        ],
      );
      if (shared.exportDir) written = await writeSharedFile(shared, name, csv);
      return {
        exportId,
        fileName: name,
        createdAt: createdAt.toISOString(),
        rows: rows.length,
        totalAmount: sumPounds(rows.map((r) => r.amount)),
        csv,
        sharedPath: sharedDisplayPath(name, shared),
      };
    });
  } catch (err) {
    if (written) await fs.unlink(written).catch(() => {});
    throw err;
  }
}

export async function listExports(pool: Pool, shared: VicoSharedDir = NO_SHARED_DIR): Promise<VicoExport[]> {
  const { rows } = await pool.query<{ export_id: string; created_at: Date; rows: number; total: string }>(
    `SELECT e.external_key2 AS export_id, min(e.last_synced_at) AS created_at, count(*)::int AS rows,
            sum(r.amount)::text AS total
       FROM external_refs e JOIN receipts r ON r.id = e.entity_id
      WHERE e.system = 'vico' AND e.entity_type = 'receipt' AND e.external_key2 IS NOT NULL
      GROUP BY e.external_key2
      ORDER BY min(e.last_synced_at) DESC
      LIMIT 100`,
  );
  return Promise.all(
    rows.map(async (r) => {
      const name = fileName(r.created_at);
      return {
        exportId: r.export_id,
        fileName: name,
        createdAt: r.created_at.toISOString(),
        rows: r.rows,
        totalAmount: twoDp(r.total),
        sharedPath: await sharedPathIfPresent(shared, name),
      };
    }),
  );
}

/** The file of an earlier export, rebuilt from the receipts it marked (same rows, current sort code/account). */
export async function getExportFile(pool: Pool, exportId: string, shared: VicoSharedDir = NO_SHARED_DIR): Promise<VicoFile> {
  const settings = requireSettings(await getVicoSettings(pool));
  const { rows } = await pool.query<VicoRow & { synced_at: Date }>(
    `SELECT t.tid, r.amount::text AS amount, e.last_synced_at AS synced_at,
            to_char(r.received_on, 'YYYY-MM-DD') AS "receivedOn", t.management_type::text AS "managementType"
       FROM external_refs e
       JOIN receipts r ON r.id = e.entity_id
       JOIN tenancies t ON t.id = r.tenancy_id
      WHERE e.system = 'vico' AND e.entity_type = 'receipt' AND e.external_key2 = $1
      ORDER BY r.received_on, t.tid, r.id`,
    [exportId],
  );
  if (rows.length === 0) throw new AppError('not_found', 'No such Vico export');
  const createdAt = rows[0]!.synced_at;
  const name = fileName(createdAt);
  return {
    exportId,
    fileName: name,
    createdAt: createdAt.toISOString(),
    rows: rows.length,
    totalAmount: sumPounds(rows.map((r) => r.amount)),
    sharedPath: await sharedPathIfPresent(shared, name),
    csv: buildVicoCsv(rows, settings),
  };
}
