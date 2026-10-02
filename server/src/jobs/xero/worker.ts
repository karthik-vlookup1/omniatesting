/**
 * Background Xero outbox worker: every few minutes, pushes ready invoice batches (new, or failed past
 * their backoff) through the bridge. It only runs unattended against the Demo target; a live target
 * always needs a person to press "Send to Xero" and confirm.
 */
import type { Pool } from '../../db/pool.js';
import { actorDb, SYSTEM_ACTOR } from '../../db/context.js';
import type { Logger } from '../../lib/logger.js';
import type { XeroBridge, XeroConfig } from '../../services/xero/bridge.js';
import { readyCount, runOutbox } from '../../services/xero/xero.service.js';

export function scheduleXeroWorker(
  pool: Pool,
  bridge: XeroBridge | null,
  config: XeroConfig,
  logger: Logger,
  everyMs = 5 * 60 * 1000,
): () => void {
  if (!bridge || config.targetEnv !== 'demo') {
    logger.info({ configured: Boolean(bridge), targetEnv: config.targetEnv }, 'xero worker not scheduled');
    return () => {};
  }
  let running = false;
  const tick = async () => {
    if (running) return;
    running = true;
    try {
      if ((await readyCount(pool)) === 0) return;
      const r = await runOutbox(actorDb(pool, SYSTEM_ACTOR), bridge);
      logger.info(
        {
          attempted: r.attempted,
          sent: r.sent,
          failed: r.failed,
          dead: r.dead,
        },
        'xero outbox run',
      );
    } catch (err) {
      logger.error({ err }, 'xero outbox run failed');
    } finally {
      running = false;
    }
  };
  const timer = setInterval(() => void tick(), everyMs);
  timer.unref();
  return () => clearInterval(timer);
}
