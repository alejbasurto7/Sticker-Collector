import { useMemo } from 'react';
import { useCollection, liveAlbums } from './collectionStore';
import type { AlbumSnapshot } from './collectionStore';

/**
 * Every album, with the CURRENT one's entry rebuilt from the live top-level fields rather
 * than its parked (stale-until-switch) snapshot. Use this instead of `s.albums` wherever
 * the whole list is rendered with per-album data — progress, counts, swaps.
 *
 * Subscribes field by field and rebuilds in a memo, rather than selecting `liveAlbums`
 * straight out of the store: that selector mints a fresh array (and a fresh active
 * snapshot inside it) on every call, which `useSyncExternalStore` reads as a permanently
 * changing snapshot. The per-field subscriptions below are all stable references, so this
 * recomputes only when the active album actually changes.
 */
export function useLiveAlbums(): AlbumSnapshot[] {
  const albums = useCollection((s) => s.albums);
  const activeAlbumId = useCollection((s) => s.activeAlbumId);
  const albumName = useCollection((s) => s.albumName);
  const albumTypeId = useCollection((s) => s.albumTypeId);
  const counts = useCollection((s) => s.counts);
  const swaps = useCollection((s) => s.swaps);
  const edition = useCollection((s) => s.edition);
  const trackCC = useCollection((s) => s.trackCC);
  const locked = useCollection((s) => s.locked);
  const albumLayout = useCollection((s) => s.albumLayout);
  const firstStickerAt = useCollection((s) => s.firstStickerAt);
  const activityDays = useCollection((s) => s.activityDays);
  const completedOn = useCollection((s) => s.completedOn);
  const unlockedAchievements = useCollection((s) => s.unlockedAchievements);

  return useMemo(
    () => liveAlbums({
      albums, activeAlbumId, albumName, albumTypeId, counts, swaps, edition, trackCC,
      locked, albumLayout, firstStickerAt, activityDays, completedOn, unlockedAchievements,
    }),
    [
      albums, activeAlbumId, albumName, albumTypeId, counts, swaps, edition, trackCC,
      locked, albumLayout, firstStickerAt, activityDays, completedOn, unlockedAchievements,
    ],
  );
}
