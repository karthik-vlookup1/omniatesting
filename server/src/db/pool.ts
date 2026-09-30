import pg from 'pg';
import type { Logger } from '../lib/logger.js';

export type Pool = pg.Pool;
export type PoolClient = pg.PoolClient;

export interface PoolConfig {
  databaseUrl: string;
  /** Set on every connection as app.hash_key so SQL secure_hash() matches the TS hash. */
  hashKey: string;
  max?: number;
}

// numeric -> string stays the default: money is NUMERIC(12,2) and must never pass through a float.
// date (OID 1082) -> plain 'YYYY-MM-DD' string instead of a local-midnight JS Date.
pg.types.setTypeParser(1082, (value: string) => value);

export function createPool({ databaseUrl, hashKey, max = 10 }: PoolConfig, logger: Logger): Pool {
  const pool = new pg.Pool({
    connectionString: databaseUrl,
    max,
    application_name: 'omnia-recon',
    idleTimeoutMillis: 30_000,
    connectionTimeoutMillis: 10_000,
  });

  // Runs before any query the caller sends on a new connection (pg queues per client).
  pool.on('connect', (client) => {
    client.query("SELECT set_config('app.hash_key', $1, false)", [hashKey]).catch((err: unknown) => {
      logger.error({ err }, 'failed to set app.hash_key on a new connection');
    });
  });

  pool.on('error', (err) => {
    logger.error({ err }, 'idle database client error');
  });

  return pool;
}
