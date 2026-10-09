/** agentOS API sync into agentos_tenants: dry run, real run, idempotence, no-null-overwrite, seed replacement, matcher. Fixture JSON only. */
import { readFileSync } from 'node:fs';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { loadConfig } from '../../src/config/env.js';
import { createPool, type Pool } from '../../src/db/pool.js';
import { decideMatch, type MatchCandidate } from '../../src/domain/agentos/match.js';
import { AgentosSyncError } from '../../src/domain/agentos/types.js';
import { createLogger } from '../../src/lib/logger.js';
import { upsertUser } from '../../src/services/auth.service.js';
import { seedAgentosTenants } from '../../src/services/agentos/seed.js';
import { syncAgentosTenants } from '../../src/services/agentos/sync.service.js';
import { fixtureClient, fixtureTenants } from '../fixtures/agentos/api/fixture-client.js';

const config = loadConfig();
let pool: Pool;
const DEPOSIT_TO = 'TEST CLIENT ACCOUNT';
const base = { dryRun: false, replaceSeed: false, depositTo: DEPOSIT_TO };
const ANA = 'aaaa-0000-0000-0011';

async function clean() {
  await pool.query('TRUNCATE agentos_intake_batches CASCADE');
  await pool.query('DELETE FROM agentos_journal_transfers');
  await pool.query('DELETE FROM agentos_sync_runs');
  await pool.query('DELETE FROM agentos_tenants');
  await pool.query("DELETE FROM audit_log WHERE table_name IN ('agentos_intake_lines', 'agentos_intake_batches', 'agentos_tenants')");
}
const count = async () => Number(((await pool.query('SELECT count(*) AS n FROM agentos_tenants')).rows[0] as { n: string }).n);

beforeAll(async () => {
  pool = createPool({ databaseUrl: config.databaseUrl, hashKey: config.hashKey, max: 4 }, createLogger({ level: 'silent' }));
  await clean();
});

afterAll(async () => {
  await clean();
  await pool?.end();
});

describe('agentOS API sync', () => {
  it('refuses to run without a deposit-to value, dry or real', async () => {
    for (const dryRun of [true, false]) {
      for (const depositTo of [undefined, '', '  ']) {
        const err = await syncAgentosTenants(pool, fixtureClient(), { ...base, dryRun, depositTo }).catch((e: unknown) => e);
        expect(err).toBeInstanceOf(AgentosSyncError);
        expect((err as Error).message).toContain('AGENTOS_DEPOSIT_TO');
      }
    }
    expect(await count()).toBe(0);
  });

  it('dry run reports 10 created and leaves nothing behind', async () => {
    const r = await syncAgentosTenants(pool, fixtureClient(), { ...base, dryRun: true });
    expect(r).toMatchObject({ dryRun: true, created: 10, updated: 0, unchanged: 0, seedDeleted: 0 });
    expect(r.fetched).toEqual({ tenants: 10, tenancies: 8, deposits: 7 });
    expect(await count()).toBe(0);
    expect(Number(((await pool.query('SELECT count(*) AS n FROM agentos_sync_runs')).rows[0] as { n: string }).n)).toBe(0);
  });

  it('real sync stores 10 api rows, joint TIDs share, no_tid rows have null tid', async () => {
    const r = await syncAgentosTenants(pool, fixtureClient(), base);
    expect(r).toMatchObject({ created: 10, updated: 0, unchanged: 0, missingFromApi: 0 });
    expect(r.flags.no_tid).toBe(2);
    const t = await pool.query("SELECT count(*) AS n FROM agentos_tenants WHERE tid = '9701' AND source = 'api'");
    expect(Number((t.rows[0] as { n: string }).n)).toBe(3);
    const nt = await pool.query("SELECT sync_flags, tid FROM agentos_tenants WHERE 'no_tid' = ANY(sync_flags)");
    expect(nt.rows).toHaveLength(2);
    expect(nt.rows.every((x: { tid: string | null }) => x.tid === null)).toBe(true);
    const ana = await pool.query<{ deposit_to: string; managed_by: string; source: string; phone: string }>(
      'SELECT deposit_to, managed_by, source, phone FROM agentos_tenants WHERE agentos_oid = $1',
      [ANA],
    );
    expect(ana.rows[0]).toEqual({ deposit_to: DEPOSIT_TO, managed_by: 'Investing Solutions', source: 'api', phone: '07700900001' });
    const runs = await pool.query('SELECT counts FROM agentos_sync_runs');
    expect(runs.rows).toHaveLength(1);
  });

  it('re-sync of the same data changes nothing', async () => {
    const r = await syncAgentosTenants(pool, fixtureClient(), base);
    expect(r).toMatchObject({ created: 0, updated: 0, unchanged: 10 });
  });

  it('null email and forename from the API never overwrite stored values', async () => {
    const variant = fixtureTenants().map((t) => (t.OID === ANA ? { ...t, EmailAddress: null, Forename: null } : t));
    await syncAgentosTenants(pool, fixtureClient(variant), base);
    const { rows } = await pool.query<{ email: string; forename: string; tid: string }>(
      'SELECT email, forename, tid FROM agentos_tenants WHERE agentos_oid = $1',
      [ANA],
    );
    expect(rows[0]).toEqual({ email: 'ana.testa@example.test', forename: '9701 Ana', tid: '9701' });
    const again = await syncAgentosTenants(pool, fixtureClient(variant), base);
    expect(again).toMatchObject({ created: 0, updated: 0, unchanged: 10 });
  });

  it('counts api rows missing from the feed without deleting them', async () => {
    const r = await syncAgentosTenants(pool, fixtureClient(fixtureTenants().slice(0, 9)), base);
    expect(r.missingFromApi).toBe(1);
    expect(await count()).toBe(10);
  });

  it('matcher picks the right joint tenant from DB candidates', async () => {
    const { rows } = await pool.query<{ id: string; tid: string; forename: string; surname: string; deposit_to: string; agentos_ref: string | null }>(
      "SELECT id, tid, forename, surname, deposit_to, agentos_ref FROM agentos_tenants WHERE tid = ANY('{9701}')",
    );
    const candidates: MatchCandidate[] = rows.map((x) => ({
      id: x.id,
      tid: x.tid,
      forename: x.forename,
      surname: x.surname,
      depositTo: x.deposit_to,
      agentosRef: x.agentos_ref ?? '',
    }));
    expect(candidates).toHaveLength(3);
    const d = decideMatch({ tid: '9701', payerName: 'Bo Testa', depositTo: DEPOSIT_TO }, candidates);
    expect(d.status).toBe('matched');
    expect(candidates.find((c) => c.id === d.tenantId)?.forename).toBe('9701 Bo');
  });

  it('seed rows block the sync unless replaceSeed, which deletes the 12 seed rows', async () => {
    await clean();
    const csv = readFileSync(new URL('../../../fixtures/agentos/tenants.csv', import.meta.url), 'utf8');
    await seedAgentosTenants(pool, csv);
    const err = await syncAgentosTenants(pool, fixtureClient(), base).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(AgentosSyncError);
    expect((err as Error).message).toContain('--replace-seed');
    expect(await count()).toBe(12);
    const r = await syncAgentosTenants(pool, fixtureClient(), { ...base, replaceSeed: true });
    expect(r).toMatchObject({ seedDeleted: 12, created: 10 });
    expect(await count()).toBe(10);
  });

  it('replaceSeed refuses while an intake line references a seed row', async () => {
    await clean();
    const csv = readFileSync(new URL('../../../fixtures/agentos/tenants.csv', import.meta.url), 'utf8');
    await seedAgentosTenants(pool, csv);
    const email = `sync-${Date.now()}@example.test`;
    await upsertUser(pool, { email, fullName: 'Sync Tester', role: 'staff', password: 'correct-horse-battery' });
    const userId = (await pool.query<{ id: string }>('SELECT id FROM app_users WHERE lower(email) = $1', [email])).rows[0]!.id;
    const tenant = (await pool.query<{ id: string }>('SELECT id FROM agentos_tenants LIMIT 1')).rows[0]!.id;
    const batch = await pool.query<{ id: string }>(
      `INSERT INTO agentos_intake_batches (file_name, file_sha256, rows_total, amount_total_pence, period_from, period_to, uploaded_by)
       VALUES ('sync.csv', repeat('a', 64), 1, 100, '2026-01-01', '2026-01-01', $1) RETURNING id`,
      [userId],
    );
    await pool.query(
      `INSERT INTO agentos_intake_lines (batch_id, line_no, received_on, payer_name, amount_pence, payment_type, deposit_to, agentos_tenant_id)
       VALUES ($1, 2, '2026-01-01', 'Test Payer', 100, 'BACS', 'X', $2)`,
      [batch.rows[0]!.id, tenant],
    );
    const err = await syncAgentosTenants(pool, fixtureClient(), { ...base, replaceSeed: true }).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(AgentosSyncError);
    expect((err as Error).message).toContain('referenced');
    expect(await count()).toBe(12);
  });
});
