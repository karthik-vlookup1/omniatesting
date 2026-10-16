import { describe, expect, it } from 'vitest';
import { ConfigError, loadConfig } from '../../src/config/env.js';

const VALID = {
  NODE_ENV: 'development',
  DATABASE_URL: 'postgres://u:p@localhost:5432/db',
  HASH_KEY: 'h'.repeat(32),
  ENCRYPTION_KEY: Buffer.alloc(32, 7).toString('base64'),
  SESSION_SECRET: 's'.repeat(32),
};

function problems(env: NodeJS.ProcessEnv): string[] {
  try {
    loadConfig(env);
  } catch (err) {
    expect(err).toBeInstanceOf(ConfigError);
    return (err as ConfigError).problems;
  }
  throw new Error('expected loadConfig to throw');
}

describe('loadConfig', () => {
  it('parses a valid environment with defaults', () => {
    const c = loadConfig({ ...VALID });
    expect(c.port).toBe(3001);
    expect(c.autoMatchThreshold).toBe(0.95);
    expect(c.encryptionKey.length).toBe(32);
    expect(c.isProduction).toBe(false);
    expect(c.cookieSecure).toBe(false);
  });

  it('names every missing required variable at once', () => {
    expect(problems({})).toEqual([
      'DATABASE_URL is not set',
      'HASH_KEY is not set',
      'ENCRYPTION_KEY is not set',
      'SESSION_SECRET is not set',
    ]);
    expect(problems({ ...VALID, HASH_KEY: '  ' })).toEqual(['HASH_KEY is not set']);
  });

  it('rejects invalid values without echoing them', () => {
    const secret = 'not-base64-secret!!';
    const list = problems({ ...VALID, ENCRYPTION_KEY: secret, DATABASE_URL: 'mysql://x' });
    expect(list.some((p) => p.startsWith('ENCRYPTION_KEY'))).toBe(true);
    expect(list.some((p) => p.startsWith('DATABASE_URL'))).toBe(true);
    expect(list.join('\n')).not.toContain(secret);
  });

  it('rejects .env.example placeholders and short keys outside tests', () => {
    expect(problems({ ...VALID, SESSION_SECRET: 'replace-with-a-long-random-session-secret' })).toEqual([
      'SESSION_SECRET still holds the .env.example placeholder',
    ]);
    expect(problems({ ...VALID, HASH_KEY: 'short' })).toEqual(['HASH_KEY must be at least 32 characters']);
    expect(() => loadConfig({ ...VALID, NODE_ENV: 'test', HASH_KEY: 'short' })).not.toThrow();
  });

  it('defaults secure cookies to production and honours COOKIE_SECURE', () => {
    expect(loadConfig({ ...VALID, NODE_ENV: 'production' }).cookieSecure).toBe(true);
    expect(loadConfig({ ...VALID, NODE_ENV: 'production', COOKIE_SECURE: 'false' }).cookieSecure).toBe(false);
  });

  it('reads the Vico shared folder settings', () => {
    const off = loadConfig({ ...VALID, VICO_EXPORT_DIR: ' ', VICO_EXPORT_DISPLAY_DIR: '' });
    expect([off.vicoExportDir, off.vicoExportDisplayDir]).toEqual([null, null]);
    const unset = loadConfig({ ...VALID });
    expect([unset.vicoExportDir, unset.vicoExportDisplayDir]).toEqual([null, null]);
    const on = loadConfig({ ...VALID, VICO_EXPORT_DIR: '/srv/vico', VICO_EXPORT_DISPLAY_DIR: ' \\\\fs\\vico ' });
    expect([on.vicoExportDir, on.vicoExportDisplayDir]).toEqual(['/srv/vico', '\\\\fs\\vico']);
    expect(loadConfig({ ...VALID, VICO_EXPORT_DISPLAY_DIR: '/x' }).vicoExportDisplayDir).toBeNull();
    expect(problems({ ...VALID, VICO_EXPORT_DIR: 'relative/dir' })).toContain('VICO_EXPORT_DIR must be an absolute path');
  });
});
