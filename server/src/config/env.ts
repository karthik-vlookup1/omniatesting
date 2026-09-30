/**
 * Environment configuration. Read and validated once at startup; the app fails fast with a
 * message naming every missing or invalid variable. Keys come from the environment only.
 */
import { z } from 'zod';

export class ConfigError extends Error {
  constructor(readonly problems: string[]) {
    super(`Invalid environment configuration:\n${problems.map((p) => `  - ${p}`).join('\n')}`);
    this.name = 'ConfigError';
  }
}

const REQUIRED = ['DATABASE_URL', 'HASH_KEY', 'ENCRYPTION_KEY', 'SESSION_SECRET'] as const;
const PLACEHOLDER = /^replace-with/i;
const BASE64 = /^[A-Za-z0-9+/]+={0,2}$/;

const booleanString = z
  .enum(['true', 'false', '1', '0'])
  .transform((v) => v === 'true' || v === '1');

const EnvSchema = z
  .object({
    NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
    PORT: z.coerce.number().int().min(1).max(65_535).default(3001),
    LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent']).default('info'),
    DATABASE_URL: z
      .string()
      .refine((v) => /^postgres(ql)?:\/\//.test(v), 'must be a postgres:// connection string'),
    HASH_KEY: z.string().min(1),
    ENCRYPTION_KEY: z
      .string()
      .refine(
        (v) => BASE64.test(v) && Buffer.from(v, 'base64').length === 32,
        'must be exactly 32 bytes, base64-encoded',
      ),
    SESSION_SECRET: z.string().min(32, 'must be at least 32 characters'),
    AUTO_MATCH_THRESHOLD: z.coerce.number().min(0).max(1).default(0.95),
    COOKIE_SECURE: booleanString.optional(),
  })
  .superRefine((env, ctx) => {
    for (const key of ['HASH_KEY', 'ENCRYPTION_KEY', 'SESSION_SECRET'] as const) {
      if (PLACEHOLDER.test(env[key])) {
        ctx.addIssue({ code: 'custom', path: [key], message: 'still holds the .env.example placeholder' });
      }
    }
    if (env.NODE_ENV !== 'test' && env.HASH_KEY.length < 32) {
      ctx.addIssue({ code: 'custom', path: ['HASH_KEY'], message: 'must be at least 32 characters' });
    }
  });

export interface AppConfig {
  nodeEnv: 'development' | 'test' | 'production';
  isProduction: boolean;
  port: number;
  logLevel: string;
  databaseUrl: string;
  /** HMAC key shared with SQL secure_hash() via `SET app.hash_key`. */
  hashKey: string;
  /** 32-byte AES-256-GCM key. */
  encryptionKey: Buffer;
  sessionSecret: string;
  autoMatchThreshold: number;
  cookieSecure: boolean;
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): AppConfig {
  const missing = REQUIRED.filter((key) => env[key] === undefined || env[key]?.trim() === '');
  if (missing.length > 0) {
    throw new ConfigError(missing.map((key) => `${key} is not set`));
  }

  const parsed = EnvSchema.safeParse(env);
  if (!parsed.success) {
    // Never echo the offending value: these are keys.
    throw new ConfigError(
      parsed.error.issues.map((issue) => `${issue.path.join('.') || '(root)'} ${issue.message}`),
    );
  }

  const e = parsed.data;
  const isProduction = e.NODE_ENV === 'production';
  return {
    nodeEnv: e.NODE_ENV,
    isProduction,
    port: e.PORT,
    logLevel: e.LOG_LEVEL,
    databaseUrl: e.DATABASE_URL,
    hashKey: e.HASH_KEY,
    encryptionKey: Buffer.from(e.ENCRYPTION_KEY, 'base64'),
    sessionSecret: e.SESSION_SECRET,
    autoMatchThreshold: e.AUTO_MATCH_THRESHOLD,
    cookieSecure: e.COOKIE_SECURE ?? isProduction,
  };
}
