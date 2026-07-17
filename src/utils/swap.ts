import type { Counts, Swap } from '../types';
import type { ParsedList } from './import';

/**
 * Candidate stickers for a potential trade between the user and another collector.
 * - youGive: user's duplicates that the other collector needs.
 * - youGet: other collector's duplicates that the user is missing.
 * - giveReserved: subset of youGive whose only spare copies are already promised in
 *   another OPEN swap. Still offered (an open swap hasn't settled, the sticker is
 *   physically in hand) but flagged so the UI can warn about the double-booking.
 * - getReserved: subset of youGet the user is already lined up to receive elsewhere.
 */
export interface SwapCandidates {
  youGive: string[];
  youGet: string[];
  /**
   * Copies you can hand over per giving id: min(copies they need, your spares).
   * Every entry is ≥1. Ids absent from the map (and everything in `youGet`) are a
   * single copy.
   */
  giveQty: Record<string, number>;
  giveReserved: Set<string>;
  getReserved: Set<string>;
}

/** Copies promised to give for one sticker id. Missing/≤1 means a single copy. */
export function giveQtyOf(sw: Swap, id: string): number {
  return Math.max(1, sw.givingQty?.[id] ?? 1);
}

/** Total copies actively promised on the giving side (sums per-sticker quantities). */
export function totalGiving(sw: Swap): number {
  return activeGiving(sw).reduce((n, id) => n + giveQtyOf(sw, id), 0);
}

/**
 * Reservation rollups across all OPEN swaps — the live picture of what is already
 * promised. Mirrors the design spec's `committedGive` / `committedGet`.
 * - committedGive: code -> how many copies are earmarked to give (sum over open swaps).
 * - committedGet:  codes the user is already lined up to receive (any open swap).
 * Pass `excludeSwapId` when re-diffing an existing swap so its own promises don't
 * count against itself.
 */
export interface Reservations {
  committedGive: Map<string, number>;
  committedGet: Set<string>;
}

/**
 * The stickers actually in play for a swap: the promised list minus any the user
 * has unselected. Deselected stickers stay on the swap but no longer count as
 * promised, so reservations and conflicts ignore them.
 */
export function activeGiving(sw: Swap): string[] {
  if (!sw.deselectedGiving?.length) return sw.giving;
  const off = new Set(sw.deselectedGiving);
  return sw.giving.filter((id) => !off.has(id));
}

export function activeReceiving(sw: Swap): string[] {
  if (!sw.deselectedReceiving?.length) return sw.receiving;
  const off = new Set(sw.deselectedReceiving);
  return sw.receiving.filter((id) => !off.has(id));
}

export function computeReservations(swaps: Swap[], excludeSwapId?: string): Reservations {
  const committedGive = new Map<string, number>();
  const committedGet = new Set<string>();

  for (const sw of swaps) {
    if (sw.status !== 'open' || sw.id === excludeSwapId) continue;
    // Each open swap earmarks as many copies as it promises to give (default 1).
    for (const id of activeGiving(sw))
      committedGive.set(id, (committedGive.get(id) ?? 0) + giveQtyOf(sw, id));
    for (const id of activeReceiving(sw)) committedGet.add(id);
  }

  return { committedGive, committedGet };
}

/**
 * Reservation-aware two-way overlap. Every spare the other collector needs is offered
 * in `youGive`, and every spare of theirs the user is missing is offered in `youGet`.
 * Reservations from other OPEN swaps no longer hide a candidate — an open swap has not
 * settled, so the sticker is still physically in hand — they only flag it (`giveReserved`
 * / `getReserved`) as already promised, so the UI can warn about the double-booking
 * instead of silently reporting "no matches". A closed swap has already been settled
 * into `counts`, so it drops the spare naturally. With no `reservations`, nothing is
 * flagged and the result is the plain overlap.
 */
export function computeCandidates(
  counts: Counts,
  other: ParsedList,
  reservations?: Reservations,
): SwapCandidates {
  const otherNeeds = new Set(other.needs);
  const otherSwaps = new Set(other.swaps);
  const committedGive = reservations?.committedGive;
  const committedGet = reservations?.committedGet;

  const youGive: string[] = [];
  const youGet: string[] = [];
  const giveQty: Record<string, number> = {};
  const giveReserved = new Set<string>();
  const getReserved = new Set<string>();

  // My spares they need. A copy already promised in another open swap is still offered
  // but flagged when no free spare is left for a second swap (committed >= spare). When
  // they need several copies of the same sticker, offer as many as I have spare for.
  for (const id of otherNeeds) {
    const spare = Math.max((counts[id] ?? 0) - 1, 0);
    if (spare < 1) continue;
    youGive.push(id);
    giveQty[id] = Math.min(other.needQty?.[id] ?? 1, spare);
    if ((committedGive?.get(id) ?? 0) >= spare) giveReserved.add(id);
  }
  // Their spares I'm missing. Flagged when I'm already lined up to receive it elsewhere.
  for (const id of otherSwaps) {
    if ((counts[id] ?? 0) !== 0) continue;
    youGet.push(id);
    if (committedGet?.has(id)) getReserved.add(id);
  }

  return { youGive, youGet, giveQty, giveReserved, getReserved };
}

/**
 * Quantity after physically giving `giveN` copies at settlement. Never drops below 1
 * owned plus the copies still reserved by OTHER open swaps (the spec's `1 + committed`
 * floor), and never invents a copy the user doesn't hold.
 */
export function quantityAfterGive(
  current: number,
  committedByOthers: number,
  giveN = 1,
): number {
  if (current <= 0) return 0;
  const floor = committedByOthers > 0 ? committedByOthers + 1 : 0;
  return Math.min(current, Math.max(current - Math.max(giveN, 1), floor));
}

/**
 * Apply a settlement to the counts, returning the new counts and the net change
 * per touched sticker. Gives use quantityAfterGive (so a give reserved by other
 * open swaps may not actually drop, in which case it records no delta); receives
 * always add one. The delta is what rollbackSwap reverses.
 */
export function settleSwapCounts(
  counts: Counts,
  settled: { givenIds: string[]; receivedIds: string[]; giveQty?: Record<string, number> },
  committedGive: Map<string, number>,
): { counts: Counts; delta: Record<string, number> } {
  const next: Counts = { ...counts };
  const delta: Record<string, number> = {};
  for (const gid of settled.givenIds) {
    const before = next[gid] ?? 0;
    // Hand over every promised copy of this sticker in one settlement (default 1).
    const giveN = Math.max(1, settled.giveQty?.[gid] ?? 1);
    const after = quantityAfterGive(before, committedGive.get(gid) ?? 0, giveN);
    next[gid] = after;
    if (after !== before) delta[gid] = (delta[gid] ?? 0) + (after - before);
  }
  for (const rid of settled.receivedIds) {
    const before = next[rid] ?? 0;
    next[rid] = before + 1;
    delta[rid] = (delta[rid] ?? 0) + 1;
  }
  return { counts: next, delta };
}

/**
 * Undo a swap's settlement on the counts. Prefers the exact recorded delta;
 * for swaps closed before settledDelta existed, falls back to a naive reversal
 * (re-add each given sticker, remove each received one), clamped at zero.
 */
export function reverseSettlement(counts: Counts, swap: Swap): Counts {
  const next: Counts = { ...counts };
  if (swap.settledDelta) {
    for (const [id, d] of Object.entries(swap.settledDelta)) {
      next[id] = Math.max(0, (next[id] ?? 0) - d);
    }
  } else {
    for (const id of swap.giving) next[id] = Math.max(0, (next[id] ?? 0) + giveQtyOf(swap, id));
    for (const id of swap.receiving) next[id] = Math.max(0, (next[id] ?? 0) - 1);
  }
  return next;
}

/**
 * Cross-swap conflict sets across all OPEN swaps.
 * - giving: sticker whose promised copies across open swaps exceed the user's spares.
 * - receiving: missing sticker (count=0) expected from 2+ open swaps (you only need one).
 * - giveSwapCounts: total copies promised across open swaps per giving sticker (a single
 *   swap may promise several copies of the same sticker).
 * - recvSwapCounts: how many open swaps each conflicted receiving sticker appears in.
 */
export interface ConflictSets {
  giving: Set<string>;
  receiving: Set<string>;
  giveSwapCounts: ReadonlyMap<string, number>;
  recvSwapCounts: ReadonlyMap<string, number>;
}

export function computeConflicts(swaps: Swap[], counts: Counts): ConflictSets {
  const giveCounts = new Map<string, number>();
  const recvCounts = new Map<string, number>();

  for (const sw of swaps) {
    if (sw.status !== 'open') continue;
    // Count promised copies, so needing 2 spares for a 2-copy give isn't a conflict.
    for (const id of activeGiving(sw))
      giveCounts.set(id, (giveCounts.get(id) ?? 0) + giveQtyOf(sw, id));
    for (const id of activeReceiving(sw)) recvCounts.set(id, (recvCounts.get(id) ?? 0) + 1);
  }

  const giving = new Set<string>();
  const receiving = new Set<string>();
  for (const [id, n] of giveCounts) {
    const spares = Math.max(0, (counts[id] ?? 0) - 1);
    if (n > spares) giving.add(id);
  }
  for (const [id, n] of recvCounts) {
    if ((counts[id] ?? 0) === 0 && n > 1) receiving.add(id);
  }

  return { giving, receiving, giveSwapCounts: giveCounts, recvSwapCounts: recvCounts };
}
