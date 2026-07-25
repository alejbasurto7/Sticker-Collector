// Pure, node-safe seam: join collectionStore albums with syncStore link metadata
// into the GroupMember shape the pool math consumes. Type-only store imports keep
// this module (and its tests) in the plain-node Vitest env, mirroring albumMode.ts.
import type { AlbumGroup, Counts, Edition, Swap } from '../types';
import type { GroupMember } from '../utils/groupSwap';
import type { AlbumSnapshot } from '../store/collectionStore';
import type { AlbumLink } from '../store/syncStore';
import { forcedReadOnly, resolveAlbumName } from './albumMode';

/** A resolved member plus its own solo swaps (for combined-swap reservation roll-up). */
export interface ResolvedGroupMember extends GroupMember {
  swaps: Swap[];
}

/** Group context threaded into NewSwapDialog / SwapDetail / SwapClose for group mode. */
export interface GroupSwapCtx {
  groupId: string;
  members: ResolvedGroupMember[];
}

/** The active album's authoritative top-level fields (its parked snapshot may be stale). */
export interface ActiveAlbumFields {
  id: string;
  counts: Counts;
  edition: Edition;
  trackCC: boolean;
  albumName: string;
  swaps: Swap[];
}

/** Resolve each memberId against local albums (active from top-level, others parked); drop absent ids. */
export function buildGroupMembers(
  memberIds: string[],
  parked: AlbumSnapshot[],
  active: ActiveAlbumFields,
  albumLinks: Record<string, AlbumLink>,
  localAlbumNames: Record<string, string>,
): ResolvedGroupMember[] {
  const out: ResolvedGroupMember[] = [];
  for (const id of memberIds) {
    const src =
      id === active.id
        ? {
            albumName: active.albumName,
            counts: active.counts,
            edition: active.edition,
            trackCC: active.trackCC,
            swaps: active.swaps,
          }
        : parked.find((a) => a.id === id);
    if (!src) continue; // resolved-out on this device
    out.push({
      id,
      name: resolveAlbumName(id, src.albumName, localAlbumNames),
      counts: src.counts,
      edition: src.edition,
      trackCC: src.trackCC,
      writable: !forcedReadOnly(albumLinks[id]),
      swaps: src.swaps,
    });
  }
  return out;
}

/** The (at most one) group an album belongs to. */
export function groupForAlbum(groups: AlbumGroup[], albumId: string): AlbumGroup | undefined {
  return groups.find((g) => g.memberIds.includes(albumId));
}
