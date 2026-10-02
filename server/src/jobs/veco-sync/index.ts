/**
 * Veco tenancy sync: configuration, the nightly schedule, and a one-off CLI.
 *
 *   VECO_MCP_URL     Veco read-only SQL MCP endpoint, including its key. Unset = sync disabled.
 *   VECO_SYNC_HOUR   Local hour (0-23) for the nightly run; default 4, after the 03:30 warehouse refresh.
 *
 *   tsx server/src/jobs/veco-sync/index.ts [--dry-run] [--force]
 */
import { z } from 'zod';
import { loadConfig } from '../../config/env.js';
import { createPool, type Pool } from '../../db/pool.js';
import { isMainModule } from '../../lib/is-main.js';
import { createLogger, type Logger } from '../../lib/logger.js';
import type { ProtectionKeys } from '../../lib/crypto.js';
import { createMcpSqlSource, type SqlSource } from './mcp-client.js';
import { fetchActiveTenancies } from './source.js';
import { syncTenancies, type SyncSummary } from './sync.js';

export { SyncRefusedError, type SyncSummary } from './sync.js';
export { VecoSourceError, type SqlSource } from './mcp-client.js';

const VecoEnvSchema = z.object({
  VECO_MCP_URL: z
    .string()
    .trim()
    .optional()
    .transform((v) => (v === '' ? undefined : v))
    .refine((v) => v === undefined || /^https:\/\//.test(v), 'must be an https:// URL'),
  VECO_SYNC_HOUR: z.coerce.number().int().min(0).max(23).default(4),
});

export interface VecoConfig {
  mcpUrl?: string;
  syncHour: number;
}

export function loadVecoConfig(env: NodeJS.ProcessEnv = process.env): VecoConfig {
  const parsed = VecoEnvSchema.safeParse(env);
  if (!parsed.success) {
    // Never echo the value: the URL carries a key.
    const problems = parsed.error.issues.map((i) => `${i.path.join('.')} ${i.message}`).join('; ');
    throw new Error(`Invalid Veco configuration: ${problems}`);
  }
  return { mcpUrl: parsed.data.VECO_MCP_URL, syncHour: parsed.data.VECO_SYNC_HOUR };
}

export interface VecoSyncRunner {
  readonly enabled: boolean;
  run(opts?: { actor?: string; dryRun?: boolean; force?: boolean }): Promise<SyncSummary>;
}

/** Binds pool, keys and a source together. `source` is injectable so tests never call Veco. */
export function createVecoSyncRunner(pool: Pool, keys: ProtectionKeys, source: SqlSource | null): VecoSyncRunner {
  return {
    enabled: source !== null,
    async run(opts = {}) {
      if (!source) throw new Error('Veco sync is not configured (VECO_MCP_URL is not set)');
      const rows = await fetchActiveTenancies(source);
      return syncTenancies(pool, rows, { keys, ...opts });
    },
  };
}

export function sourceFromConfig(cfg: VecoConfig): SqlSource | null {
  return cfg.mcpUrl ? createMcpSqlSource({ url: cfg.mcpUrl }) : null;
}

/** Milliseconds from `now` until the next `hour`:00 local time. */
export function msUntilNextRun(hour: number, now: Date = new Date()): number {
  const next = new Date(now);
  next.setHours(hour, 0, 0, 0);
  if (next.getTime() <= now.getTime()) next.setDate(next.getDate() + 1);
  return next.getTime() - now.getTime();
}

/** Runs the sync every night at `hour`. Returns a stop function. */
export function scheduleNightly(runner: VecoSyncRunner, hour: number, logger: Logger): () => void {
  let timer: NodeJS.Timeout | undefined;
  const arm = () => {
    timer = setTimeout(() => {
      runner
        .run()
        .then((s) => logger.info({ vecoSync: compact(s) }, 'veco sync finished'))
        .catch((err: unknown) => logger.error({ err: errorMessage(err) }, 'veco sync failed'))
        .finally(arm);
    }, msUntilNextRun(hour));
    timer.unref();
  };
  arm();
  return () => clearTimeout(timer);
}

/** The summary without the rejected-row list, for one log line. */
export function compact(s: SyncSummary) {
  return { ...s, rejected: s.rejected.length };
}

function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

async function main(argv: string[]): Promise<void> {
  const config = loadConfig();
  const veco = loadVecoConfig();
  const logger = createLogger({ level: config.logLevel, pretty: config.nodeEnv === 'development' });
  const pool = createPool({ databaseUrl: config.databaseUrl, hashKey: config.hashKey, max: 2 }, logger);
  try {
    const runner = createVecoSyncRunner(
      pool,
      { hashKey: config.hashKey, encryptionKey: config.encryptionKey },
      sourceFromConfig(veco),
    );
    const summary = await runner.run({ dryRun: argv.includes('--dry-run'), force: argv.includes('--force') });
    process.stdout.write(`${JSON.stringify(summary, null, 2)}\n`);
  } finally {
    await pool.end();
  }
}

if (isMainModule(import.meta.url)) {
  main(process.argv.slice(2)).catch((err: unknown) => {
    process.stderr.write(`veco-sync: ${errorMessage(err)}\n`);
    process.exit(1);
  });
}
