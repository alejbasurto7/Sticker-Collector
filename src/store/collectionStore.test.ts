import { describe, it, expect, beforeEach } from 'vitest';
import { useCollection, orderAlbums } from './collectionStore';

const snap = (id: string, over = {}) => ({ id, albumName: id, counts: {}, swaps: [], edition: 'latam' as const, trackCC: true, locked: false, activityDays: [], completedOn: null, unlockedAchievements: {}, ...over });

beforeEach(() => {
  // Seed a known state: active album 'A' plus a shared album 'S'.
  useCollection.setState({
    counts: { 'MEX-1': 1 }, swaps: [], edition: 'latam', trackCC: true, albumName: 'A',
    locked: false, activityDays: [], completedOn: null, unlockedAchievements: {}, importSeq: 0, theme: 'dark',
    activeAlbumId: 'A',
    albums: [snap('A', { albumName: 'A', counts: { 'MEX-1': 1 } }), snap('S', { albumName: 'Shared' })],
  } as any, false);
});

describe('applyMergedCollection', () => {
  it('replaces cloud albums with the merged set and preserves shared/private albums', () => {
    const payload = { kind: 'collection' as const, v: 1, albums: [snap('A', { albumName: 'A', counts: { 'MEX-1': 2 } })] };
    useCollection.getState().applyMergedCollection(payload, new Set(['S'])); // 'S' is non-cloud
    const st = useCollection.getState();
    expect(st.albums.map((a) => a.id).sort()).toEqual(['A', 'S']);
    // active 'A' is a cloud album -> top-level refreshed from merged
    expect(st.counts).toEqual({ 'MEX-1': 2 });
    expect(st.albums.find((a) => a.id === 'S')!.albumName).toBe('Shared'); // untouched
  });
  it('adopts a brand-new cloud album from the payload', () => {
    const payload = { kind: 'collection' as const, v: 1, albums: [snap('A', { counts: { 'MEX-1': 1 } }), snap('NEW')] };
    useCollection.getState().applyMergedCollection(payload, new Set(['S']));
    expect(useCollection.getState().albums.map((a) => a.id).sort()).toEqual(['A', 'NEW', 'S']);
  });
  it('promotes a fallback when the active album vanishes from the merged set', () => {
    const payload = { kind: 'collection' as const, v: 1, albums: [snap('B', { albumName: 'B2', counts: { 'ARG-1': 3 } })] };
    useCollection.getState().applyMergedCollection(payload, new Set()); // 'A' absent from payload and nonCloudIds -> vanishes
    const st = useCollection.getState();
    expect(st.activeAlbumId).toBe('B');
    expect(st.albumName).toBe('B2');
    expect(st.counts).toEqual({ 'ARG-1': 3 });
  });
  it('never adopts a shared/private album that lingers in the cloud payload (keeps live top-level)', () => {
    // Regression: an album shared AFTER it was already in the Cloud row lingers there (carve-out ≠
    // deletion), so mergeCollection re-surfaces a STALE copy in the payload. If applyMergedCollection
    // adopts it for the active album, loadSnapshot overwrites live top-level and a just-created swap
    // vanishes. The album's own channel is authoritative — the Cloud copy must be ignored.
    const liveSwap = { id: 'sw1', name: 'x', createdAt: 1, status: 'open' as const, theirNeeds: [], theirSwaps: [], giving: [], receiving: [] };
    useCollection.setState({ swaps: [liveSwap], albums: [snap('A', { swaps: [liveSwap] })] } as any, false);
    const stalePayload = { kind: 'collection' as const, v: 1, albums: [snap('A', { swaps: [] })] }; // stale 'A' (no swap)
    useCollection.getState().applyMergedCollection(stalePayload, new Set(['A'])); // 'A' is non-cloud (shared)
    const st = useCollection.getState();
    expect(st.swaps.map((sw) => sw.id)).toEqual(['sw1']); // live swap survives — top-level untouched
    expect(st.albums.filter((a) => a.id === 'A')).toHaveLength(1); // no duplicate 'A' from the payload
  });
  it('does not crash when the merged album set is empty (keeps active id unchanged)', () => {
    const before = useCollection.getState().activeAlbumId;
    useCollection.getState().applyMergedCollection({ kind: 'collection', v: 1, albums: [] }, new Set());
    const st = useCollection.getState();
    expect(st.albums).toEqual([]);
    expect(st.activeAlbumId).toBe(before);
  });
});

describe('applyMergedAlbum', () => {
  it('refreshes the active album in place from the merged snapshot', () => {
    useCollection.getState().applyMergedAlbum('A', snap('A', { counts: { 'ARG-1': 5 } }) as any);
    expect(useCollection.getState().counts).toEqual({ 'ARG-1': 5 });
  });
  it('updates a non-active album without touching the top-level mirror', () => {
    useCollection.getState().applyMergedAlbum('S', snap('S', { albumName: 'Shared2' }) as any);
    const st = useCollection.getState();
    expect(st.albums.find((a) => a.id === 'S')!.albumName).toBe('Shared2');
    expect(st.albumName).toBe('A'); // active top-level unchanged
  });
});

const DEFAULT_ALBUM_ID = 'usa-mex-can-26';

/** Force a clean single-album baseline (persist is a no-op in the Node test env). */
function resetToSingleAlbum() {
  useCollection.setState({
    activeAlbumId: DEFAULT_ALBUM_ID,
    albumName: 'My Album',
    counts: {},
    swaps: [],
    edition: 'latam',
    trackCC: false,
    locked: false,
    albumLayout: 'compact',
    activityDays: [],
    completedOn: null,
    unlockedAchievements: {},
    albums: [
      {
        id: DEFAULT_ALBUM_ID,
        albumName: 'My Album',
        counts: {},
        swaps: [],
        edition: 'latam',
        trackCC: false,
        locked: false,
        albumLayout: 'compact',
        activityDays: [],
        completedOn: null,
        unlockedAchievements: {},
      },
    ],
  });
}

describe('setAlbumLayout', () => {
  beforeEach(resetToSingleAlbum);
  it('updates the top-level field and mirrors it into the active parked snapshot', () => {
    useCollection.getState().setAlbumLayout('pages');
    const s = useCollection.getState();
    expect(s.albumLayout).toBe('pages');
    expect(s.albums.find((a) => a.id === s.activeAlbumId)?.albumLayout).toBe('pages');
  });
});

describe('per-album layout', () => {
  beforeEach(resetToSingleAlbum);
  it('is remembered per album and survives switching away and back', () => {
    useCollection.getState().setAlbumLayout('pages'); // album A -> pages
    useCollection.getState().createAlbum();           // new album B becomes active
    expect(useCollection.getState().albumLayout).toBe('compact'); // B defaults compact
    useCollection.getState().switchAlbum(DEFAULT_ALBUM_ID);       // back to A
    expect(useCollection.getState().albumLayout).toBe('pages');   // A preserved
  });

  it('loads a legacy snapshot without albumLayout as compact', () => {
    const legacy = {
      id: 'legacy',
      albumName: 'Legacy',
      counts: {},
      swaps: [],
      edition: 'latam' as const,
      trackCC: false,
      locked: false,
      activityDays: [],
      completedOn: null,
      unlockedAchievements: {},
    };
    useCollection.setState((s) => ({ albums: [...s.albums, legacy] }));
    useCollection.getState().switchAlbum('legacy');
    expect(useCollection.getState().albumLayout).toBe('compact');
  });
});

describe('orderAlbums (pure)', () => {
  const A = snap('A');
  const B = snap('B');
  const C = snap('C');

  it('returns albums unchanged when order is undefined', () => {
    expect(orderAlbums([A, B, C], undefined).map((a) => a.id)).toEqual(['A', 'B', 'C']);
  });
  it('returns albums unchanged when order is empty', () => {
    expect(orderAlbums([A, B, C], []).map((a) => a.id)).toEqual(['A', 'B', 'C']);
  });
  it('applies a full manual order', () => {
    expect(orderAlbums([A, B, C], ['C', 'A', 'B']).map((a) => a.id)).toEqual(['C', 'A', 'B']);
  });
  it('lists ordered ids first, then unlisted albums in natural order', () => {
    expect(orderAlbums([A, B, C], ['C']).map((a) => a.id)).toEqual(['C', 'A', 'B']);
  });
  it('ignores ids in the order that no longer exist', () => {
    expect(orderAlbums([A, B], ['Z', 'B', 'A']).map((a) => a.id)).toEqual(['B', 'A']);
  });
});

describe('reorderAlbums', () => {
  it('records the manual order in albumOrder', () => {
    useCollection.getState().reorderAlbums(['S', 'A']);
    expect(useCollection.getState().albumOrder).toEqual(['S', 'A']);
  });
  it('keeps the manual order across a sync merge that re-sorts albums by id', () => {
    useCollection.getState().reorderAlbums(['S', 'A']);
    // A cloud merge rebuilds `albums` id-sorted; albumOrder must be untouched.
    const payload = {
      kind: 'collection' as const,
      v: 1,
      albums: [snap('A'), snap('S', { albumName: 'Shared' })],
    };
    useCollection.getState().applyMergedCollection(payload, new Set());
    const st = useCollection.getState();
    expect(st.albumOrder).toEqual(['S', 'A']); // preserved through sync
    expect(orderAlbums(st.albums, st.albumOrder).map((a) => a.id)).toEqual(['S', 'A']);
  });
});
