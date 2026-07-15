import { describe, it, expect } from 'vitest';
import {
  generateSyncCode,
  normalizeSyncCode,
  isValidSyncCode,
  formatSyncCode,
  hashSyncCode,
} from './syncCode';

describe('syncCode', () => {
  it('generates codes in XXXX-XXXX-XXXX form that validate', () => {
    for (let i = 0; i < 50; i++) {
      const code = generateSyncCode();
      expect(code).toMatch(/^[0-9A-HJKMNP-TV-Z]{4}-[0-9A-HJKMNP-TV-Z]{4}-[0-9A-HJKMNP-TV-Z]{4}$/);
      expect(isValidSyncCode(code)).toBe(true);
    }
  });

  it('generates distinct codes', () => {
    const codes = new Set(Array.from({ length: 200 }, () => generateSyncCode()));
    expect(codes.size).toBe(200);
  });

  it('normalizes separators, case, and ambiguous glyphs', () => {
    // lowercase + spaces/dashes stripped; O→0, I/L→1, U→V
    expect(normalizeSyncCode('abcd efgh jklm')).toBe('ABCDEFGHJK1M');
    expect(normalizeSyncCode('OoIiLlUu')).toBe('001111VV');
    expect(normalizeSyncCode('a-b-c-d')).toBe('ABCD');
  });

  it('normalization is idempotent', () => {
    const raw = 'x9-Ab cO1L';
    const once = normalizeSyncCode(raw);
    expect(normalizeSyncCode(once)).toBe(once);
  });

  it('rejects malformed codes', () => {
    expect(isValidSyncCode('')).toBe(false);
    expect(isValidSyncCode('ABC')).toBe(false); // too short
    expect(isValidSyncCode('ABCDEFGHJKMNP')).toBe(false); // too long
    expect(isValidSyncCode('!!!!-!!!!-!!!!')).toBe(false);
  });

  it('formats and validates a normalized 12-char code', () => {
    const formatted = formatSyncCode('ABCD2345678Z');
    expect(formatted).toBe('ABCD-2345-678Z');
    expect(isValidSyncCode(formatted)).toBe(true);
  });

  it('hashes deterministically and independent of formatting/case', async () => {
    const a = await hashSyncCode('ABCD-2345-678Z');
    const b = await hashSyncCode('abcd2345678z');
    expect(a).toBe(b);
    expect(a).toMatch(/^[0-9a-f]{64}$/);
  });

  it('produces different hashes for different codes', async () => {
    const a = await hashSyncCode('ABCD-2345-678Z');
    const b = await hashSyncCode('ABCD-2345-6790');
    expect(a).not.toBe(b);
  });
});
