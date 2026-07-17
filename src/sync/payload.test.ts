import { describe, it, expect } from 'vitest';
import {
  PAYLOAD_V,
  isAlbumPayload,
  isCollectionPayload,
  type AlbumPayload,
  type CollectionPayload,
} from './payload';

const albumSnap = {
  id: 'a', albumName: 'A', counts: {}, swaps: [], edition: 'latam' as const,
  trackCC: true, locked: false, activityDays: [], completedOn: null, unlockedAchievements: {},
};

describe('payload guards', () => {
  it('recognises an album payload', () => {
    const p: AlbumPayload = { kind: 'album', v: PAYLOAD_V, access: 'collaborative', album: albumSnap };
    expect(isAlbumPayload(p)).toBe(true);
    expect(isCollectionPayload(p)).toBe(false);
  });

  it('recognises a collection payload', () => {
    const p: CollectionPayload = { kind: 'collection', v: PAYLOAD_V, albums: [albumSnap] };
    expect(isCollectionPayload(p)).toBe(true);
    expect(isAlbumPayload(p)).toBe(false);
  });

  it('rejects junk and header-less blobs', () => {
    expect(isAlbumPayload(null)).toBe(false);
    expect(isAlbumPayload({})).toBe(false);
    expect(isCollectionPayload({ kind: 'collection', v: 1, albums: 'nope' })).toBe(false);
    expect(isAlbumPayload({ kind: 'album', v: 1, access: 'read-only' })).toBe(false); // no album
  });
});
