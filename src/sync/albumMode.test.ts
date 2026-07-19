import { describe, it, expect } from 'vitest';
import {
  albumMode, forcedReadOnly, effectiveReadOnly, resolveAlbumName, deleteDisposition, pickLocalAlbumId,
} from './albumMode';
import type { AlbumLink } from '../store/syncStore';

const link = (over: Partial<AlbumLink> = {}): AlbumLink => ({
  albumId: 'A', code: 'c', codeHash: 'h', writerId: 'w', role: 'owner', access: 'collaborative',
  lastVersion: 0, lastSyncedAt: null, status: 'synced', ...over,
});

const cloudLink = { code: 'C', codeHash: 'H', writerId: 'W', lastVersion: 0, lastSyncedAt: null, status: 'synced' as const };

describe('albumMode', () => {
  it('is shared when a link exists (regardless of the Cloud link)', () => {
    expect(albumMode('A', { albumLinks: { A: link() }, privateAlbumIds: [], collection: null })).toBe('shared');
  });
  it('is local when explicitly private', () => {
    expect(albumMode('A', { albumLinks: {}, privateAlbumIds: ['A'], collection: cloudLink })).toBe('local');
  });
  it('defaults to local until a Cloud code is set up', () => {
    expect(albumMode('A', { albumLinks: {}, privateAlbumIds: [], collection: null })).toBe('local');
  });
  it('defaults to cloud once a Cloud link exists', () => {
    expect(albumMode('A', { albumLinks: {}, privateAlbumIds: [], collection: cloudLink })).toBe('cloud');
  });
  it('a link wins over a private flag (shared beats local)', () => {
    expect(albumMode('A', { albumLinks: { A: link() }, privateAlbumIds: ['A'], collection: cloudLink })).toBe('shared');
  });
});

describe('forcedReadOnly / effectiveReadOnly', () => {
  it('forced only for a read-only joiner', () => {
    expect(forcedReadOnly(link({ role: 'joiner', access: 'read-only' }))).toBe(true);
    expect(forcedReadOnly(link({ role: 'owner', access: 'read-only' }))).toBe(false);
    expect(forcedReadOnly(link({ role: 'joiner', access: 'collaborative' }))).toBe(false);
    expect(forcedReadOnly(undefined)).toBe(false);
  });
  it('effective = locked OR forced', () => {
    expect(effectiveReadOnly(true, undefined)).toBe(true);
    expect(effectiveReadOnly(false, link({ role: 'joiner', access: 'read-only' }))).toBe(true);
    expect(effectiveReadOnly(false, undefined)).toBe(false);
  });
});

describe('resolveAlbumName', () => {
  it('prefers the local alias, falls back to the snapshot name', () => {
    expect(resolveAlbumName('A', 'Shared', { A: 'My alias' })).toBe('My alias');
    expect(resolveAlbumName('A', 'Shared', {})).toBe('Shared');
  });
});

describe('deleteDisposition', () => {
  it('unlink a shared album, tombstone a cloud album, local for a private album', () => {
    expect(deleteDisposition('A', { albumLinks: { A: link() }, privateAlbumIds: [] })).toBe('unlink');
    expect(deleteDisposition('A', { albumLinks: {}, privateAlbumIds: [] })).toBe('tombstone');
    expect(deleteDisposition('A', { albumLinks: {}, privateAlbumIds: ['A'] })).toBe('local');
  });
});

describe('pickLocalAlbumId', () => {
  it('keeps the remote id when free, generates on collision', () => {
    expect(pickLocalAlbumId('A', ['B', 'C'], () => 'GEN')).toBe('A');
    expect(pickLocalAlbumId('A', ['A', 'B'], () => 'GEN')).toBe('GEN');
  });
});
