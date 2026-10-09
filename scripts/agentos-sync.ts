/**
 * Read-only agentOS v4 -> agentos_tenants sync. Run: npm run agentos:sync -- [--dry-run] [--replace-seed]
 * Needs DATABASE_URL, HASH_KEY, ENCRYPTION_KEY, SESSION_SECRET plus AGENTOS_API_KEY, AGENTOS_BASE_URL, AGENTOS_DEPOSIT_TO.
 * Prints counts and flag counts only: never names, emails or OIDs (GDPR).
 */
import { loadConfig } from '../server/src/config/env.js';
import { createPool } from '../server/src/db/pool.js';
import { SYNC_FLAGS } from '../server/src/domain/agentos/types.js';
import { createLogger } from '../server/src/lib/logger.js';
import { createAgentosClient, loadAgentosApiConfig } from '../server/src/services/agentos/api-client.js';
import { syncAgentosTenants } from '../server/src/services/agentos/sync.service.js';

const out = (line: string) => process.stdout.write(`${line}\n`);
const USAGE = 'Usage: npm run agentos:sync -- [--dry-run] [--replace-seed]';

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const unknown = args.filter((a) => a !== '--dry-run' && a !== '--replace-seed');
  if (unknown.length > 0) {
    process.stderr.write(`Unknown option(s): ${unknown.join(' ')}\n${USAGE}\n`);
    process.exitCode = 1;
    return;
  }
  const dryRun = args.includes('--dry-run');
  const replaceSeed = args.includes('--replace-seed');
  const config = loadConfig();
  const api = loadAgentosApiConfig(process.env);
  const pool = createPool({ databaseUrl: config.databaseUrl, hashKey: config.hashKey, max: 2 }, createLogger({ level: 'info' }));
  try {
    const r = await syncAgentosTenants(pool, createAgentosClient(api), {
      dryRun,
      replaceSeed,
      depositTo: process.env['AGENTOS_DEPOSIT_TO'],
      managedBy: api.managedBy,
    });
    if (r.dryRun) out('DRY RUN (rolled back)');
    out(`fetched: tenants=${r.fetched.tenants} tenancies=${r.fetched.tenancies} deposits=${r.fetched.deposits}`);
    out(`created=${r.created} updated=${r.updated} unchanged=${r.unchanged} seedDeleted=${r.seedDeleted} missingFromApi=${r.missingFromApi}`);
    out(`flags: ${SYNC_FLAGS.map((f) => `${f}=${r.flags[f]}`).join(' ')}`);
  } finally {
    await pool.end();
  }
}

main().catch((err: unknown) => {
  process.stderr.write(`${err instanceof Error ? err.message : String(err)}\n`);
  process.exitCode = 1;
});
