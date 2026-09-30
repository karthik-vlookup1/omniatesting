/**
 * Personal-data protection for NI numbers and payer bank accounts.
 *
 * Every sensitive identifier is stored three ways, never in the clear:
 *   - hash:      HMAC-SHA256 keyed by HASH_KEY, for exact lookup. Byte-for-byte identical to the
 *                SQL secure_hash() in 002_matching_layer.sql, so rows hashed by either side match.
 *   - encrypted: AES-256-GCM ciphertext, for authorised display only.
 *   - last N:    the last 3-4 characters, for masked display.
 *
 * Pure functions: keys are passed in, never read from the environment here.
 */
import { createCipheriv, createDecipheriv, createHmac, randomBytes } from 'node:crypto';

const CIPHER = 'aes-256-gcm';
const FORMAT_VERSION = 0x01;
const IV_BYTES = 12;
const TAG_BYTES = 16;
const HEADER_BYTES = 1 + IV_BYTES + TAG_BYTES;

/** Same normalisation as SQL: upper-case, then drop everything but A-Z and 0-9. */
export function normaliseIdentifier(value: string): string {
  return value.toUpperCase().replace(/[^A-Z0-9]/g, '');
}

/**
 * TypeScript twin of SQL `secure_hash(p_value)`:
 *   NULL / blank -> null, else hex(HMAC-SHA256(normalised value, key)).
 */
export function secureHash(value: string | null | undefined, hashKey: string): string | null {
  if (value === null || value === undefined || value.trim() === '') return null;
  return createHmac('sha256', Buffer.from(hashKey, 'utf8'))
    .update(normaliseIdentifier(value), 'utf8')
    .digest('hex');
}

function assertKey(key: Buffer): void {
  if (key.length !== 32) {
    throw new Error('Encryption key must be exactly 32 bytes');
  }
}

/**
 * AES-256-GCM. Output layout: [version:1][iv:12][tag:16][ciphertext]. Stored as bytea.
 * `aad` binds the ciphertext to its purpose (e.g. "tenants.ni"), so a value copied into
 * another column fails to decrypt.
 */
export function encrypt(plaintext: string, key: Buffer, aad?: string): Buffer {
  assertKey(key);
  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv(CIPHER, key, iv, { authTagLength: TAG_BYTES });
  if (aad !== undefined) cipher.setAAD(Buffer.from(aad, 'utf8'));
  const ciphertext = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  return Buffer.concat([Buffer.from([FORMAT_VERSION]), iv, cipher.getAuthTag(), ciphertext]);
}

/** Throws if the data was tampered with, the key is wrong, or `aad` differs from encryption. */
export function decrypt(payload: Buffer, key: Buffer, aad?: string): string {
  assertKey(key);
  if (payload.length < HEADER_BYTES || payload[0] !== FORMAT_VERSION) {
    throw new Error('Unrecognised ciphertext format');
  }
  const iv = payload.subarray(1, 1 + IV_BYTES);
  const tag = payload.subarray(1 + IV_BYTES, HEADER_BYTES);
  const ciphertext = payload.subarray(HEADER_BYTES);
  const decipher = createDecipheriv(CIPHER, key, iv, { authTagLength: TAG_BYTES });
  if (aad !== undefined) decipher.setAAD(Buffer.from(aad, 'utf8'));
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString('utf8');
}

/** Last `n` characters of the normalised identifier. */
export function lastChars(value: string, n: number): string {
  const normalised = normaliseIdentifier(value);
  return normalised.slice(Math.max(0, normalised.length - n));
}

/** Masked NI for display, matching v_bank_statement_enriched: "•••••123C". */
export function maskNi(last3: string | null | undefined): string | null {
  return last3 ? `•••••${last3}` : null;
}

/** Masked account for display, matching v_bank_statement_enriched: "****1234". */
export function maskAccount(last4: string | null | undefined): string | null {
  return last4 ? `****${last4}` : null;
}

/** UK National Insurance number, already normalised (same letter rules as SQL extract_ni). */
const NI_PATTERN = /^[A-CEGHJ-PR-TW-Z]{2}\d{6}[A-D]$/;

export function isValidNi(value: string): boolean {
  return NI_PATTERN.test(normaliseIdentifier(value));
}

export interface ProtectedIdentifier {
  hash: string;
  encrypted: Buffer;
  last: string;
}

export interface ProtectionKeys {
  hashKey: string;
  encryptionKey: Buffer;
}

/** Hash + ciphertext + last `keep` characters for one identifier. */
export function protectIdentifier(
  value: string,
  keys: ProtectionKeys,
  { keep, aad }: { keep: number; aad: string },
): ProtectedIdentifier {
  const normalised = normaliseIdentifier(value);
  if (normalised === '') {
    throw new Error('Cannot protect an empty identifier');
  }
  const hash = secureHash(normalised, keys.hashKey);
  if (hash === null) throw new Error('Cannot protect an empty identifier');
  return { hash, encrypted: encrypt(normalised, keys.encryptionKey, aad), last: lastChars(normalised, keep) };
}

/** NI number -> hash + ciphertext + last 3, as stored on `tenants`. */
export function protectNi(ni: string, keys: ProtectionKeys): ProtectedIdentifier {
  if (!isValidNi(ni)) {
    throw new Error('Not a valid UK National Insurance number');
  }
  return protectIdentifier(ni, keys, { keep: 3, aad: 'tenants.ni' });
}

/**
 * The value hashed for a payer bank account: sort code digits followed by account number digits,
 * as `secure_hash(sort_code || account_number)` in SQL.
 */
export function payerAccountKey(sortCode: string, accountNumber: string): string {
  const sc = sortCode.replace(/\D/g, '');
  const acc = accountNumber.replace(/\D/g, '');
  if (sc.length !== 6) throw new Error('Sort code must have 6 digits');
  if (acc.length < 6 || acc.length > 10) throw new Error('Account number must have 6-10 digits');
  return `${sc}${acc}`;
}

export function payerAccountHash(sortCode: string, accountNumber: string, hashKey: string): string {
  const hash = secureHash(payerAccountKey(sortCode, accountNumber), hashKey);
  if (hash === null) throw new Error('Cannot hash an empty account');
  return hash;
}
