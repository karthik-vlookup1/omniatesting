import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { DEMO_AMOUNT, DEMO_STAFF_PK, DEMO_TIDS } from '../../src/services/veco-push/demo-data.js';
import { parseArgs, parseReceipts, redact, resolveDatabaseTarget, UsageError } from '../../src/services/veco-push/demo-seed.js';

const HOST = 'ep-x.example.neon.tech';
const PASSWORD = 'p%40ss-secret';
const CLOUD = `postgres://user:${PASSWORD}@${HOST}/db?sslmode=require`;
const STAFF = '0d0d0d0d-0000-4000-8000-0000000000aa';

describe('demo-seed parseArgs', () => {
  it('defaults to the three 1.00 receipts and the demo staff', () => {
    expect(parseArgs(['seed', '--user', 'a@example.test'])).toEqual({
      command: 'seed',
      userEmail: 'a@example.test',
      cloud: false,
      staffPk: DEMO_STAFF_PK,
      receipts: DEMO_TIDS.map((tid) => ({ tid, amount: DEMO_AMOUNT })),
    });
  });

  it('takes flags in any order and uppercases the staff', () => {
    const args = parseArgs(['seed', '--cloud', '--receipts', 't5755=2.50', '--staff', STAFF, '--user', 'a@example.test']);
    expect(args).toMatchObject({ cloud: true, staffPk: STAFF.toUpperCase(), receipts: [{ tid: 'T5755', amount: '2.50' }] });
  });

  it('rejects unknown, repeated and value-less flags', () => {
    expect(() => parseArgs(['seed', '--user', 'a', '--bogus', 'x'])).toThrow(UsageError);
    expect(() => parseArgs(['seed', '--user', 'a', '--user', 'b'])).toThrow(UsageError);
    expect(() => parseArgs(['seed', '--cloud', '--cloud', '--user', 'a'])).toThrow(UsageError);
    expect(() => parseArgs(['seed', '--user'])).toThrow(UsageError);
    expect(() => parseArgs(['seed', '--user', '--cloud'])).toThrow(UsageError);
    expect(() => parseArgs(['seed'])).toThrow(UsageError);
    expect(() => parseArgs(['seed', '--user', 'a', '--staff', 'nope'])).toThrow(UsageError);
    expect(() => parseArgs(['seed', '--user', 'a', '--receipts', 'T1=1.00'])).toThrow(UsageError);
    expect(() => parseArgs([])).toThrow(UsageError);
  });

  it('remove and users take only --cloud', () => {
    expect(parseArgs(['remove'])).toEqual({ command: 'remove', cloud: false });
    expect(parseArgs(['users', '--cloud'])).toEqual({ command: 'users', cloud: true });
    expect(() => parseArgs(['remove', '--staff', STAFF])).toThrow(UsageError);
  });
});

describe('demo-seed parseReceipts', () => {
  it('uppercases the TID and keeps the amount', () => {
    expect(parseReceipts('t5755=997.27, T6008 = 890.00')).toEqual([
      { tid: 'T5755', amount: '997.27' },
      { tid: 'T6008', amount: '890.00' },
    ]);
  });

  it.each(['T12=1.00', 'T1234=1', 'T1234=1.5', 'T1234=0.00', 'T1234=-1.00', 'T1234', '', 'T1234=1.00,t1234=2.00'])('rejects %j', (text) => {
    expect(() => parseReceipts(text)).toThrow();
  });

  it('names the bad item and caps at 50', () => {
    expect(() => parseReceipts('T1234=1.00,T12=1')).toThrow('Bad --receipts item "T12=1"');
    const many = (n: number) => Array.from({ length: n }, (_, i) => `T${1000 + i}=1.00`).join(',');
    expect(parseReceipts(many(50))).toHaveLength(50);
    expect(() => parseReceipts(many(51))).toThrow();
  });
});

describe('demo-seed resolveDatabaseTarget', () => {
  it('local mode behaves as before', () => {
    expect(resolveDatabaseTarget({ DATABASE_URL: 'postgres://u:p@localhost:5433/omnia_test' }, false).label).toBe('localhost:5433');
    expect(() => resolveDatabaseTarget({ DATABASE_URL: CLOUD }, false)).toThrow('Demo seed only runs against localhost:5433');
  });

  it('cloud order is UNPOOLED, NEON_ unpooled, then plain', () => {
    const a = 'postgres://a:a@a.example.test/db';
    const b = 'postgres://b:b@b.example.test/db';
    const c = 'postgres://c:c@c.example.test/db';
    expect(resolveDatabaseTarget({ DATABASE_URL_UNPOOLED: a, NEON_DATABASE_URL_UNPOOLED: b, DATABASE_URL: c }, true)).toEqual({
      databaseUrl: a,
      label: 'cloud database',
    });
    expect(resolveDatabaseTarget({ NEON_DATABASE_URL_UNPOOLED: b, DATABASE_URL: c }, true).databaseUrl).toBe(b);
    expect(resolveDatabaseTarget({ DATABASE_URL: c }, true).databaseUrl).toBe(c);
  });

  it('cloud refuses localhost, missing and garbage URLs without leaking the URL', () => {
    expect(() => resolveDatabaseTarget({ DATABASE_URL: 'postgres://u:p@localhost:5433/x' }, true)).toThrow('--cloud refuses a local database');
    expect(() => resolveDatabaseTarget({ DATABASE_URL: 'postgres://u:p@[::1]/x' }, true)).toThrow('--cloud refuses a local database');
    expect(() => resolveDatabaseTarget({}, true)).toThrow('--cloud needs DATABASE_URL_UNPOOLED');
    expect(() => resolveDatabaseTarget({ DATABASE_URL: 'not a url' }, true)).toThrow('unreadable cloud database URL');
    for (const env of [{ DATABASE_URL: CLOUD.replace('postgres://', '') }, { DATABASE_URL: 'postgres://u:p@localhost/x' }, {}]) {
      try {
        resolveDatabaseTarget(env, true);
      } catch (err) {
        expect((err as Error).message).not.toContain(HOST);
        expect((err as Error).message).not.toContain(PASSWORD);
      }
    }
  });
});

describe('demo-seed redact', () => {
  it('hides the URL, host and password', () => {
    const msg = `getaddrinfo ENOTFOUND ${HOST} while using ${CLOUD} (password p@ss-secret)`;
    const out = redact(msg, CLOUD);
    expect(out).not.toContain(HOST);
    expect(out).not.toContain(PASSWORD);
    expect(out).not.toContain('p@ss-secret');
    expect(out).toContain('cloud database');
  });

  it('leaves a message alone when the URL is unreadable', () => {
    expect(redact('boom', 'not a url')).toBe('boom');
  });
});

describe('cloud-demo-seed.ps1 (static)', () => {
  const text = readFileSync(new URL('../../../scripts/cloud-demo-seed.ps1', import.meta.url), 'utf8');

  it('prompts masked and passes --cloud', () => {
    expect(text).toContain('-AsSecureString');
    expect(text).toContain('--cloud');
  });

  it('never writes to disk', () => {
    expect(text).not.toMatch(/Set-Content|Out-File|Add-Content|>/);
  });

  it('clears every secret in the finally block', () => {
    const finallyBlock = text.slice(text.lastIndexOf('finally'));
    for (const key of ['DATABASE_URL', 'HASH_KEY', 'ENCRYPTION_KEY', 'SESSION_SECRET']) expect(finallyBlock).toContain(`'${key}'`);
  });

  it('never prints the URL or the keys', () => {
    expect(text).not.toMatch(/Write-(Host|Output|Warning)[^\r\n]*\$(databaseUrl|env:)/i);
  });
});
