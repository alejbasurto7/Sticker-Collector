import { describe, it, expect } from 'vitest';
import { contrastRatio } from './contrast';

/** The six album tints from styles.css. Keep in sync with the .tint-N rules. */
const TINTS: Record<string, string> = {
  'tint-0': '#18b563',
  'tint-1': '#3b82f6',
  'tint-2': '#f59e0b',
  'tint-3': '#ef4444',
  'tint-4': '#a855f7',
  'tint-5': '#14b8a6',
};

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
});

describe('album mark legibility (spec §D)', () => {
  for (const [name, bg] of Object.entries(TINTS)) {
    it(`${name} clears 4.5:1 against the mark ink`, () => {
      expect(contrastRatio(AMARK_INK, bg)).toBeGreaterThanOrEqual(4.5);
    });
  }

  it('documents why the ink is not .album-cover\'s #06210f: tint-4 fails with it', () => {
    expect(contrastRatio('#06210f', TINTS['tint-4'])).toBeLessThan(4.5);
  });
});
