import { describe, it, expect } from 'vitest';
import { computeStats, computeStatsFor } from './stats';
import { buildAlbumFor, DEFAULT_EDITION, DEFAULT_TRACK_CC } from '../data/sampleAlbum';

describe('computeStatsFor', () => {
  it('uses the requested layout, not the active singleton', () => {
    const withCC = computeStatsFor({}, DEFAULT_EDITION, true);
    const withoutCC = computeStatsFor({}, DEFAULT_EDITION, false);
    // Tracking Coca-Cola turns on its optional section, so total slots grow.
    expect(withCC.totalStickers).toBeGreaterThan(withoutCC.totalStickers);
  });

  it('counts owned uniques and duplicates against that layout', () => {
    const layout = buildAlbumFor(DEFAULT_EDITION, false);
    const firstId = layout.stickers[0].id;
    const stats = computeStatsFor({ [firstId]: 2 }, DEFAULT_EDITION, false);
    expect(stats.ownedUnique).toBe(1);
    expect(stats.dupesTotal).toBe(1);
  });

  it('matches computeStats for the default (active) layout', () => {
    expect(computeStatsFor({}, DEFAULT_EDITION, DEFAULT_TRACK_CC).totalStickers).toBe(
      computeStats({}).totalStickers,
    );
  });
});
