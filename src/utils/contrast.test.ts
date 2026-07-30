import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { contrastRatio } from './contrast';

/** The six album tints, read from the stylesheet itself so this cannot drift. */
const TINTS: Record<string, string> = Object.fromEntries(
  [...readFileSync('src/styles.css', 'utf8').matchAll(/\.(tint-\d)\s*\{\s*background:\s*(#[0-9a-f]{6})/gi)]
    .map((m) => [m[1], m[2]]),
);

/** The .amark ink. Pure black, not .album-cover's #06210f, which fails on tint-4. */
const AMARK_INK = '#000000';

describe('contrastRatio', () => {
  it('is 21 for black on white and 1 for a colour on itself', () => {
    expect(contrastRatio('#000000', '#ffffff')).toBeCloseTo(21, 1);
    expect(contrastRatio('#18b563', '#18b563')).toBeCloseTo(1, 5);
  });

  it('is order-independent', () => {
    expect(contrastRatio('#000000', '#a855f7')).toBeCloseTo(contrastRatio('#a855f7', '#000000'), 5);
  });

  it('reads 3-digit shorthand hex the same as its expanded form', () => {
    expect(contrastRatio('#fff', '#000')).toBeCloseTo(21, 1);
    expect(contrastRatio('#18b563', '#1b6')).toBeCloseTo(contrastRatio('#18b563', '#11bb66'), 5);
  });

  it('throws on a colour it cannot parse rather than returning NaN', () => {
    // NaN silently satisfies nothing (`NaN >= 4.5` is false), so a bad colour would look
    // like a contrast failure instead of the input error it is.
    expect(() => contrastRatio('#ff', '#000000')).toThrow();
    expect(() => contrastRatio('rebeccapurple', '#000000')).toThrow();
  });
});

describe('album mark legibility (spec §D)', () => {
  it('found all six tints in the stylesheet', () => {
    expect(Object.keys(TINTS).sort()).toEqual(['tint-0', 'tint-1', 'tint-2', 'tint-3', 'tint-4', 'tint-5']);
  });

  for (const [name, bg] of Object.entries(TINTS)) {
    it(`${name} clears 4.5:1 against the mark ink`, () => {
      expect(contrastRatio(AMARK_INK, bg)).toBeGreaterThanOrEqual(4.5);
    });
  }

  it('documents why the ink is not .album-cover\'s #06210f: tint-4 fails with it', () => {
    expect(contrastRatio('#06210f', TINTS['tint-4'])).toBeLessThan(4.5);
  });
});
