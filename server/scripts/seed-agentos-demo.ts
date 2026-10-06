/** Dev only: seed the synthetic 5 Aug 2026 agentOS demo tenants. Run: npx tsx server/scripts/seed-agentos-demo.ts */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { loadConfig } from '../src/config/env.js';
import { createPool } from '../src/db/pool.js';
import { createLogger } from '../src/lib/logger.js';
import { seedAgentosTenants } from '../src/services/agentos/seed.js';

const out = (line: string) => process.stdout.write(`${line}\n`);

async function main(): Promise<void> {
  if (process.env['NODE_ENV'] === 'production') throw new Error('Refusing to seed demo data in production');
  const config = loadConfig();
  const host = new URL(config.databaseUrl).hostname.replace(/^\[|\]$/g, '');
  if (!['localhost', '127.0.0.1', '::1'].includes(host) && !process.argv.includes('--allow-remote')) {
    throw new Error(`Refusing to seed: DATABASE_URL host "${host}" is not local. Pass --allow-remote to override.`);
  }
  const pool = createPool({ databaseUrl: config.databaseUrl, hashKey: config.hashKey, max: 2 }, createLogger({ level: 'info' }));
  try {
    const csv = readFileSync(new URL('../../fixtures/agentos/demo-2026-08-05/tenants.csv', import.meta.url), 'utf8');
    const r = await seedAgentosTenants(pool, csv);
    out(`Seeded agentOS demo tenants: rows=${r.rows}, created=${r.created}, updated=${r.updated}, linked=${r.linked}`);
    const bank = fileURLToPath(new URL('../../fixtures/agentos/demo-2026-08-05/bank-formatted.csv', import.meta.url));
    out(`Bank file: ${bank}`);
    out('Upload it at /agentos');
  } finally {
    await pool.end();
  }
}

main().catch((err: unknown) => {
  process.stderr.write(`${err instanceof Error ? err.message : String(err)}\n`);
  process.exitCode = 1;
});
