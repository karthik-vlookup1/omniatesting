/**
 * Transactions with an audit identity.
 *
 * Every write goes through a transaction that first runs
 *   SELECT set_config('app.user_email', <email>, true)   -- i.e. SET LOCAL
 * so the audit_row() trigger records who made the change. The setting is transaction-local and
 * disappears on COMMIT/ROLLBACK, so a pooled connection never carries one user's identity into
 * another request.
 */
import type { Pool, PoolClient } from './pool.js';

export const SYSTEM_ACTOR = 'system';

export type TxFn<T> = (client: PoolClient) => Promise<T>;

export async function withTransaction<T>(pool: Pool, actorEmail: string, fn: TxFn<T>): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query("SELECT set_config('app.user_email', $1, true)", [actorEmail]);
    const result = await fn(client);
    await client.query('COMMIT');
    return result;
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    throw err;
  } finally {
    client.release();
  }
}

/** Database handle bound to one actor, attached to each request as `req.db`. */
export interface ActorDb {
  readonly actorEmail: string;
  /** Runs `fn` in a transaction audited as this actor. */
  tx<T>(fn: TxFn<T>): Promise<T>;
  /** Read-only convenience; no transaction, no audit identity needed. */
  query: Pool['query'];
}

export function actorDb(pool: Pool, actorEmail: string): ActorDb {
  return {
    actorEmail,
    tx: (fn) => withTransaction(pool, actorEmail, fn),
    query: pool.query.bind(pool) as Pool['query'],
  };
}
