import { useMemo } from 'react';
import type { GroupSwapCtx } from '../sync/groupMembers';
import { routeForDisplay, reservedSparesOf, applyRouteOverride } from '../utils/groupSwap';
import { chipBadges, type AlbumMarkInfo, type ChipBadge } from '../utils/chipBadges';

export interface GroupBadges {
  /** Members as AlbumMark needs them — also what GroupLegend renders. */
  members: AlbumMarkInfo[];
  give: Map<string, ChipBadge>;
  get: Map<string, ChipBadge>;
}

/**
 * Per-sticker album routing for a combined swap's chips. Returns null outside group
 * mode, so a solo swap passes `undefined` badges and renders exactly as it always has.
 *
 * Memoised on a CONTENT key rather than argument identity: callers build `giving` /
 * `receiving` fresh on every render, while the computation rebuilds each member's album
 * layout via buildAlbumFromType — far too expensive to redo on every keystroke in the
 * new-swap dialog. The records are small, so stringifying them is the cheap side.
 *
 * NOTE: `groupCtx` is a dep by REFERENCE. Callers must pass it straight through (as
 * SwapsView does, rebuilding the literal each render) and must not memoise it with
 * incomplete deps — a member's counts changing must produce a new `groupCtx`, or the
 * badges will go stale.
 */
export function useGroupBadges(
  groupCtx: GroupSwapCtx | undefined,
  giving: Record<string, number>,
  receiving: Record<string, number>,
  routeOverride?: Record<string, string>,
): GroupBadges | null {
  const key = JSON.stringify([giving, receiving, routeOverride ?? null]);
  return useMemo(() => {
    if (!groupCtx) return null;
    const members: AlbumMarkInfo[] = groupCtx.members.map((m) => ({
      id: m.id,
      name: m.name,
      viewOnly: !m.writable,
    }));
    const routing = routeForDisplay(
      groupCtx.members,
      giving,
      receiving,
      reservedSparesOf(groupCtx.members),
    );
    // Reflect an ambiguous-copy override (close screen only) on the chip itself.
    const get = applyRouteOverride(routing.get, routeOverride);
    return {
      members,
      give: chipBadges(routing.give, members, 'give'),
      get: chipBadges(get, members, 'get'),
    };
    // `key` is the content hash of giving/receiving/routeOverride — see the doc comment.
  }, [groupCtx, key]);
}
