import { describe, expect, it } from 'vitest';
import {
  buildSlpQueries,
  matchLanded,
  parseRefreshed,
  SNAPSHOT_SQL,
  toVecoRow,
  type LandedReceipt,
  type VecoSlpRow,
} from '../../src/services/vico/landed.js';

const rc = (o: Partial<LandedReceipt> = {}): LandedReceipt => ({
  tid: 'T1234',
  receivedOn: '2026-09-11',
  amount: '50.00',
  bankCode: 'HSBC',
  ...o,
});
const vr = (o: Partial<VecoSlpRow> = {}): VecoSlpRow => ({ tid: 'T1234', date: '2026-09-11', amount: '50.00', ...o });
const run = (r: LandedReceipt[], v: VecoSlpRow[]) => matchLanded(r, v, '2026-10-16T10:00:00.000Z', null);

describe('matchLanded', () => {
  it('matches identical receipts one-for-one against VECO rows', () => {
    expect(run([rc(), rc()], [vr()]).landed).toBe(1);
    const two = run([rc(), rc()], [vr(), vr()]);
    expect(two.landed).toBe(2);
    expect(two.rows).toBe(2);
  });

  it('does not land on a 1p difference, a date +1 day, or a different tid', () => {
    expect(run([rc()], [vr({ amount: '50.01' })]).landed).toBe(0);
    expect(run([rc()], [vr({ date: '2026-09-12' })]).landed).toBe(0);
    expect(run([rc()], [vr({ tid: 'T9999' })]).landed).toBe(0);
  });

  it('normalises the tid to upper case', () => {
    expect(run([rc({ tid: 't1234' })], [vr()]).landed).toBe(1);
  });

  it('never lands unsafe tids or bad dates, but still counts them in rows', () => {
    const c = run([rc({ tid: "T12'; DROP" }), rc({ receivedOn: '11/09/2026' })], [vr(), vr({ tid: "T12'; DROP" })]);
    expect(c.landed).toBe(0);
    expect(c.rows).toBe(2);
  });

  it('groups banks with null last', () => {
    const c = run([rc({ bankCode: null }), rc({ bankCode: 'HSBC' }), rc({ bankCode: 'BARC', tid: 'T2222' })], [vr()]);
    expect(c.banks.map((b) => b.bankCode)).toEqual(['BARC', 'HSBC', null]);
    expect(c.banks.find((b) => b.bankCode === 'HSBC')!.landed + c.banks.find((b) => b.bankCode === null)!.landed).toBe(1);
  });

  it('sums exactly', () => {
    const c = run([rc({ amount: '0.10', tid: 'T1111' }), rc({ amount: '0.20', tid: 'T2222' })], []);
    expect(c.totalAmount).toBe('0.30');
    expect(c.landedAmount).toBe('0.00');
    expect(run([], []).totalAmount).toBe('0.00');
  });

  it('matches a numeric VECO amount 450 to 450.00', () => {
    const row = toVecoRow({ tid: 'T1234', txDate: '2026-09-11', amount: 450 })!;
    expect(row.amount).toBe('450.00');
    expect(run([rc({ amount: '450.00' })], [row]).landed).toBe(1);
  });

  it('drops VECO rows with a bad date or amount', () => {
    expect(toVecoRow({ tid: 'T1', txDate: 'x', amount: 1 })).toBeNull();
    expect(toVecoRow({ tid: 'T1', txDate: '2026-09-11', amount: 'abc' })).toBeNull();
  });
});

describe('parseRefreshed', () => {
  it('keeps the UK wall-clock string unchanged and rejects everything else', () => {
    expect(parseRefreshed('2026-10-16 03:30')).toBe('2026-10-16 03:30');
    expect(parseRefreshed('2026-10-16T03:30:25Z')).toBeNull();
    expect(parseRefreshed(null)).toBeNull();
    expect(parseRefreshed(42)).toBeNull();
  });
});

describe('buildSlpQueries', () => {
  it('chunks 501 tids into 2 queries', () => {
    const receipts = Array.from({ length: 501 }, (_, i) => rc({ tid: `T${String(1000 + i)}` }));
    expect(buildSlpQueries(receipts)).toHaveLength(2);
  });

  it('leaves an invalid tid out of the SQL, and returns [] when nothing is valid', () => {
    const sql = buildSlpQueries([rc(), rc({ tid: "T12'; DROP" })]).join('\n');
    expect(sql).not.toContain('DROP');
    expect(buildSlpQueries([rc({ tid: 'bad' }), rc({ receivedOn: 'nope' })])).toEqual([]);
  });

  it('bounds dates as >= min and < max+1 across a month end', () => {
    const [sql] = buildSlpQueries([rc({ receivedOn: '2026-09-28' }), rc({ receivedOn: '2026-09-30' })]);
    expect(sql).toContain("TxDate >= '2026-09-28'");
    expect(sql).toContain("TxDate < '2026-10-01'");
  });

  it('only ever builds a single read-only SELECT', () => {
    const receipts = Array.from({ length: 501 }, (_, i) => rc({ tid: `T${String(1000 + i)}` }));
    for (const sql of [...buildSlpQueries(receipts), SNAPSHOT_SQL]) {
      expect(sql.match(/\bSELECT\b/gi)).toHaveLength(1);
      expect(sql).not.toMatch(/;/);
      expect(sql).not.toMatch(/\b(INSERT|UPDATE|DELETE|MERGE|EXEC|DROP)\b/i);
      expect(sql).toMatch(/^SELECT /);
    }
  });
});
