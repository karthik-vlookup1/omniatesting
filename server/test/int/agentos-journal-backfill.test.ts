/**
 * Migration 019 ledger backfill on pre-existing data: build a scratch database at 018 (migrations 001-018 copied
 * to a temp dir and run through runMigrations), insert two-entry transfers in the 015 shape, then apply 019.
 */
import { copyFile, mkdtemp, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { loadConfig } from '../../src/config/env.js';
import { MIGRATIONS_DIR, resetDatabase, runMigrations } from '../../src/db/migrate.js';

const url = new URL(loadConfig().databaseUrl);
url.pathname = '/omnia_j019_backfill_test';
const scratchUrl = url.toString();
let dir = '';
let client: pg.Client;

beforeAll(async () => {
  dir = await mkdtemp(path.join(tmpdir(), 'omnia-mig-'));
  for (const f of (await readdir(MIGRATIONS_DIR)).filter((n) => /^\d{3}_.*\.sql$/.test(n) && n.slice(0, 3) <= '018')) {
    await copyFile(path.join(MIGRATIONS_DIR, f), path.join(dir, f));
  }
  await resetDatabase(scratchUrl);
  await runMigrations(scratchUrl, { dir });
  client = new pg.Client({ connectionString: scratchUrl });
  await client.connect();
});

afterAll(async () => {
  await client?.end();
  if (dir) await rm(dir, { recursive: true, force: true });
});

describe('019 backfill', () => {
  it('gives every pre-existing transfer one ledger transaction whose postings equal its entries', async () => {
    const u = (
      await client.query<{ id: string }>(
        "INSERT INTO app_users (email, full_name, role, password_hash) VALUES ('bf@example.test', 'Bf', 'accounts', 'x') RETURNING id",
      )
    ).rows[0]!.id;
    const seeded: { id: string; from: string; to: string; amount: number; type: string }[] = [];
    for (const [from, to, amount, type] of [
      ['9201', '9202', 12345, 'Rent'],
      ['9203', '9201', 500, 'Deposit'],
    ] as const) {
      const t = await client.query<{ id: string }>(
        `INSERT INTO agentos_journal_transfers (from_tid, to_tid, amount_pence, description, nominal_code, account_type, created_by)
         VALUES ($1, $2, $3, 'Old move', '1100', $4, $5) RETURNING id`,
        [from, to, amount, type, u],
      );
      const id = t.rows[0]!.id;
      await client.query('BEGIN');
      await client.query(
        `INSERT INTO agentos_journal_entries (transfer_id, side, tid, person, branch, property, amount_pence)
         VALUES ($1, 'from', $2, 'p', 'b', 'r', $4), ($1, 'to', $3, 'p', 'b', 'r', $5)`,
        [id, from, to, -amount, amount],
      );
      await client.query('COMMIT');
      seeded.push({ id, from, to, amount, type });
    }

    const res = await runMigrations(scratchUrl, { dir: MIGRATIONS_DIR });
    expect(res.applied).toEqual(['019_agentos_journal_multirow.sql']);

    for (const t of seeded) {
      const tx = await client.query<{ id: string }>(
        "SELECT id FROM ledger_transactions WHERE kind = 'journal_transfer' AND source_id = $1",
        [t.id],
      );
      expect(tx.rows).toHaveLength(1);
      const p = await client.query<{ account_ref: string; account_type: string; amount_pence: string }>(
        'SELECT account_ref, account_type, amount_pence FROM ledger_postings WHERE transaction_id = $1 ORDER BY amount_pence',
        [tx.rows[0]!.id],
      );
      expect(p.rows.map((r) => [r.account_ref, r.account_type, Number(r.amount_pence)])).toEqual([
        [t.from, t.type, -t.amount],
        [t.to, t.type, t.amount],
      ]);
      const e = await client.query<{ line_no: number; side: string; account_type: string }>(
        'SELECT line_no, side, account_type FROM agentos_journal_entries WHERE transfer_id = $1 ORDER BY line_no',
        [t.id],
      );
      expect(e.rows.map((r) => [r.line_no, r.side, r.account_type])).toEqual([
        [1, 'from', t.type],
        [2, 'to', t.type],
      ]);
    }
    const n = await client.query<{ n: string }>('SELECT count(*) AS n FROM ledger_transactions');
    expect(Number(n.rows[0]!.n)).toBe(2);
  });
});
