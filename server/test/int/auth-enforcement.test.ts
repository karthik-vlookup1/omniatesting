/**
 * Senior-tester gap tests for recon-004: role enforcement (readonly cannot write), per-request
 * SET LOCAL isolation under concurrency, session expiry, Secure cookie, IP rate limit, password
 * hash parameters, self-demotion guard and session revocation.
 */
import { randomUUID } from 'node:crypto';
import cookieParser from 'cookie-parser';
import express, { type ErrorRequestHandler } from 'express';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createApp } from '../../src/api/app.js';
import {
  authenticate,
  CSRF_HEADER,
  CSRF_HEADER_VALUE,
  csrfGuard,
  requireWriter,
  SESSION_COOKIE,
} from '../../src/api/auth/middleware.js';
import { loadConfig } from '../../src/config/env.js';
import { createPool, type Pool } from '../../src/db/pool.js';
import { AppError } from '../../src/lib/errors.js';
import { createLogger } from '../../src/lib/logger.js';
import { upsertUser, type Role } from '../../src/services/auth.service.js';

const PASSWORD = 'correct-horse-battery';
const config = loadConfig();
const logger = createLogger({ level: 'silent' });
let pool: Pool;

const run = randomUUID().slice(0, 8);
const emailFor = (role: string) => `enf-${role}-${run}@example.test`;
const ROLES_ALL = ['admin', 'accounts', 'staff', 'readonly'] as const;

const newApp = (overrides: Partial<typeof config> = {}) =>
  createApp({ config: { ...config, ...overrides }, pool, logger });

/** Minimal app wiring the real auth middleware to a write route and an audit-context probe. */
function probeApp() {
  const app = express();
  app.use(express.json());
  app.use(cookieParser());
  app.use(authenticate(pool), csrfGuard);
  app.post('/write', requireWriter, (_req, res) => {
    res.status(204).end();
  });
  app.get('/whoami', async (req, res) => {
    const inTx = await req.db.tx(async (c) => {
      // Hold the transaction open so concurrent requests overlap on the pool.
      await c.query('SELECT pg_sleep(0.05)');
      const { rows } = await c.query<{ v: string }>("SELECT current_setting('app.user_email', true) AS v");
      return rows[0]!.v;
    });
    res.json({ inTx });
  });
  const handler: ErrorRequestHandler = (err: unknown, _req, res, _next) => {
    const status = err instanceof AppError ? err.status : 500;
    res.status(status).json({ code: err instanceof AppError ? err.code : 'internal' });
  };
  app.use(handler);
  return app;
}

async function signIn(app: express.Express, email: string, password = PASSWORD) {
  return request(app).post('/api/auth/login').set(CSRF_HEADER, CSRF_HEADER_VALUE).send({ email, password });
}

function cookieFrom(res: request.Response): string {
  const raw = res.headers['set-cookie'] as unknown as string[] | undefined;
  const cookie = raw?.find((c) => c.startsWith(`${SESSION_COOKIE}=`));
  if (!cookie) throw new Error(`no session cookie (status ${res.status})`);
  return cookie.split(';')[0]!;
}

beforeAll(async () => {
  pool = createPool({ databaseUrl: config.databaseUrl, hashKey: config.hashKey, max: 8 }, logger);
  await Promise.all(
    ROLES_ALL.map((role: Role) => upsertUser(pool, { email: emailFor(role), fullName: `Enf ${role}`, role, password: PASSWORD })),
  );
});

afterAll(async () => {
  await pool?.end();
});

describe('role enforcement', () => {
  it('readonly cannot write; admin, accounts and staff can; anonymous gets 401', async () => {
    const app = newApp();
    const probe = probeApp();
    const status: Record<string, number> = {};
    for (const role of ROLES_ALL) {
      const cookie = cookieFrom(await signIn(app, emailFor(role)));
      status[role] = (await request(probe).post('/write').set('Cookie', cookie).set(CSRF_HEADER, CSRF_HEADER_VALUE)).status;
    }
    expect(status).toEqual({ admin: 204, accounts: 204, staff: 204, readonly: 403 });
    expect((await request(probe).post('/write').set(CSRF_HEADER, CSRF_HEADER_VALUE)).status).toBe(401);
  });

  it('readonly cannot create or edit users', async () => {
    const app = newApp();
    const cookie = cookieFrom(await signIn(app, emailFor('readonly')));
    const res = await request(app)
      .post('/api/users')
      .set('Cookie', cookie)
      .set(CSRF_HEADER, CSRF_HEADER_VALUE)
      .send({ email: `ro-made-${run}@example.test`, fullName: 'X', role: 'admin', password: PASSWORD });
    expect(res.status).toBe(403);
    const patch = await request(app)
      .patch(`/api/users/${randomUUID()}`)
      .set('Cookie', cookie)
      .set(CSRF_HEADER, CSRF_HEADER_VALUE)
      .send({ role: 'admin' });
    expect(patch.status).toBe(403);
  });

  it('an admin cannot demote or deactivate themselves', async () => {
    const app = newApp();
    const login = await signIn(app, emailFor('admin'));
    const cookie = cookieFrom(login);
    const id = login.body.user.id as string;
    for (const body of [{ role: 'staff' }, { isActive: false }]) {
      const res = await request(app).patch(`/api/users/${id}`).set('Cookie', cookie).set(CSRF_HEADER, CSRF_HEADER_VALUE).send(body);
      expect(res.status).toBe(400);
    }
  });

  it('a role change by an admin ends the target user\'s sessions', async () => {
    const app = newApp();
    const email = `enf-demote-${run}@example.test`;
    await upsertUser(pool, { email, fullName: 'Demote Me', role: 'accounts', password: PASSWORD });
    const userLogin = await signIn(app, email);
    const userCookie = cookieFrom(userLogin);
    const admin = cookieFrom(await signIn(app, emailFor('admin')));
    const res = await request(app)
      .patch(`/api/users/${userLogin.body.user.id as string}`)
      .set('Cookie', admin)
      .set(CSRF_HEADER, CSRF_HEADER_VALUE)
      .send({ role: 'readonly' });
    expect(res.status).toBe(200);
    expect((await request(app).get('/api/auth/me').set('Cookie', userCookie)).status).toBe(401);
  });
});

describe('per-request audit context', () => {
  it('concurrent requests on a shared pool each see only their own app.user_email', async () => {
    const app = newApp();
    const probe = probeApp();
    const cookies = await Promise.all(ROLES_ALL.map(async (r) => [r, cookieFrom(await signIn(app, emailFor(r)))] as const));
    const results = await Promise.all(
      [...cookies, ...cookies, ...cookies].map(async ([role, cookie]) => {
        const res = await request(probe).get('/whoami').set('Cookie', cookie);
        return [role, res.body.inTx as string] as const;
      }),
    );
    for (const [role, seen] of results) expect(seen).toBe(emailFor(role));
    const anon = await request(probe).get('/whoami');
    expect(anon.body.inTx).toBe('anonymous');
  });
});

describe('sessions and cookies', () => {
  it('sets Secure on the session cookie when cookieSecure is on, with a 12h Max-Age', async () => {
    const res = await signIn(newApp({ cookieSecure: true }), emailFor('staff'));
    const setCookie = (res.headers['set-cookie'] as unknown as string[]).join(';');
    expect(setCookie).toMatch(/;\s*Secure/i);
    expect(setCookie).toMatch(/HttpOnly/i);
    expect(setCookie).toMatch(/SameSite=Strict/i);
    expect(setCookie).toMatch(/Max-Age=43200/);
  });

  it('rejects a session past its absolute expiry', async () => {
    const app = newApp();
    const cookie = cookieFrom(await signIn(app, emailFor('accounts')));
    const { createHash } = await import('node:crypto');
    const id = createHash('sha256').update(cookie.split('=')[1]!).digest('hex');
    await pool.query(
      `UPDATE user_sessions SET created_at = now() - interval '13 hours', expires_at = now() - interval '1 hour' WHERE id = $1`,
      [id],
    );
    expect((await request(app).get('/api/auth/me').set('Cookie', cookie)).status).toBe(401);
  });

  it('rejects a session idle for more than 2 hours', async () => {
    const app = newApp();
    const cookie = cookieFrom(await signIn(app, emailFor('accounts')));
    const { createHash } = await import('node:crypto');
    const id = createHash('sha256').update(cookie.split('=')[1]!).digest('hex');
    await pool.query(`UPDATE user_sessions SET last_seen_at = now() - interval '121 minutes' WHERE id = $1`, [id]);
    expect((await request(app).get('/api/auth/me').set('Cookie', cookie)).status).toBe(401);
  });
});

describe('login hardening', () => {
  it('stores passwords as scrypt N=32768 r=8 p=1 with a per-user salt', async () => {
    const { rows } = await pool.query<{ password_hash: string }>(
      'SELECT password_hash FROM app_users WHERE email = ANY($1) ORDER BY email',
      [[emailFor('staff'), emailFor('readonly')]],
    );
    expect(rows).toHaveLength(2);
    for (const r of rows) expect(r.password_hash).toMatch(/^scrypt\$32768\$8\$1\$[A-Za-z0-9+/=]{24}\$[A-Za-z0-9+/=]{88}$/);
    expect(rows[0]!.password_hash).not.toBe(rows[1]!.password_hash);
  });

  it('a locked account stays locked even with the correct password, and unlocks after expiry', async () => {
    const app = newApp();
    const email = `enf-lock-${run}@example.test`;
    await upsertUser(pool, { email, fullName: 'Lock Me', role: 'staff', password: PASSWORD });
    for (let i = 0; i < 5; i++) await signIn(app, email, 'wrong-password-123');
    expect((await signIn(app, email)).status).toBe(401);
    await pool.query(`UPDATE app_users SET locked_until = now() - interval '1 second' WHERE email = $1`, [email]);
    expect((await signIn(app, email)).status).toBe(200);
  });

  it('after a lockout expires, one wrong password does not re-lock the account', async () => {
    const app = newApp();
    const email = `enf-relock-${run}@example.test`;
    await upsertUser(pool, { email, fullName: 'Relock', role: 'staff', password: PASSWORD });
    for (let i = 0; i < 5; i++) await signIn(app, email, 'wrong-password-123');
    await pool.query(`UPDATE app_users SET locked_until = now() - interval '1 second' WHERE email = $1`, [email]);
    expect((await signIn(app, email, 'wrong-password-123')).status).toBe(401);
    const { rows } = await pool.query<{ failed_login_count: number; locked_until: Date | null }>(
      'SELECT failed_login_count, locked_until FROM app_users WHERE email = $1',
      [email],
    );
    expect(rows[0]).toEqual({ failed_login_count: 1, locked_until: null });
    expect((await signIn(app, email)).status).toBe(200);
  });

  it('rate-limits sign-in per IP after 20 attempts in the window', async () => {
    const app = newApp();
    const statuses: number[] = [];
    for (let i = 0; i < 21; i++) {
      statuses.push((await signIn(app, `nobody-${i}-${run}@example.test`, 'wrong-password-123')).status);
    }
    expect(statuses.slice(0, 20).every((s) => s === 401)).toBe(true);
    expect(statuses[20]).toBe(429);
  }, 60_000);
});
