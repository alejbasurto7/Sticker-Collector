import { describe, it, expect } from 'vitest';
import { isWritable, computeManagedIds, mergeFor, type Channel } from './engine';
import { useCollection } from '../store/collectionStore';
import { useSyncMeta } from '../store/syncStore';
import { PAYLOAD_V, type AlbumPayload, type CollectionPayload } from './payload';
import type { AlbumSnapshot } from '../store/collectionStore';

const snap = (id: string, over: Partial<AlbumSnapshot> = {}): AlbumSnapshot => ({
  id,
  albumName: id,
  counts: {},
  swaps: [],
  edition: 'latam',
  trackCC: true,
  locked: false,
  activityDays: [],
  completedOn: null,
  unlockedAchievements: {},
  ...over,
});

describe('isWritable', () => {
  it('a read-only joiner channel is not writable', () => {
    expect(isWritable({ kind: 'album', role: 'joiner', access: 'read-only' } as any)).toBe(false);
  });
  it('a read-only owner channel IS writable (authoritative)', () => {
    expect(isWritable({ kind: 'album', role: 'owner', access: 'read-only' } as any)).toBe(true);
  });
  it('a collaborative channel and the cloud channel are writable', () => {
    expect(isWritable({ kind: 'album', role: 'joiner', access: 'collaborative' } as any)).toBe(true);
    expect(isWritable({ kind: 'collection' } as any)).toBe(true);
  });
});

describe('computeManagedIds', () => {
  it('excludes shared and private albums', () => {
    const state = {
      counts: {},
      swaps: [],
      edition: 'latam' as const,
      trackCC: true,
      albumName: 'A',
      locked: false,
      activityDays: [],
      completedOn: null,
      unlockedAchievements: {},
      activeAlbumId: 'A',
      albums: [snap('A'), snap('B'), snap('C')],
    };
    const syncMeta = {
      albumLinks: { B: { albumId: 'B' } as any },
      privateAlbumIds: ['C'],
    };
    expect([...computeManagedIds(state, syncMeta)].sort()).toEqual(['A']);
  });

  it('reconstructs the active album from live top-level fields before scoping', () => {
    const state = {
      counts: {},
      swaps: [],
      edition: 'latam' as const,
      trackCC: true,
      albumName: 'Active',
      locked: false,
      activityDays: [],
      completedOn: null,
      unlockedAchievements: {},
      activeAlbumId: 'A',
      albums: [snap('A', { albumName: 'stale' })],
    };
    const syncMeta = { albumLinks: {}, privateAlbumIds: [] };
    expect([...computeManagedIds(state, syncMeta)]).toEqual(['A']);
  });
});

describe('mergeFor', () => {
  it('a read-only OWNER album channel returns local unchanged (never merges in remote)', () => {
    const channel: Channel = {
      key: 'alb1',
      kind: 'album',
      albumId: 'alb1',
      codeHash: 'h',
      writerId: 'w',
      lastVersion: 1,
      role: 'owner',
      access: 'read-only',
      writable: true,
    };
    const local: AlbumPayload = {
      kind: 'album',
      v: PAYLOAD_V,
      access: 'read-only',
      album: snap('alb1', { counts: { A: 1 } }),
    };
    const remote: AlbumPayload = {
      kind: 'album',
      v: PAYLOAD_V,
      access: 'read-only',
      album: snap('alb1', { counts: { A: 99, B: 5 } }),
    };
    const merged = mergeFor(channel, undefined, local, remote);
    expect(merged).toEqual(local);
  });

  it('a read-only JOINER channel is not writable (so it would never reach mergeFor as a push source)', () => {
    // Documents the pairing with isWritable: read-only joiners are filtered before any push.
    expect(
      isWritable({ kind: 'album', role: 'joiner', access: 'read-only', writable: false } as any),
    ).toBe(false);
  });

  it('a collaborative album channel 3-way merges counts via mergeAlbum', () => {
    const channel: Channel = {
      key: 'alb1',
      kind: 'album',
      albumId: 'alb1',
      codeHash: 'h',
      writerId: 'w',
      lastVersion: 1,
      role: 'joiner',
      access: 'collaborative',
      writable: true,
    };
    const base: AlbumPayload = {
      kind: 'album',
      v: PAYLOAD_V,
      access: 'collaborative',
      album: snap('alb1', { counts: { A: 1 } }),
    };
    const local: AlbumPayload = {
      kind: 'album',
      v: PAYLOAD_V,
      access: 'collaborative',
      album: snap('alb1', { counts: { A: 1, B: 1 } }),
    };
    const remote: AlbumPayload = {
      kind: 'album',
      v: PAYLOAD_V,
      access: 'collaborative',
      album: snap('alb1', { counts: { A: 1, C: 1 } }),
    };
    const merged = mergeFor(channel, base, local, remote) as AlbumPayload;
    expect(merged.album.counts).toEqual({ A: 1, B: 1, C: 1 });
  });

  it('a writable album channel with no remote yet returns local unchanged', () => {
    const channel: Channel = {
      key: 'alb1',
      kind: 'album',
      albumId: 'alb1',
      codeHash: 'h',
      writerId: 'w',
      lastVersion: 0,
      role: 'owner',
      access: 'collaborative',
      writable: true,
    };
    const local: AlbumPayload = {
      kind: 'album',
      v: PAYLOAD_V,
      access: 'collaborative',
      album: snap('alb1', { counts: { A: 1 } }),
    };
    expect(mergeFor(channel, undefined, local, null)).toEqual(local);
  });

  it('the collection channel merges via mergeCollection, scoped to this device managed ids', () => {
    useCollection.setState(
      {
        counts: {},
        swaps: [],
        edition: 'latam',
        trackCC: true,
        albumName: 'mine',
        locked: false,
        activityDays: [],
        completedOn: null,
        unlockedAchievements: {},
        importSeq: 0,
        theme: 'dark',
        activeAlbumId: 'mine',
        albums: [snap('mine')],
      } as any,
      false,
    );
    useSyncMeta.setState(
      { collection: null, albumLinks: {}, privateAlbumIds: [], localAlbumNames: {}, bases: {} },
      false,
    );

    const channel: Channel = {
      key: 'collection',
      kind: 'collection',
      codeHash: 'h',
      writerId: 'w',
      lastVersion: 0,
      writable: true,
    };
    const base: CollectionPayload = { kind: 'collection', v: PAYLOAD_V, albums: [snap('mine', { counts: { A: 1 } })] };
    const local: CollectionPayload = {
      kind: 'collection',
      v: PAYLOAD_V,
      albums: [snap('mine', { counts: { A: 1, B: 1 } })],
    };
    const remote: CollectionPayload = {
      kind: 'collection',
      v: PAYLOAD_V,
      albums: [snap('mine', { counts: { A: 1, C: 1 } }), snap('theirs')],
    };
    const merged = mergeFor(channel, base, local, remote) as CollectionPayload;
    const mine = merged.albums.find((a) => a.id === 'mine')!;
    expect(mine.counts).toEqual({ A: 1, B: 1, C: 1 });
    // 'theirs' isn't in managedIds (not present locally at all) -> preserved untouched from remote.
    expect(merged.albums.find((a) => a.id === 'theirs')).toEqual(snap('theirs'));
  });

  // Bug 1 regression: routing an "own echo" push through mergeFor (instead of a `merged = local`
  // shortcut) must reconstruct a tombstone that only `base` carries. `local` (sliceCloudPayload)
  // and `remote` (the server's echoed row) never carry deletedAlbumIds themselves -- only
  // mergeCollection unions and re-attaches them, from whichever of base/local/remote has them.
  it('the collection channel reconstructs a base-only tombstone even when local/remote lack it', () => {
    useCollection.setState(
      {
        counts: {},
        swaps: [],
        edition: 'latam',
        trackCC: true,
        albumName: 'mine',
        locked: false,
        activityDays: [],
        completedOn: null,
        unlockedAchievements: {},
        importSeq: 0,
        theme: 'dark',
        activeAlbumId: 'mine',
        albums: [snap('mine')],
      } as any,
      false,
    );
    useSyncMeta.setState(
      { collection: null, albumLinks: {}, privateAlbumIds: [], localAlbumNames: {}, bases: {} },
      false,
    );

    const channel: Channel = {
      key: 'collection',
      kind: 'collection',
      codeHash: 'h',
      writerId: 'w',
      lastVersion: 0,
      writable: true,
    };
    // Only `base` (the previously recorded ancestor, e.g. via tombstoneAlbum) carries the
    // tombstone -- local (a fresh sliceCloudPayload) and remote (our own echoed write) don't.
    const base: CollectionPayload = {
      kind: 'collection',
      v: PAYLOAD_V,
      albums: [snap('mine', { counts: { A: 1 } })],
      deletedAlbumIds: ['X'],
    };
    const local: CollectionPayload = {
      kind: 'collection',
      v: PAYLOAD_V,
      albums: [snap('mine', { counts: { A: 1 } })],
    };
    const remote: CollectionPayload = {
      kind: 'collection',
      v: PAYLOAD_V,
      albums: [snap('mine', { counts: { A: 1 } })],
    };
    const merged = mergeFor(channel, base, local, remote) as CollectionPayload;
    expect(merged.deletedAlbumIds).toContain('X');
  });
});
