/**
 * Rent charge generation: for every tenancy with a rent account (charges_from set), drops stale
 * charges and generates any missing ones up to today. Runs nightly (after the Veco sync) and on
 * demand from POST /api/rent/generate. One tenancy failing is logged and does not stop the rest.
 */
import type { Pool } from '../db/pool.js';
import { withTransaction } from '../db/context.js';
import type { Logger } from '../lib/logger.js';
import { msUntilNextRun } from './veco-sync/index.js';

export const JOB_ACTOR = 'job:generate-charges';
const RUN_HOUR = 5; // Veco sync runs at 4

export interface GenerationSummary {
  tenancies: number;
  created: number;
  failed: number;
}

export async function runChargeGeneration(pool: Pool, logger?: Logger): Promise<GenerationSummary> {
  const { rows } = await pool.query<{ id: string; tid: string }>(
    'SELECT id, tid FROM tenancies WHERE charges_from IS NOT NULL ORDER BY tid',
  );
  const summary: GenerationSummary = { tenancies: 0, created: 0, failed: 0 };
  for (const t of rows) {
    try {
      const n = await withTransaction(pool, JOB_ACTOR, async (c) => {
        const r = await c.query<{ n: number }>('SELECT refresh_rent_charges($1) AS n', [t.id]);
        return r.rows[0]?.n ?? 0;
      });
      summary.tenancies += 1;
      summary.created += n;
    } catch (err) {
      summary.failed += 1;
      logger?.error({ err, tid: t.tid }, 'charge generation failed for a tenancy');
    }
  }
  return summary;
}

/** Runs the generation every night at 05:00 local time. Returns a stop function. */
export function scheduleChargeGeneration(pool: Pool, logger: Logger): () => void {
  let timer: NodeJS.Timeout | undefined;
  const arm = () => {
    timer = setTimeout(() => {
      runChargeGeneration(pool, logger)
        .then((s) => logger.info({ chargeGeneration: s }, 'charge generation finished'))
        .catch((err: unknown) => logger.error({ err }, 'charge generation failed'))
        .finally(arm);
    }, msUntilNextRun(RUN_HOUR));
    timer.unref();
  };
  arm();
  return () => clearTimeout(timer);
}
