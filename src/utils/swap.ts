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
 * Cross-swap conflict sets across all OPEN swaps. A sticker is flagged when it is
 * promised in more than one open swap in the same direction.
 * - giving: duplicate promised to give in 2+ swaps (may not have enough copies).
 * - receiving: missing sticker expected from 2+ swaps (you only need one).
 */
export interface ConflictSets {
  giving: Set<string>;
  receiving: Set<string>;
}

export function computeConflicts(swaps: Swap[]): ConflictSets {
  const giveCounts = new Map<string, number>();
  const recvCounts = new Map<string, number>();

  for (const sw of swaps) {
    if (sw.status !== 'open') continue;
    for (const id of sw.giving) giveCounts.set(id, (giveCounts.get(id) ?? 0) + 1);
    for (const id of sw.receiving) recvCounts.set(id, (recvCounts.get(id) ?? 0) + 1);
  }

  const giving = new Set<string>();
  const receiving = new Set<string>();
  for (const [id, n] of giveCounts) if (n > 1) giving.add(id);
  for (const [id, n] of recvCounts) if (n > 1) receiving.add(id);

  return { giving, receiving };
}
