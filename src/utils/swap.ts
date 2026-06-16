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

export function computeCandidates(counts: Counts, other: ParsedList): SwapCandidates {
  const otherNeeds = new Set(other.needs);
  const otherSwaps = new Set(other.swaps);

  const youGive: string[] = [];
  const youGet: string[] = [];

  // User's duplicates (count >= 2) that the other collector needs.
  for (const [id, c] of Object.entries(counts)) {
    if (c >= 2 && otherNeeds.has(id)) youGive.push(id);
  }
  // Other collector's duplicates that the user is missing (count 0).
  for (const id of otherSwaps) {
    if ((counts[id] ?? 0) === 0) youGet.push(id);
  }

  return { youGive, youGet };
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
