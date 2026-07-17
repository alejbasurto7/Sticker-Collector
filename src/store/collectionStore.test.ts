import { beforeEach, describe, it, expect } from 'vitest';
import { useCollection } from './collectionStore';

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

beforeEach(resetToSingleAlbum);

describe('setAlbumLayout', () => {
  it('updates the top-level field and mirrors it into the active parked snapshot', () => {
    useCollection.getState().setAlbumLayout('pages');
    const s = useCollection.getState();
    expect(s.albumLayout).toBe('pages');
    expect(s.albums.find((a) => a.id === s.activeAlbumId)?.albumLayout).toBe('pages');
  });
});

describe('per-album layout', () => {
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
