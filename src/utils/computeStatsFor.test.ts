import { describe, it, expect } from 'vitest';
import { computeStats, computeStatsFor } from './stats';
import { buildAlbumFor, DEFAULT_EDITION, DEFAULT_TRACK_CC } from '../data/sampleAlbum';
import { ALBUM_TYPES, ACTIVE_ALBUM_TYPE_ID } from '../data/albumTypes';

// A second, structurally-different collection lets us prove computeStatsFor is
// parameterized by album type, not bound to the active singleton. When the registry
// has only one type (e.g. after the Adrenalyn album was removed) there is nothing to
// compare against, so the cross-type test below skips until a second type returns.
const OTHER_TYPE_ID = Object.keys(ALBUM_TYPES).find((id) => id !== ACTIVE_ALBUM_TYPE_ID);
const OTHER_VARIANT = OTHER_TYPE_ID ? ALBUM_TYPES[OTHER_TYPE_ID].defaultVariant : DEFAULT_EDITION;

describe('computeStatsFor', () => {
  it('grows the total when the optional (Coca-Cola) section is tracked', () => {
    const withCC = computeStatsFor({}, ACTIVE_ALBUM_TYPE_ID, DEFAULT_EDITION, true);
    const withoutCC = computeStatsFor({}, ACTIVE_ALBUM_TYPE_ID, DEFAULT_EDITION, false);
    // Tracking Coca-Cola turns on its optional section, so total slots grow.
    expect(withCC.totalStickers).toBeGreaterThan(withoutCC.totalStickers);
  });

  it('counts owned uniques and duplicates against that layout', () => {
    const layout = buildAlbumFor(ACTIVE_ALBUM_TYPE_ID, DEFAULT_EDITION, false);
    const firstId = layout.stickers[0].id;
    const stats = computeStatsFor({ [firstId]: 2 }, ACTIVE_ALBUM_TYPE_ID, DEFAULT_EDITION, false);
    expect(stats.ownedUnique).toBe(1);
    expect(stats.dupesTotal).toBe(1);
  });

  it('matches computeStats for the default (active) layout', () => {
    expect(
      computeStatsFor({}, ACTIVE_ALBUM_TYPE_ID, DEFAULT_EDITION, DEFAULT_TRACK_CC).totalStickers,
    ).toBe(computeStats({}).totalStickers);
  });

  it.skipIf(!OTHER_TYPE_ID)('reflects a different album type’s own totals, not the active type’s', () => {
    const otherTotal = buildAlbumFor(OTHER_TYPE_ID, OTHER_VARIANT, false).stickers.length;
    const activeTotal = buildAlbumFor(ACTIVE_ALBUM_TYPE_ID, DEFAULT_EDITION, false).stickers.length;
    expect(otherTotal).not.toBe(activeTotal); // the two collections differ in size
    expect(computeStatsFor({}, OTHER_TYPE_ID, OTHER_VARIANT, false).totalStickers).toBe(otherTotal);
  });
});
