import type { Counts, Swap } from '../types';
import type { ParsedList } from './import';

/**
 * Candidate stickers for a potential trade between the user and another collector.
 * - youGive: user's duplicates that the other collector needs.
 * - youGet: other collector's duplicates that the user is missing.
 */
export interface SwapCandidates {
  youGive: string[];
  youGet: string[];
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

export function computeReservations(swaps: Swap[], excludeSwapId?: string): Reservations {
  const committedGive = new Map<string, number>();
  const committedGet = new Set<string>();

  for (const sw of swaps) {
    if (sw.status !== 'open' || sw.id === excludeSwapId) continue;
    for (const id of sw.giving) committedGive.set(id, (committedGive.get(id) ?? 0) + 1);
    for (const id of sw.receiving) committedGet.add(id);
  }

  return { committedGive, committedGet };
}

/**
 * Reservation-aware two-way overlap. Spares already promised in other open swaps are
 * excluded from `youGive`, and stickers already lined up to receive are excluded from
 * `youGet` — so a spare is never double-promised and you never chase a sticker you are
 * already getting. With no `reservations` it falls back to the plain overlap.
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

  // My spares they need, minus copies already promised elsewhere (offerable >= 1).
  for (const id of otherNeeds) {
    const spare = Math.max((counts[id] ?? 0) - 1, 0);
    const offerable = spare - (committedGive?.get(id) ?? 0);
    if (offerable >= 1) youGive.push(id);
  }
  // Their spares I'm missing, unless I'm already receiving that sticker.
  for (const id of otherSwaps) {
    if ((counts[id] ?? 0) === 0 && !committedGet?.has(id)) youGet.push(id);
  }

  return { youGive, youGet };
}

/**
 * Quantity after physically giving one copy at settlement. Never drops below 1 owned
 * plus the copies still reserved by OTHER open swaps (the spec's `1 + committed` floor),
 * and never invents a copy the user doesn't hold.
 */
export function quantityAfterGive(current: number, committedByOthers: number): number {
  if (current <= 0) return 0;
  const floor = committedByOthers > 0 ? committedByOthers + 1 : 0;
  return Math.min(current, Math.max(current - 1, floor));
}

/**
 * Cross-swap conflict sets across all OPEN swaps.
 * - giving: sticker promised to give in more open swaps than the user has spares for.
 * - receiving: missing sticker (count=0) expected from 2+ open swaps (you only need one).
 * - giveSwapCounts: how many open swaps each conflicted giving sticker appears in.
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
    for (const id of sw.giving) giveCounts.set(id, (giveCounts.get(id) ?? 0) + 1);
    for (const id of sw.receiving) recvCounts.set(id, (recvCounts.get(id) ?? 0) + 1);
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
