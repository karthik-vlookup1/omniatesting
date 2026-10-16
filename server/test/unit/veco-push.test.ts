/**
 * VECO push building blocks that need no database or VECO: row builder, UK time, SQL literals, classification
 * and the cross-check. Nothing here reads VECO_RW_MCP_URL or calls any VECO endpoint.
 */
import { describe, expect, it } from 'vitest';
import { classify, type Candidate, type TenantLookupRow } from '../../src/services/veco-push/classify.js';
import {
  ALLOCATION_COLUMNS,
  TRANSACTION_COLUMNS,
  TRANSACTION_KINDS,
  TRANSACTION_NULL_COLUMNS,
} from '../../src/services/veco-push/columns.js';
import { crossCheck, type StoredItem } from '../../src/services/veco-push/crosscheck.js';
import { buildRows } from '../../src/services/veco-push/row-builder.js';
import { BANK_FK, COMPANY_FK } from '../../src/services/veco-push/settings.js';
import { bit, dt, formatValue, guid, nstr, num } from '../../src/services/veco-push/sql-literal.js';
import { batchReference, ukParts, vecoReference } from '../../src/services/veco-push/uk-time.js';

const STAFF = '11111111-2222-3333-4444-555555555555';
const hex = (n: number) => n.toString(16).toUpperCase().padStart(12, '0');
const guidSeq = () => {
  let i = 0;
  return () => `AAAAAAAA-0000-4000-8000-${hex(++i)}`;
};
const fixedRnd = { digits2: () => '42', hex8: () => 'DEADBEEF' };
const seqRnd = () => {
  let i = 0;
  return { digits2: () => '42', hex8: () => (++i).toString(16).toUpperCase().padStart(8, '0') };
};

const cand = (over: Partial<Candidate> = {}): Candidate => ({
  receiptId: '00000000-0000-4000-8000-000000000001',
  tid: 'T1001',
  amount: '997.27',
  paymentDate: '2026-10-14',
  sourceBank: 'HSBC',
  tenantName: 'Alex Testperson',
  property: '1 Test Road, TE1 1ST',
  landlord: 'Test Landlord',
  ...over,
});

const lookup = (over: Partial<TenantLookupRow> = {}): TenantLookupRow => ({
  tid: 'T1001',
  tenancyFk: 'BBBBBBBB-0000-4000-8000-000000000001',
  contactFk: 'CCCCCCCC-0000-4000-8000-000000000001',
  propertyFk: 'DDDDDDDD-0000-4000-8000-000000000001',
  officeName: 'MY',
  ownerCount: 1,
  ownerFk: 'EEEEEEEE-0000-4000-8000-000000000001',
  officeCount: 1,
  officeFk: 'FFFFFFFF-0000-4000-8000-000000000001',
  delayPayment: false,
  addressTitle: 'Mr A Testperson',
  lastDescription: 'Rent Received  From Mr A Testperson  ',
  lastDepartment: 'Tenancy',
  ...over,
});

const opts = { bankOk: true, sentIds: new Set<string>(), departments: {} };
const readyOf = (c: Candidate, l: TenantLookupRow, departments = {}) => classify([c], [l], { ...opts, departments }).ready;

describe('column lists', () => {
  it('has 79 Transaction columns, 30 filled and 49 NULL, and 14 Allocation columns', () => {
    expect(TRANSACTION_COLUMNS).toHaveLength(79);
    expect(new Set(TRANSACTION_COLUMNS).size).toBe(79);
    expect(Object.keys(TRANSACTION_KINDS)).toHaveLength(30);
    expect(TRANSACTION_NULL_COLUMNS).toHaveLength(49);
    expect(ALLOCATION_COLUMNS).toHaveLength(14);
  });
});

describe('uk time', () => {
  it('uses BST in summer and GMT in winter, flooring ms to 10', () => {
    expect(ukParts(new Date('2026-10-14T13:17:06.129Z'))).toEqual({ y: 2026, mo: 10, d: 14, h: 14, mi: 17, s: 6, ms: 120 });
    expect(ukParts(new Date('2026-12-01T09:05:03.000Z'))).toMatchObject({ h: 9, mi: 5, s: 3 });
  });

  it('follows the 2026 clock changes (29 March forward, 25 October back)', () => {
    expect(ukParts(new Date('2026-03-29T00:30:00Z')).h).toBe(0);
    expect(ukParts(new Date('2026-03-29T01:30:00Z')).h).toBe(2);
    expect(ukParts(new Date('2026-10-25T00:30:00Z')).h).toBe(1); // still BST
    expect(ukParts(new Date('2026-10-25T01:30:00Z')).h).toBe(1); // now GMT
    expect(ukParts(new Date('2026-10-25T00:00:00Z')).d).toBe(25);
  });

  it('builds the batch reference and the strReference in VECO format', () => {
    const p = ukParts(new Date('2026-10-14T13:17:06Z'));
    expect(batchReference(p)).toBe('2026-10-14-14-17');
    expect(vecoReference(p, fixedRnd)).toBe('O0642K1714-DEADBEEF');
    const winter = ukParts(new Date('2026-12-01T09:05:03Z'));
    expect(vecoReference(winter, fixedRnd)).toBe('J0342M0501-DEADBEEF');
  });
});

describe('sql literals', () => {
  it('escapes quotes and rejects NUL', () => {
    expect(nstr("O'Brien")).toBe("N'O''Brien'");
    expect(nstr(null)).toBe('NULL');
    expect(() => nstr('a\u0000b')).toThrow('unsafe SQL value');
  });

  it('accepts only well-formed guids, datetimes and numbers', () => {
    expect(guid('aaaaaaaa-0000-4000-8000-000000000001')).toBe("'AAAAAAAA-0000-4000-8000-000000000001'");
    expect(() => guid("x'; DROP TABLE a;--")).toThrow('unsafe SQL value');
    expect(dt('2026-10-14T14:17:06.120')).toBe("'2026-10-14T14:17:06.120'");
    expect(() => dt('2026-10-14')).toThrow('unsafe SQL value');
    expect(num('-12.50')).toBe('-12.50');
    expect(() => num('1e5')).toThrow('unsafe SQL value');
    expect(() => num("1); DROP")).toThrow('unsafe SQL value');
    expect(bit(1)).toBe('1');
    expect(() => bit(2 as 0)).toThrow('unsafe SQL value');
    expect(formatValue('str', null)).toBe('NULL');
  });
});

describe('row builder', () => {
  const at = new Date('2026-10-14T13:17:06.129Z');
  const build = (ready = readyOf(cand(), lookup()), when = at) =>
    buildRows(ready, { at: when, staffFk: STAFF, uuid: guidSeq(), rnd: seqRnd() });

  it('fills 79 keys in order: 30 values, 49 NULL, with the constants', () => {
    const { rows, batchReference: ref } = build();
    const tx = rows[0]!.tx;
    expect(Object.keys(tx)).toEqual([...TRANSACTION_COLUMNS]);
    const nonNull = Object.entries(tx).filter(([, v]) => v !== null);
    expect(nonNull).toHaveLength(30);
    expect(TRANSACTION_NULL_COLUMNS.every((c) => tx[c] === null)).toBe(true);
    expect(ref).toBe('2026-10-14-14-17');
    expect(tx).toMatchObject({
      CompanyFK: COMPANY_FK,
      BankFK: BANK_FK,
      StaffFK: STAFF.toUpperCase(),
      StatusStaffFK: STAFF.toUpperCase(),
      strType: 'SLP',
      strStatus: 'Live',
      strTransactionStatus: 'Live',
      dblAmount: '997.27',
      dblGross: '997.27',
      dblVAT: '0',
      dblTaxRate: '20',
      lngDaysDelay: '0',
      blnDeleted: 0,
      blnOwnerPayment: 0,
      strStandingOrderReference: 'T1001',
      strBatchReference: '2026-10-14-14-17',
      dtePosting: '2026-10-14T14:17:06.120',
      dteStatus: '2026-10-14T14:17:06.120',
      dteDate: '2026-10-14T00:00:00.000',
      strDepartment: 'Tenancy',
    });
  });

  it('fills the Allocation row: 7 values, 7 NULL, pointing at its own receipt', () => {
    const { rows } = build();
    const { alloc, tx } = rows[0]!;
    expect(Object.keys(alloc)).toEqual([...ALLOCATION_COLUMNS]);
    expect(Object.values(alloc).filter((v) => v !== null)).toHaveLength(7);
    expect(alloc).toMatchObject({
      DebitTransactionFK: tx.TransactionPK,
      CreditTransactionFK: tx.TransactionPK,
      dblAmount: '0',
      dblPercentage: '0',
      dtePosting: tx.dtePosting,
      strAccountPeriod: tx.strAccountPeriod,
    });
  });

  it('copies the earlier description verbatim (trailing spaces kept); the fallback has two spaces', () => {
    expect(build().rows[0]!.tx.memDescription).toBe('Rent Received  From Mr A Testperson  ');
    const fallback = build(readyOf(cand(), lookup({ lastDescription: null }))).rows[0]!.tx.memDescription;
    expect(fallback).toBe('Rent Received  From Mr A Testperson');
    expect(String(fallback)).toContain('Received  From');
  });

  it('takes the account period from the payment date, not the push date', () => {
    const rows = build(readyOf(cand({ paymentDate: '2026-09-30' }), lookup()), new Date('2026-10-01T10:00:00Z')).rows;
    expect(rows[0]!.tx.strAccountPeriod).toBe('2026/09');
    expect(rows[0]!.alloc.strAccountPeriod).toBe('2026/09');
  });

  it('uses 7 days delay when the property delays payment', () => {
    expect(build(readyOf(cand(), lookup({ delayPayment: true }))).rows[0]!.tx.lngDaysDelay).toBe('7');
  });

  it('numbers banking refs 0001..n by date, TID, receipt, and restarts on the next push', () => {
    const a = cand({ receiptId: '00000000-0000-4000-8000-00000000000a', tid: 'T2', paymentDate: '2026-10-14' });
    const b = cand({ receiptId: '00000000-0000-4000-8000-00000000000b', tid: 'T1', paymentDate: '2026-10-14' });
    const c = cand({ receiptId: '00000000-0000-4000-8000-00000000000c', tid: 'T3', paymentDate: '2026-10-13' });
    const ready = [a, b, c].flatMap((x) => readyOf(x, lookup({ tid: x.tid })));
    const first = build(ready).rows;
    expect(first.map((r) => [r.tid, r.bankingRef])).toEqual([
      ['T3', 'S20261014-0001'],
      ['T1', 'S20261014-0002'],
      ['T2', 'S20261014-0003'],
    ]);
    expect(build(ready).rows[0]!.bankingRef).toBe('S20261014-0001');
  });

  it('regenerates a strReference that collides inside one push', () => {
    const seq = ['AAAAAAAA', 'AAAAAAAA', 'BBBBBBBB'];
    let i = 0;
    const rnd = { digits2: () => '10', hex8: () => seq[i++] ?? 'CCCCCCCC' };
    const ready = [
      ...readyOf(cand({ receiptId: '00000000-0000-4000-8000-00000000000a', tid: 'T1' }), lookup({ tid: 'T1' })),
      ...readyOf(cand({ receiptId: '00000000-0000-4000-8000-00000000000b', tid: 'T2' }), lookup({ tid: 'T2' })),
    ];
    const { rows } = buildRows(ready, { at, staffFk: STAFF, uuid: guidSeq(), rnd });
    const refs = rows.map((r) => r.tx.strReference);
    expect(new Set(refs).size).toBe(2);
    expect(refs[1]).toMatch(/-BBBBBBBB$/);
  });
});

describe('classify', () => {
  const run = (c: Candidate, l: TenantLookupRow[], o = opts) => classify([c], l, o);
  const code = (r: ReturnType<typeof run>) => r.held[0]?.code;

  it('holds each case with its reason', () => {
    expect(code(run(cand(), [lookup()], { ...opts, sentIds: new Set([cand().receiptId]) }))).toBe('already_sent');
    expect(code(run(cand({ amount: '0.00' }), [lookup()]))).toBe('amount_not_positive');
    expect(code(run(cand({ amount: '-5.00' }), [lookup()]))).toBe('amount_not_positive');
    expect(code(run(cand(), [lookup()], { ...opts, bankOk: false }))).toBe('bank_account_mismatch');
    expect(code(run(cand({ tid: "T1'; --" }), [lookup()]))).toBe('tid_invalid');
    expect(code(run(cand(), []))).toBe('tid_not_found');
    expect(code(run(cand(), [lookup(), lookup()]))).toBe('tid_duplicate');
    expect(code(run(cand(), [lookup({ propertyFk: null })]))).toBe('tenancy_missing');
    expect(code(run(cand(), [lookup({ ownerCount: 0, ownerFk: null })]))).toBe('owner_none');
    expect(code(run(cand(), [lookup({ ownerCount: 2 })]))).toBe('owner_multiple');
    expect(code(run(cand(), [lookup({ officeCount: 0, officeFk: null })]))).toBe('office_none');
    expect(code(run(cand(), [lookup({ officeCount: 2 })]))).toBe('office_multiple');
    expect(code(run(cand(), [lookup({ lastDescription: null, addressTitle: ' ' })]))).toBe('contact_name_missing');
    expect(run(cand(), [lookup()]).ready).toHaveLength(1);
    for (const h of run(cand(), []).held) expect(h.message.length).toBeGreaterThan(5);
  });

  it('copies the department from VECO; a first-ever receipt needs a pick, and the pick applies', () => {
    expect(run(cand(), [lookup({ lastDepartment: 'Owner' })], { ...opts, departments: { [cand().receiptId]: 'Tenancy' } }).ready[0]!.department).toBe('Owner');
    const first = run(cand(), [lookup({ lastDepartment: null })]);
    expect(first.held[0]).toMatchObject({ code: 'department_not_chosen', needsDepartment: true });
    const picked = run(cand(), [lookup({ lastDepartment: null })], { ...opts, departments: { [cand().receiptId]: 'Owner' } });
    expect(picked.ready[0]).toMatchObject({ department: 'Owner', departmentFromVeco: false });
  });
});

describe('crossCheck', () => {
  const build = () => {
    const ready = [
      ...readyOf(cand({ receiptId: '00000000-0000-4000-8000-00000000000a', tid: 'T1', sourceBank: 'HSBC' }), lookup({ tid: 'T1' })),
      ...readyOf(cand({ receiptId: '00000000-0000-4000-8000-00000000000b', tid: 'T2', sourceBank: 'MANUAL', amount: '10.50' }), lookup({ tid: 'T2' })),
    ];
    const rows = buildRows(ready, { at: new Date('2026-10-14T13:17:06.120Z'), staffFk: STAFF, uuid: guidSeq(), rnd: seqRnd() }).rows;
    const items: StoredItem[] = rows.map((r) => ({
      receiptId: r.receiptId,
      transactionPk: r.transactionPk,
      allocationPk: r.allocationPk,
      tid: r.tid,
      amount: r.amount,
      paymentDate: r.paymentDate,
      sourceBank: r.sourceBank,
      bankingRef: r.bankingRef,
      vecoRow: r.tx,
      allocationRow: r.alloc,
      property: 'P',
      landlord: 'L',
    }));
    // What VECO would hand back: JSON numbers, booleans, trimmed datetime fractions.
    const readBack = rows.map((r) => {
      const rec: Record<string, unknown> = { ...r.tx, tenantName: 'Mr A Testperson' };
      rec.dblAmount = Number(r.tx.dblAmount);
      rec.blnDeleted = false;
      rec.dtePosting = '2026-10-14T14:17:06.12';
      for (const [k, v] of Object.entries(r.alloc)) rec[`a_${k}`] = v;
      return rec;
    });
    return { items, readBack };
  };

  it('passes when identical, with before == after per bank (.12 equals .120)', () => {
    const { items, readBack } = build();
    const v = crossCheck(items, readBack);
    expect(v.ok).toBe(true);
    expect(v.rows.every((r) => r.ok && r.diffs.length === 0)).toBe(true);
    expect(v.after).toEqual(v.before);
    expect(v.before.byBank.map((b) => [b.bank, b.count, b.total])).toEqual([['HSBC', 1, '997.27'], ['MANUAL', 1, '10.50']]);
    expect(v.before.total).toBe('1007.77');
  });

  it('flags a changed dblAmount by column name', () => {
    const { items, readBack } = build();
    readBack[0]!.dblAmount = 997.28;
    const v = crossCheck(items, readBack);
    expect(v.ok).toBe(false);
    expect(v.rows.find((r) => !r.ok)!.diffs).toEqual(['dblAmount']);
    expect(v.after.total).not.toBe(v.before.total);
  });

  it('flags a missing row and a differing Allocation value', () => {
    const { items, readBack } = build();
    readBack[1]!.a_dblPercentage = 5;
    const missing = crossCheck(items, readBack.slice(1));
    expect(missing.rows[0]!.diffs).toEqual(['row missing']);
    expect(missing.rows[1]!.diffs).toEqual(['Allocation.dblPercentage']);
    expect(missing.after.count).toBe(1);
  });
});
