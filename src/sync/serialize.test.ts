import { describe, it, expect } from 'vitest';
import {
  hasCollectionData, type SyncPayload,
  reconstructActive, allAlbums, cloudManagedIds, sliceCloudPayload, sliceAlbumPayload, type SliceState,
  normalizeRemote, legacyToCollection,
} from './serialize';

/** A pristine, brand-new install: one default album, nothing owned. */
function emptyState(): Pick<SyncPayload, 'counts' | 'swaps' | 'albums'> {
  return {
    counts: {},
    swaps: [],
    albums: [
      {
        id: 'usa-mex-can-26',
        albumName: 'My Album',
        counts: {},
        swaps: [],
        edition: 'latam',
        trackCC: true,
        locked: false,
        activityDays: [],
        completedOn: null,
        unlockedAchievements: {},
      },
    ],
  };
}

describe('hasCollectionData (join-wipe guard)', () => {
  it('is false for a pristine empty install (safe to auto-pull)', () => {
    expect(hasCollectionData(emptyState())).toBe(false);
  });

  it('is true when a sticker is owned at the top level', () => {
    expect(hasCollectionData({ ...emptyState(), counts: { 'MEX-1': 1 } })).toBe(true);
  });

  it('is true when an owned sticker lives only in a parked album', () => {
    const s = emptyState();
    s.albums[0].counts = { 'ARG-3': 2 };
    expect(hasCollectionData(s)).toBe(true);
  });

  it('is true when there are swaps', () => {
    const s = emptyState();
    s.swaps = [
      { id: 'x', name: 'n', createdAt: 1, status: 'open', theirNeeds: [], theirSwaps: [], giving: [], receiving: [] },
    ];
    expect(hasCollectionData(s)).toBe(true);
  });

  it('is true when more than the single default album exists', () => {
    const s = emptyState();
    s.albums = [...s.albums, { ...s.albums[0], id: 'second', albumName: 'Second' }];
    expect(hasCollectionData(s)).toBe(true);
  });

  it('treats zero counts as no data', () => {
    expect(hasCollectionData({ ...emptyState(), counts: { 'MEX-1': 0, 'ARG-3': 0 } })).toBe(false);
  });
});

function state(): SliceState {
  return {
    counts: { 'MEX-1': 2 }, swaps: [], edition: 'latam' as const, trackCC: true,
    albumName: 'Active', locked: false, firstStickerAt: 10, activityDays: ['2026-07-01'],
    completedOn: null, unlockedAchievements: {},
    activeAlbumId: 'A',
    albums: [
      { id: 'A', albumName: 'stale-A', counts: {}, swaps: [], edition: 'latam' as const, trackCC: true, locked: false, activityDays: [], completedOn: null, unlockedAchievements: {} },
      { id: 'B', albumName: 'B', counts: { 'ARG-1': 1 }, swaps: [], edition: 'latam' as const, trackCC: true, locked: false, activityDays: [], completedOn: null, unlockedAchievements: {} },
    ],
  };
}

describe('reconstructActive / allAlbums', () => {
  it('reconstructs the active album from live top-level fields, not the stale parked copy', () => {
    const a = reconstructActive(state());
    expect(a.id).toBe('A');
    expect(a.albumName).toBe('Active');       // top-level, not 'stale-A'
    expect(a.counts).toEqual({ 'MEX-1': 2 });
  });
  it('allAlbums refreshes the active entry and keeps the rest', () => {
    const all = allAlbums(state());
    expect(all.find((x) => x.id === 'A')!.albumName).toBe('Active');
    expect(all.find((x) => x.id === 'B')!.counts).toEqual({ 'ARG-1': 1 });
  });
});

describe('cloudManagedIds', () => {
  it('excludes shared and private albums', () => {
    expect([...cloudManagedIds(['A', 'B', 'C'], ['B'], ['C'])].sort()).toEqual(['A']);
  });
});

describe('sliceCloudPayload / sliceAlbumPayload', () => {
  it('slices only managed albums into a collection payload', () => {
    const p = sliceCloudPayload(state(), new Set(['A']));
    expect(p.kind).toBe('collection');
    expect(p.albums.map((a) => a.id)).toEqual(['A']);
    expect(p.albums[0].albumName).toBe('Active');
  });
  it('slices a single album into an album payload with access', () => {
    const p = sliceAlbumPayload(state(), 'B', 'read-only');
    expect(p).not.toBeNull();
    expect(p!.kind).toBe('album');
    expect(p!.access).toBe('read-only');
    expect(p!.album.id).toBe('B');
  });
  it('returns null for a missing album', () => {
    expect(sliceAlbumPayload(state(), 'ZZZ', 'collaborative')).toBeNull();
  });
});

const snap = (id: string) => ({ id, albumName: id, counts: {}, swaps: [], edition: 'latam' as const, trackCC: true, locked: false, activityDays: [], completedOn: null, unlockedAchievements: {} });

describe('normalizeRemote', () => {
  it('accepts a valid album payload', () => {
    const p = { kind: 'album', v: 1, access: 'collaborative', album: snap('A') };
    expect(normalizeRemote(p)).toEqual(p);
  });
  it('rejects an album payload with a bad access value', () => {
    expect(normalizeRemote({ kind: 'album', v: 1, access: 'nope', album: snap('A') })).toBeNull();
  });
  it('rejects an album payload with a non-numeric v', () => {
    expect(normalizeRemote({ kind: 'album', v: 'x', access: 'read-only', album: snap('A') })).toBeNull();
  });
  it('accepts a valid collection payload', () => {
    const p = { kind: 'collection', v: 1, albums: [snap('A')] };
    expect(normalizeRemote(p)).toEqual(p);
  });
  it('coerces a header-less legacy blob to a collection payload (active reconstructed)', () => {
    const legacy = {
      counts: { 'MEX-1': 3 }, swaps: [], edition: 'latam', trackCC: true, albumName: 'Live',
      locked: false, activityDays: [], completedOn: null, unlockedAchievements: {},
      activeAlbumId: 'A', albums: [{ ...snap('A'), albumName: 'stale', counts: {} }, snap('B')],
    };
    const out = normalizeRemote(legacy)!;
    expect(out.kind).toBe('collection');
    const a = (out as any).albums.find((x: any) => x.id === 'A');
    expect(a.albumName).toBe('Live');          // reconstructed from top-level, not 'stale'
    expect(a.counts).toEqual({ 'MEX-1': 3 });
    expect((out as any).albums.map((x: any) => x.id).sort()).toEqual(['A', 'B']);
  });
  it('rejects a legacy blob whose swaps is missing/not an array (defense-in-depth)', () => {
    const base = {
      counts: {}, edition: 'latam', trackCC: true, albumName: 'X', locked: false,
      activityDays: [], completedOn: null, unlockedAchievements: {},
      activeAlbumId: 'A', albums: [snap('A')],
    };
    expect(normalizeRemote(base)).toBeNull(); // no swaps key at all
    expect(normalizeRemote({ ...base, swaps: 'nope' })).toBeNull(); // swaps not an array
  });
  it('rejects junk', () => {
    expect(normalizeRemote(null)).toBeNull();
    expect(normalizeRemote('nope')).toBeNull();
    expect(normalizeRemote({})).toBeNull();
  });
});
