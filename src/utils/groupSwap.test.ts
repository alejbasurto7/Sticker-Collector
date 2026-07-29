import { describe, it, expect } from 'vitest';
import type { Counts } from '../types';
import {
  memberStickerIds,
  computeGroupPool,
  computeGroupCandidates,
  routeReceived,
  routeGiven,
  routeForDisplay,
  reservedSparesOf,
  swapRoutingInput,
  applyRouteOverride,
  overrideIsLive,
  type GroupMember,
  type ChipRouting,
} from './groupSwap';
import type { ParsedList } from './import';
import type { Reservations } from './swap';

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

const w = (id: string, counts: Counts): GroupMember =>
  ({ id, name: id, counts, edition: 'latam', trackCC: false, writable: true });
const v = (id: string, counts: Counts): GroupMember =>
  ({ id, name: id, counts, edition: 'latam', trackCC: false, writable: false });

describe('computeGroupPool', () => {
  it('A=2,B=0 → internal move A→B, nothing external', () => {
    const pool = computeGroupPool([w('A', { 'MEX-7': 2 }), w('B', { 'MEX-7': 0 })]);
    expect(pool.give['MEX-7']).toBeUndefined();
    expect(pool.get['MEX-7']).toBeUndefined();
    expect(pool.internalMoves).toEqual([{ id: 'MEX-7', fromId: 'A', toId: 'B' }]);
  });

  it('both missing → external get ×2', () => {
    const pool = computeGroupPool([w('A', { 'MEX-3': 0 }), w('B', { 'MEX-3': 0 })]);
    expect(pool.get['MEX-3']).toBe(2);
    expect(pool.writableGet['MEX-3']).toBe(2);
    expect(pool.give['MEX-3']).toBeUndefined();
  });

  it('A=3,B=0 → external give ×1 AND internal move', () => {
    const pool = computeGroupPool([w('A', { 'MEX-9': 3 }), w('B', { 'MEX-9': 0 })]);
    expect(pool.give['MEX-9']).toBe(1);
    expect(pool.get['MEX-9']).toBeUndefined();
    expect(pool.internalMoves).toEqual([{ id: 'MEX-9', fromId: 'A', toId: 'B' }]);
  });

  it('A=2,B=1 → external give ×1, no move', () => {
    const pool = computeGroupPool([w('A', { 'MEX-4': 2 }), w('B', { 'MEX-4': 1 })]);
    expect(pool.give['MEX-4']).toBe(1);
    expect(pool.internalMoves).toEqual([]);
  });

  it('mixed trackCC: CC-5 only in A → target 1, only A can need it', () => {
    const a: GroupMember = { id: 'A', name: 'A', counts: { 'CC-5': 0 }, edition: 'latam', trackCC: true, writable: true };
    const b: GroupMember = { id: 'B', name: 'B', counts: {}, edition: 'latam', trackCC: false, writable: true };
    const pool = computeGroupPool([a, b]);
    expect(pool.get['CC-5']).toBe(1);
  });

  it('view-only member adds to get but not to give/writableGet', () => {
    const pool = computeGroupPool([w('A', { 'MEX-2': 1 }), v('V', { 'MEX-2': 0 })]);
    expect(pool.get['MEX-2']).toBe(1);
    expect(pool.writableGet['MEX-2']).toBeUndefined();
    expect(pool.give['MEX-2']).toBeUndefined();
  });
});

const list = (over: Partial<ParsedList> = {}): ParsedList =>
  ({ needs: [], swaps: [], swapQty: {}, needQty: {}, all: {}, unmatched: [], ...over });

describe('computeGroupCandidates', () => {
  it('offers pooled surplus for their need, capped by their needed copies', () => {
    const members = [w('A', { 'MEX-9': 3 }), w('B', { 'MEX-9': 3 })]; // pooled give = 4
    const c = computeGroupCandidates(members, list({ needs: ['MEX-9'], needQty: { 'MEX-9': 2 } }));
    expect(c.youGive).toEqual(['MEX-9']);
    expect(c.giveQty['MEX-9']).toBe(2);
  });

  it('requests two copies when both writable members miss it', () => {
    const members = [w('A', { 'MEX-3': 0 }), w('B', { 'MEX-3': 0 })];
    const c = computeGroupCandidates(members, list({ swaps: ['MEX-3'], swapQty: { 'MEX-3': 5 } }));
    expect(c.youGet).toEqual(['MEX-3']);
    expect(c.getQty['MEX-3']).toBe(2);
  });

  it('flags a give whose only spare is reserved elsewhere', () => {
    const members = [w('A', { 'MEX-9': 2 }), w('B', { 'MEX-9': 1 })]; // pooled give = 1
    const reservations: Reservations = { committedGive: new Map([['MEX-9', 1]]), committedGet: new Set() };
    const c = computeGroupCandidates(members, list({ needs: ['MEX-9'] }), reservations);
    expect(c.youGive).toEqual(['MEX-9']);
    expect(c.giveReserved.has('MEX-9')).toBe(true);
  });

  it('includes a view-only need in youGet', () => {
    const members = [w('A', { 'MEX-2': 1 }), v('V', { 'MEX-2': 0 })];
    const c = computeGroupCandidates(members, list({ swaps: ['MEX-2'] }));
    expect(c.youGet).toEqual(['MEX-2']);
    expect(c.getQty['MEX-2']).toBe(1);
  });
});

describe('routeReceived', () => {
  it('routes to the only needer, unambiguously', () => {
    const members = [w('A', { 'MEX-9': 1 }), w('B', { 'MEX-9': 0 })];
    const r = routeReceived(members, { 'MEX-9': 1 });
    expect(r.writes).toEqual({ B: { 'MEX-9': 1 } });
    expect(r.ambiguous).toEqual([]);
  });

  it('splits two copies one-each with no ambiguity', () => {
    const members = [w('A', { 'MEX-3': 0 }), w('B', { 'MEX-3': 0 })];
    const r = routeReceived(members, { 'MEX-3': 2 });
    expect(r.writes).toEqual({ A: { 'MEX-3': 1 }, B: { 'MEX-3': 1 } });
    expect(r.ambiguous).toEqual([]);
  });

  it('auto-assigns the first needer and flags ambiguity when one copy, two needers', () => {
    const members = [w('A', { 'MEX-7': 0 }), w('B', { 'MEX-7': 0 })];
    const r = routeReceived(members, { 'MEX-7': 1 });
    expect(r.writes).toEqual({ A: { 'MEX-7': 1 } });
    expect(r.ambiguous).toEqual([
      { id: 'MEX-7', chosenIds: ['A'], options: [{ id: 'A', name: 'A' }, { id: 'B', name: 'B' }] },
    ]);
  });

  it('reminds to hand off to a view-only needer without writing it', () => {
    const members = [w('A', { 'MEX-2': 1 }), v('V', { 'MEX-2': 0 })];
    const r = routeReceived(members, { 'MEX-2': 1 });
    // The single copy goes to V by hand; nothing is credited to A. (Before this fix the
    // copy was double-counted: written to A AND flagged as a hand-off to V.)
    expect(r.writes).toEqual({});
    expect(r.handoffs).toEqual([{ id: 'MEX-2', memberId: 'V', memberName: 'V' }]);
  });

  it('a second copy beyond the hand-off is parked in a writable album', () => {
    const members = [w('A', { 'MEX-2': 1 }), v('V', { 'MEX-2': 0 })];
    const r = routeReceived(members, { 'MEX-2': 2 });
    expect(r.writes).toEqual({ A: { 'MEX-2': 1 } });
    expect(r.handoffs).toEqual([{ id: 'MEX-2', memberId: 'V', memberName: 'V' }]);
  });

  it('a view-only needer gets no reminder when no copy is left for it', () => {
    const members = [w('A', { 'MEX-2': 0 }), v('V', { 'MEX-2': 0 })];
    const r = routeReceived(members, { 'MEX-2': 1 });
    expect(r.writes).toEqual({ A: { 'MEX-2': 1 } });
    expect(r.handoffs).toEqual([]);
  });
});

describe('routeGiven', () => {
  it('decrements from the writable member holding the spare', () => {
    const members = [w('A', { 'MEX-9': 2 }), w('B', { 'MEX-9': 1 })];
    const r = routeGiven(members, { 'MEX-9': 1 });
    expect(r.writes).toEqual({ A: { 'MEX-9': -1 } });
    expect(r.short).toEqual({});
  });

  it('prefers the member with the most spares', () => {
    const members = [w('A', { 'MEX-9': 2 }), w('B', { 'MEX-9': 4 })];
    const r = routeGiven(members, { 'MEX-9': 1 });
    expect(r.writes).toEqual({ B: { 'MEX-9': -1 } });
  });

  it("skips a spare reserved by that album's own solo swap", () => {
    const members = [w('A', { 'MEX-9': 2 }), w('B', { 'MEX-9': 3 })];
    const r = routeGiven(members, { 'MEX-9': 1 }, { A: { 'MEX-9': 1 } });
    expect(r.writes).toEqual({ B: { 'MEX-9': -1 } });
  });

  it('records a shortfall when the pool cannot cover the give', () => {
    const members = [w('A', { 'MEX-9': 1 }), w('B', { 'MEX-9': 1 })];
    const r = routeGiven(members, { 'MEX-9': 1 });
    expect(r.writes).toEqual({});
    expect(r.short).toEqual({ 'MEX-9': 1 });
  });
});

describe('routeForDisplay', () => {
  const spares = (n: number) => ({ 'MEX-9': n });

  it('give routed to one member yields one mark', () => {
    const members = [w('A', { 'MEX-9': 2 }), w('B', { 'MEX-9': 1 })];
    const r = routeForDisplay(members, { 'MEX-9': 1 }, {});
    expect(r.give['MEX-9'].memberIds).toEqual(['A']);
  });

  it('two copies from one member is still one mark (qty lives on the chip)', () => {
    const members = [w('A', { 'MEX-9': 3 }), w('B', { 'MEX-9': 1 })];
    const r = routeForDisplay(members, { 'MEX-9': 2 }, {});
    expect(r.give['MEX-9'].memberIds).toEqual(['A']);
  });

  it('two copies from two members yields two marks in group order', () => {
    const members = [w('A', { 'MEX-9': 2 }), w('B', { 'MEX-9': 2 })];
    const r = routeForDisplay(members, { 'MEX-9': 2 }, {});
    expect(r.give['MEX-9'].memberIds).toEqual(['A', 'B']);
  });

  it('two needers and two copies: both marked, not ambiguous', () => {
    const members = [w('A', { 'MEX-7': 0 }), w('B', { 'MEX-7': 0 })];
    const r = routeForDisplay(members, {}, { 'MEX-7': 2 });
    expect(r.get['MEX-7'].memberIds).toEqual(['A', 'B']);
    expect(r.get['MEX-7'].ambiguousAmong).toBeUndefined();
  });

  it('two needers and one copy: one mark plus ambiguousAmong', () => {
    const members = [w('A', { 'MEX-3': 0 }), w('B', { 'MEX-3': 0 })];
    const r = routeForDisplay(members, {}, { 'MEX-3': 1 });
    expect(r.get['MEX-3'].memberIds).toEqual(['A']);
    expect(r.get['MEX-3'].ambiguousAmong).toEqual(['A', 'B']);
  });

  it('a writable needer takes the only copy, leaving nothing to hand over', () => {
    const members = [w('A', { 'ARG-2': 0 }), v('G', { 'ARG-2': 0 })];
    const r = routeForDisplay(members, {}, { 'ARG-2': 1 });
    // Writable needers are filled first (spec §D). With one copy there is nothing
    // physical left for G, so no hand-off reminder is raised.
    expect(r.get['ARG-2'].memberIds).toEqual(['A']);
    expect(r.get['ARG-2'].handoffIds).toBeUndefined();
  });

  it('a second copy is the one the view-only needer gets by hand', () => {
    const members = [w('A', { 'ARG-2': 0 }), v('G', { 'ARG-2': 0 })];
    const r = routeForDisplay(members, {}, { 'ARG-2': 2 });
    expect(r.get['ARG-2'].memberIds).toEqual(['A']);
    expect(r.get['ARG-2'].handoffIds).toEqual(['G']);
  });

  it('a sticker only a view-only member needs has no write target at all', () => {
    const members = [w('A', { 'ARG-2': 1 }), v('G', { 'ARG-2': 0 })];
    const r = routeForDisplay(members, {}, { 'ARG-2': 1 });
    expect(r.get['ARG-2'].memberIds).toEqual([]);
    expect(r.get['ARG-2'].handoffIds).toEqual(['G']);
  });

  it('a hand-off consumes its copy, so only a genuine surplus lands in a writable album', () => {
    const members = [w('A', { 'ARG-2': 1 }), v('G', { 'ARG-2': 0 })];
    const r = routeForDisplay(members, {}, { 'ARG-2': 2 });
    expect(r.get['ARG-2'].memberIds).toEqual(['A']);
    expect(r.get['ARG-2'].handoffIds).toEqual(['G']);
  });

  it('a member whose layout excludes the sticker never appears', () => {
    const members = [
      { ...w('A', { 'CC-5': 0 }), trackCC: true },
      { ...w('B', { 'CC-5': 0 }), trackCC: false },
    ];
    const r = routeForDisplay(members, {}, { 'CC-5': 1 });
    expect(r.get['CC-5'].memberIds).toEqual(['A']);
  });

  it('a give the pool cannot source yields no marks and does not throw', () => {
    const members = [w('A', { 'MEX-9': 1 }), w('B', { 'MEX-9': 1 })];
    const r = routeForDisplay(members, { 'MEX-9': 1 }, {});
    expect(r.give['MEX-9'].memberIds).toEqual([]);
  });

  it("respects a spare reserved by that album's own solo swap", () => {
    const members = [w('A', { 'MEX-9': 2 }), w('B', { 'MEX-9': 3 })];
    const r = routeForDisplay(members, { 'MEX-9': 1 }, {}, { A: spares(1) });
    expect(r.give['MEX-9'].memberIds).toEqual(['B']);
  });

  it('is per-sticker independent: dropping one id leaves the others identical', () => {
    const members = [w('A', { 'MEX-9': 2, 'BRA-4': 2 }), w('B', { 'MEX-9': 1, 'BRA-4': 1 })];
    const both = routeForDisplay(members, { 'MEX-9': 1, 'BRA-4': 1 }, {});
    const one = routeForDisplay(members, { 'BRA-4': 1 }, {});
    expect(one.give['BRA-4']).toEqual(both.give['BRA-4']);
  });

  it('orders marks by group member order, not by writes insertion order', () => {
    const members = [w('B', { 'MEX-7': 0 }), w('A', { 'MEX-7': 0 })];
    const r = routeForDisplay(members, {}, { 'MEX-7': 2 });
    expect(r.get['MEX-7'].memberIds).toEqual(['B', 'A']);
  });
});

describe('applyRouteOverride', () => {
  const routing = (): Record<string, ChipRouting> => ({
    'MEX-3': { memberIds: ['A'], ambiguousAmong: ['A', 'B'] },
    'MEX-7': { memberIds: ['A', 'B'] },
  });

  it('retargets the copy and clears the ambiguity marker', () => {
    const out = applyRouteOverride(routing(), { 'MEX-3': 'B' });
    expect(out['MEX-3'].memberIds).toEqual(['B']);
    expect(out['MEX-3'].ambiguousAmong).toBeUndefined();
  });

  it('leaves stickers without an override untouched', () => {
    const out = applyRouteOverride(routing(), { 'MEX-3': 'B' });
    expect(out['MEX-7']).toEqual({ memberIds: ['A', 'B'] });
  });

  it('keeps the marker when no choice was made (the app default stands)', () => {
    const out = applyRouteOverride(routing(), {});
    expect(out['MEX-3'].ambiguousAmong).toEqual(['A', 'B']);
  });

  it('ignores an override for a sticker that is not being received', () => {
    const out = applyRouteOverride(routing(), { 'BRA-4': 'A' });
    expect(out['BRA-4']).toBeUndefined();
  });

  it('does not mutate its input', () => {
    const before = routing();
    applyRouteOverride(before, { 'MEX-3': 'B' });
    expect(before['MEX-3']).toEqual({ memberIds: ['A'], ambiguousAmong: ['A', 'B'] });
  });

  it('ignores a stale override once the sticker is no longer ambiguous', () => {
    const get = { 'MEX-3': { memberIds: ['A'] } };
    expect(applyRouteOverride(get, { 'MEX-3': 'B' })['MEX-3'].memberIds).toEqual(['A']);
  });

  it('ignores an override naming an album that is no longer an option', () => {
    const get = { 'MEX-3': { memberIds: ['A'], ambiguousAmong: ['A', 'B'] } };
    expect(applyRouteOverride(get, { 'MEX-3': 'C' })['MEX-3'].memberIds).toEqual(['A']);
  });
});

describe('overrideIsLive', () => {
  const options = [{ id: 'A' }, { id: 'B' }];
  it('accepts a choice still among the options', () => {
    expect(overrideIsLive(options, 'B')).toBe(true);
  });
  it('rejects a choice no longer among the options', () => {
    expect(overrideIsLive(options, 'C')).toBe(false);
  });
  it('rejects an absent choice', () => {
    expect(overrideIsLive(options, undefined)).toBe(false);
  });
  it('rejects any choice when nothing is on offer', () => {
    expect(overrideIsLive([], 'A')).toBe(false);
  });
});

describe('swapRoutingInput', () => {
  // theirNeeds / theirSwaps are required on Swap — omitting them fails typecheck.
  const base = {
    id: 's1', name: 'Carlos', status: 'open' as const, createdAt: 0,
    theirNeeds: [], theirSwaps: [],
    giving: [] as string[], receiving: [] as string[],
  };

  it('reads promised give quantities and receiving quantities', () => {
    const swap = { ...base, giving: ['MEX-9'], givingQty: { 'MEX-9': 2 },
      receiving: ['MEX-7'], receivingQty: { 'MEX-7': 2 } };
    expect(swapRoutingInput(swap)).toEqual({
      giving: { 'MEX-9': 2 },
      receiving: { 'MEX-7': 2 },
    });
  });

  it('defaults a missing receivingQty to one copy', () => {
    const swap = { ...base, giving: [], receiving: ['MEX-7'] };
    expect(swapRoutingInput(swap).receiving).toEqual({ 'MEX-7': 1 });
  });

  it('uses the promised set, ignoring deselection', () => {
    const swap = { ...base, giving: ['MEX-9'], receiving: ['MEX-7'],
      deselectedReceiving: ['MEX-7'] };
    expect(Object.keys(swapRoutingInput(swap).receiving)).toEqual(['MEX-7']);
  });
});

describe('reservedSparesOf', () => {
  it("maps each member to its own open swaps' committed gives", () => {
    const swap = {
      id: 's1', name: 'x', status: 'open' as const, createdAt: 0,
      theirNeeds: [], theirSwaps: [],
      giving: ['MEX-9'], receiving: [] as string[],
    };
    expect(reservedSparesOf([{ id: 'A', swaps: [swap] }, { id: 'B', swaps: [] }]))
      .toEqual({ A: { 'MEX-9': 1 }, B: {} });
  });
});
