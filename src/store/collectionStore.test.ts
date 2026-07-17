import { describe, it, expect, beforeEach } from 'vitest';
import { useCollection } from './collectionStore';

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
