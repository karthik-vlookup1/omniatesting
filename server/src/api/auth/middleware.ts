import type { CookieOptions, NextFunction, Request, RequestHandler, Response } from 'express';
import { actorDb } from '../../db/context.js';
import type { Pool } from '../../db/pool.js';
import { AppError } from '../../lib/errors.js';
import { getSessionUser, SESSION_ABSOLUTE_MS, type Role } from '../../services/auth.service.js';
import './types.js';

export const SESSION_COOKIE = 'omnia_sid';
/** Header every state-changing request must carry (see csrfGuard). */
export const CSRF_HEADER = 'x-requested-with';
export const CSRF_HEADER_VALUE = 'omnia-recon';
const ANONYMOUS_ACTOR = 'anonymous';

export function sessionCookieOptions(secure: boolean): CookieOptions {
  return { httpOnly: true, secure, sameSite: 'strict', path: '/', maxAge: SESSION_ABSOLUTE_MS };
}

/**
 * Resolves the session cookie to `req.user` and gives every request `req.db`, whose
 * transactions run `SET LOCAL app.user_email` so the audit trigger records the actor.
 */
export function authenticate(pool: Pool): RequestHandler {
  return async (req, _res, next) => {
    const token: unknown = req.cookies?.[SESSION_COOKIE];
    if (typeof token === 'string' && token !== '') {
      const user = await getSessionUser(pool, token);
      if (user) {
        req.user = user;
        req.sessionToken = token;
      }
    }
    req.db = actorDb(pool, req.user?.email ?? ANONYMOUS_ACTOR);
    next();
  };
}

/**
 * CSRF defence in depth, on top of SameSite=Strict cookies: state-changing requests must send a
 * custom header, which a cross-site form cannot set and a cross-site fetch cannot send without
 * a CORS preflight this API never grants.
 */
export function csrfGuard(req: Request, _res: Response, next: NextFunction): void {
  if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) return next();
  if (req.get(CSRF_HEADER) !== CSRF_HEADER_VALUE) {
    return next(new AppError('forbidden', `Missing ${CSRF_HEADER} header`));
  }
  next();
}

export function requireAuth(req: Request, _res: Response, next: NextFunction): void {
  if (!req.user) return next(new AppError('unauthenticated', 'Sign in required'));
  next();
}

/** Allows the listed roles. `admin` is always allowed. */
export function requireRole(...roles: Role[]): RequestHandler {
  const allowed = new Set<Role>(['admin', ...roles]);
  return (req, _res, next) => {
    if (!req.user) return next(new AppError('unauthenticated', 'Sign in required'));
    if (!allowed.has(req.user.role)) {
      return next(new AppError('forbidden', 'You do not have permission to do this'));
    }
    next();
  };
}

/** Anyone signed in except read-only users may change data. */
export const requireWriter = requireRole('accounts', 'staff');
