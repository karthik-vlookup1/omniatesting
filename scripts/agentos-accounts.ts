/**
 * agentOS "Will deposit to" accounts. Run: npm run agentos:accounts -- --list | --add-alias <CODE> <text>
 * Needs DATABASE_URL, HASH_KEY, ENCRYPTION_KEY, SESSION_SECRET. Prints bank codes and alias text only.
 */
import { loadConfig } from '../server/src/config/env.js';
import { actorDb } from '../server/src/db/context.js';
import { createPool } from '../server/src/db/pool.js';
import { createLogger } from '../server/src/lib/logger.js';
import { addDepositAlias, listDepositAccounts } from '../server/src/services/agentos/accounts.service.js';

const out = (line: string) => process.stdout.write(`${line}\n`);
const USAGE = 'Usage: npm run agentos:accounts -- --list | --add-alias <CODE> <text>';

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const isList = args.length === 1 && args[0] === '--list';
  const isAdd = args.length === 3 && args[0] === '--add-alias';
  if (!isList && !isAdd) {
    process.stderr.write(`${args.length === 0 ? 'Missing option' : `Unknown option(s): ${args.join(' ')}`}\n${USAGE}\n`);
    process.exitCode = 1;
    return;
  }
  const config = loadConfig();
  const pool = createPool({ databaseUrl: config.databaseUrl, hashKey: config.hashKey, max: 2 }, createLogger({ level: 'info' }));
  try {
    if (isList) {
      for (const a of await listDepositAccounts(pool)) {
        out(`${a.code}\t${a.bankName}\taliases: ${a.aliases.join(', ') || '-'}`);
      }
    } else {
      const r = await addDepositAlias(actorDb(pool, 'script:agentos-accounts'), args[1]!, args[2]!);
      out(`added alias "${r.alias}" -> ${r.code}`);
    }
  } finally {
    await pool.end();
  }
}

main().catch((err: unknown) => {
  process.stderr.write(`${err instanceof Error ? err.message : String(err)}\n`);
  process.exitCode = 1;
});
