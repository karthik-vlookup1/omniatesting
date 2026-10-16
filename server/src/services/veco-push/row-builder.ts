/** Builds the 79-column Transaction row and the 14-column Allocation row for each ready receipt. */
import { randomBytes, randomInt, randomUUID } from 'node:crypto';
import type { ReadyInput } from './classify.js';
import {
  ALLOCATION_COLUMNS,
  TRANSACTION_COLUMNS,
  type AllocationColumn,
  type TransactionColumn,
} from './columns.js';
import { BANK_FK, COMPANY_FK } from './settings.js';
import {
  bankingRef,
  batchReference,
  ukDateTimeLiteral,
  ukParts,
  vecoReference,
  type RandomSource,
} from './uk-time.js';

export type TransactionRow = Record<TransactionColumn, string | number | null>;
export type AllocationRow = Record<AllocationColumn, string | number | null>;

export interface BuiltRow {
  receiptId: string;
  tid: string;
  sourceBank: string;
  amount: string;
  paymentDate: string;
  transactionPk: string;
  allocationPk: string;
  bankingRef: string;
  tx: TransactionRow;
  alloc: AllocationRow;
}

export const defaultRandom: RandomSource = {
  digits2: () => String(randomInt(0, 100)).padStart(2, '0'),
  hex8: () => randomBytes(4).toString('hex').toUpperCase(),
};

export interface BuildContext {
  at: Date;
  staffFk: string;
  uuid?: () => string;
  rnd?: RandomSource;
}

export function buildRows(
  ready: ReadyInput[],
  ctx: BuildContext,
): { batchReference: string; postedAt: string; rows: BuiltRow[] } {
  const uuid = ctx.uuid ?? (() => randomUUID().toUpperCase());
  const rnd = ctx.rnd ?? defaultRandom;
  const p = ukParts(ctx.at);
  const posting = ukDateTimeLiteral(p);
  const batchRef = batchReference(p);
  const sorted = [...ready].sort(
    (a, b) =>
      a.candidate.paymentDate.localeCompare(b.candidate.paymentDate) ||
      a.candidate.tid.localeCompare(b.candidate.tid) ||
      a.candidate.receiptId.localeCompare(b.candidate.receiptId),
  );

  const seenRefs = new Set<string>();
  const rows = sorted.map((r, i): BuiltRow => {
    const { candidate: c, lookup: l } = r;
    const txPk = uuid().toUpperCase();
    const alPk = uuid().toUpperCase();
    let strReference = vecoReference(p, rnd);
    for (let tries = 0; seenRefs.has(strReference); tries++) {
      if (tries >= 100) throw new Error('could not make a unique strReference');
      strReference = vecoReference(p, rnd);
    }
    seenRefs.add(strReference);
    const period = c.paymentDate.slice(0, 7).replace('-', '/');
    const ref = bankingRef(p, i + 1);

    const tx = Object.fromEntries(TRANSACTION_COLUMNS.map((col) => [col, null])) as TransactionRow;
    Object.assign(tx, {
      TransactionPK: txPk,
      CompanyFK: COMPANY_FK,
      OfficeFK: l.officeFk,
      StaffFK: ctx.staffFk.toUpperCase(),
      OwnerGroupFK: l.ownerFk,
      PropertyFK: l.propertyFk,
      TenancyFK: l.tenancyFk,
      ContactFK: l.contactFk,
      strType: 'SLP',
      dtePosting: posting,
      dteDate: `${c.paymentDate}T00:00:00.000`,
      strAccountPeriod: period,
      strBankingRef: ref,
      dblAmount: c.amount,
      dblVAT: '0',
      dblGross: c.amount,
      dblTaxRate: '20',
      lngDaysDelay: l.delayPayment ? '7' : '0',
      memDescription: l.lastDescription ?? `Rent Received  From ${l.addressTitle ?? ''}`,
      blnDeleted: 0,
      strDepartment: r.department,
      strStatus: 'Live',
      dteStatus: posting,
      StatusStaffFK: ctx.staffFk.toUpperCase(),
      strReference,
      strTransactionStatus: 'Live',
      strBatchReference: batchRef,
      blnOwnerPayment: 0,
      strStandingOrderReference: c.tid,
      BankFK: BANK_FK,
    });

    const alloc = Object.fromEntries(ALLOCATION_COLUMNS.map((col) => [col, null])) as AllocationRow;
    Object.assign(alloc, {
      AllocationPK: alPk,
      DebitTransactionFK: txPk,
      CreditTransactionFK: txPk,
      dblAmount: '0',
      dtePosting: posting,
      dblPercentage: '0',
      strAccountPeriod: period,
    });

    return {
      receiptId: c.receiptId,
      tid: c.tid,
      sourceBank: c.sourceBank,
      amount: c.amount,
      paymentDate: c.paymentDate,
      transactionPk: txPk,
      allocationPk: alPk,
      bankingRef: ref,
      tx,
      alloc,
    };
  });
  return { batchReference: batchRef, postedAt: posting, rows };
}
