import { describe, it, expect } from 'vitest';
import { monogram, coverTint } from './albumCover';

describe('monogram', () => {
  it('uppercases the first character', () => {
    expect(monogram('leo')).toBe('L');
  });
  it('skips leading whitespace and falls back for empty names', () => {
    expect(monogram('  kai')).toBe('K');
    expect(monogram('')).toBe('?');
  });
});

describe('coverTint', () => {
  it('is deterministic and within range', () => {
    expect(coverTint('abc')).toBe(coverTint('abc'));
    expect(coverTint('abc')).toBeGreaterThanOrEqual(0);
    expect(coverTint('abc')).toBeLessThan(6);
  });
  it('spreads across more than one bucket', () => {
    const tints = new Set(['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'].map((x) => coverTint(x)));
    expect(tints.size).toBeGreaterThan(1);
  });
});
