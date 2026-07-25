import { describe, it, expect } from 'vitest';
import { buildGroupMembers, groupForAlbum } from './groupMembers';
import type { AlbumSnapshot } from '../store/collectionStore';
import type { AlbumLink } from '../store/syncStore';

const snap = (id: string, over: Partial<AlbumSnapshot> = {}): AlbumSnapshot => ({
  id, albumName: id, counts: {}, swaps: [], edition: 'latam', trackCC: false,
  locked: false, activityDays: [], completedOn: null, unlockedAchievements: {}, ...over,
});
const active = {
  id: 'A', counts: { 'MEX-1': 2 }, edition: 'latam' as const, trackCC: false, albumName: 'A', swaps: [],
};
const joinerRO: AlbumLink = {
  albumId: 'C', role: 'joiner', access: 'read-only',
  code: 'x', codeHash: 'x', writerId: 'w', lastVersion: 0, lastSyncedAt: null, status: 'synced',
};

describe('buildGroupMembers', () => {
  it('reads the ACTIVE member from top-level fields, parked members from the snapshot', () => {
    const parked = [snap('A', { counts: { 'MEX-1': 99 } }), snap('B', { counts: { 'MEX-1': 0 } })];
    const members = buildGroupMembers(['A', 'B'], parked, active, {}, {});
    expect(members.map((m) => m.id)).toEqual(['A', 'B']);
    expect(members[0].counts).toEqual({ 'MEX-1': 2 }); // top-level wins over stale parked 99
    expect(members[1].counts).toEqual({ 'MEX-1': 0 });
    expect(members.every((m) => m.writable)).toBe(true);
  });

  it('drops ids with no resolvable album (per-device resolution)', () => {
    const members = buildGroupMembers(['A', 'GHOST'], [snap('A')], active, {}, {});
    expect(members.map((m) => m.id)).toEqual(['A']);
  });

  it('marks a read-only joined share as a non-writable (view-only) member', () => {
    const members = buildGroupMembers(['C'], [snap('C')], active, { C: joinerRO }, {});
    expect(members[0].writable).toBe(false);
  });

  it('resolves the per-device display name via localAlbumNames', () => {
    const members = buildGroupMembers(['B'], [snap('B', { albumName: 'synced' })], active, {}, { B: 'my alias' });
    expect(members[0].name).toBe('my alias');
  });

  it('carries each member solo swaps for reservation roll-up', () => {
    const sw = {
      id: 's1', name: 'x', createdAt: 0, status: 'open' as const,
      theirNeeds: [], theirSwaps: [], giving: [], receiving: [],
    };
    const members = buildGroupMembers(['B'], [snap('B', { swaps: [sw] })], active, {}, {});
    expect(members[0].swaps).toEqual([sw]);
  });
});

describe('groupForAlbum', () => {
  it('finds the single group containing the album, else undefined', () => {
    const groups = [{ id: 'g1', name: 'K', memberIds: ['A', 'B'], swaps: [] }];
    expect(groupForAlbum(groups, 'B')?.id).toBe('g1');
    expect(groupForAlbum(groups, 'Z')).toBeUndefined();
  });
});
