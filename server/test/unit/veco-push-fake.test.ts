/** The SQL-text fake VECO: it must refuse what the real MCP refuses. No real VECO / MCP endpoint is involved. */
import { describe, expect, it } from 'vitest';
import { VecoSourceError } from '../../src/jobs/veco-sync/mcp-client.js';
import { classify, type Candidate, type TenantLookupRow } from '../../src/services/veco-push/classify.js';
import { DEMO_FAKE_SEED, DEMO_TIDS } from '../../src/services/veco-push/demo-data.js';
import { assertLocalDatabase } from '../../src/services/veco-push/demo-seed.js';
import { createFakeVecoSql, forbiddenTransactionSql } from '../../src/services/veco-push/fake-veco-sql.js';
import { createSqlGateway } from '../../src/services/veco-push/gateway.js';
import { buildRows } from '../../src/services/veco-push/row-builder.js';
import { deleteBatchSql, insertBatchSql } from '../../src/services/veco-push/sql-batches.js';

const STAFF = '11111111-2222-3333-4444-555555555555';
const hex = (n: number) => n.toString(16).toUpperCase().padStart(12, '0');
const guidSeq = () => {
  let i = 0;
  return () => `AAAAAAAA-0000-4000-8000-${hex(++i)}`;
};

function makeRows(n: number, addressTitle = "Mr O'Test (a), b") {
  const ready = Array.from({ length: n }, (_, i) => {
    const c: Candidate = {
      receiptId: `00000000-0000-4000-8000-${hex(i + 1)}`,
      tid: `T${1000 + i}`,
      amount: '10.00',
      paymentDate: '2026-10-14',
      sourceBank: 'HSBC',
      tenantName: null,
      property: null,
      landlord: null,
    };
    const l: TenantLookupRow = {
      tid: c.tid,
      tenancyFk: 'BBBBBBBB-0000-4000-8000-000000000001',
      contactFk: 'CCCCCCCC-0000-4000-8000-000000000001',
      propertyFk: 'DDDDDDDD-0000-4000-8000-000000000001',
      officeName: 'MY',
      ownerCount: 1,
      ownerFk: 'EEEEEEEE-0000-4000-8000-000000000001',
      officeCount: 1,
      officeFk: 'FFFFFFFF-0000-4000-8000-000000000001',
      delayPayment: false,
      addressTitle,
      lastDescription: null,
      lastDepartment: 'Tenancy',
    };
    return classify([c], [l], { bankOk: true, sentIds: new Set(), departments: {} }).ready[0]!;
  });
  return buildRows(ready, { at: new Date('2026-10-14T13:17:06Z'), staffFk: STAFF, uuid: guidSeq() }).rows;
}

const seed = () => ({
  staff: [{ staffPk: STAFF, email: 'a@example.test' }],
  lookups: [{ ...DEMO_FAKE_SEED.lookups[0]!, tid: 'T1000', contactFk: 'CCCCCCCC-0000-4000-8000-000000000001', addressTitle: "Mr O'Test (a), b" }],
});

const GUARD_SQL = "IF DB_NAME() <> N'Test Database Read Write' THROW 50001, N'x', 1;";

describe('fake VECO SQL', () => {
  it('rejects BEGIN TRAN, COMMIT, ROLLBACK and ROLLBACK TRAN with 3902 and writes nothing', async () => {
    const fake = createFakeVecoSql(seed());
    const good = insertBatchSql(makeRows(1));
    for (const extra of ['BEGIN TRAN;', 'BEGIN TRANSACTION;', 'COMMIT;', 'COMMIT TRAN;', 'ROLLBACK;', 'ROLLBACK TRAN;']) {
      const sql = good.replace('BEGIN TRY', `BEGIN TRY ${extra}`);
      await expect(fake.executeBatch(sql)).rejects.toThrow('(3902)');
      await expect(fake.executeBatch(sql)).rejects.toBeInstanceOf(VecoSourceError);
    }
    expect(fake.transactions.size).toBe(0);
    expect(fake.allocations.size).toBe(0);
  });

  it('allows ROLLBACK TRANSACTION recon_push and ignores those words inside string literals', () => {
    expect(forbiddenTransactionSql('IF XACT_STATE() = 1 ROLLBACK TRANSACTION recon_push;')).toBe(false);
    expect(forbiddenTransactionSql("SELECT N'COMMIT (BEGIN TRAN) ROLLBACK' /* COMMIT */")).toBe(false);
    expect(forbiddenTransactionSql('COMMIT')).toBe(true);
    expect(forbiddenTransactionSql('ROLLBACK TRAN')).toBe(true);
  });

  it('returns rows only for SQL that starts with SELECT', async () => {
    const fake = createFakeVecoSql(seed());
    expect(await fake.queryRows('SELECT /* omnia:db */ DB_NAME() AS db')).toEqual([{ db: 'Test Database Read Write' }]);
    expect(await fake.queryRows('/* x */ SELECT /* omnia:db */ DB_NAME() AS db')).toEqual([]);
    await expect(fake.queryRows('SELECT 1')).rejects.toThrow('fake VECO: unsupported query');
  });

  it('refuses a write batch without the leading guard', async () => {
    const fake = createFakeVecoSql(seed());
    const sql = insertBatchSql(makeRows(1));
    await expect(fake.executeBatch(sql.slice(sql.indexOf('\n') + 1))).rejects.toThrow('must start with the DB_NAME() guard');
    await expect(fake.executeBatch(`${GUARD_SQL}\n/* omnia:insert */`)).rejects.toThrow('guard');
  });

  it('fails with 50001 on another database', async () => {
    const fake = createFakeVecoSql({ ...seed(), dbName: 'Veco-onesystem' });
    await expect(fake.executeBatch(insertBatchSql(makeRows(1)))).rejects.toThrow('(50001)');
    expect(fake.transactions.size).toBe(0);
  });

  it('insert, read back, duplicate (50002), delete and count through createSqlGateway', async () => {
    const fake = createFakeVecoSql(seed());
    const gw = createSqlGateway(fake);
    const rows = makeRows(2);
    const tx = rows.map((r) => r.transactionPk);
    const al = rows.map((r) => r.allocationPk);
    await gw.assertTargetDb();
    expect(await gw.findStaffByEmail('A@example.test')).toEqual([STAFF.toUpperCase()]);
    expect((await gw.lookupTenants(['T1000']))[0]!.addressTitle).toBe("Mr O'Test (a), b");

    await gw.insertReceipts(rows);
    expect(fake.transactions.size).toBe(2);
    expect(fake.allocations.size).toBe(2);
    const back = await gw.readBack(tx, al);
    expect(back).toHaveLength(2);
    expect(String(back[0]!.memDescription)).toContain("Rent Received  From Mr O'Test (a), b");
    expect(back[0]!.a_AllocationPK).toBeTruthy();
    expect((await gw.countRemaining(tx, al)).transactions).toBe(2);

    await expect(gw.insertReceipts(rows)).rejects.toThrow('(50002)');
    expect(fake.transactions.size).toBe(2);

    await gw.deleteReceipts(tx, al);
    expect(await gw.countRemaining(tx, al)).toEqual({ transactions: 0, allocations: 0, total: '0.00' });
    expect(deleteBatchSql(tx, al)).toContain('50006');
  });

  it('DEMO_FAKE_SEED resolves T5755, T6008, T2822 and classify marks all three ready', async () => {
    const fake = createFakeVecoSql(DEMO_FAKE_SEED);
    const gw = createSqlGateway(fake);
    const lookups = await gw.lookupTenants([...DEMO_TIDS]);
    expect(lookups.map((l) => l.tid).sort()).toEqual(['T2822', 'T5755', 'T6008']);
    const cands: Candidate[] = DEMO_TIDS.map((tid, i) => ({
      receiptId: `00000000-0000-4000-8000-${hex(i + 1)}`,
      tid,
      amount: '1.00',
      paymentDate: '2026-10-14',
      sourceBank: 'MANUAL',
      tenantName: null,
      property: null,
      landlord: null,
    }));
    const out = classify(cands, lookups, { bankOk: true, sentIds: new Set(), departments: {} });
    expect(out.held).toEqual([]);
    expect(out.ready).toHaveLength(3);
  });

  it('assertLocalDatabase refuses anything but localhost:5433', () => {
    expect(() => assertLocalDatabase('postgres://u:p@localhost:5433/db')).not.toThrow();
    expect(() => assertLocalDatabase('postgres://u:p@127.0.0.1:5433/db')).not.toThrow();
    expect(() => assertLocalDatabase('postgres://u:p@localhost:5432/db')).toThrow();
    expect(() => assertLocalDatabase('postgres://u:p@db.example.invalid:5433/db')).toThrow();
    expect(() => assertLocalDatabase('not a url')).toThrow();
  });
});
