import type { Counts, Edition, Swap } from '../types';
// Type-only imports (erased at build) — keeps this module free of the store's
// runtime (localStorage/zustand), so it's importable in a plain Node test env.
import type { AlbumSnapshot, Theme } from '../store/collectionStore';

/**
 * The exact slice of collection state that travels between devices. This is the
 * same set of fields the `persist` middleware saves to localStorage — an
 * explicit whitelist so the sync payload stays stable and testable, and so no
 * store action/function is ever accidentally serialized.
 */
export interface SyncPayload {
  counts: Counts;
  swaps: Swap[];
  edition: Edition;
  trackCC: boolean;
  albumName: string;
  locked: boolean;
  firstStickerAt?: number;
  activityDays: string[];
  completedOn: string | null;
  unlockedAchievements: Record<string, number>;
  importSeq: number;
  theme: Theme;
  albums: AlbumSnapshot[];
  activeAlbumId: string;
}

/** Extract the syncable payload from the (superset) collection store state. */
export function pickSyncState(s: SyncPayload): SyncPayload {
  return {
    counts: s.counts,
    swaps: s.swaps,
    edition: s.edition,
    trackCC: s.trackCC,
    albumName: s.albumName,
    locked: s.locked,
    firstStickerAt: s.firstStickerAt,
    activityDays: s.activityDays,
    completedOn: s.completedOn,
    unlockedAchievements: s.unlockedAchievements,
    importSeq: s.importSeq,
    theme: s.theme,
    albums: s.albums,
    activeAlbumId: s.activeAlbumId,
  };
}

const anyOwned = (c?: Record<string, number>) => !!c && Object.values(c).some((n) => n > 0);

/**
 * Does this collection hold anything worth protecting? Drives the join-time
 * safety check: a device WITH data must never be silently overwritten by a pull
 * (it's asked which side to keep instead); an empty device can safely auto-pull.
 * "Has data" = any owned sticker, any swap, or more than the single default album.
 */
export function hasCollectionData(
  s: Pick<SyncPayload, 'counts' | 'swaps' | 'albums'>,
): boolean {
  if (anyOwned(s.counts)) return true;
  if (s.swaps.length > 0) return true;
  if (s.albums.length > 1) return true;
  return s.albums.some((a) => anyOwned(a.counts) || a.swaps.length > 0);
}

const isObject = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v);

/**
 * Defensively validate a blob pulled from the server before applying it to the
 * live store. Returns the payload if it has the core shape, else null (so a
 * corrupt/foreign row can never crash or wipe the app). Only the essentials are
 * checked; the store's own reconciliation fills any gaps.
 */
export function sanitizeRemote(data: unknown): SyncPayload | null {
  if (!isObject(data)) return null;
  if (!isObject(data.counts)) return null;
  if (!Array.isArray(data.albums)) return null;
  if (typeof data.activeAlbumId !== 'string') return null;
  if (!Array.isArray(data.swaps)) return null;
  return data as unknown as SyncPayload;
}
