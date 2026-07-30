import { describe, it, expect } from 'vitest';
import {
  settleSwapCounts,
  reverseSettlement,
  computeCandidates,
  computeReservations,
  computeConflicts,
  countClosedSwaps,
  totalGiving,
} from './swap';
import { parseExport } from './import';
import type { ParsedList } from './import';
import type { AlbumGroup, Swap } from '../types';

describe('settleSwapCounts', () => {
  it('decrements a given spare and increments a received sticker', () => {
    const { counts, delta } = settleSwapCounts(
      { A: 2, B: 0 },
      { givenIds: ['A'], receivedIds: ['B'] },
      new Map(),
    );
    expect(counts).toEqual({ A: 1, B: 1 });
    expect(delta).toEqual({ A: -1, B: 1 });
  });

  it('does not decrement (or record a delta for) a give floored by another open swap', () => {
    // A has 2 (1 spare) but another open swap also reserves A, so the spare is held.
    const { counts, delta } = settleSwapCounts(
      { A: 2 },
      { givenIds: ['A'], receivedIds: [] },
      new Map([['A', 1]]),
    );
    expect(counts).toEqual({ A: 2 });
    expect(delta).toEqual({});
  });

  it('gives every promised copy of a multi-copy sticker in one settlement', () => {
    // A has 4 (3 spare); the swap promised 3 copies of A.
    const { counts, delta } = settleSwapCounts(
      { A: 4, B: 0 },
      { givenIds: ['A'], receivedIds: ['B'], giveQty: { A: 3 } },
      new Map(),
    );
    expect(counts).toEqual({ A: 1, B: 1 });
    expect(delta).toEqual({ A: -3, B: 1 });
  });

  it('never gives a multi-copy sticker below what other open swaps still reserve', () => {
    // A has 3 (2 spare); this give asks for 2, but 1 spare is committed elsewhere.
    const { counts, delta } = settleSwapCounts(
      { A: 3 },
      { givenIds: ['A'], receivedIds: [], giveQty: { A: 2 } },
      new Map([['A', 1]]),
    );
    expect(counts).toEqual({ A: 2 }); // floored at 1 owned + 1 committed
    expect(delta).toEqual({ A: -1 });
  });
});

describe('computeCandidates multi-copy giving', () => {
  const other: ParsedList = {
    needs: ['A', 'B'],
    swaps: [],
    swapQty: {},
    needQty: { A: 3, B: 2 },
    all: {},
    unmatched: [],
  };

  it('offers min(copies they need, your spares) per sticker', () => {
    // A: 4 owned -> 3 spare, they need 3 -> give 3.
    // B: 2 owned -> 1 spare, they need 2 -> give 1 (spare-capped).
    const c = computeCandidates({ A: 4, B: 2 }, other);
    expect(c.youGive).toEqual(expect.arrayContaining(['A', 'B']));
    expect(c.giveQty).toEqual({ A: 3, B: 1 });
  });
});

describe('multi-copy reservations & conflicts', () => {
  const swap = (over: Partial<Swap>): Swap => baseSwap({ status: 'open', ...over });

  it('reservations earmark every promised copy', () => {
    const r = computeReservations([swap({ giving: ['A'], givingQty: { A: 3 } })]);
    expect(r.committedGive.get('A')).toBe(3);
  });

  it('a 2-copy give backed by 2 spares is not a conflict', () => {
    const swaps = [swap({ giving: ['A'], givingQty: { A: 2 } })];
    const conflicts = computeConflicts(swaps, { A: 3 }); // 2 spares, promising 2
    expect(conflicts.giving.has('A')).toBe(false);
  });

  it('promising more copies than spares is a conflict', () => {
    const swaps = [swap({ giving: ['A'], givingQty: { A: 3 } })];
    const conflicts = computeConflicts(swaps, { A: 3 }); // only 2 spares
    expect(conflicts.giving.has('A')).toBe(true);
  });

  it('totalGiving sums copies, not distinct stickers', () => {
    expect(totalGiving(swap({ giving: ['A', 'B'], givingQty: { A: 3 } }))).toBe(4);
  });
});

describe('multi-copy end-to-end (task list: 31 stickers, 44 copies)', () => {
  const LIST = [
    'In need:',
    'FWC 🏆: 7, 18',
    'GHA 🇬🇭: 1 (×2)',
    'CRO 🇭🇷: 1 (×2)',
    'COD 🇨🇩: 11, 16',
    'JOR 🇯🇴: 5',
    'AUT 🇦🇹: 1 (×2)',
    'NOR 🇳🇴: 9',
    'IRN 🇮🇷: 1 (×3)',
    'EGY 🇪🇬: 20',
    'BEL 🇧🇪: 6, 15',
    'SWE 🇸🇪: 14',
    'NED 🇳🇱: 13',
    'TUR 🇹🇷: 3, 11',
    'PAR 🇵🇾: 8 (×3)',
    'USA 🇺🇸: 14',
    'SCO 🏴󠁧󠁢󠁳󠁣󠁴󠁿: 1, 14 (×2)',
    'SUI 🇨🇭: 13',
    'QAT 🇶🇦: 15',
    'BIH 🇧🇦: 1 (×2), 3 (×2), 7 (×2), 11',
    'CZE 🇨🇿: 6, 10',
    'RSA 🇿🇦: 1 (×3), 10',
  ].join('\n');

  it('offers all 44 copies when the collector holds the spares', () => {
    const p = parseExport(LIST);
    expect(p.unmatched).toHaveLength(0);
    expect(p.needs).toHaveLength(31); // distinct stickers
    const totalNeeded = Object.values(p.needQty).reduce((a, b) => a + b, 0);
    expect(totalNeeded).toBe(44); // copies across the whole list

    // A collection with exactly enough spares for every requested copy.
    const counts: Record<string, number> = {};
    for (const id of p.needs) counts[id] = 1 + (p.needQty[id] ?? 1);

    const c = computeCandidates(counts, p);
    expect(c.youGive).toHaveLength(31);
    const giveCopies = c.youGive.reduce((n, id) => n + (c.giveQty[id] ?? 1), 0);
    expect(giveCopies).toBe(44); // was capped at 31 before multi-copy support
  });
});

const baseSwap = (over: Partial<Swap>): Swap => ({
  id: 's1',
  name: 'Test',
  createdAt: 0,
  status: 'closed',
  theirNeeds: [],
  theirSwaps: [],
  giving: [],
  receiving: [],
  ...over,
});

describe('reverseSettlement', () => {
  it('restores counts exactly from a recorded delta', () => {
    const swap = baseSwap({ giving: ['A'], receiving: ['B'], settledDelta: { A: -1, B: 1 } });
    expect(reverseSettlement({ A: 1, B: 1 }, swap)).toEqual({ A: 2, B: 0 });
  });

  it('round-trips a floored give without inventing a copy', () => {
    // Settle a give that is floored by another open swap, then reverse it.
    const start = { A: 2 };
    const { counts, delta } = settleSwapCounts(start, { givenIds: ['A'], receivedIds: [] }, new Map([['A', 1]]));
    const swap = baseSwap({ giving: ['A'], settledDelta: delta });
    expect(reverseSettlement(counts, swap)).toEqual(start);
  });

  it('falls back to naive reversal when settledDelta is absent (legacy swap)', () => {
    const swap = baseSwap({ giving: ['A'], receiving: ['B'] }); // no settledDelta
    expect(reverseSettlement({ A: 1, B: 1 }, swap)).toEqual({ A: 2, B: 0 });
  });

  it('clamps to zero on naive reversal', () => {
    const swap = baseSwap({ giving: [], receiving: ['B'] });
    expect(reverseSettlement({ B: 0 }, swap)).toEqual({ B: 0 });
  });
});

describe('countClosedSwaps', () => {
  const group = (over: Partial<AlbumGroup>): AlbumGroup =>
    ({ id: 'g1', name: 'Kids', memberIds: ['A', 'B'], swaps: [], ...over });
  /** A concluded combined swap that moved a copy in each listed album. */
  const combined = (id: string, settledByAlbum: Record<string, Record<string, number>>): Swap =>
    baseSwap({ id, status: 'closed', settledByAlbum });

  it('counts the album\'s own closed solo swaps', () => {
    const swaps = [baseSwap({ id: 's1' }), baseSwap({ id: 's2', status: 'open' })];
    expect(countClosedSwaps('A', swaps, [])).toBe(1);
  });

  it('counts a concluded combined swap that moved one of the album\'s copies', () => {
    // The bug: closedSwaps only ever saw the active album's solo swaps, so concluding a
    // combined swap never advanced a swap-count achievement, however many stickers moved.
    const groups = [group({ swaps: [combined('c1', { A: { 'MEX-9': -1 }, B: { 'MEX-3': 1 } })] })];
    expect(countClosedSwaps('A', [], groups)).toBe(1);
  });

  it('counts a combined swap once, not once per member album this device holds', () => {
    // A combined swap is one swap of the GROUP. Counting it per participating album would
    // inflate the total on a device that happens to hold several members.
    const groups = [group({ swaps: [combined('c1', { A: { 'MEX-9': -1 }, B: { 'MEX-9': 1 } })] })];
    expect(countClosedSwaps('A', [], groups)).toBe(1);
  });

  it('ignores a combined swap the album took no part in', () => {
    const groups = [group({ swaps: [combined('c1', { B: { 'MEX-3': 1 } })] })];
    expect(countClosedSwaps('A', [], groups)).toBe(0);
  });

  it('ignores an open combined swap', () => {
    const groups = [group({ swaps: [baseSwap({ id: 'c1', status: 'open' })] })];
    expect(countClosedSwaps('A', [], groups)).toBe(0);
  });

  it('ignores a combined swap whose gives were all clamped away (nothing changed hands)', () => {
    // closeCombinedSwap stores the deltas that actually landed, so a fully clamped
    // settlement leaves an empty map — no copies moved, no swap to the album's credit.
    const groups = [group({ swaps: [combined('c1', {})] })];
    expect(countClosedSwaps('A', [], groups)).toBe(0);
  });

  it('adds solo and combined swaps across several groups', () => {
    const groups = [
      group({ id: 'g1', swaps: [combined('c1', { A: { 'MEX-1': 1 } })] }),
      group({ id: 'g2', memberIds: ['A', 'C'], swaps: [combined('c2', { A: { 'MEX-2': 1 } })] }),
    ];
    expect(countClosedSwaps('A', [baseSwap({ id: 's1' })], groups)).toBe(3);
  });
});
