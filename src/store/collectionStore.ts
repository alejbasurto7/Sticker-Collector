import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { Counts, Edition, Swap } from '../types';
import { applyEdition, DEFAULT_EDITION, DEFAULT_TRACK_CC } from '../data/sampleAlbum';
import { computeReservations, quantityAfterGive } from '../utils/swap';

type ImportMode = 'replace' | 'merge';

interface CollectionState {
  counts: Counts;
  swaps: Swap[];
  edition: Edition;
  trackCC: boolean;
  albumName: string;
  /** Timestamp of the very first sticker added (for speed-run style achievements). */
  firstStickerAt?: number;
  /** Local YYYY-MM-DD days on which the collection grew (for streak achievements). */
  activityDays: string[];
  /** Sticky ledger: achievement key -> timestamp first earned. */
  unlockedAchievements: Record<string, number>;
  setEdition: (edition: Edition) => void;
  setTrackCC: (trackCC: boolean) => void;
  setAlbumName: (name: string) => void;

  // Collection actions
  addOne: (id: string) => void;
  removeOne: (id: string) => void;
  setCount: (id: string, n: number) => void;
  importCounts: (map: Counts, mode: ImportMode) => void;
  reset: () => void;

  // Swap actions
  createSwap: (input: {
    name: string;
    theirNeeds: string[];
    theirSwaps: string[];
    giving: string[];
    receiving: string[];
  }) => string;
  updateSwap: (id: string, patch: { giving?: string[]; receiving?: string[]; name?: string }) => void;
  closeSwap: (id: string, settled: { givenIds: string[]; receivedIds: string[] }) => void;
  deleteSwap: (id: string) => void;
  undoLastTrade: () => void;

  // Achievements
  markUnlocked: (keys: string[]) => void;
}

const clampCount = (n: number) => (n < 0 ? 0 : n);

function newId(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

/** Local calendar day as YYYY-MM-DD, used to group collecting activity. */
function todayKey(ts = Date.now()): string {
  const d = new Date(ts);
  const m = `${d.getMonth() + 1}`.padStart(2, '0');
  const day = `${d.getDate()}`.padStart(2, '0');
  return `${d.getFullYear()}-${m}-${day}`;
}

/** Stamp the first-sticker time and log today as an active collecting day. */
function withActivity(s: CollectionState): Pick<CollectionState, 'firstStickerAt' | 'activityDays'> {
  const today = todayKey();
  return {
    firstStickerAt: s.firstStickerAt ?? Date.now(),
    activityDays: s.activityDays.includes(today) ? s.activityDays : [...s.activityDays, today].sort(),
  };
}

export const useCollection = create<CollectionState>()(
  persist(
    (set) => ({
      counts: {},
      swaps: [],
      edition: DEFAULT_EDITION,
      trackCC: DEFAULT_TRACK_CC,
      albumName: 'Usa Mex Can 26',
      activityDays: [],
      unlockedAchievements: {},

      setEdition: (edition) =>
        set((s) => {
          applyEdition(edition, s.trackCC);
          return { edition };
        }),

      setTrackCC: (trackCC) =>
        set((s) => {
          applyEdition(s.edition, trackCC);
          return { trackCC };
        }),

      setAlbumName: (name) => set({ albumName: name.trim() || 'Usa Mex Can 26' }),

      addOne: (id) =>
        set((s) => ({
          counts: { ...s.counts, [id]: clampCount((s.counts[id] ?? 0) + 1) },
          ...withActivity(s),
        })),

      removeOne: (id) =>
        set((s) => ({ counts: { ...s.counts, [id]: clampCount((s.counts[id] ?? 0) - 1) } })),

      setCount: (id, n) =>
        set((s) => {
          const next = clampCount(n);
          const increased = next > (s.counts[id] ?? 0);
          return { counts: { ...s.counts, [id]: next }, ...(increased ? withActivity(s) : {}) };
        }),

      importCounts: (map, mode) =>
        set((s) => {
          const added = Object.values(map).some((n) => n > 0);
          if (mode === 'replace') return { counts: { ...map }, ...(added ? withActivity(s) : {}) };
          const merged = { ...s.counts };
          for (const [id, n] of Object.entries(map)) merged[id] = clampCount(n);
          return { counts: merged, ...(added ? withActivity(s) : {}) };
        }),

      reset: () => set({ counts: {} }),

      createSwap: (input) => {
        const id = newId();
        const swap: Swap = {
          id,
          name: input.name.trim() || 'Untitled swap',
          createdAt: Date.now(),
          status: 'open',
          theirNeeds: input.theirNeeds,
          theirSwaps: input.theirSwaps,
          giving: input.giving,
          receiving: input.receiving,
        };
        set((s) => ({ swaps: [swap, ...s.swaps] }));
        return id;
      },

      updateSwap: (id, patch) =>
        set((s) => ({
          swaps: s.swaps.map((sw) =>
            sw.id === id
              ? {
                  ...sw,
                  ...(patch.giving ? { giving: patch.giving } : {}),
                  ...(patch.receiving ? { receiving: patch.receiving } : {}),
                  ...(patch.name !== undefined ? { name: patch.name } : {}),
                }
              : sw,
          ),
        })),

      closeSwap: (id, settled) =>
        set((s) => {
          // Copies still reserved by OTHER open swaps must survive this settlement, so a
          // give here can never strip a spare already promised to someone else.
          const others = computeReservations(s.swaps, id);
          const counts = { ...s.counts };
          for (const gid of settled.givenIds) {
            counts[gid] = quantityAfterGive(counts[gid] ?? 0, others.committedGive.get(gid) ?? 0);
          }
          for (const rid of settled.receivedIds) counts[rid] = clampCount((counts[rid] ?? 0) + 1);
          const swaps = s.swaps.map((sw) =>
            sw.id === id
              ? {
                  ...sw,
                  status: 'closed' as const,
                  closedAt: Date.now(),
                  giving: settled.givenIds,
                  receiving: settled.receivedIds,
                }
              : sw,
          );
          // Receiving new stickers counts as a collecting day.
          return { counts, swaps, ...(settled.receivedIds.length ? withActivity(s) : {}) };
        }),

      deleteSwap: (id) => set((s) => ({ swaps: s.swaps.filter((sw) => sw.id !== id) })),

      undoLastTrade: () =>
        set((s) => {
          const last = [...s.swaps]
            .filter((sw) => sw.status === 'closed')
            .sort((a, b) => (b.closedAt ?? 0) - (a.closedAt ?? 0))[0];
          if (!last) return s;
          const counts = { ...s.counts };
          for (const id of last.giving) counts[id] = clampCount((counts[id] ?? 0) + 1);
          for (const id of last.receiving) counts[id] = clampCount((counts[id] ?? 0) - 1);
          return { counts, swaps: s.swaps.filter((sw) => sw.id !== last.id) };
        }),

      markUnlocked: (keys) =>
        set((s) => {
          const now = Date.now();
          let changed = false;
          const unlockedAchievements = { ...s.unlockedAchievements };
          for (const k of keys) {
            if (unlockedAchievements[k] == null) {
              unlockedAchievements[k] = now;
              changed = true;
            }
          }
          return changed ? { unlockedAchievements } : s;
        }),
    }),
    {
      name: 'figuritas-collection-v1',
      // Rebuild the album to match the persisted edition + CC tracking before first render.
      onRehydrateStorage: () => (state) => {
        if (state) applyEdition(state.edition ?? DEFAULT_EDITION, state.trackCC ?? DEFAULT_TRACK_CC);
      },
    },
  ),
);
