import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { useCollection, orderAlbums, liveAlbums } from './collectionStore';
import { ALBUM_TYPES, ACTIVE_ALBUM_TYPE_ID } from '../data/albumTypes';
import { applyAlbumLayout, buildAlbumFor, DEFAULT_EDITION, DEFAULT_TRACK_CC } from '../data/sampleAlbum';

const snap = (id: string, over = {}) => ({ id, albumName: id, counts: {}, swaps: [], edition: 'latam' as const, trackCC: true, locked: false, activityDays: [], completedOn: null, unlockedAchievements: {}, ...over });

// The "create an album of another type" test needs a second entry in the registry.
// While only one album type exists (e.g. after the Adrenalyn album was removed) it
// skips, and auto-runs again once a second type returns.
const OTHER_TYPE_ID = Object.keys(ALBUM_TYPES).find((id) => id !== ACTIVE_ALBUM_TYPE_ID);

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

describe('createAlbum (collection type + name)', () => {
  beforeEach(resetToSingleAlbum);

  it.skipIf(!OTHER_TYPE_ID)('creates an album of the given type + default variant + name and makes it active', () => {
    const otherId = OTHER_TYPE_ID!;
    const variant = ALBUM_TYPES[otherId].defaultVariant;
    useCollection.getState().createAlbum({ albumTypeId: otherId, name: "Leo's" });
    const s = useCollection.getState();
    const active = s.albums.find((a) => a.id === s.activeAlbumId)!;
    expect(active.albumTypeId).toBe(otherId);
    expect(active.edition).toBe(variant);
    expect(active.albumName).toBe("Leo's");
    expect(s.albumTypeId).toBe(otherId); // top-level mirror follows the new album
  });

  it('defaults to the active type + an auto name when no opts are given', () => {
    useCollection.getState().createAlbum();
    const s = useCollection.getState();
    const active = s.albums.find((a) => a.id === s.activeAlbumId)!;
    expect(active.albumTypeId).toBe(ACTIVE_ALBUM_TYPE_ID);
    expect(active.albumName).toBeTruthy();
  });

  it('creates the very first album on an empty (album-less) store', () => {
    useCollection.setState({ albums: [], activeAlbumId: '' } as any, false);
    useCollection.getState().createAlbum({ albumTypeId: ACTIVE_ALBUM_TYPE_ID, name: 'First' });
    const s = useCollection.getState();
    expect(s.albums).toHaveLength(1);
    expect(s.activeAlbumId).toBe(s.albums[0].id);
    expect(s.albumName).toBe('First');
  });
});

describe('deleteAlbum to zero', () => {
  beforeEach(resetToSingleAlbum);
  it('leaves the store album-less (→ collection picker) instead of rebuilding a default', () => {
    const active = useCollection.getState().activeAlbumId;
    useCollection.getState().deleteAlbum(active);
    const s = useCollection.getState();
    expect(s.albums).toEqual([]);
    expect(s.activeAlbumId).toBe('');
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

describe('group CRUD', () => {
  beforeEach(() => {
    useCollection.setState({ groups: [] } as any, false);
  });

  it('creates a group with trimmed name and members, returning its id', () => {
    const id = useCollection.getState().createGroup('  Kids  ', ['A', 'S']);
    const g = useCollection.getState().groups.find((x) => x.id === id)!;
    expect(g.name).toBe('Kids');
    expect(g.memberIds).toEqual(['A', 'S']);
    expect(g.swaps).toEqual([]);
  });

  it('renames, replaces members, and disbands', () => {
    const id = useCollection.getState().createGroup('G', ['A', 'S']);
    useCollection.getState().renameGroup(id, 'Family');
    useCollection.getState().setGroupMembers(id, ['A', 'S', 'B']);
    const g = useCollection.getState().groups.find((x) => x.id === id)!;
    expect(g.name).toBe('Family');
    expect(g.memberIds).toEqual(['A', 'S', 'B']);
    useCollection.getState().disbandGroup(id);
    expect(useCollection.getState().groups.find((x) => x.id === id)).toBeUndefined();
  });
});

describe('applyInternalMove', () => {
  const both = new Set(['A', 'B']);
  beforeEach(() => {
    useCollection.setState({
      counts: { 'MEX-7': 2 }, swaps: [], activeAlbumId: 'A',
      albums: [snap('A', { counts: { 'MEX-7': 2 } }), snap('B', { counts: { 'MEX-7': 0 } })],
    } as any, false);
  });

  it('moves a copy from the active album to a parked album', () => {
    useCollection.getState().applyInternalMove('A', 'B', 'MEX-7', both);
    const st = useCollection.getState();
    expect(st.counts['MEX-7']).toBe(1);
    expect(st.albums.find((a) => a.id === 'B')!.counts['MEX-7']).toBe(1);
  });

  it('moves a copy between two parked albums without touching the active mirror', () => {
    useCollection.setState({
      counts: { 'MEX-7': 9 }, activeAlbumId: 'A',
      albums: [snap('A', { counts: { 'MEX-7': 9 } }), snap('B', { counts: { 'MEX-7': 3 } }), snap('C', { counts: { 'MEX-7': 0 } })],
    } as any, false);
    useCollection.getState().applyInternalMove('B', 'C', 'MEX-7', new Set(['B', 'C']));
    const st = useCollection.getState();
    expect(st.counts['MEX-7']).toBe(9);
    expect(st.albums.find((a) => a.id === 'B')!.counts['MEX-7']).toBe(2);
    expect(st.albums.find((a) => a.id === 'C')!.counts['MEX-7']).toBe(1);
  });

  it('refuses to move the source album\'s last copy', () => {
    // The bite: double-tapping Apply before the pool memo recomputes. The first tap takes
    // A from 2 to 1; the second must be a no-op rather than emptying A.
    useCollection.getState().applyInternalMove('A', 'B', 'MEX-7', both);
    useCollection.getState().applyInternalMove('A', 'B', 'MEX-7', both);
    const st = useCollection.getState();
    expect(st.counts['MEX-7']).toBe(1);
    expect(st.albums.find((a) => a.id === 'B')!.counts['MEX-7']).toBe(1);
  });

  it("refuses to move a spare reserved by the source album's own open swap", () => {
    const reserved = {
      id: 'sw1', name: 'x', createdAt: 1, status: 'open' as const,
      theirNeeds: [], theirSwaps: [], giving: ['MEX-7'], receiving: [],
    };
    useCollection.setState({ swaps: [reserved] } as any, false); // 'A' is active
    useCollection.getState().applyInternalMove('A', 'B', 'MEX-7', both);
    const st = useCollection.getState();
    expect(st.counts['MEX-7']).toBe(2);
    expect(st.albums.find((a) => a.id === 'B')!.counts['MEX-7'] ?? 0).toBe(0);
  });

  it('refuses a target that is not writable', () => {
    useCollection.getState().applyInternalMove('A', 'B', 'MEX-7', new Set(['A']));
    const st = useCollection.getState();
    expect(st.counts['MEX-7']).toBe(2);
    expect(st.albums.find((a) => a.id === 'B')!.counts['MEX-7'] ?? 0).toBe(0);
  });

  it('refuses a source that is not writable', () => {
    useCollection.getState().applyInternalMove('A', 'B', 'MEX-7', new Set(['B']));
    expect(useCollection.getState().counts['MEX-7']).toBe(2);
  });
});

describe('combined-swap CRUD', () => {
  let gid: string;
  beforeEach(() => {
    useCollection.setState({ groups: [] } as any, false);
    gid = useCollection.getState().createGroup('Kids', ['A', 'B']);
  });

  it('creates a combined swap on the group with receivingQty', () => {
    const sid = useCollection.getState().createCombinedSwap(gid, {
      name: 'Carlos', theirNeeds: [], theirSwaps: [], giving: ['MEX-9'], receiving: ['MEX-3'],
      receivingQty: { 'MEX-3': 2 },
    });
    const g = useCollection.getState().groups.find((x) => x.id === gid)!;
    expect(g.swaps[0].id).toBe(sid);
    expect(g.swaps[0].receiving).toEqual(['MEX-3']);
    expect(g.swaps[0].receivingQty).toEqual({ 'MEX-3': 2 });
    expect(g.swaps[0].status).toBe('open');
  });

  it('updates and deletes a combined swap', () => {
    const sid = useCollection.getState().createCombinedSwap(gid, {
      name: 'x', theirNeeds: [], theirSwaps: [], giving: [], receiving: [],
    });
    useCollection.getState().updateCombinedSwap(gid, sid, { name: 'Renamed', giving: ['MEX-1'] });
    let g = useCollection.getState().groups.find((x) => x.id === gid)!;
    expect(g.swaps[0].name).toBe('Renamed');
    expect(g.swaps[0].giving).toEqual(['MEX-1']);
    useCollection.getState().deleteCombinedSwap(gid, sid);
    g = useCollection.getState().groups.find((x) => x.id === gid)!;
    expect(g.swaps).toEqual([]);
  });
});

describe('closeCombinedSwap / rollbackCombinedSwap', () => {
  let gid: string;
  beforeEach(() => {
    useCollection.setState({
      counts: { 'MEX-9': 2 }, activeAlbumId: 'A', groups: [],
      activityDays: [], firstStickerAt: undefined, completedOn: null,
      albums: [snap('A', { counts: { 'MEX-9': 2 } }), snap('B', { counts: { 'MEX-3': 0 } })],
    } as any, false);
    gid = useCollection.getState().createGroup('Kids', ['A', 'B']);
  });

  it('applies per-album deltas, marks closed, and stores settledByAlbum', () => {
    const sid = useCollection.getState().createCombinedSwap(gid, {
      name: 'c', theirNeeds: [], theirSwaps: [], giving: ['MEX-9'], receiving: ['MEX-3'],
    });
    useCollection.getState().closeCombinedSwap(gid, sid, {
      givenIds: ['MEX-9'], receivedIds: ['MEX-3'],
      settledByAlbum: { A: { 'MEX-9': -1 }, B: { 'MEX-3': 1 } },
    });
    const st = useCollection.getState();
    expect(st.counts['MEX-9']).toBe(1);
    expect(st.albums.find((a) => a.id === 'B')!.counts['MEX-3']).toBe(1);
    const sw = st.groups[0].swaps[0];
    expect(sw.status).toBe('closed');
    expect(sw.settledByAlbum).toEqual({ A: { 'MEX-9': -1 }, B: { 'MEX-3': 1 } });
  });

  it('records the delta clamping actually applied, not the one that was intended', () => {
    // 'B' holds no MEX-3, so the -1 clamps to nothing. Storing the intended -1 would make
    // rollback invent a copy the user never had.
    const sid = useCollection.getState().createCombinedSwap(gid, {
      name: 'c', theirNeeds: [], theirSwaps: [], giving: ['MEX-3'], receiving: [],
    });
    useCollection.getState().closeCombinedSwap(gid, sid, {
      givenIds: ['MEX-3'], receivedIds: [],
      settledByAlbum: { B: { 'MEX-3': -1 } },
    });
    expect(useCollection.getState().groups[0].swaps[0].settledByAlbum).toEqual({});
  });

  it('rollback of a clamped give does not invent a copy', () => {
    const sid = useCollection.getState().createCombinedSwap(gid, {
      name: 'c', theirNeeds: [], theirSwaps: [], giving: ['MEX-3'], receiving: [],
    });
    useCollection.getState().closeCombinedSwap(gid, sid, {
      givenIds: ['MEX-3'], receivedIds: [],
      settledByAlbum: { B: { 'MEX-3': -1 } },
    });
    useCollection.getState().rollbackCombinedSwap(gid, sid);
    expect(useCollection.getState().albums.find((a) => a.id === 'B')!.counts['MEX-3'] ?? 0).toBe(0);
  });

  it('drops deltas aimed at an album this device does not have', () => {
    const sid = useCollection.getState().createCombinedSwap(gid, {
      name: 'c', theirNeeds: [], theirSwaps: [], giving: [], receiving: ['MEX-3'],
    });
    useCollection.getState().closeCombinedSwap(gid, sid, {
      givenIds: [], receivedIds: ['MEX-3'],
      settledByAlbum: { GONE: { 'MEX-3': 1 }, B: { 'MEX-3': 1 } },
    });
    expect(useCollection.getState().groups[0].swaps[0].settledByAlbum).toEqual({ B: { 'MEX-3': 1 } });
  });

  it('counts as a collecting day when the active album receives a copy', () => {
    const sid = useCollection.getState().createCombinedSwap(gid, {
      name: 'c', theirNeeds: [], theirSwaps: [], giving: [], receiving: ['MEX-3'],
    });
    useCollection.getState().closeCombinedSwap(gid, sid, {
      givenIds: [], receivedIds: ['MEX-3'],
      settledByAlbum: { A: { 'MEX-3': 1 } },
    });
    const st = useCollection.getState();
    expect(st.activityDays).toHaveLength(1);
    expect(st.firstStickerAt).toBeTypeOf('number');
  });

  it('does not count as a collecting day when the active album only gives', () => {
    const sid = useCollection.getState().createCombinedSwap(gid, {
      name: 'c', theirNeeds: [], theirSwaps: [], giving: ['MEX-9'], receiving: ['MEX-3'],
    });
    // The received copy lands in parked 'B'; 'A' only hands one over.
    useCollection.getState().closeCombinedSwap(gid, sid, {
      givenIds: ['MEX-9'], receivedIds: ['MEX-3'],
      settledByAlbum: { A: { 'MEX-9': -1 }, B: { 'MEX-3': 1 } },
    });
    expect(useCollection.getState().activityDays).toEqual([]);
  });

  it('credits a parked album that received a copy with its own collecting day', () => {
    // Activity used to be written only to the top-level fields — the ACTIVE album's — so a
    // received copy routed into a parked album grew nobody's streak.
    const sid = useCollection.getState().createCombinedSwap(gid, {
      name: 'c', theirNeeds: [], theirSwaps: [], giving: ['MEX-9'], receiving: ['MEX-3'],
    });
    useCollection.getState().closeCombinedSwap(gid, sid, {
      givenIds: ['MEX-9'], receivedIds: ['MEX-3'],
      settledByAlbum: { A: { 'MEX-9': -1 }, B: { 'MEX-3': 1 } },
    });
    const st = useCollection.getState();
    const b = st.albums.find((a) => a.id === 'B')!;
    expect(b.activityDays).toHaveLength(1);
    expect(b.firstStickerAt).toBeTypeOf('number');
    expect(st.activityDays).toEqual([]); // active album only gave — not a collecting day
  });

  it('does not credit a parked album that only gave', () => {
    const sid = useCollection.getState().createCombinedSwap(gid, {
      name: 'c', theirNeeds: [], theirSwaps: [], giving: ['MEX-3'], receiving: [],
    });
    useCollection.setState({ albums: [snap('A', { counts: { 'MEX-9': 2 } }), snap('B', { counts: { 'MEX-3': 2 } })] } as any, false);
    useCollection.getState().closeCombinedSwap(gid, sid, {
      givenIds: ['MEX-3'], receivedIds: [],
      settledByAlbum: { B: { 'MEX-3': -1 } },
    });
    expect(useCollection.getState().albums.find((a) => a.id === 'B')!.activityDays).toEqual([]);
  });

  it('rollback reverses the exact per-album deltas and reopens', () => {
    const sid = useCollection.getState().createCombinedSwap(gid, {
      name: 'c', theirNeeds: [], theirSwaps: [], giving: ['MEX-9'], receiving: ['MEX-3'],
    });
    useCollection.getState().closeCombinedSwap(gid, sid, {
      givenIds: ['MEX-9'], receivedIds: ['MEX-3'],
      settledByAlbum: { A: { 'MEX-9': -1 }, B: { 'MEX-3': 1 } },
    });
    useCollection.getState().rollbackCombinedSwap(gid, sid);
    const st = useCollection.getState();
    expect(st.counts['MEX-9']).toBe(2);
    expect(st.albums.find((a) => a.id === 'B')!.counts['MEX-3']).toBe(0);
    expect(st.groups[0].swaps[0].status).toBe('open');
    expect(st.groups[0].swaps[0].settledByAlbum).toBeUndefined();
  });
});

describe('deleteAlbum prunes groups', () => {
  beforeEach(() => {
    useCollection.setState({
      activeAlbumId: 'A', counts: {}, groups: [],
      albums: [snap('A'), snap('B'), snap('C')],
    } as any, false);
  });

  it('removes a deleted member and keeps a group with ≥2 members', () => {
    const gid = useCollection.getState().createGroup('G', ['A', 'B', 'C']);
    useCollection.getState().deleteAlbum('C');
    const g = useCollection.getState().groups.find((x) => x.id === gid)!;
    expect(g.memberIds).toEqual(['A', 'B']);
  });

  it('auto-disbands a group that drops below 2 members', () => {
    const gid = useCollection.getState().createGroup('G', ['B', 'C']);
    useCollection.getState().deleteAlbum('C');
    expect(useCollection.getState().groups.find((x) => x.id === gid)).toBeUndefined();
  });
});

describe('applyMergedCollection adopts groups', () => {
  beforeEach(() => {
    useCollection.setState({
      activeAlbumId: 'A', counts: {}, groups: [],
      albums: [snap('A', { counts: {} }), snap('S')],
    } as any, false);
  });

  it('adopts the merged group set from the payload', () => {
    const groups = [{ id: 'g1', name: 'Kids', memberIds: ['A', 'S'], swaps: [] }];
    useCollection.getState().applyMergedCollection(
      { kind: 'collection', v: 1, albums: [snap('A')], groups } as any, new Set(['S']),
    );
    expect(useCollection.getState().groups).toEqual(groups);
  });

  it('clears groups when the merged payload has none', () => {
    useCollection.setState({ groups: [{ id: 'g1', name: 'x', memberIds: ['A', 'S'], swaps: [] }] } as any, false);
    useCollection.getState().applyMergedCollection(
      { kind: 'collection', v: 1, albums: [snap('A')] } as any, new Set(['S']),
    );
    expect(useCollection.getState().groups).toEqual([]);
  });
});

describe('liveAlbums', () => {
  it('reports the active album from the live top-level fields, not its parked snapshot', () => {
    useCollection.getState().addOne('MEX-2');
    const active = liveAlbums(useCollection.getState()).find((a) => a.id === 'A')!;
    expect(active.counts).toEqual({ 'MEX-1': 1, 'MEX-2': 1 });
  });

  it('reflects a combined settlement in the ACTIVE album, as it already does in parked ones', () => {
    // The reported bug: closing a group swap where every member gained a copy left the
    // library card of the CURRENT album showing its pre-swap total, while the parked
    // members updated. applyAlbumDeltas writes the active album's delta to top-level
    // `counts` only, so anything reading `albums` directly shows stale progress.
    useCollection.setState({
      counts: {}, activeAlbumId: 'A', groups: [],
      albums: [snap('A'), snap('B'), snap('C')],
    } as any, false);
    const gid = useCollection.getState().createGroup('Kids', ['A', 'B', 'C']);
    const sid = useCollection.getState().createCombinedSwap(gid, {
      name: 'c', theirNeeds: [], theirSwaps: [], giving: [], receiving: ['MEX-3'],
    });
    useCollection.getState().closeCombinedSwap(gid, sid, {
      givenIds: [], receivedIds: ['MEX-3'],
      settledByAlbum: { A: { 'MEX-3': 1 }, B: { 'MEX-3': 1 }, C: { 'MEX-3': 1 } },
    });
    const list = liveAlbums(useCollection.getState());
    expect(list.map((a) => a.counts['MEX-3'])).toEqual([1, 1, 1]);
  });

  it('leaves parked albums exactly as stored', () => {
    const before = useCollection.getState().albums.find((a) => a.id === 'S')!;
    expect(liveAlbums(useCollection.getState()).find((a) => a.id === 'S')).toBe(before);
  });

  it('invents no album while the collection is empty (album-less first run)', () => {
    useCollection.setState({ activeAlbumId: '', albums: [] } as any, false);
    expect(liveAlbums(useCollection.getState())).toEqual([]);
  });
});

describe('combined settlement stamps completion against the RIGHT album', () => {
  // The reason this was deferred: completion has to be measured against the album that
  // gained the copy — its own type/edition/CC layout — not against whatever layout the
  // active album happens to have live. Here the two albums track opt-in sections
  // differently, so the two layouts hold different sticker sets.
  let gid: string;

  /** Every sticker of a layout owned, minus `hold` — the copy the swap will deliver. */
  const fullExcept = (trackCC: boolean, hold: string) => {
    const layout = buildAlbumFor(ACTIVE_ALBUM_TYPE_ID, 'latam', trackCC);
    const counts = Object.fromEntries(layout.stickers.map((s) => [s.id, 1]));
    delete counts[hold];
    return counts;
  };
  const anyStickerOf = (trackCC: boolean) =>
    buildAlbumFor(ACTIVE_ALBUM_TYPE_ID, 'latam', trackCC).stickers.at(-1)!.id;

  afterEach(() => {
    applyAlbumLayout(ACTIVE_ALBUM_TYPE_ID, DEFAULT_EDITION, DEFAULT_TRACK_CC);
  });

  const seed = (activeTrackCC: boolean, parked: Record<string, unknown>) => {
    useCollection.setState({
      counts: {}, activeAlbumId: 'A', groups: [], trackCC: activeTrackCC, edition: 'latam',
      activityDays: [], firstStickerAt: undefined, completedOn: null,
      albums: [snap('A', { trackCC: activeTrackCC }), snap('B', parked)],
    } as any, false);
    // The live layout mirrors the ACTIVE album — the one the old code measured against.
    applyAlbumLayout(ACTIVE_ALBUM_TYPE_ID, 'latam', activeTrackCC);
    gid = useCollection.getState().createGroup('Kids', ['A', 'B']);
  };

  it("stamps a parked album complete when its OWN layout is finished", () => {
    const last = anyStickerOf(false);
    // B tracks no opt-in section; the active album does, so its layout is the larger one.
    seed(true, { trackCC: false, counts: fullExcept(false, last) });
    const sid = useCollection.getState().createCombinedSwap(gid, {
      name: 'c', theirNeeds: [], theirSwaps: [], giving: [], receiving: [last],
    });
    useCollection.getState().closeCombinedSwap(gid, sid, {
      givenIds: [], receivedIds: [last], settledByAlbum: { B: { [last]: 1 } },
    });
    expect(useCollection.getState().albums.find((a) => a.id === 'B')!.completedOn).not.toBeNull();
  });

  it("does not stamp a parked album complete on the active album's shorter layout", () => {
    const last = anyStickerOf(false);
    // Now B is the one tracking the opt-in section: finishing every sticker of the ACTIVE
    // album's shorter layout still leaves B's own album unfinished.
    seed(false, { trackCC: true, counts: fullExcept(false, last) });
    const sid = useCollection.getState().createCombinedSwap(gid, {
      name: 'c', theirNeeds: [], theirSwaps: [], giving: [], receiving: [last],
    });
    useCollection.getState().closeCombinedSwap(gid, sid, {
      givenIds: [], receivedIds: [last], settledByAlbum: { B: { [last]: 1 } },
    });
    expect(useCollection.getState().albums.find((a) => a.id === 'B')!.completedOn).toBeNull();
  });
});
