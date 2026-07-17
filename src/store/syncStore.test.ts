import { describe, it, expect, beforeEach } from 'vitest';
import { useSyncMeta, migrateSyncMeta } from './syncStore';

// Reset the store between tests (zustand persists to a jsdom-less localStorage shim; in the node
// env localStorage is undefined, so persist is a no-op and the store starts at its initial state).
beforeEach(() => {
  useSyncMeta.setState({ collection: null, albumLinks: {}, privateAlbumIds: [], localAlbumNames: {}, bases: {} }, false);
});

describe('syncMeta v2 actions', () => {
  it('creates and clears the Cloud link', () => {
    useSyncMeta.getState().setCollectionLink({ code: 'C', codeHash: 'H', writerId: 'W' });
    expect(useSyncMeta.getState().collection).toMatchObject({ codeHash: 'H', lastVersion: 0, status: 'syncing' });
    useSyncMeta.getState().clearCollectionLink();
    expect(useSyncMeta.getState().collection).toBeNull();
  });
  it('upserts and removes an album link', () => {
    const link = { albumId: 'X', code: 'c', codeHash: 'h', writerId: 'w', role: 'owner' as const, access: 'collaborative' as const, lastVersion: 0, lastSyncedAt: null, status: 'syncing' as const };
    useSyncMeta.getState().upsertAlbumLink(link);
    expect(useSyncMeta.getState().albumLinks.X.role).toBe('owner');
    useSyncMeta.getState().removeAlbumLink('X');
    expect(useSyncMeta.getState().albumLinks.X).toBeUndefined();
  });
  it('records a tombstone into the collection base', () => {
    useSyncMeta.getState().tombstoneAlbum('gone');
    expect(useSyncMeta.getState().bases.collection).toMatchObject({ kind: 'collection', deletedAlbumIds: ['gone'] });
  });
  it('marks a channel synced', () => {
    useSyncMeta.getState().setCollectionLink({ code: 'C', codeHash: 'H', writerId: 'W' });
    useSyncMeta.getState().markChannelSynced('collection', 7);
    expect(useSyncMeta.getState().collection!.lastVersion).toBe(7);
    expect(useSyncMeta.getState().collection!.status).toBe('synced');
  });

  // Bug 2 regression: bases.collection is keyed by the fixed string 'collection' (not by
  // codeHash), so a stale base from a previous link must never survive an unlink or a fresh
  // link — otherwise it gets reused as the 3-way-merge ancestor for a differently-coded
  // collection and mergeCounts/scalar3 misclassify real local edits as "unchanged since base",
  // silently discarding them.
  it('clearCollectionLink drops a pre-seeded bases.collection', () => {
    useSyncMeta.setState((s) => ({ bases: { ...s.bases, collection: { kind: 'collection', v: 1, albums: [] } } }));
    expect(useSyncMeta.getState().bases.collection).toBeDefined();
    useSyncMeta.getState().clearCollectionLink();
    expect(useSyncMeta.getState().bases.collection).toBeUndefined();
  });

  it('setCollectionLink drops a pre-seeded bases.collection from a previous code', () => {
    useSyncMeta.setState((s) => ({ bases: { ...s.bases, collection: { kind: 'collection', v: 1, albums: [] } } }));
    expect(useSyncMeta.getState().bases.collection).toBeDefined();
    useSyncMeta.getState().setCollectionLink({ code: 'NEW', codeHash: 'NEWHASH', writerId: 'W2' });
    expect(useSyncMeta.getState().bases.collection).toBeUndefined();
  });
});

describe('v1 -> v2 migration', () => {
  it('folds a legacy single link into the collection channel', () => {
    const v1 = { code: 'OLD', codeHash: 'OLDHASH', writerId: 'wid', linkedAt: 1, lastVersion: 5, lastSyncedAt: 99 };
    const v2 = migrateSyncMeta(v1, 1);
    expect(v2.collection).toMatchObject({ code: 'OLD', codeHash: 'OLDHASH', writerId: 'wid', lastVersion: 5 });
    expect(v2.albumLinks).toEqual({});
    expect(v2.privateAlbumIds).toEqual([]);
    expect(v2.bases).toEqual({});
  });
  it('migrates an unlinked v1 to a null collection', () => {
    const v2 = migrateSyncMeta({ code: null, codeHash: null, writerId: null, lastVersion: 0, lastSyncedAt: null }, 1);
    expect(v2.collection).toBeNull();
  });
});
