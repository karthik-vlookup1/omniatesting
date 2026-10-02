/**
 * Bank CSV ingest: bank accounts, versioned CSV profiles, and importing a statement file.
 *
 * Import rules (BUILD_BRIEF §3):
 *   - the same file twice is rejected by its SHA-256 (import_batches.file_sha256 is UNIQUE);
 *   - lines already imported from an overlapping statement are skipped by dedupe key;
 *   - every line keeps its (masked) raw row;
 *   - TID and NI are extracted with the same SQL functions the matcher uses (extract_tid,
 *     extract_ni + secure_hash), so import and matching can never disagree. Unmasked text is
 *     only ever a query parameter, never stored.
 */
import { createHash } from 'node:crypto';
import type { ActorDb } from '../../db/context.js';
import type { Pool, PoolClient } from '../../db/pool.js';
import { AppError } from '../../lib/errors.js';
import { parseBankCsv, type ParsedLine } from '../../domain/ingest/parse.js';
import {
  CANONICAL_FIELDS,
  DATE_FORMATS,
  DEFAULT_BANKS,
  type CanonicalField,
  type CsvProfile,
} from '../../domain/ingest/profiles.js';

export interface BankAccount {
  id: string;
  code: string;
  bankName: string;
  accountName: string;
  isActive: boolean;
  profile: (CsvProfile & { id: string; version: number; notes: string | null }) | null;
}

interface ProfileRow {
  id: string;
  version: number;
  header_aliases: CsvProfile['headerAliases'];
  required_fields: CanonicalField[];
  amount_mode: CsvProfile['amountMode'];
  date_format: string;
  skip_rows: number;
  notes: string | null;
}

function toProfile(r: ProfileRow): NonNullable<BankAccount['profile']> {
  return {
    id: r.id,
    version: r.version,
    headerAliases: r.header_aliases,
    requiredFields: r.required_fields,
    amountMode: r.amount_mode,
    dateFormat: r.date_format,
    skipRows: r.skip_rows,
    notes: r.notes,
  };
}

export async function listBankAccounts(pool: Pool): Promise<BankAccount[]> {
  const { rows } = await pool.query<{
    id: string;
    code: string;
    bank_name: string;
    account_name: string;
    is_active: boolean;
    profile: ProfileRow | null;
  }>(
    `SELECT b.id, b.code, b.bank_name, b.account_name, b.is_active,
            (SELECT row_to_json(p) FROM (
               SELECT id, version, header_aliases, required_fields, amount_mode, date_format, skip_rows, notes
                 FROM bank_csv_profiles WHERE bank_account_id = b.id AND is_active) p) AS profile
       FROM bank_accounts b ORDER BY b.code`,
  );
  return rows.map((r) => ({
    id: r.id,
    code: r.code,
    bankName: r.bank_name,
    accountName: r.account_name,
    isActive: r.is_active,
    profile: r.profile ? toProfile(r.profile) : null,
  }));
}

export interface BankAccountInput {
  code: string;
  bankName: string;
  accountName: string;
}

export async function createBankAccount(db: ActorDb, input: BankAccountInput): Promise<string> {
  try {
    return await db.tx(async (c) => {
      const { rows } = await c.query<{ id: string }>(
        'INSERT INTO bank_accounts (code, bank_name, account_name) VALUES ($1, $2, $3) RETURNING id',
        [input.code.toUpperCase(), input.bankName, input.accountName],
      );
      return rows[0]!.id;
    });
  } catch (err) {
    if ((err as { code?: string }).code === '23505') throw new AppError('conflict', 'A bank account with that code exists');
    throw err;
  }
}

/** Validates a profile; returns the problems (empty = fine). */
export function profileProblems(p: CsvProfile): string[] {
  const problems: string[] = [];
  for (const key of Object.keys(p.headerAliases)) {
    if (!(CANONICAL_FIELDS as readonly string[]).includes(key)) problems.push(`unknown field "${key}"`);
  }
  for (const f of p.requiredFields) {
    if (!p.headerAliases[f]?.length) problems.push(`required field "${f}" has no header aliases`);
  }
  if (!p.headerAliases.txn_date?.length) problems.push('txn_date needs at least one header alias');
  if (p.amountMode === 'signed' && !p.headerAliases.amount?.length) problems.push('signed mode needs "amount" aliases');
  if (p.amountMode === 'split_in_out' && !p.headerAliases.paid_in?.length && !p.headerAliases.paid_out?.length) {
    problems.push('split mode needs "paid_in" and/or "paid_out" aliases');
  }
  if (!(DATE_FORMATS as readonly string[]).includes(p.dateFormat)) {
    problems.push(`date format must be one of ${DATE_FORMATS.join(', ')}`);
  }
  return problems;
}

/** Saves a new profile version for a bank and makes it the active one. */
export async function saveProfileVersion(
  db: ActorDb,
  bankAccountId: string,
  profile: CsvProfile,
  notes: string | null,
): Promise<{ id: string; version: number }> {
  const problems = profileProblems(profile);
  if (problems.length > 0) throw new AppError('bad_request', `Invalid profile: ${problems.join('; ')}`, { problems });
  return db.tx((c) => insertProfileVersion(c, bankAccountId, profile, notes));
}

async function insertProfileVersion(c: PoolClient, bankAccountId: string, profile: CsvProfile, notes: string | null) {
  const { rows: bank } = await c.query('SELECT 1 FROM bank_accounts WHERE id = $1 FOR UPDATE', [bankAccountId]);
  if (bank.length === 0) throw new AppError('not_found', 'No such bank account');
  await c.query('UPDATE bank_csv_profiles SET is_active = false WHERE bank_account_id = $1 AND is_active', [bankAccountId]);
  const { rows } = await c.query<{ id: string; version: number }>(
    `INSERT INTO bank_csv_profiles
       (bank_account_id, version, header_aliases, required_fields, amount_mode, date_format, skip_rows, notes)
     VALUES ($1, (SELECT coalesce(max(version), 0) + 1 FROM bank_csv_profiles WHERE bank_account_id = $1),
             $2, $3, $4, $5, $6, $7)
     RETURNING id, version`,
    [
      bankAccountId,
      JSON.stringify(profile.headerAliases),
      profile.requiredFields,
      profile.amountMode,
      profile.dateFormat,
      profile.skipRows,
      notes,
    ],
  );
  return rows[0]!;
}

/** Creates any of the 7 default bank accounts (and their starting profile) that don't exist yet. */
export async function installDefaultBanks(db: ActorDb): Promise<{ created: string[] }> {
  return db.tx(async (c) => {
    const created: string[] = [];
    for (const bank of DEFAULT_BANKS) {
      const { rows } = await c.query<{ id: string }>(
        `INSERT INTO bank_accounts (code, bank_name, account_name) VALUES ($1, $2, $3)
         ON CONFLICT (code) DO NOTHING RETURNING id`,
        [bank.code, bank.bankName, bank.accountName],
      );
      if (rows[0]) {
        await insertProfileVersion(c, rows[0].id, bank.profile, 'default profile (synthetic layout until the real headers are entered)');
        created.push(bank.code);
      }
    }
    return created;
  }).then((created) => ({ created }));
}

export interface ImportInput {
  bankAccountId: string;
  fileName: string;
  content: Buffer;
  userId: string;
}

export interface ImportResult {
  batchId: string;
  rowsTotal: number;
  rowsInserted: number;
  rowsDuplicate: number;
  rowsSkipped: number;
  periodFrom: string;
  periodTo: string;
  withTid: number;
  withNi: number;
  withPayerAccount: number;
  moneyIn: number;
  moneyOut: number;
}

export async function importBankCsv(db: ActorDb, hashKey: string, input: ImportInput): Promise<ImportResult> {
  try {
    return await importInTx(db, hashKey, input);
  } catch (err) {
    // Two uploads of the same file at the same moment: the second loses the UNIQUE race.
    if ((err as { code?: string; constraint?: string }).code === '23505' &&
        (err as { constraint?: string }).constraint === 'import_batches_file_sha256_key') {
      throw new AppError('conflict', 'This exact file is already being imported');
    }
    throw err;
  }
}

async function importInTx(db: ActorDb, hashKey: string, input: ImportInput): Promise<ImportResult> {
  const sha256 = createHash('sha256').update(input.content).digest('hex');
  return db.tx(async (c) => {
    const { rows: profiles } = await c.query<ProfileRow & { bank_active: boolean }>(
      `SELECT p.id, p.version, p.header_aliases, p.required_fields, p.amount_mode, p.date_format, p.skip_rows, p.notes,
              b.is_active AS bank_active
         FROM bank_accounts b LEFT JOIN bank_csv_profiles p ON p.bank_account_id = b.id AND p.is_active
        WHERE b.id = $1`,
      [input.bankAccountId],
    );
    const row = profiles[0];
    if (!row) throw new AppError('not_found', 'No such bank account');
    if (!row.bank_active) throw new AppError('bad_request', 'This bank account is inactive');
    if (!row.id) throw new AppError('bad_request', 'This bank account has no CSV profile yet');

    const { rows: existing } = await c.query<{ id: string; file_name: string; uploaded_at: Date }>(
      'SELECT id, file_name, uploaded_at FROM import_batches WHERE file_sha256 = $1',
      [sha256],
    );
    if (existing[0]) {
      throw new AppError(
        'conflict',
        `This exact file was already imported (as "${existing[0].file_name}" on ${existing[0].uploaded_at.toISOString().slice(0, 10)})`,
        { batchId: existing[0].id },
      );
    }

    const parsed = parseBankCsv(input.content, toProfile(row), { bankAccountId: input.bankAccountId, hashKey });
    if (!parsed.ok) {
      throw new AppError('bad_request', parsed.message, {
        reason: parsed.code,
        missingFields: parsed.missingFields,
        rowErrors: parsed.rowErrors,
      });
    }

    const dates = parsed.lines.map((l) => l.txnDate).sort();
    const { rows: batch } = await c.query<{ id: string }>(
      `INSERT INTO import_batches (source, bank_account_id, file_name, file_sha256, period_from, period_to,
                                   rows_total, status, uploaded_by)
       VALUES ('bank_csv', $1, $2, $3, $4, $5, $6, 'parsed', $7) RETURNING id`,
      [input.bankAccountId, input.fileName.slice(0, 255), sha256, dates[0], dates[dates.length - 1], parsed.lines.length, input.userId],
    );
    const batchId = batch[0]!.id;

    const result: ImportResult = {
      batchId,
      rowsTotal: parsed.lines.length,
      rowsInserted: 0,
      rowsDuplicate: 0,
      rowsSkipped: parsed.skipped,
      periodFrom: dates[0]!,
      periodTo: dates[dates.length - 1]!,
      withTid: 0,
      withNi: 0,
      withPayerAccount: 0,
      moneyIn: 0,
      moneyOut: 0,
    };
    for (const line of parsed.lines) {
      const inserted = await insertLine(c, input.bankAccountId, batchId, row.id, line);
      if (!inserted) {
        result.rowsDuplicate += 1;
        continue;
      }
      result.rowsInserted += 1;
      if (inserted.has_tid) result.withTid += 1;
      if (inserted.has_ni) result.withNi += 1;
      if (line.payerAccountHash) result.withPayerAccount += 1;
      if (line.amount.startsWith('-')) result.moneyOut += 1;
      else result.moneyIn += 1;
    }

    await c.query('UPDATE import_batches SET rows_inserted = $2, rows_duplicate = $3 WHERE id = $1', [
      batchId,
      result.rowsInserted,
      result.rowsDuplicate,
    ]);
    return result;
  });
}

async function insertLine(c: PoolClient, bankAccountId: string, batchId: string, profileId: string, l: ParsedLine) {
  const { rows } = await c.query<{ has_tid: boolean; has_ni: boolean }>(
    `INSERT INTO bank_transactions
       (bank_account_id, import_batch_id, profile_id, txn_date, amount, description, reference, counterparty,
        balance_after, raw_row, dedupe_key, extracted_tid, extracted_ni_hash,
        payer_sort_code, payer_account_hash, payer_account_last4)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11,
             coalesce(extract_tid($12), extract_tid($13)),
             secure_hash(coalesce(extract_ni($14), extract_ni($13))),
             $15, $16, $17)
     ON CONFLICT (bank_account_id, dedupe_key) DO NOTHING
     RETURNING extracted_tid IS NOT NULL AS has_tid, extracted_ni_hash IS NOT NULL AS has_ni`,
    [
      bankAccountId,
      batchId,
      profileId,
      l.txnDate,
      l.amount,
      l.description,
      l.reference,
      l.counterparty,
      l.balanceAfter,
      JSON.stringify(l.rawRow),
      l.dedupeKey,
      l.tidColumn,
      l.matchText,
      l.niColumn,
      l.payerSortCode,
      l.payerAccountHash,
      l.payerAccountLast4,
    ],
  );
  return rows[0] ?? null;
}

export interface ImportBatchSummary {
  id: string;
  bankCode: string;
  fileName: string;
  periodFrom: string | null;
  periodTo: string | null;
  rowsTotal: number | null;
  rowsInserted: number | null;
  rowsDuplicate: number | null;
  uploadedAt: string;
  uploadedBy: string | null;
}

export async function listImports(pool: Pool, limit = 50): Promise<ImportBatchSummary[]> {
  const { rows } = await pool.query<{
    id: string;
    code: string;
    file_name: string;
    period_from: string | null;
    period_to: string | null;
    rows_total: number | null;
    rows_inserted: number | null;
    rows_duplicate: number | null;
    uploaded_at: Date;
    uploaded_by: string | null;
  }>(
    `SELECT ib.id, b.code, ib.file_name, to_char(ib.period_from, 'YYYY-MM-DD') AS period_from,
            to_char(ib.period_to, 'YYYY-MM-DD') AS period_to, ib.rows_total, ib.rows_inserted, ib.rows_duplicate,
            ib.uploaded_at, u.full_name AS uploaded_by
       FROM import_batches ib JOIN bank_accounts b ON b.id = ib.bank_account_id
       LEFT JOIN app_users u ON u.id = ib.uploaded_by
      WHERE ib.source = 'bank_csv'
      ORDER BY ib.uploaded_at DESC LIMIT $1`,
    [limit],
  );
  return rows.map((r) => ({
    id: r.id,
    bankCode: r.code,
    fileName: r.file_name,
    periodFrom: r.period_from,
    periodTo: r.period_to,
    rowsTotal: r.rows_total,
    rowsInserted: r.rows_inserted,
    rowsDuplicate: r.rows_duplicate,
    uploadedAt: r.uploaded_at.toISOString(),
    uploadedBy: r.uploaded_by,
  }));
}
