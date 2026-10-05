/** Landlord reference data. landlordRef is internal only and editable. */
import type { ActorDb } from '../../db/context.js';
import type { Pool } from '../../db/pool.js';
import { AppError } from '../../lib/errors.js';

export interface Landlord {
  id: string;
  landlordRef: string | null;
  name: string;
  email: string | null;
  phone: string | null;
}

export interface LandlordCreate {
  landlordRef?: string | null;
  name: string;
  email?: string | null;
  phone?: string | null;
}

export type LandlordPatch = Partial<{
  landlordRef: string | null;
  name: string;
  email: string | null;
  phone: string | null;
}>;

const COLUMNS: Record<keyof LandlordPatch, string> = {
  landlordRef: 'landlord_ref',
  name: 'name',
  email: 'email',
  phone: 'phone',
};

interface Row {
  id: string;
  landlord_ref: string | null;
  name: string;
  email: string | null;
  phone: string | null;
}

const SELECT = 'SELECT id, landlord_ref, name, email, phone FROM landlords';

const toLandlord = (r: Row): Landlord => ({
  id: r.id,
  landlordRef: r.landlord_ref,
  name: r.name,
  email: r.email,
  phone: r.phone,
});

const escapeLike = (s: string): string => s.replace(/[\\%_]/g, (m) => `\\${m}`);

export async function list(pool: Pool, { q = '' }: { q?: string }): Promise<Landlord[]> {
  const { rows } = await pool.query<Row>(
    `${SELECT}
      WHERE $1 = '' OR name ILIKE '%'||$1||'%' OR landlord_ref ILIKE '%'||$1||'%' OR email ILIKE '%'||$1||'%'
      ORDER BY name LIMIT 200`,
    [escapeLike(q.trim())],
  );
  return rows.map(toLandlord);
}

export async function create(db: ActorDb, input: LandlordCreate): Promise<string> {
  try {
    return await db.tx(async (c) => {
      const { rows } = await c.query<{ id: string }>(
        'INSERT INTO landlords (landlord_ref, name, email, phone) VALUES ($1, $2, $3, $4) RETURNING id',
        [input.landlordRef ?? null, input.name, input.email ?? null, input.phone ?? null],
      );
      return rows[0]!.id;
    });
  } catch (err) {
    if ((err as { code?: string }).code === '23505') throw new AppError('conflict', 'A landlord with that reference exists');
    throw err;
  }
}

export async function update(db: ActorDb, id: string, patch: LandlordPatch): Promise<Landlord> {
  const keys = (Object.keys(COLUMNS) as (keyof LandlordPatch)[]).filter((k) => patch[k] !== undefined);
  if (keys.length === 0) throw new AppError('bad_request', 'nothing to change');
  const sets = keys.map((k, i) => `${COLUMNS[k]} = $${i + 2}`).join(', ');
  const values = keys.map((k) => patch[k]);
  try {
    return await db.tx(async (c) => {
      const { rows } = await c.query<Row>(
        `UPDATE landlords SET ${sets} WHERE id = $1 RETURNING id, landlord_ref, name, email, phone`,
        [id, ...values],
      );
      if (rows.length === 0) throw new AppError('not_found', 'No such landlord');
      return toLandlord(rows[0]!);
    });
  } catch (err) {
    if ((err as { code?: string }).code === '23505') throw new AppError('conflict', 'A landlord with that reference exists');
    throw err;
  }
}
