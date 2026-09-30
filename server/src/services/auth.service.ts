/**
 * Authentication and user administration.
 *
 * - Passwords: scrypt (N=2^15, r=8, p=1, 64-byte key, 16-byte salt), compared in constant time.
 *   Unknown e-mails still pay for one scrypt so response time does not reveal which accounts exist.
 * - Lockout: 5 consecutive failures lock the account for 15 minutes.
 * - Sessions: 32 random bytes as the cookie token; only sha256(token) is stored. Sessions expire
 *   after 12 hours, or after 2 hours without activity.
 */
import { createHash, randomBytes, scrypt as scryptCb, timingSafeEqual, type ScryptOptions } from 'node:crypto';
import { z } from 'zod';
import { withTransaction, SYSTEM_ACTOR } from '../db/context.js';
import type { Pool } from '../db/pool.js';
import { AppError, isUniqueViolation } from '../lib/errors.js';

export const ROLES = ['admin', 'accounts', 'staff', 'readonly'] as const;
export type Role = (typeof ROLES)[number];

export interface AuthUser {
  id: string;
  email: string;
  fullName: string;
  role: Role;
}

export interface UserSummary extends AuthUser {
  isActive: boolean;
  lastLoginAt: string | null;
  lockedUntil: string | null;
  createdAt: string;
}

export const SESSION_ABSOLUTE_MS = 12 * 60 * 60 * 1000;
export const SESSION_IDLE_MS = 2 * 60 * 60 * 1000;
const SESSION_TOUCH_MS = 5 * 60 * 1000;
const MAX_FAILED_LOGINS = 5;
const LOCKOUT_MS = 15 * 60 * 1000;

const SCRYPT = { N: 2 ** 15, r: 8, p: 1, keylen: 64, saltBytes: 16 };
const SCRYPT_MAXMEM = 128 * SCRYPT.N * SCRYPT.r * 2;

export const PasswordSchema = z
  .string()
  .min(12, 'Password must be at least 12 characters')
  .max(256, 'Password must be at most 256 characters');

export const EmailSchema = z
  .string()
  .trim()
  .toLowerCase()
  .pipe(z.email('Enter a valid e-mail address'));

// ---------------------------------------------------------------------------- passwords

function scrypt(password: string, salt: Buffer, keylen: number, opts: ScryptOptions): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    scryptCb(password.normalize('NFKC'), salt, keylen, opts, (err, key) => (err ? reject(err) : resolve(key)));
  });
}

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(SCRYPT.saltBytes);
  const key = await scrypt(password, salt, SCRYPT.keylen, {
    N: SCRYPT.N, r: SCRYPT.r, p: SCRYPT.p, maxmem: SCRYPT_MAXMEM,
  });
  return ['scrypt', SCRYPT.N, SCRYPT.r, SCRYPT.p, salt.toString('base64'), key.toString('base64')].join('$');
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const parts = stored.split('$');
  if (parts.length !== 6 || parts[0] !== 'scrypt') return false;
  const [, n, r, p, saltB64, keyB64] = parts as [string, string, string, string, string, string];
  const N = Number(n), R = Number(r), P = Number(p);
  if (![N, R, P].every(Number.isSafeInteger)) return false;
  const expected = Buffer.from(keyB64, 'base64');
  const actual = await scrypt(password, Buffer.from(saltB64, 'base64'), expected.length, {
    N, r: R, p: P, maxmem: 128 * N * R * 2,
  });
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

/** Equalises timing for unknown accounts. Computed once, lazily. */
let dummyHash: Promise<string> | undefined;
async function burnPasswordCheck(password: string): Promise<void> {
  dummyHash ??= hashPassword(randomBytes(16).toString('hex'));
  await verifyPassword(password, await dummyHash);
}

// ---------------------------------------------------------------------------- sessions

export function hashSessionToken(token: string): string {
  return createHash('sha256').update(token, 'utf8').digest('hex');
}

export interface LoginInput {
  email: string;
  password: string;
  ip?: string | undefined;
  userAgent?: string | undefined;
}

export interface LoginResult {
  user: AuthUser;
  token: string;
  expiresAt: Date;
}

interface UserRow {
  id: string;
  email: string;
  full_name: string;
  role: string;
  is_active: boolean;
  password_hash: string | null;
  locked_until: Date | null;
}

function isRole(role: string): role is Role {
  return (ROLES as readonly string[]).includes(role);
}

function toAuthUser(row: { id: string; email: string; full_name: string; role: string }): AuthUser {
  if (!isRole(row.role)) throw new AppError('forbidden', 'This account cannot sign in');
  return { id: row.id, email: row.email, fullName: row.full_name, role: row.role };
}

export async function login(pool: Pool, input: LoginInput): Promise<LoginResult> {
  const email = EmailSchema.safeParse(input.email);
  const invalid = new AppError('invalid_credentials', 'E-mail or password is incorrect');
  if (!email.success) {
    await burnPasswordCheck(input.password);
    throw invalid;
  }

  const { rows } = await pool.query<UserRow>(
    `SELECT id, email, full_name, role, is_active, password_hash, locked_until
       FROM app_users WHERE lower(email) = $1`,
    [email.data],
  );
  const row = rows[0];
  if (!row || !row.is_active || !row.password_hash || !isRole(row.role)) {
    await burnPasswordCheck(input.password);
    throw invalid;
  }
  if (row.locked_until && row.locked_until.getTime() > Date.now()) {
    throw new AppError('account_locked', 'Too many failed attempts. Try again later.');
  }

  if (!(await verifyPassword(input.password, row.password_hash))) {
    await pool.query(
      `UPDATE app_users
          SET failed_login_count = failed_login_count + 1,
              locked_until = CASE WHEN failed_login_count + 1 >= $2
                                  THEN now() + make_interval(secs => $3) ELSE locked_until END
        WHERE id = $1`,
      [row.id, MAX_FAILED_LOGINS, LOCKOUT_MS / 1000],
    );
    throw invalid;
  }

  const token = randomBytes(32).toString('base64url');
  const expiresAt = new Date(Date.now() + SESSION_ABSOLUTE_MS);
  await withTransaction(pool, row.email, async (client) => {
    await client.query(
      `UPDATE app_users SET failed_login_count = 0, locked_until = NULL, last_login_at = now() WHERE id = $1`,
      [row.id],
    );
    await client.query(
      `INSERT INTO user_sessions (id, user_id, expires_at, ip, user_agent) VALUES ($1, $2, $3, $4, $5)`,
      [hashSessionToken(token), row.id, expiresAt, input.ip ?? null, input.userAgent?.slice(0, 512) ?? null],
    );
  });
  return { user: toAuthUser(row), token, expiresAt };
}

/** Resolves a cookie token to its user, or null if missing, expired, idle or deactivated. */
export async function getSessionUser(pool: Pool, token: string): Promise<AuthUser | null> {
  if (!token || token.length > 128) return null;
  const id = hashSessionToken(token);
  const { rows } = await pool.query<{
    id: string; email: string; full_name: string; role: string; last_seen_at: Date;
  }>(
    `SELECT u.id, u.email, u.full_name, u.role, s.last_seen_at
       FROM user_sessions s JOIN app_users u ON u.id = s.user_id
      WHERE s.id = $1 AND s.expires_at > now()
        AND s.last_seen_at > now() - make_interval(secs => $2)
        AND u.is_active`,
    [id, SESSION_IDLE_MS / 1000],
  );
  const row = rows[0];
  if (!row || !isRole(row.role)) return null;
  if (Date.now() - row.last_seen_at.getTime() > SESSION_TOUCH_MS) {
    await pool.query('UPDATE user_sessions SET last_seen_at = now() WHERE id = $1', [id]);
  }
  return toAuthUser(row);
}

export async function logout(pool: Pool, token: string): Promise<void> {
  await pool.query('DELETE FROM user_sessions WHERE id = $1', [hashSessionToken(token)]);
}

export async function purgeExpiredSessions(pool: Pool): Promise<number> {
  const res = await pool.query(
    `DELETE FROM user_sessions
      WHERE expires_at <= now() OR last_seen_at <= now() - make_interval(secs => $1)`,
    [SESSION_IDLE_MS / 1000],
  );
  return res.rowCount ?? 0;
}

// ---------------------------------------------------------------------------- administration

export const CreateUserSchema = z.object({
  email: EmailSchema,
  fullName: z.string().trim().min(1).max(200),
  role: z.enum(ROLES),
  password: PasswordSchema,
});
export type CreateUserInput = z.infer<typeof CreateUserSchema>;

export const UpdateUserSchema = z
  .object({
    fullName: z.string().trim().min(1).max(200).optional(),
    role: z.enum(ROLES).optional(),
    isActive: z.boolean().optional(),
    password: PasswordSchema.optional(),
  })
  .refine((v) => Object.values(v).some((x) => x !== undefined), 'Nothing to update');
export type UpdateUserInput = z.infer<typeof UpdateUserSchema>;

const USER_COLUMNS = `id, email, full_name, role, is_active, last_login_at, locked_until, created_at`;

interface UserSummaryRow {
  id: string; email: string; full_name: string; role: string; is_active: boolean;
  last_login_at: Date | null; locked_until: Date | null; created_at: Date;
}

function toSummary(row: UserSummaryRow): UserSummary {
  return {
    ...toAuthUser(row),
    isActive: row.is_active,
    lastLoginAt: row.last_login_at?.toISOString() ?? null,
    lockedUntil: row.locked_until?.toISOString() ?? null,
    createdAt: row.created_at.toISOString(),
  };
}

export async function listUsers(pool: Pool): Promise<UserSummary[]> {
  const { rows } = await pool.query<UserSummaryRow>(
    `SELECT ${USER_COLUMNS} FROM app_users WHERE role <> 'system' ORDER BY lower(email)`,
  );
  return rows.map(toSummary);
}

export async function createUser(pool: Pool, actor: string, input: CreateUserInput): Promise<UserSummary> {
  const data = CreateUserSchema.parse(input);
  const passwordHash = await hashPassword(data.password);
  try {
    return await withTransaction(pool, actor, async (client) => {
      const { rows } = await client.query<UserSummaryRow>(
        `INSERT INTO app_users (email, full_name, role, password_hash, password_changed_at)
         VALUES ($1, $2, $3, $4, now()) RETURNING ${USER_COLUMNS}`,
        [data.email, data.fullName, data.role, passwordHash],
      );
      return toSummary(rows[0]!);
    });
  } catch (err) {
    if (isUniqueViolation(err)) throw new AppError('conflict', 'A user with this e-mail already exists');
    throw err;
  }
}

export async function updateUser(
  pool: Pool, actor: AuthUser, userId: string, input: UpdateUserInput,
): Promise<UserSummary> {
  const data = UpdateUserSchema.parse(input);
  if (userId === actor.id && (data.isActive === false || (data.role && data.role !== 'admin'))) {
    throw new AppError('bad_request', 'You cannot deactivate or demote your own account');
  }
  const passwordHash = data.password ? await hashPassword(data.password) : null;

  return withTransaction(pool, actor.email, async (client) => {
    const { rows } = await client.query<UserSummaryRow>(
      `UPDATE app_users
          SET full_name = coalesce($2, full_name),
              role = coalesce($3, role),
              is_active = coalesce($4, is_active),
              password_hash = coalesce($5, password_hash),
              password_changed_at = CASE WHEN $5::text IS NULL THEN password_changed_at ELSE now() END,
              failed_login_count = CASE WHEN $5::text IS NULL THEN failed_login_count ELSE 0 END,
              locked_until = CASE WHEN $5::text IS NULL THEN locked_until ELSE NULL END
        WHERE id = $1 AND role <> 'system'
        RETURNING ${USER_COLUMNS}`,
      [userId, data.fullName ?? null, data.role ?? null, data.isActive ?? null, passwordHash],
    );
    const row = rows[0];
    if (!row) throw new AppError('not_found', 'User not found');
    // Deactivation, a role change or a password reset ends every existing session.
    if (data.isActive === false || data.role !== undefined || passwordHash) {
      await client.query('DELETE FROM user_sessions WHERE user_id = $1', [userId]);
    }
    return toSummary(row);
  });
}

export async function changeOwnPassword(
  pool: Pool, user: AuthUser, currentToken: string, currentPassword: string, newPassword: string,
): Promise<void> {
  const next = PasswordSchema.parse(newPassword);
  const { rows } = await pool.query<{ password_hash: string | null }>(
    'SELECT password_hash FROM app_users WHERE id = $1 AND is_active',
    [user.id],
  );
  const stored = rows[0]?.password_hash;
  if (!stored || !(await verifyPassword(currentPassword, stored))) {
    throw new AppError('invalid_credentials', 'Current password is incorrect');
  }
  const passwordHash = await hashPassword(next);
  await withTransaction(pool, user.email, async (client) => {
    await client.query(
      'UPDATE app_users SET password_hash = $2, password_changed_at = now() WHERE id = $1',
      [user.id, passwordHash],
    );
    // Keep this session, sign out everywhere else.
    await client.query('DELETE FROM user_sessions WHERE user_id = $1 AND id <> $2', [
      user.id,
      hashSessionToken(currentToken),
    ]);
  });
}

/** Used by the create-user CLI: create the user, or reset role/password if the e-mail exists. */
export async function upsertUser(pool: Pool, input: CreateUserInput): Promise<{ created: boolean }> {
  const data = CreateUserSchema.parse(input);
  const passwordHash = await hashPassword(data.password);
  return withTransaction(pool, SYSTEM_ACTOR, async (client) => {
    const existing = await client.query<{ id: string }>(
      'SELECT id FROM app_users WHERE lower(email) = $1',
      [data.email],
    );
    if (existing.rows[0]) {
      await client.query(
        `UPDATE app_users SET full_name = $2, role = $3, password_hash = $4, password_changed_at = now(),
                is_active = true, failed_login_count = 0, locked_until = NULL WHERE id = $1`,
        [existing.rows[0].id, data.fullName, data.role, passwordHash],
      );
      await client.query('DELETE FROM user_sessions WHERE user_id = $1', [existing.rows[0].id]);
      return { created: false };
    }
    await client.query(
      `INSERT INTO app_users (email, full_name, role, password_hash, password_changed_at)
       VALUES ($1, $2, $3, $4, now())`,
      [data.email, data.fullName, data.role, passwordHash],
    );
    return { created: true };
  });
}
