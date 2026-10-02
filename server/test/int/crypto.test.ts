/**
 * The TS secureHash() must equal SQL secure_hash() byte for byte, or rows hashed by the app
 * never match rows hashed by the matching functions in 002_matching_layer.sql.
 */
import pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { payerAccountHash, secureHash } from '../../src/lib/crypto.js';

const HASH_KEY = process.env.HASH_KEY ?? 'test-only-key';
let client: pg.Client;

beforeAll(async () => {
  client = new pg.Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();
  await client.query("SELECT set_config('app.hash_key', $1, false)", [HASH_KEY]);
});

afterAll(async () => {
  await client?.end();
});

async function sqlHash(value: string | null): Promise<string | null> {
  const res = await client.query<{ h: string | null }>('SELECT secure_hash($1) AS h', [value]);
  return res.rows[0]!.h;
}

describe('secureHash matches SQL secure_hash()', () => {
  const samples = ['AB123456C', 'ab 12 34 56 c', 'ce-65-43-21-a', '20000012345678', 'x', 'T1234 rent'];

  for (const value of samples) {
    it(`agrees for ${JSON.stringify(value)}`, async () => {
      expect(secureHash(value, HASH_KEY)).toBe(await sqlHash(value));
    });
  }

  it('both return null for blank input', async () => {
    expect(await sqlHash('   ')).toBeNull();
    expect(await sqlHash(null)).toBeNull();
    expect(secureHash('   ', HASH_KEY)).toBeNull();
  });

  it('payer account hash equals secure_hash(sort_code || account_number)', async () => {
    const res = await client.query<{ h: string }>(
      "SELECT secure_hash(regexp_replace('20-00-00', '\\D', '', 'g') || '12345678') AS h",
    );
    expect(payerAccountHash('20-00-00', '12345678', HASH_KEY)).toBe(res.rows[0]!.h);
  });
});
