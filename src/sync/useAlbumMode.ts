import { useCollection } from '../store/collectionStore';
import { useSyncMeta } from '../store/syncStore';
import { albumMode, effectiveReadOnly, forcedReadOnly, resolveAlbumName, type AlbumMode } from './albumMode';

/** The derived Local/Cloud/Shared mode of one album, reactive to the sync-meta store. */
export function useAlbumMode(albumId: string): AlbumMode {
  const albumLinks = useSyncMeta((s) => s.albumLinks);
  const privateAlbumIds = useSyncMeta((s) => s.privateAlbumIds);
  const collection = useSyncMeta((s) => s.collection);
  return albumMode(albumId, { albumLinks, privateAlbumIds, collection });
}

/** True when the ACTIVE album is a read-only share we joined (edits must be force-locked). */
export function useForcedReadOnly(): boolean {
  const activeAlbumId = useCollection((s) => s.activeAlbumId);
  const link = useSyncMeta((s) => s.albumLinks[activeAlbumId]);
  return forcedReadOnly(link);
}

/** True when the ACTIVE album is effectively read-only: user-locked OR a forced read-only share. */
export function useEffectiveReadOnly(): boolean {
  const activeAlbumId = useCollection((s) => s.activeAlbumId);
  const locked = useCollection((s) => s.locked);
  const link = useSyncMeta((s) => s.albumLinks[activeAlbumId]);
  return effectiveReadOnly(locked, link);
}

/** The per-device display name for an album (local alias if set, else the snapshot name). */
export function useResolvedAlbumName(albumId: string, snapshotName: string): string {
  const localAlbumNames = useSyncMeta((s) => s.localAlbumNames);
  return resolveAlbumName(albumId, snapshotName, localAlbumNames);
}
