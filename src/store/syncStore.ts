import { create } from 'zustand';
import { persist } from 'zustand/middleware';

/** Live sync connection state, surfaced in the Sync settings section. */
export type SyncStatus = 'unlinked' | 'syncing' | 'synced' | 'offline' | 'error';

interface SyncState {
  /** The raw sync code — kept ONLY on this device, never synced into the blob. */
  code: string | null;
  /** SHA-256 of the code; what the server row is keyed on. */
  codeHash: string | null;
  /** Random per-device id, so the engine can ignore its own echoed writes. */
  writerId: string | null;
  linkedAt: number | null;
  /** Last server row version this device has applied/written (optimistic concurrency). */
  lastVersion: number;
  lastSyncedAt: number | null;
  status: SyncStatus;

  setLink: (p: { code: string; codeHash: string; writerId: string }) => void;
  clearLink: () => void;
  setStatus: (status: SyncStatus) => void;
  markSynced: (version: number) => void;
}

/**
 * Sync metadata lives in its OWN persisted store (separate localStorage key)
 * so the link/identity is never part of the collection blob that gets synced —
 * otherwise the code would travel to every paired device inside the document.
 */
export const useSyncMeta = create<SyncState>()(
  persist(
    (set) => ({
      code: null,
      codeHash: null,
      writerId: null,
      linkedAt: null,
      lastVersion: 0,
      lastSyncedAt: null,
      status: 'unlinked',

      setLink: ({ code, codeHash, writerId }) =>
        set({ code, codeHash, writerId, linkedAt: Date.now(), lastVersion: 0, lastSyncedAt: null, status: 'syncing' }),

      clearLink: () =>
        set({
          code: null,
          codeHash: null,
          writerId: null,
          linkedAt: null,
          lastVersion: 0,
          lastSyncedAt: null,
          status: 'unlinked',
        }),

      setStatus: (status) => set({ status }),

      markSynced: (version) => set({ lastVersion: version, lastSyncedAt: Date.now(), status: 'synced' }),
    }),
    {
      name: 'figuritas-sync-v1',
      // `status` is transient runtime state — don't persist a stale "syncing".
      partialize: (s) => ({
        code: s.code,
        codeHash: s.codeHash,
        writerId: s.writerId,
        linkedAt: s.linkedAt,
        lastVersion: s.lastVersion,
        lastSyncedAt: s.lastSyncedAt,
      }),
    },
  ),
);
