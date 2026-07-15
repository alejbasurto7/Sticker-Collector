import { describe, it, expect } from 'vitest';
import { pickSyncState, sanitizeRemote, type SyncPayload } from './serialize';

function samplePayload(): SyncPayload {
  return {
    counts: { 'MEX-1': 2, 'ARG-3': 1 },
    swaps: [
      {
        id: 's1',
        name: 'Trade with Ana',
        createdAt: 111,
        status: 'open',
        theirNeeds: ['MEX-1'],
        theirSwaps: ['ARG-3'],
        giving: ['MEX-1'],
        receiving: ['ARG-3'],
      },
    ],
    edition: 'latam',
    trackCC: true,
    albumName: 'My Album',
    locked: false,
    firstStickerAt: 999,
    activityDays: ['2026-07-01', '2026-07-02'],
    completedOn: null,
    unlockedAchievements: { firstSticker: 1000 },
    importSeq: 3,
    theme: 'dark',
    albums: [
      {
        id: 'usa-mex-can-26',
        albumName: 'My Album',
        counts: { 'MEX-1': 2 },
        swaps: [],
        edition: 'latam',
        trackCC: true,
        locked: false,
        activityDays: [],
        completedOn: null,
        unlockedAchievements: {},
      },
    ],
    activeAlbumId: 'usa-mex-can-26',
  };
}

describe('pickSyncState', () => {
  it('round-trips every syncable field deeply', () => {
    const payload = samplePayload();
    expect(pickSyncState(payload)).toEqual(payload);
  });

  it('drops non-whitelisted keys (e.g. store actions)', () => {
    const withExtra = { ...samplePayload(), addOne: () => {}, junk: 42 } as unknown as SyncPayload;
    const picked = pickSyncState(withExtra);
    expect('addOne' in picked).toBe(false);
    expect('junk' in picked).toBe(false);
  });
});

describe('sanitizeRemote', () => {
  it('accepts a well-formed payload', () => {
    const payload = samplePayload();
    expect(sanitizeRemote(payload)).toEqual(payload);
  });

  it('rejects junk / malformed blobs', () => {
    expect(sanitizeRemote(null)).toBeNull();
    expect(sanitizeRemote('nope')).toBeNull();
    expect(sanitizeRemote({})).toBeNull();
    expect(sanitizeRemote({ counts: {}, albums: 'x', activeAlbumId: 'a', swaps: [] })).toBeNull();
    expect(sanitizeRemote({ counts: {}, albums: [], activeAlbumId: 5, swaps: [] })).toBeNull();
    expect(sanitizeRemote({ counts: [], albums: [], activeAlbumId: 'a', swaps: [] })).toBeNull();
  });
});
