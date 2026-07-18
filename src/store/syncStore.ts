import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { ChannelPayload, CollectionPayload } from '../sync/payload';
import { PAYLOAD_V } from '../sync/payload';

export type SyncStatus = 'unlinked' | 'syncing' | 'synced' | 'offline' | 'error';

export interface LinkMeta {
  code: string; codeHash: string; writerId: string;
  lastVersion: number; lastSyncedAt: number | null; status: SyncStatus;
}
export interface AlbumLink extends LinkMeta {
  albumId: string; role: 'owner' | 'joiner'; access: 'collaborative' | 'read-only';
}

export interface SyncMetaState {
  collection: LinkMeta | null;
  albumLinks: Record<string, AlbumLink>;
  privateAlbumIds: string[];
  localAlbumNames: Record<string, string>;
  bases: Record<string, ChannelPayload>;
  /** Transient: set when an owner revoked a share we joined; shown once, then cleared. Not persisted. */
  revokedNotice: string | null;

  setCollectionLink: (p: { code: string; codeHash: string; writerId: string }) => void;
  clearCollectionLink: () => void;
  upsertAlbumLink: (link: AlbumLink) => void;
  removeAlbumLink: (albumId: string) => void;
  setPrivate: (albumId: string, isPrivate: boolean) => void;
  setLocalAlbumName: (albumId: string, name: string | null) => void;
  tombstoneAlbum: (albumId: string) => void;
  setBase: (key: string, payload: ChannelPayload) => void;
  setChannelStatus: (key: string, status: SyncStatus) => void;
  markChannelSynced: (key: string, version: number) => void;
  setRevokedNotice: (msg: string) => void;
  clearRevokedNotice: () => void;
}

const freshLink = (p: { code: string; codeHash: string; writerId: string }): LinkMeta => ({
  ...p, lastVersion: 0, lastSyncedAt: null, status: 'syncing',
});

/** Apply a per-channel patch to whichever slot (collection or an album link) `key` names. */
function patchChannel(s: SyncMetaState, key: string, patch: Partial<LinkMeta>): Partial<SyncMetaState> {
  if (key === 'collection') return s.collection ? { collection: { ...s.collection, ...patch } } : {};
  const link = s.albumLinks[key];
  return link ? { albumLinks: { ...s.albumLinks, [key]: { ...link, ...patch } } } : {};
}

/** Exported for unit testing; also used as the persist `migrate`. */
export function migrateSyncMeta(persisted: any, version: number): Partial<SyncMetaState> {
  const base: Partial<SyncMetaState> = { albumLinks: {}, privateAlbumIds: [], localAlbumNames: {}, bases: {} };
  if (version >= 2) return { ...base, ...persisted };
  const collection = persisted && persisted.codeHash
    ? { code: persisted.code, codeHash: persisted.codeHash, writerId: persisted.writerId ?? '',
        lastVersion: persisted.lastVersion ?? 0, lastSyncedAt: persisted.lastSyncedAt ?? null, status: 'unlinked' as SyncStatus }
    : null;
  return { ...base, collection };
}

export const useSyncMeta = create<SyncMetaState>()(
  persist(
    (set) => ({
      collection: null, albumLinks: {}, privateAlbumIds: [], localAlbumNames: {}, bases: {},
      revokedNotice: null,

      // `bases.collection` is keyed by the fixed string 'collection', not by codeHash, so it
      // must be reset on every (re)link: a freshly-established link starts with no ancestor
      // (the engine's baseFor('collection') then falls back to its empty-collection default),
      // and an unlinked device must not let a stale base from a previous code be reused as the
      // merge ancestor for a differently-coded link later (mergeCounts/scalar3 would misclassify
      // real local edits as "unchanged since base" and silently discard them).
      setCollectionLink: (p) => set((s) => {
        const bases = { ...s.bases };
        delete bases.collection;
        return { collection: freshLink(p), bases };
      }),
      clearCollectionLink: () => set((s) => {
        const bases = { ...s.bases };
        delete bases.collection;
        return { collection: null, bases };
      }),
      upsertAlbumLink: (link) => set((s) => ({ albumLinks: { ...s.albumLinks, [link.albumId]: link } })),
      removeAlbumLink: (albumId) => set((s) => {
        const albumLinks = { ...s.albumLinks }; delete albumLinks[albumId];
        const bases = { ...s.bases }; delete bases[albumId];
        return { albumLinks, bases };
      }),
      setPrivate: (albumId, isPrivate) => set((s) => ({
        privateAlbumIds: isPrivate
          ? (s.privateAlbumIds.includes(albumId) ? s.privateAlbumIds : [...s.privateAlbumIds, albumId])
          : s.privateAlbumIds.filter((id) => id !== albumId),
      })),
      setLocalAlbumName: (albumId, name) => set((s) => {
        const localAlbumNames = { ...s.localAlbumNames };
        if (name && name.trim()) localAlbumNames[albumId] = name.trim(); else delete localAlbumNames[albumId];
        return { localAlbumNames };
      }),
      tombstoneAlbum: (albumId) => set((s) => {
        const cur = (s.bases.collection as CollectionPayload | undefined) ?? { kind: 'collection', v: PAYLOAD_V, albums: [] };
        const set2 = new Set([...(cur.deletedAlbumIds ?? []), albumId]);
        return { bases: { ...s.bases, collection: { ...cur, deletedAlbumIds: [...set2].sort() } } };
      }),
      setBase: (key, payload) => set((s) => ({ bases: { ...s.bases, [key]: payload } })),
      setChannelStatus: (key, status) => set((s) => patchChannel(s, key, { status })),
      markChannelSynced: (key, version) => set((s) => patchChannel(s, key, { lastVersion: version, lastSyncedAt: Date.now(), status: 'synced' })),
      setRevokedNotice: (msg) => set({ revokedNotice: msg }),
      clearRevokedNotice: () => set({ revokedNotice: null }),
    }),
    {
      name: 'figuritas-sync-v1',
      version: 2,
      migrate: migrateSyncMeta,
      // Persist everything except transient statuses (recomputed at runtime).
      partialize: (s): Partial<SyncMetaState> => ({
        collection: s.collection ? { ...s.collection, status: 'unlinked' as SyncStatus } : null,
        albumLinks: Object.fromEntries(Object.entries(s.albumLinks).map(([k, v]) => [k, { ...v, status: 'unlinked' as SyncStatus }])),
        privateAlbumIds: s.privateAlbumIds, localAlbumNames: s.localAlbumNames, bases: s.bases,
      }),
    },
  ),
);
