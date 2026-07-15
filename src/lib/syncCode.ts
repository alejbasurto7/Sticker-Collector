// Sync-code helpers. A sync code is the ONLY secret that pairs two devices:
// whoever holds it can read/write that one collection. So it must be long and
// unguessable, yet easy to type/read. We use 60 bits of randomness rendered as
// 12 Crockford base32 chars (no I/L/O/U — the ambiguous ones), grouped as
// XXXX-XXXX-XXXX. The raw code never leaves the device; only its SHA-256 hash
// is sent to the server (see hashSyncCode), so a DB dump never reveals codes.

// Crockford base32 alphabet (excludes I, L, O, U to avoid transcription errors).
const ALPHABET = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';
const CODE_LEN = 12;

/** Generate a fresh, unguessable sync code formatted as XXXX-XXXX-XXXX. */
export function generateSyncCode(): string {
  const bytes = new Uint8Array(8); // 64 bits of entropy
  crypto.getRandomValues(bytes);
  let bits = 0;
  let value = 0;
  let out = '';
  for (const b of bytes) {
    value = (value << 8) | b;
    bits += 8;
    while (bits >= 5) {
      out += ALPHABET[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  return formatSyncCode(out.slice(0, CODE_LEN));
}

/**
 * Canonicalise user input: uppercase, drop separators/spaces, and fold the
 * ambiguous glyphs a human might type (O→0, I/L→1, U→V) onto the alphabet.
 */
export function normalizeSyncCode(input: string): string {
  return input
    .toUpperCase()
    .replace(/[^0-9A-Z]/g, '')
    .replace(/O/g, '0')
    .replace(/[IL]/g, '1')
    .replace(/U/g, 'V');
}

/** A code is valid when it normalises to exactly 12 in-alphabet characters. */
export function isValidSyncCode(input: string): boolean {
  const c = normalizeSyncCode(input);
  return c.length === CODE_LEN && [...c].every((ch) => ALPHABET.includes(ch));
}

/** Render any (normalised or raw) code in the grouped XXXX-XXXX-XXXX form. */
export function formatSyncCode(input: string): string {
  const c = normalizeSyncCode(input);
  return [c.slice(0, 4), c.slice(4, 8), c.slice(8, 12)].filter(Boolean).join('-');
}

/**
 * SHA-256 of the normalised code (with a fixed app-specific prefix), as lower
 * hex. This is what we key the server row on — the plaintext code stays on the
 * device. Deterministic, so both paired devices derive the same hash.
 */
export async function hashSyncCode(code: string): Promise<string> {
  const data = new TextEncoder().encode(`sticker-sync:${normalizeSyncCode(code)}`);
  const buf = await crypto.subtle.digest('SHA-256', data);
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
}
