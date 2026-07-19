// Pure, node-safe derivations over sync metadata. Type-only store imports keep this
// module free of the store runtime, so it (and its tests) run in the plain-node Vitest env.
import type { AlbumLink, SyncMetaState } from '../store/syncStore';

export type AlbumMode = 'local' | 'cloud' | 'shared';

type MetaSlice = Pick<SyncMetaState, 'albumLinks' | 'privateAlbumIds'>;
/** `albumMode` also needs the Cloud link to decide the default (Local until Cloud is set up). */
type ModeSlice = MetaSlice & Pick<SyncMetaState, 'collection'>;

/**
 * An album is Shared iff linked, Local iff explicitly private. Otherwise the default is
 * context-dependent: **Local** until a Cloud code is set up (nothing syncs it yet — showing "Cloud"
 * there would be misleading), then **Cloud** once a Cloud link exists (untouched albums sync as the
 * whole-collection Cloud channel). A link wins over a private flag.
 */
export function albumMode(albumId: string, meta: ModeSlice): AlbumMode {
  if (meta.albumLinks[albumId]) return 'shared';
  if (meta.privateAlbumIds.includes(albumId)) return 'local';
  return meta.collection ? 'cloud' : 'local';
}

/** True only for a read-only JOINER link — the one channel whose edits the UI must force-lock. */
export function forcedReadOnly(link: AlbumLink | undefined): boolean {
  return !!link && link.role === 'joiner' && link.access === 'read-only';
}

/** Effective read-only for an album: the user's own lock, or a forced read-only share. */
export function effectiveReadOnly(locked: boolean, link: AlbumLink | undefined): boolean {
  return locked || forcedReadOnly(link);
}

/** The per-device display name: local alias if set, else the synced snapshot name. */
export function resolveAlbumName(
  albumId: string, snapshotName: string, localAlbumNames: Record<string, string>,
): string {
  return localAlbumNames[albumId] ?? snapshotName;
}

/** How deleting `albumId` must propagate: unlink a share, tombstone a Cloud album, else purely local. */
export function deleteDisposition(albumId: string, meta: MetaSlice): 'unlink' | 'tombstone' | 'local' {
  if (meta.albumLinks[albumId]) return 'unlink';
  if (meta.privateAlbumIds.includes(albumId)) return 'local';
  return 'tombstone';
}

/** Adopt a joined album under a locally-unique id: keep the remote id unless it collides. */
export function pickLocalAlbumId(remoteId: string, existingIds: Iterable<string>, gen: () => string): string {
  return new Set(existingIds).has(remoteId) ? gen() : remoteId;
}
