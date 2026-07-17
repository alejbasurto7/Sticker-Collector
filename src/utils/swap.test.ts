import { describe, it, expect } from 'vitest';
import {
  settleSwapCounts,
  reverseSettlement,
  computeCandidates,
  computeReservations,
  computeConflicts,
  totalGiving,
} from './swap';
import { parseExport } from './import';
import type { ParsedList } from './import';
import type { Swap } from '../types';

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
