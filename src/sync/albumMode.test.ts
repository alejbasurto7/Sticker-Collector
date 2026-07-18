import { describe, it, expect } from 'vitest';
import {
  albumMode, forcedReadOnly, effectiveReadOnly, resolveAlbumName, deleteDisposition, pickLocalAlbumId,
} from './albumMode';
import type { AlbumLink } from '../store/syncStore';

const link = (over: Partial<AlbumLink> = {}): AlbumLink => ({
  albumId: 'A', code: 'c', codeHash: 'h', writerId: 'w', role: 'owner', access: 'collaborative',
  lastVersion: 0, lastSyncedAt: null, status: 'synced', ...over,
});

describe('albumMode', () => {
  it('is shared when a link exists', () => {
    expect(albumMode('A', { albumLinks: { A: link() }, privateAlbumIds: [] })).toBe('shared');
  });
  it('is local when private', () => {
    expect(albumMode('A', { albumLinks: {}, privateAlbumIds: ['A'] })).toBe('local');
  });
  it('is cloud otherwise', () => {
    expect(albumMode('A', { albumLinks: {}, privateAlbumIds: [] })).toBe('cloud');
  });
  it('a link wins over a private flag (shared beats local)', () => {
    expect(albumMode('A', { albumLinks: { A: link() }, privateAlbumIds: ['A'] })).toBe('shared');
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
