import { describe, it, expect } from 'vitest';
import { memberStickerIds, type GroupMember } from './groupSwap';

const member = (over: Partial<GroupMember> = {}): GroupMember => ({
  id: 'a', name: 'A', counts: {}, edition: 'latam', trackCC: false, writable: true, ...over,
});

describe('memberStickerIds', () => {
  it('includes team stickers and excludes CC when trackCC is off', () => {
    const ids = memberStickerIds(member({ trackCC: false }));
    expect(ids.has('MEX-1')).toBe(true);
    expect(ids.has('CC-5')).toBe(false);
  });

  it('includes CC stickers when trackCC is on; latam has CC-14, na does not', () => {
    expect(memberStickerIds(member({ trackCC: true, edition: 'latam' })).has('CC-14')).toBe(true);
    expect(memberStickerIds(member({ trackCC: true, edition: 'na' })).has('CC-14')).toBe(false);
    expect(memberStickerIds(member({ trackCC: true, edition: 'na' })).has('CC-5')).toBe(true);
  });
});
