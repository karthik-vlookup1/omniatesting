/**
 * Pure string builders for every VECO statement. Reads are single SELECTs that start with SELECT (the RW MCP
 * returns rows only then). The two write batches (insert, delete) are guarded by DB_NAME() and contain no
 * BEGIN TRAN / COMMIT / plain ROLLBACK: the MCP owns the transaction, so we only SAVE TRANSACTION and let
 * THROW re-raise (the MCP rolls everything back). A write returns no rows. SQL Server 2016, possibly
 * compatibility level 100: no OPENJSON, STRING_SPLIT or STRING_AGG, only plain INSERT ... VALUES.
 * Every value goes through sql-literal.ts, which throws instead of guessing.
 */
import type { BuiltRow } from './row-builder.js';
import {
  ALLOCATION_COLUMNS,
  ALLOCATION_FILLED_COLUMNS,
  ALLOCATION_KINDS,
  TRANSACTION_COLUMNS,
  TRANSACTION_FILLED_COLUMNS,
  TRANSACTION_KINDS,
} from './columns.js';
import { formatValue, guid, guidList, nstr, nstrList } from './sql-literal.js';
import { TARGET_DB } from './settings.js';

export const MAX_TUPLES_PER_INSERT = 500;

const TX = 'dbo.[Transaction]';
const AL = 'dbo.Allocation';

export const dbNameSql = (): string => 'SELECT /* omnia:db */ DB_NAME() AS db';

export const staffByEmailSql = (email: string): string =>
  `SELECT /* omnia:staff */ StaffPK AS staffPk FROM dbo.Staff WHERE strEmailAddress1 = ${nstr(email)}`;

export const staffExistsSql = (staffPk: string): string =>
  `SELECT /* omnia:staff-exists */ COUNT(*) AS n FROM dbo.Staff WHERE StaffPK = ${guid(staffPk)}`;

export function lookupSql(tids: string[]): string {
  const ownerWhere = 'o.PropertyFK = ty.PropertyFK AND o.blnCurrentOwner = 1';
  const officeWhere = 'f.strOfficeName = ty.strTenancyOfficeName';
  const prev =
    "t.strType = 'SLP' AND t.strBatchReference IS NOT NULL AND t.memDescription LIKE N'Rent Received  From %'";
  return (
    'SELECT /* omnia:lookup */ tn.strStandingOrderReference AS tid, tn.TenancyFK AS tenancyFk, tn.ContactFK AS contactFk, ' +
    'ty.PropertyFK AS propertyFk, ty.strTenancyOfficeName AS officeName, ' +
    `(SELECT COUNT(*) FROM dbo.Owns o WHERE ${ownerWhere}) AS ownerCount, ` +
    `(SELECT TOP 1 o.OwnerFK FROM dbo.Owns o WHERE ${ownerWhere}) AS ownerFk, ` +
    `(SELECT COUNT(*) FROM dbo.Office f WHERE ${officeWhere}) AS officeCount, ` +
    `(SELECT TOP 1 f.OfficePK FROM dbo.Office f WHERE ${officeWhere}) AS officeFk, ` +
    'p.blnDelayPayment AS delayPayment, ' +
    'CAST(c.strAddressTitle AS nvarchar(max)) AS addressTitle, ' +
    `(SELECT TOP 1 CAST(t.memDescription AS nvarchar(max)) FROM ${TX} t WHERE ${prev} AND t.ContactFK = tn.ContactFK ORDER BY t.dtePosting DESC) AS lastDescription, ` +
    `(SELECT TOP 1 t.strDepartment FROM ${TX} t WHERE ${prev} AND t.TenancyFK = tn.TenancyFK ORDER BY t.dtePosting DESC) AS lastDepartment ` +
    'FROM dbo.Tenant tn ' +
    'LEFT JOIN dbo.Tenancy ty ON ty.TenancyPK = tn.TenancyFK ' +
    'LEFT JOIN dbo.Property p ON p.PropertyPK = ty.PropertyFK ' +
    'LEFT JOIN dbo.Contacts c ON c.ContactPK = tn.ContactFK ' +
    `WHERE tn.strStandingOrderReference IN (${nstrList(tids)})`
  );
}

export const GUARD =
  `IF DB_NAME() <> ${nstr(TARGET_DB)} THROW 50001, N'Omnia Recon refuses to write outside ${TARGET_DB}', 1;`;
const writeHead = (tag: string): string[] => [
  GUARD,
  `/* omnia:${tag} */`,
  'SET XACT_ABORT ON;',
  'SAVE TRANSACTION recon_push;',
  'BEGIN TRY',
];
// IF XACT_STATE() = 1: under XACT_ABORT the transaction may be doomed (-1) in CATCH, and a savepoint rollback
// would raise 3931 and hide the original error.
export const WRITE_TAIL = 'END TRY BEGIN CATCH IF XACT_STATE() = 1 ROLLBACK TRANSACTION recon_push; THROW; END CATCH;';

function chunks<T>(items: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

export function insertBatchSql(rows: BuiltRow[]): string {
  if (rows.length === 0) throw new Error('nothing to insert');
  const tx = rows.map((r) => r.transactionPk);
  const al = rows.map((r) => r.allocationPk);
  const refs = rows.map((r) => String(r.tx.strReference));
  const parts: string[] = [
    ...writeHead('insert'),
    `IF EXISTS (SELECT 1 FROM ${TX} WHERE TransactionPK IN (${guidList(tx)})) THROW 50002, N'A TransactionPK already exists', 1;`,
    `IF EXISTS (SELECT 1 FROM ${AL} WHERE AllocationPK IN (${guidList(al)})) THROW 50003, N'An AllocationPK already exists', 1;`,
    `IF EXISTS (SELECT 1 FROM ${TX} WHERE strReference IN (${nstrList(refs)})) THROW 50004, N'A strReference already exists', 1;`,
  ];
  const txCols = TRANSACTION_COLUMNS.join(', ');
  for (const group of chunks(rows, MAX_TUPLES_PER_INSERT)) {
    const tuples = group.map(
      (r) =>
        '(' +
        TRANSACTION_COLUMNS.map((c) =>
          c in TRANSACTION_KINDS ? formatValue(TRANSACTION_KINDS[c as keyof typeof TRANSACTION_KINDS], r.tx[c]) : 'NULL',
        ).join(', ') +
        ')',
    );
    parts.push(`INSERT INTO ${TX} (${txCols}) VALUES ${tuples.join(', ')};`);
  }
  const alCols = ALLOCATION_COLUMNS.join(', ');
  for (const group of chunks(rows, MAX_TUPLES_PER_INSERT)) {
    const tuples = group.map(
      (r) =>
        '(' +
        ALLOCATION_COLUMNS.map((c) =>
          c in ALLOCATION_KINDS ? formatValue(ALLOCATION_KINDS[c as keyof typeof ALLOCATION_KINDS], r.alloc[c]) : 'NULL',
        ).join(', ') +
        ')',
    );
    parts.push(`INSERT INTO ${AL} (${alCols}) VALUES ${tuples.join(', ')};`);
  }
  parts.push(
    `IF (SELECT COUNT(*) FROM ${TX} WHERE TransactionPK IN (${guidList(tx)})) <> ${rows.length} THROW 50005, N'Transaction row count is wrong', 1;`,
    `IF (SELECT COUNT(*) FROM ${AL} WHERE AllocationPK IN (${guidList(al)})) <> ${rows.length} THROW 50005, N'Allocation row count is wrong', 1;`,
    WRITE_TAIL,
  );
  return parts.join('\n');
}

/** Read-back: the 30 filled Transaction columns, the 7 filled Allocation columns (a_ prefix), the tenant name. */
export function readBackSql(tx: string[], al: string[]): string {
  const txCols = TRANSACTION_FILLED_COLUMNS.map((c) =>
    c === 'memDescription' ? 'CAST(t.memDescription AS nvarchar(max)) AS memDescription' : `t.${c} AS ${c}`,
  );
  const alCols = ALLOCATION_FILLED_COLUMNS.map((c) => `a.${c} AS a_${c}`);
  return (
    `SELECT /* omnia:readback */ ${[...txCols, ...alCols, 'CAST(c.strAddressTitle AS nvarchar(max)) AS tenantName'].join(', ')} ` +
    `FROM ${TX} t ` +
    `LEFT JOIN ${AL} a ON a.DebitTransactionFK = t.TransactionPK AND a.AllocationPK IN (${guidList(al)}) ` +
    'LEFT JOIN dbo.Contacts c ON c.ContactPK = t.ContactFK ' +
    `WHERE t.TransactionPK IN (${guidList(tx)})`
  );
}

export function deleteBatchSql(tx: string[], al: string[]): string {
  if (tx.length === 0) throw new Error('nothing to delete');
  const txIn = guidList(tx);
  const alIn = guidList(al);
  return [
    ...writeHead('delete'),
    `IF EXISTS (SELECT 1 FROM ${AL} WHERE (DebitTransactionFK IN (${txIn}) OR CreditTransactionFK IN (${txIn})) AND AllocationPK NOT IN (${alIn})) THROW 50006, N'Other VECO rows now reference these receipts; delete refused', 1;`,
    `DELETE FROM ${AL} WHERE AllocationPK IN (${alIn});`,
    `DELETE FROM ${TX} WHERE TransactionPK IN (${txIn});`,
    WRITE_TAIL,
  ].join('\n');
}

export function remainingSql(tx: string[], al: string[]): string {
  return (
    `SELECT /* omnia:remaining */ (SELECT COUNT(*) FROM ${TX} WHERE TransactionPK IN (${guidList(tx)})) AS transactions, ` +
    `(SELECT COUNT(*) FROM ${AL} WHERE AllocationPK IN (${guidList(al)})) AS allocations, ` +
    `(SELECT CAST(ISNULL(SUM(dblAmount), 0) AS decimal(18,2)) FROM ${TX} WHERE TransactionPK IN (${guidList(tx)})) AS total`
  );
}
