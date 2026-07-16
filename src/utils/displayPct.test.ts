import { describe, expect, it } from 'vitest';
import { displayPct } from './stats';

describe('displayPct', () => {
  it('never reads 100% while stickers are still missing', () => {
    // 976/980 = 99.59% — used to round up to a misleading 100%.
    expect(displayPct(976 / 980)).toBe(99);
  });

  it('floors partial progress instead of rounding', () => {
    expect(displayPct(0.999)).toBe(99);
    expect(displayPct(0.005)).toBe(0);
    expect(displayPct(0.5)).toBe(50);
  });

  it('reads 100% only when genuinely complete', () => {
    expect(displayPct(1)).toBe(100);
    expect(displayPct(980 / 980)).toBe(100);
  });

  it('clamps out-of-range values', () => {
    expect(displayPct(-0.2)).toBe(0);
    expect(displayPct(1.5)).toBe(100);
  });
});
