import type { RequestHandler } from 'express';
import { AppError } from '../../lib/errors.js';

export const DEFAULT_LOGIN_RATE_LIMIT_MAX = 20;

/** Parse LOGIN_RATE_LIMIT_MAX; absent or invalid falls back to the default of 20. */
export function parseLoginRateLimitMax(raw: string | undefined): number {
  if (raw === undefined || !/^\d+$/.test(raw.trim())) return DEFAULT_LOGIN_RATE_LIMIT_MAX;
  const n = Number.parseInt(raw, 10);
  return n > 0 ? n : DEFAULT_LOGIN_RATE_LIMIT_MAX;
}

/**
 * Fixed-window limiter keyed by client IP, for the sign-in endpoint. Per-account lockout in the
 * database is the main brute-force defence; this stops one client spraying many accounts.
 * In-memory: correct for a single API instance. Behind several instances, move to Postgres.
 */
export function ipRateLimit({ max, windowMs }: { max: number; windowMs: number }): RequestHandler {
  const hits = new Map<string, { count: number; resetAt: number }>();

  const sweep = setInterval(() => {
    const now = Date.now();
    for (const [key, entry] of hits) if (entry.resetAt <= now) hits.delete(key);
  }, windowMs);
  sweep.unref();

  return (req, res, next) => {
    const key = req.ip ?? 'unknown';
    const now = Date.now();
    let entry = hits.get(key);
    if (!entry || entry.resetAt <= now) {
      entry = { count: 0, resetAt: now + windowMs };
      hits.set(key, entry);
    }
    entry.count += 1;
    if (entry.count > max) {
      res.setHeader('Retry-After', Math.ceil((entry.resetAt - now) / 1000).toString());
      return next(new AppError('too_many_requests', 'Too many sign-in attempts. Try again later.'));
    }
    next();
  };
}
