/**
 * Auth + roles + per-request audit context, end to end through the Express app.
 */
import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createApp } from '../../src/api/app.js';
import { CSRF_HEADER, CSRF_HEADER_VALUE, SESSION_COOKIE } from '../../src/api/auth/middleware.js';
import { loadConfig } from '../../src/config/env.js';
import { createPool, type Pool } from '../../src/db/pool.js';
import { createLogger } from '../../src/lib/logger.js';
import { upsertUser, type Role } from '../../src/services/auth.service.js';

const PASSWORD = 'correct-horse-battery';
const config = loadConfig();
const logger = createLogger({ level: 'silent' });
let pool: Pool;

const run = randomUUID().slice(0, 8);
const emailFor = (role: string) => `${role}-${run}@example.test`;

function newApp() {
  return createApp({ config, pool, logger });
}

async function seed(role: Role): Promise<string> {
  const email = emailFor(role);
  await upsertUser(pool, { email, fullName: `Test ${role}`, role, password: PASSWORD });
  return email;
}

/** Signs in and returns the cookie header for later requests. */
async function signIn(app: ReturnType<typeof newApp>, email: string, password = PASSWORD) {
  const res = await request(app)
    .post('/api/auth/login')
    .set(CSRF_HEADER, CSRF_HEADER_VALUE)
    .send({ email, password });
  return res;
}

function cookieFrom(res: request.Response): string {
  const raw = res.headers['set-cookie'] as unknown as string[] | undefined;
  const cookie = raw?.find((c) => c.startsWith(`${SESSION_COOKIE}=`));
  if (!cookie) throw new Error('no session cookie');
  return cookie.split(';')[0]!;
}

beforeAll(async () => {
  pool = createPool({ databaseUrl: config.databaseUrl, hashKey: config.hashKey, max: 4 }, logger);
  await Promise.all((['admin', 'accounts', 'staff', 'readonly'] as const).map(seed));
});

afterAll(async () => {
  await pool?.end();
});

describe('auth: sign in, session, sign out', () => {
  it('signs in with an httpOnly SameSite=Strict cookie and resolves /me', async () => {
    const app = newApp();
    const res = await signIn(app, emailFor('staff').toUpperCase());
    expect(res.status).toBe(200);
    expect(res.body.user).toMatchObject({ email: emailFor('staff'), role: 'staff' });
    const setCookie = (res.headers['set-cookie'] as unknown as string[]).join(';');
    expect(setCookie).toMatch(/HttpOnly/i);
    expect(setCookie).toMatch(/SameSite=Strict/i);

    const me = await request(app).get('/api/auth/me').set('Cookie', cookieFrom(res));
    expect(me.status).toBe(200);
    expect(me.body.user.role).toBe('staff');
  });

  it('stores only the hash of the session token', async () => {
    const app = newApp();
    const res = await signIn(app, emailFor('readonly'));
    const token = cookieFrom(res).split('=')[1]!;
    const { rows } = await pool.query('SELECT 1 FROM user_sessions WHERE id = $1', [token]);
    expect(rows).toHaveLength(0);
  });

  it('rejects a wrong password and an unknown e-mail with the same error', async () => {
    const app = newApp();
    const wrong = await signIn(app, emailFor('accounts'), 'wrong-password-123');
    const unknown = await signIn(app, `nobody-${run}@example.test`);
    expect(wrong.status).toBe(401);
    expect(unknown.status).toBe(401);
    expect(wrong.body.error.code).toBe('invalid_credentials');
    expect(unknown.body.error).toEqual(wrong.body.error);
  });

  it('requires sign-in for /me and the CSRF header for state changes', async () => {
    const app = newApp();
    expect((await request(app).get('/api/auth/me')).status).toBe(401);
    const noHeader = await request(app).post('/api/auth/login').send({ email: emailFor('staff'), password: PASSWORD });
    expect(noHeader.status).toBe(403);
  });

  it('signs out and the old cookie stops working', async () => {
    const app = newApp();
    const cookie = cookieFrom(await signIn(app, emailFor('staff')));
    const out = await request(app).post('/api/auth/logout').set('Cookie', cookie).set(CSRF_HEADER, CSRF_HEADER_VALUE);
    expect(out.status).toBe(204);
    expect((await request(app).get('/api/auth/me').set('Cookie', cookie)).status).toBe(401);
  });

  it('locks the account after 5 failed attempts', async () => {
    const app = newApp();
    const email = `locked-${run}@example.test`;
    await upsertUser(pool, { email, fullName: 'Locked', role: 'staff', password: PASSWORD });
    for (let i = 0; i < 5; i++) {
      expect((await signIn(app, email, 'wrong-password-123')).status).toBe(401);
    }
    // Locked looks identical to a wrong password, so lockout can't reveal which e-mails exist.
    const res = await signIn(app, email);
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('invalid_credentials');
  });
});

describe('roles', () => {
  it('only admin can manage users', async () => {
    const app = newApp();
    for (const role of ['accounts', 'staff', 'readonly'] as const) {
      const cookie = cookieFrom(await signIn(app, emailFor(role)));
      expect((await request(app).get('/api/users').set('Cookie', cookie)).status).toBe(403);
    }
    const admin = cookieFrom(await signIn(app, emailFor('admin')));
    const list = await request(app).get('/api/users').set('Cookie', admin);
    expect(list.status).toBe(200);
    expect(list.body.users.some((u: { email: string }) => u.email === emailFor('readonly'))).toBe(true);
  });
});

describe('per-request audit context', () => {
  it('records the signed-in admin as the actor and strips the password hash', async () => {
    const app = newApp();
    const admin = cookieFrom(await signIn(app, emailFor('admin')));
    const email = `audited-${run}@example.test`;
    const created = await request(app)
      .post('/api/users')
      .set('Cookie', admin)
      .set(CSRF_HEADER, CSRF_HEADER_VALUE)
      .send({ email, fullName: 'Audited User', role: 'readonly', password: PASSWORD });
    expect(created.status).toBe(201);

    const { rows } = await pool.query<{ changed_by: string; new_row: Record<string, unknown> }>(
      `SELECT changed_by, new_row FROM audit_log
        WHERE table_name = 'app_users' AND row_id = $1 AND action = 'INSERT'`,
      [created.body.user.id],
    );
    expect(rows).toHaveLength(1);
    expect(rows[0]!.changed_by).toBe(emailFor('admin'));
    expect(rows[0]!.new_row).not.toHaveProperty('password_hash');
  });

  it('SET LOCAL does not leak the actor onto a pooled connection', async () => {
    const app = newApp();
    const admin = cookieFrom(await signIn(app, emailFor('admin')));
    await request(app)
      .post('/api/users')
      .set('Cookie', admin)
      .set(CSRF_HEADER, CSRF_HEADER_VALUE)
      .send({ email: `leak-${run}@example.test`, fullName: 'Leak Check', role: 'staff', password: PASSWORD });
    const clients = await Promise.all([pool.connect(), pool.connect(), pool.connect(), pool.connect()]);
    try {
      for (const c of clients) {
        const { rows } = await c.query<{ v: string | null }>("SELECT current_setting('app.user_email', true) AS v");
        expect(rows[0]!.v ?? '').toBe('');
      }
    } finally {
      clients.forEach((c) => c.release());
    }
  });
});
