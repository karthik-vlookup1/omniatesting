/**
 * Seeds the synthetic agentOS tenants for the e2e test and clears intake batches:
 *   node --import tsx server/test/fixtures/agentos-reassign-seed.ts
 */
import { readFileSync } from 'node:fs';
import { loadConfig } from '../../src/config/env.js';
import { createPool } from '../../src/db/pool.js';
import { createLogger } from '../../src/lib/logger.js';
import { seedAgentosTenants } from '../../src/services/agentos/seed.js';

const config = loadConfig();
const pool = createPool({ databaseUrl: config.databaseUrl, hashKey: config.hashKey, max: 1 }, createLogger({ level: 'silent' }));

async function main(): Promise<void> {
  await pool.query('TRUNCATE agentos_intake_batches CASCADE');
  await pool.query('DELETE FROM agentos_tenants');
  const csv = readFileSync(new URL('./agentos/match-tenants.csv', import.meta.url), 'utf8');
  await seedAgentosTenants(pool, csv);
  process.stdout.write('seeded agentos tenants\n');
}

main()
  .catch((err: unknown) => {
    process.stderr.write(`agentos-reassign-seed failed: ${err instanceof Error ? err.message : String(err)}\n`);
    process.exitCode = 1;
  })
  .finally(() => void pool.end());
