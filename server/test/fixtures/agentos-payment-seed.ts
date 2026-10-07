/**
 * Seeds the synthetic agentOS tenants (via the reassign seed) plus one active bank account for the payment e2e:
 *   node --import tsx server/test/fixtures/agentos-payment-seed.ts
 */
import { spawnSync } from 'node:child_process';
import { loadConfig } from '../../src/config/env.js';
import { createPool } from '../../src/db/pool.js';
import { createLogger } from '../../src/lib/logger.js';

const config = loadConfig();
const pool = createPool({ databaseUrl: config.databaseUrl, hashKey: config.hashKey, max: 1 }, createLogger({ level: 'silent' }));

async function main(): Promise<void> {
  const seed = new URL('./agentos-reassign-seed.ts', import.meta.url);
  const res = spawnSync(process.execPath, ['--import', 'tsx', seed.pathname.replace(/^\/([A-Za-z]:)/, '$1')], {
    encoding: 'utf8',
    env: process.env,
  });
  if (res.status !== 0) throw new Error(`reassign seed failed:\n${res.stdout}${res.stderr}`);
  await pool.query(
    `INSERT INTO bank_accounts (code, bank_name, account_name, is_active)
     VALUES ('E2E_CLIENT', 'Synthetic Bank', 'Synthetic Client Account', true)
     ON CONFLICT (code) DO UPDATE SET account_name = EXCLUDED.account_name, is_active = true`,
  );
  process.stdout.write('seeded agentos tenants and E2E_CLIENT bank account\n');
}

main()
  .catch((err: unknown) => {
    process.stderr.write(`agentos-payment-seed failed: ${err instanceof Error ? err.message : String(err)}\n`);
    process.exitCode = 1;
  })
  .finally(() => void pool.end());
