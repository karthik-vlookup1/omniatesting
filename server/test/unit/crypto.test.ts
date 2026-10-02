import { createHmac, randomBytes } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import {
  decrypt,
  encrypt,
  isValidNi,
  lastChars,
  maskAccount,
  maskNi,
  normaliseIdentifier,
  payerAccountHash,
  payerAccountKey,
  protectNi,
  secureHash,
} from '../../src/lib/crypto.js';

const HASH_KEY = 'test-only-key';
const KEY = randomBytes(32);

describe('secureHash', () => {
  it('is HMAC-SHA256 hex of the normalised value', () => {
    const expected = createHmac('sha256', HASH_KEY).update('AB123456C').digest('hex');
    expect(secureHash('ab 12 34 56 c', HASH_KEY)).toBe(expected);
    expect(secureHash('AB123456C', HASH_KEY)).toBe(expected);
  });

  it('returns null for null, undefined and blank input', () => {
    expect(secureHash(null, HASH_KEY)).toBeNull();
    expect(secureHash(undefined, HASH_KEY)).toBeNull();
    expect(secureHash('   ', HASH_KEY)).toBeNull();
  });

  it('depends on the key', () => {
    expect(secureHash('AB123456C', 'other-key')).not.toBe(secureHash('AB123456C', HASH_KEY));
  });
});

describe('encrypt / decrypt', () => {
  it('round-trips with a fresh IV each time', () => {
    const a = encrypt('AB123456C', KEY, 'tenants.ni');
    const b = encrypt('AB123456C', KEY, 'tenants.ni');
    expect(a.equals(b)).toBe(false);
    expect(decrypt(a, KEY, 'tenants.ni')).toBe('AB123456C');
  });

  it('rejects a different AAD, a wrong key and tampered ciphertext', () => {
    const payload = encrypt('AB123456C', KEY, 'tenants.ni');
    expect(() => decrypt(payload, KEY, 'payer_accounts.account')).toThrow();
    expect(() => decrypt(payload, randomBytes(32), 'tenants.ni')).toThrow();
    const tampered = Buffer.from(payload);
    tampered.writeUInt8(tampered.readUInt8(tampered.length - 1) ^ 0xff, tampered.length - 1);
    expect(() => decrypt(tampered, KEY, 'tenants.ni')).toThrow();
  });

  it('rejects keys that are not 32 bytes and unknown formats', () => {
    expect(() => encrypt('x', randomBytes(16))).toThrow('32 bytes');
    expect(() => decrypt(Buffer.alloc(10), KEY)).toThrow('Unrecognised ciphertext format');
  });
});

describe('identifier helpers', () => {
  it('normalises and keeps the last characters', () => {
    expect(normaliseIdentifier(' ab-12 34/56 c ')).toBe('AB123456C');
    expect(lastChars('ab 12 34 56 c', 3)).toBe('56C');
    expect(lastChars('12', 4)).toBe('12');
  });

  it('masks like v_bank_statement_enriched', () => {
    expect(maskNi('56C')).toBe('•••••56C');
    expect(maskAccount('5678')).toBe('****5678');
    expect(maskNi(null)).toBeNull();
    expect(maskAccount('')).toBeNull();
  });

  it('validates UK NI numbers', () => {
    expect(isValidNi('AB 12 34 56 C')).toBe(true);
    expect(isValidNi('DA123456C')).toBe(false); // D is not a valid first letter
    expect(isValidNi('AB123456E')).toBe(false); // suffix must be A-D
  });

  it('protectNi stores hash, ciphertext and last 3', () => {
    const p = protectNi('ab 12 34 56 c', { hashKey: HASH_KEY, encryptionKey: KEY });
    expect(p.hash).toBe(secureHash('AB123456C', HASH_KEY));
    expect(p.last).toBe('56C');
    expect(decrypt(p.encrypted, KEY, 'tenants.ni')).toBe('AB123456C');
    expect(() => protectNi('not an NI', { hashKey: HASH_KEY, encryptionKey: KEY })).toThrow();
  });

  it('payer account key is sort code digits then account digits', () => {
    expect(payerAccountKey('20-00-00', '1234 5678')).toBe('20000012345678');
    expect(payerAccountHash('20-00-00', '12345678', HASH_KEY)).toBe(secureHash('20000012345678', HASH_KEY));
    expect(() => payerAccountKey('20-00', '12345678')).toThrow('Sort code');
    expect(() => payerAccountKey('200000', '123')).toThrow('Account number');
  });
});
