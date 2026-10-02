/**
 * A strong temporary password for an admin to hand over (the user changes it after signing in).
 * 20 characters from an unambiguous alphabet, from the browser's CSPRNG. Never stored or logged.
 */
const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789';

export function generateTemporaryPassword(length = 20): string {
  const out: string[] = [];
  const bytes = new Uint8Array(1);
  // Rejection sampling keeps every character equally likely.
  const limit = 256 - (256 % ALPHABET.length);
  while (out.length < length) {
    crypto.getRandomValues(bytes);
    const b = bytes[0]!;
    if (b < limit) out.push(ALPHABET[b % ALPHABET.length]!);
  }
  return out.join('');
}
