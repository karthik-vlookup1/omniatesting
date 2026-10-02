/**
 * Seeds synthetic tenancies through the real sync code (no Veco call). Used by the e2e tests:
 *   node --import tsx server/test/fixtures/veco-seed.ts <count>
 */
import { loadConfig } from '../../src/config/env.js';
import { createPool } from '../../src/db/pool.js';
import { createLogger } from '../../src/lib/logger.js';
import { syncTenancies } from '../../src/jobs/veco-sync/sync.js';
import { vecoRow, vecoRows } from './veco-rows.js';

const config = loadConfig();
const pool = createPool({ databaseUrl: config.databaseUrl, hashKey: config.hashKey, max: 1 }, createLogger({ level: 'silent' }));
const count = Number(process.argv[2] ?? 5);
const rows = [...vecoRows(count - 1), vecoRow(count, { tenantName: 'Zara Q Sample', ni: 'CE123456D' })];

syncTenancies(pool, rows, { keys: { hashKey: config.hashKey, encryptionKey: config.encryptionKey }, force: true })
  .then((s) => process.stdout.write(`seeded ${s.tenancies.inserted + s.tenancies.updated} tenancies\n`))
  .catch((err: unknown) => {
    process.stderr.write(`veco-seed failed: ${err instanceof Error ? err.message : String(err)}\n`);
    process.exitCode = 1;
  })
  .finally(() => void pool.end());
