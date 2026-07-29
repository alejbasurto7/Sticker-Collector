import { describe, it, expect } from 'vitest';
import { chipBadges, describeBadge, type AlbumMarkInfo } from './chipBadges';
import type { ChipRouting } from './groupSwap';

const MEMBERS: AlbumMarkInfo[] = [
  { id: 'A', name: 'Leo' },
  { id: 'B', name: 'Kai' },
  { id: 'G', name: 'Grandpa', viewOnly: true },
];

const routing = (over: Partial<ChipRouting>): Record<string, ChipRouting> => ({
  'MEX-7': { memberIds: [], ...over },
});

describe('chipBadges', () => {
  it('resolves member ids to marks, preserving routing order', () => {
    const m = chipBadges(routing({ memberIds: ['B', 'A'] }), MEMBERS, 'get');
    expect(m.get('MEX-7')!.marks.map((x) => x.name)).toEqual(['Kai', 'Leo']);
    expect(m.get('MEX-7')!.direction).toBe('get');
  });

  it('flags ambiguity and resolves hand-offs separately from write targets', () => {
    const m = chipBadges(
      routing({ memberIds: ['A'], ambiguousAmong: ['A', 'B'], handoffIds: ['G'] }),
      MEMBERS,
      'get',
    );
    const b = m.get('MEX-7')!;
    expect(b.ambiguous).toBe(true);
    expect(b.marks.map((x) => x.name)).toEqual(['Leo']);
    expect(b.handoffs.map((x) => x.name)).toEqual(['Grandpa']);
  });

  it('drops ids with no matching member instead of rendering a blank mark', () => {
    const m = chipBadges(routing({ memberIds: ['A', 'GONE'] }), MEMBERS, 'give');
    expect(m.get('MEX-7')!.marks.map((x) => x.id)).toEqual(['A']);
  });

  it('produces an entry for every routed sticker, even an unrouted one', () => {
    const m = chipBadges(routing({ memberIds: [] }), MEMBERS, 'give');
    expect(m.get('MEX-7')!.marks).toEqual([]);
  });
});

describe('describeBadge', () => {
  const badge = (over: Partial<ReturnType<typeof mk>> = {}) => ({ ...mk(), ...over });
  function mk() {
    return { direction: 'get' as const, marks: [] as AlbumMarkInfo[], ambiguous: false, handoffs: [] as AlbumMarkInfo[] };
  }

  it('names a single destination', () => {
    expect(describeBadge(badge({ marks: [MEMBERS[0]] }), 1)).toBe('1 copy, to Leo');
  });

  it('joins two destinations and pluralises copies', () => {
    expect(describeBadge(badge({ marks: [MEMBERS[0], MEMBERS[1]] }), 2)).toBe('2 copies, to Leo and Kai');
  });

  it('says "from" on the give side', () => {
    expect(describeBadge(badge({ direction: 'give', marks: [MEMBERS[1]] }), 1)).toBe('1 copy, from Kai');
  });

  it('spells out an ambiguous copy', () => {
    expect(describeBadge(badge({ marks: [MEMBERS[0]], ambiguous: true }), 1)).toBe(
      '1 copy, to Leo — another album needs it too, you choose at close',
    );
  });

  it('describes a hand-off-only sticker', () => {
    expect(describeBadge(badge({ handoffs: [MEMBERS[2]] }), 1)).toBe(
      '1 copy, for Grandpa — hand over, not recorded',
    );
  });
});
