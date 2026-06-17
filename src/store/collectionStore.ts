import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { Counts, Edition, Swap } from '../types';
import { album, applyEdition, DEFAULT_EDITION, DEFAULT_TRACK_CC } from '../data/sampleAlbum';
import { computeReservations, quantityAfterGive } from '../utils/swap';
import { dateKey } from '../utils/stats';

type ImportMode = 'replace' | 'merge';

interface CollectionState {
  counts: Counts;
  swaps: Swap[];
  edition: Edition;
  trackCC: boolean;
  albumName: string;
  /** Local date keys (YYYY-MM-DD) on which a sticker was added. Drives the streak. */
  collectDays: string[];
  /** Date the album first reached 100% unique, which freezes "days collecting". */
  completedOn: string | null;
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
}

const clampCount = (n: number) => (n < 0 ? 0 : n);

function newId(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

const sumCounts = (counts: Counts) => Object.values(counts).reduce((a, n) => a + n, 0);

const ownedUnique = (counts: Counts) =>
  album.stickers.reduce((acc, s) => acc + ((counts[s.id] ?? 0) >= 1 ? 1 : 0), 0);

/**
 * Records the collection-history side effects of a count change: a streak day
 * whenever the total number of stickers grew, and the completion date the first
 * time every unique sticker is owned. Returns the patch to merge into state.
 */
function trackHistory(
  prev: Pick<CollectionState, 'counts' | 'collectDays' | 'completedOn'>,
  nextCounts: Counts,
): Pick<CollectionState, 'collectDays' | 'completedOn'> {
  let collectDays = prev.collectDays;
  let completedOn = prev.completedOn;
  const today = dateKey(Date.now());

  if (sumCounts(nextCounts) > sumCounts(prev.counts) && !collectDays.includes(today)) {
    collectDays = [...collectDays, today].sort();
  }

  if (!completedOn && album.stickers.length > 0 && ownedUnique(nextCounts) === album.stickers.length) {
    completedOn = today;
  }

  return { collectDays, completedOn };
}

export const useCollection = create<CollectionState>()(
  persist(
    (set) => ({
      counts: {},
      swaps: [],
      edition: DEFAULT_EDITION,
      trackCC: DEFAULT_TRACK_CC,
      albumName: 'Usa Mex Can 26',
      collectDays: [],
      completedOn: null,

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
        set((s) => {
          const counts = { ...s.counts, [id]: clampCount((s.counts[id] ?? 0) + 1) };
          return { counts, ...trackHistory(s, counts) };
        }),

      removeOne: (id) =>
        set((s) => ({ counts: { ...s.counts, [id]: clampCount((s.counts[id] ?? 0) - 1) } })),

      setCount: (id, n) =>
        set((s) => {
          const counts = { ...s.counts, [id]: clampCount(n) };
          return { counts, ...trackHistory(s, counts) };
        }),

      importCounts: (map, mode) =>
        set((s) => {
          const counts =
            mode === 'replace'
              ? { ...map }
              : (() => {
                  const merged = { ...s.counts };
                  for (const [id, n] of Object.entries(map)) merged[id] = clampCount(n);
                  return merged;
                })();
          return { counts, ...trackHistory(s, counts) };
        }),

      reset: () => set({ counts: {}, collectDays: [], completedOn: null }),

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
          return { counts, swaps, ...trackHistory(s, counts) };
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
