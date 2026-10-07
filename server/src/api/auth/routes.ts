import { Router } from 'express';
import { z } from 'zod';
import type { Pool } from '../../db/pool.js';
import {
  changeOwnPassword,
  createUser,
  CreateUserSchema,
  listUsers,
  login,
  logout,
  updateUser,
  UpdateUserSchema,
} from '../../services/auth.service.js';
import { requireAuth, requireRole, SESSION_COOKIE, sessionCookieOptions } from './middleware.js';
import { ipRateLimit, parseLoginRateLimitMax } from './rate-limit.js';

const LoginBody = z.object({
  email: z.string().max(320),
  password: z.string().min(1).max(256),
});

const ChangePasswordBody = z.object({
  currentPassword: z.string().min(1).max(256),
  newPassword: z.string().max(256),
});

const UserIdParam = z.object({ id: z.uuid() });

export interface AuthRouterDeps {
  pool: Pool;
  cookieSecure: boolean;
}

/** /api/auth: sign in, sign out, current user, change own password. */
export function authRouter({ pool, cookieSecure }: AuthRouterDeps): Router {
  const router = Router();
  const cookieOptions = sessionCookieOptions(cookieSecure);

  const loginLimit = ipRateLimit({
    max: parseLoginRateLimitMax(process.env.LOGIN_RATE_LIMIT_MAX),
    windowMs: 15 * 60 * 1000,
  });

  router.post('/login', loginLimit, async (req, res) => {
    const body = LoginBody.parse(req.body);
    const result = await login(pool, {
      email: body.email,
      password: body.password,
      ip: req.ip,
      userAgent: req.get('user-agent'),
    });
    res.cookie(SESSION_COOKIE, result.token, cookieOptions);
    req.log.info({ userId: result.user.id }, 'signed in');
    res.json({ user: result.user });
  });

  router.post('/logout', async (req, res) => {
    if (req.sessionToken) await logout(pool, req.sessionToken);
    const { maxAge: _maxAge, ...clearOptions } = cookieOptions;
    res.clearCookie(SESSION_COOKIE, clearOptions);
    res.status(204).end();
  });

  router.get('/me', requireAuth, (req, res) => {
    res.json({ user: req.user });
  });

  router.post('/password', requireAuth, async (req, res) => {
    const body = ChangePasswordBody.parse(req.body);
    await changeOwnPassword(pool, req.user!, req.sessionToken!, body.currentPassword, body.newPassword);
    res.status(204).end();
  });

  return router;
}

/** /api/users: user administration, admin only. */
export function usersRouter({ pool }: { pool: Pool }): Router {
  const router = Router();
  router.use(requireRole());

  router.get('/', async (_req, res) => {
    res.json({ users: await listUsers(pool) });
  });

  router.post('/', async (req, res) => {
    const user = await createUser(pool, req.user!.email, CreateUserSchema.parse(req.body));
    res.status(201).json({ user });
  });

  router.patch('/:id', async (req, res) => {
    const { id } = UserIdParam.parse(req.params);
    const user = await updateUser(pool, req.user!, id, UpdateUserSchema.parse(req.body));
    res.json({ user });
  });

  return router;
}
