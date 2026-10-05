/** Branch reference data. The code is immutable: Veco sync keys on it. */
import type { ActorDb } from '../../db/context.js';
import type { Pool } from '../../db/pool.js';
import { AppError } from '../../lib/errors.js';

export interface Branch {
  id: string;
  code: string;
  name: string;
  xeroTrackingOption: string | null;
}

export interface BranchCreate {
  code: string;
  name: string;
  xeroTrackingOption?: string | null;
}

export type BranchPatch = Partial<{ name: string; xeroTrackingOption: string | null }>;

const COLUMNS: Record<keyof BranchPatch, string> = { name: 'name', xeroTrackingOption: 'xero_tracking_option' };

interface Row {
  id: string;
  code: string;
  name: string;
  xero_tracking_option: string | null;
}

const toBranch = (r: Row): Branch => ({
  id: r.id,
  code: r.code,
  name: r.name,
  xeroTrackingOption: r.xero_tracking_option,
});

const escapeLike = (s: string): string => s.replace(/[\\%_]/g, (m) => `\\${m}`);

export async function list(pool: Pool, { q = '' }: { q?: string }): Promise<Branch[]> {
  const { rows } = await pool.query<Row>(
    `SELECT id, code, name, xero_tracking_option FROM branches
      WHERE $1 = '' OR code ILIKE '%'||$1||'%' OR name ILIKE '%'||$1||'%'
      ORDER BY code LIMIT 200`,
    [escapeLike(q.trim())],
  );
  return rows.map(toBranch);
}

export async function create(db: ActorDb, input: BranchCreate): Promise<string> {
  try {
    return await db.tx(async (c) => {
      const { rows } = await c.query<{ id: string }>(
        'INSERT INTO branches (code, name, xero_tracking_option) VALUES ($1, $2, $3) RETURNING id',
        [input.code.toUpperCase(), input.name, input.xeroTrackingOption ?? null],
      );
      return rows[0]!.id;
    });
  } catch (err) {
    if ((err as { code?: string }).code === '23505') throw new AppError('conflict', 'A branch with that code exists');
    throw err;
  }
}

export async function update(db: ActorDb, id: string, patch: BranchPatch): Promise<Branch> {
  const keys = (Object.keys(COLUMNS) as (keyof BranchPatch)[]).filter((k) => patch[k] !== undefined);
  if (keys.length === 0) throw new AppError('bad_request', 'nothing to change');
  const sets = keys.map((k, i) => `${COLUMNS[k]} = $${i + 2}`).join(', ');
  const values = keys.map((k) => patch[k]);
  return db.tx(async (c) => {
    const { rows } = await c.query<Row>(
      `UPDATE branches SET ${sets} WHERE id = $1 RETURNING id, code, name, xero_tracking_option`,
      [id, ...values],
    );
    if (rows.length === 0) throw new AppError('not_found', 'No such branch');
    return toBranch(rows[0]!);
  });
}
