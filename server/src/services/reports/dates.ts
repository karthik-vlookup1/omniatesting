/** Date helpers shared by the dashboard and the tenant statement. */
import { z } from 'zod';
import type { Pool } from '../../db/pool.js';
import { AppError } from '../../lib/errors.js';

type Q = Pick<Pool, 'query'>;

/** A real calendar date as YYYY-MM-DD. */
export const ISO_DATE = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'Use YYYY-MM-DD')
  .refine((s) => {
    const d = new Date(`${s}T00:00:00Z`);
    return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s;
  }, 'Not a real date');

/** Today in Europe/London, from the database clock. */
export async function londonToday(q: Q): Promise<string> {
  const { rows } = await q.query<{ d: string }>(
    "SELECT to_char((now() AT TIME ZONE 'Europe/London')::date, 'YYYY-MM-DD') AS d",
  );
  return rows[0]!.d;
}

/** The day D for a report: the given date, or London today. A future date is a 400. */
export async function resolveDay(q: Q, date?: string): Promise<string> {
  const today = await londonToday(q);
  if (date === undefined) return today;
  if (date > today) throw new AppError('bad_request', 'Date cannot be in the future');
  return date;
}
