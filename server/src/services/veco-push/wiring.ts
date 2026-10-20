/**
 * Shared VECO push wiring for both entry points (local main() and the Vercel function), so they
 * build the gateway the same way. The MCP client is stateless HTTP per call, so building it here
 * opens no connection.
 */
import { createMcpSqlClient } from '../../jobs/veco-sync/mcp-client.js';
import type { Logger } from '../../lib/logger.js';
import { loadVecoPushConfig, type VecoPushConfig } from './config.js';
import { DEMO_FAKE_SEED } from './demo-data.js';
import { createFakeVecoSql } from './fake-veco-sql.js';
import { createSqlGateway, type VecoGateway } from './gateway.js';

export type VecoPushLogger = Pick<Logger, 'info' | 'error'>;

export function createVecoPushGateway(config: VecoPushConfig): VecoGateway | null {
  return config.mode === 'mcp'
    ? createSqlGateway(createMcpSqlClient({ url: config.rwMcpUrl, clientName: 'omnia-recon-veco-push' }))
    : config.mode === 'fake'
      ? createSqlGateway(createFakeVecoSql(DEMO_FAKE_SEED))
      : null;
}

/**
 * 'throw' keeps a bad config fatal (local startup); 'off' logs the reason and disables the push
 * (Vercel, where a bad optional setting must not turn every route into a 500). Only the error
 * message is logged: loadVecoPushConfig keeps the URL out of it.
 */
export function loadVecoPushWiring(
  env: NodeJS.ProcessEnv,
  logger: VecoPushLogger,
  opts: { onInvalid: 'throw' | 'off' },
): { mode: VecoPushConfig['mode']; gateway: VecoGateway | null } {
  let config: VecoPushConfig;
  try {
    config = loadVecoPushConfig(env);
  } catch (err) {
    if (opts.onInvalid === 'throw') throw err;
    logger.error({ reason: err instanceof Error ? err.message : 'unknown' }, 'veco push off: invalid configuration');
    return { mode: 'off', gateway: null };
  }
  const gateway = createVecoPushGateway(config);
  logger.info({ mode: config.mode, configured: Boolean(gateway) }, 'veco push (test database)');
  return { mode: config.mode, gateway };
}
