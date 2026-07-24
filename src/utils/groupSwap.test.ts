import { describe, it, expect } from 'vitest';
import type { Counts } from '../types';
import {
  memberStickerIds,
  computeGroupPool,
  computeGroupCandidates,
  routeReceived,
  type GroupMember,
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
    expect(r.writes).toEqual({ A: { 'MEX-2': 1 } });
    expect(r.handoffs).toEqual([{ id: 'MEX-2', memberId: 'V', memberName: 'V' }]);
  });
});
