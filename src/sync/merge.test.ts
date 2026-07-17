import { describe, it, expect } from 'vitest';
import { mergeCounts, scalar3 } from './merge';

describe('mergeCounts', () => {
  it('keeps independent changes from both sides', () => {
    expect(mergeCounts({}, { A: 1 }, { B: 1 })).toEqual({ A: 1, B: 1 });
  });

  it('takes the side that changed vs. base (local)', () => {
    expect(mergeCounts({ A: 1 }, { A: 2 }, { A: 1 })).toEqual({ A: 2 });
  });

  it('takes the side that changed vs. base (remote), pruning zeros', () => {
    // remote removed A (1 -> 0); local unchanged. Removal wins; 0 is omitted.
    expect(mergeCounts({ A: 1 }, { A: 1 }, { A: 0 })).toEqual({});
  });

  it('on a true same-sticker collision, max wins (and is order-independent)', () => {
    expect(mergeCounts({ A: 1 }, { A: 0 }, { A: 2 })).toEqual({ A: 2 });
    expect(mergeCounts({ A: 1 }, { A: 2 }, { A: 0 })).toEqual({ A: 2 });
  });

  it('keeps equal values from both sides', () => {
    expect(mergeCounts({}, { A: 1 }, { A: 1 })).toEqual({ A: 1 });
  });
});

describe('scalar3', () => {
  it('returns the value when both sides agree', () => {
    expect(scalar3('latam', 'na', 'na')).toBe('na');
  });

  it('takes the changed side (local changed, remote at base)', () => {
    expect(scalar3('latam', 'na', 'latam')).toBe('na');
  });

  it('takes the changed side (remote changed, local at base)', () => {
    expect(scalar3('latam', 'latam', 'na')).toBe('na');
  });

  it('resolves a true collision deterministically, both orders equal', () => {
    // 'na' >= 'latam' lexically -> 'na' wins regardless of argument order.
    expect(scalar3('latam', 'na', 'latam')).toBe('na');
    const a = scalar3('x', 'na', 'latam');
    const b = scalar3('x', 'latam', 'na');
    expect(a).toBe(b);
    expect(a).toBe('na');
  });

  it('handles booleans (true beats false on collision)', () => {
    expect(scalar3(undefined as boolean | undefined, true, false)).toBe(true);
    expect(scalar3(undefined as boolean | undefined, false, true)).toBe(true);
  });

  it('with no common ancestor, agreement still wins', () => {
    expect(scalar3(undefined, 'na', 'na')).toBe('na');
  });
});
