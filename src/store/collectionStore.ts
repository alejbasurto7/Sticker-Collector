import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { Counts, Edition, Swap } from '../types';
import { album, applyEdition, DEFAULT_EDITION, DEFAULT_TRACK_CC } from '../data/sampleAlbum';
import { computeReservations, quantityAfterGive } from '../utils/swap';

type ImportMode = 'replace' | 'merge';

/** Default name given to a freshly created album (deduplicated when it collides). */
const NEW_ALBUM_NAME = 'New Album';
const DEFAULT_ALBUM_ID = 'usa-mex-can-26';
const DEFAULT_ALBUM_NAME = 'My Album';

/**
 * The full collecting state of a single album. The active album's fields are
 * mirrored at the top level of the store (so every view keeps reading them
 * directly); the inactive albums are parked in `albums` until selected.
 */
interface AlbumSnapshot {
  id: string;
  albumName: string;
  counts: Counts;
  swaps: Swap[];
  edition: Edition;
  trackCC: boolean;
  /** When true the album is read-only: tapping sticker cells does nothing. */
  locked: boolean;
  firstStickerAt?: number;
  activityDays: string[];
  completedOn: string | null;
  unlockedAchievements: Record<string, number>;
}

interface CollectionState {
  counts: Counts;
  swaps: Swap[];
  edition: Edition;
  trackCC: boolean;
  albumName: string;
  /** When true the active album is locked (read-only): sticker cells ignore taps. */
  locked: boolean;
  /** Timestamp of the very first sticker added (for speed-run style achievements). */
  firstStickerAt?: number;
  /** Local YYYY-MM-DD days on which the collection grew (streak + days collecting). */
  activityDays: string[];
  /** Date the album first reached 100% unique, which freezes "days collecting". */
  completedOn: string | null;
  /** Sticky ledger: achievement key -> timestamp first earned. */
  unlockedAchievements: Record<string, number>;
  /**
   * Monotonic counter bumped on every collection import. Lets the achievement
   * banner tell a bulk import (celebrated as one summary) apart from coincidental
   * multi-unlocks during normal play (each celebrated on its own).
   */
  importSeq: number;

  /** Every album the user has, including a (possibly stale) snapshot of the active one. */
  albums: AlbumSnapshot[];
  /** Id of the album whose data is currently mirrored at the top level. */
  activeAlbumId: string;

  setEdition: (edition: Edition) => void;
  setTrackCC: (trackCC: boolean) => void;
  setAlbumName: (name: string) => void;
  /** Flip the active album between locked (read-only) and unlocked (editable). */
  toggleLocked: () => void;

  // Album management
  createAlbum: () => void;
  switchAlbum: (id: string) => void;
  deleteAlbum: (id: string) => void;

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

/** Capture the active album's live top-level fields as a parkable snapshot. */
function snapshotActive(s: CollectionState): AlbumSnapshot {
  return {
    id: s.activeAlbumId,
    albumName: s.albumName,
    counts: s.counts,
    swaps: s.swaps,
    edition: s.edition,
    trackCC: s.trackCC,
    locked: s.locked,
    firstStickerAt: s.firstStickerAt,
    activityDays: s.activityDays,
    completedOn: s.completedOn,
    unlockedAchievements: s.unlockedAchievements,
  };
}

/** Spread a parked album's data back onto the top-level (active) fields. */
function loadSnapshot(a: AlbumSnapshot) {
  return {
    counts: a.counts,
    swaps: a.swaps,
    edition: a.edition,
    trackCC: a.trackCC,
    locked: a.locked ?? false,
    albumName: a.albumName,
    firstStickerAt: a.firstStickerAt,
    activityDays: a.activityDays,
    completedOn: a.completedOn,
    unlockedAchievements: a.unlockedAchievements,
  };
}

/**
 * Pick a default name for a new album, appending " (2)", " (3)", … when the
 * plain "New Album" (or a prior numbered variant) is already taken.
 */
function nextAlbumName(existing: string[]): string {
  const taken = new Set(existing.map((n) => n.trim()));
  if (!taken.has(NEW_ALBUM_NAME)) return NEW_ALBUM_NAME;
  for (let i = 2; ; i++) {
    const candidate = `${NEW_ALBUM_NAME} (${i})`;
    if (!taken.has(candidate)) return candidate;
  }
}

const ownedUnique = (counts: Counts) =>
  album.stickers.reduce((acc, s) => acc + ((counts[s.id] ?? 0) >= 1 ? 1 : 0), 0);

/** Local calendar day as YYYY-MM-DD, used to group collecting activity. */
function todayKey(ts = Date.now()): string {
  const d = new Date(ts);
  const m = `${d.getMonth() + 1}`.padStart(2, '0');
  const day = `${d.getDate()}`.padStart(2, '0');
  return `${d.getFullYear()}-${m}-${day}`;
}

/**
 * Stamp the first-sticker time, log today as an active collecting day, and—once
 * every unique sticker is owned—freeze the album completion date. Pass the
 * resulting counts so completion can be detected.
 */
function withActivity(
  s: CollectionState,
  nextCounts?: Counts,
): Pick<CollectionState, 'firstStickerAt' | 'activityDays' | 'completedOn'> {
  const today = todayKey();
  let completedOn = s.completedOn;
  if (!completedOn && nextCounts && album.stickers.length > 0 && ownedUnique(nextCounts) === album.stickers.length) {
    completedOn = today;
  }
  return {
    firstStickerAt: s.firstStickerAt ?? Date.now(),
    activityDays: s.activityDays.includes(today) ? s.activityDays : [...s.activityDays, today].sort(),
    completedOn,
  };
}

export const useCollection = create<CollectionState>()(
  persist(
    (set) => ({
      counts: {},
      swaps: [],
      edition: DEFAULT_EDITION,
      trackCC: DEFAULT_TRACK_CC,
      albumName: DEFAULT_ALBUM_NAME,
      locked: false,
      activityDays: [],
      completedOn: null,
      unlockedAchievements: {},
      importSeq: 0,
      activeAlbumId: DEFAULT_ALBUM_ID,
      albums: [
        {
          id: DEFAULT_ALBUM_ID,
          albumName: DEFAULT_ALBUM_NAME,
          counts: {},
          swaps: [],
          edition: DEFAULT_EDITION,
          trackCC: DEFAULT_TRACK_CC,
          locked: false,
          activityDays: [],
          completedOn: null,
          unlockedAchievements: {},
        },
      ],

      createAlbum: () =>
        set((s) => {
          const id = newId();
          const albumName = nextAlbumName(s.albums.map((a) => a.albumName));
          const fresh: AlbumSnapshot = {
            id,
            albumName,
            counts: {},
            swaps: [],
            edition: DEFAULT_EDITION,
            trackCC: DEFAULT_TRACK_CC,
            locked: false,
            firstStickerAt: undefined,
            activityDays: [],
            completedOn: null,
            unlockedAchievements: {},
          };
          // Park the album we're leaving, then make the new one active & live.
          const albums = s.albums
            .map((a) => (a.id === s.activeAlbumId ? snapshotActive(s) : a))
            .concat(fresh);
          applyEdition(fresh.edition, fresh.trackCC);
          return { albums, activeAlbumId: id, ...loadSnapshot(fresh) };
        }),

      switchAlbum: (id) =>
        set((s) => {
          if (id === s.activeAlbumId) return s;
          const target = s.albums.find((a) => a.id === id);
          if (!target) return s;
          const albums = s.albums.map((a) =>
            a.id === s.activeAlbumId ? snapshotActive(s) : a,
          );
          applyEdition(target.edition, target.trackCC);
          return { albums, activeAlbumId: id, ...loadSnapshot(target) };
        }),

      deleteAlbum: (id) =>
        set((s) => {
          const remaining = s.albums.filter((a) => a.id !== id);
          // Never leave the app album-less: rebuild a fresh default if this was the last one.
          if (remaining.length === 0) {
            const fresh: AlbumSnapshot = {
              id: newId(),
              albumName: DEFAULT_ALBUM_NAME,
              counts: {},
              swaps: [],
              edition: DEFAULT_EDITION,
              trackCC: DEFAULT_TRACK_CC,
              locked: false,
              firstStickerAt: undefined,
              activityDays: [],
              completedOn: null,
              unlockedAchievements: {},
            };
            applyEdition(fresh.edition, fresh.trackCC);
            return { albums: [fresh], activeAlbumId: fresh.id, ...loadSnapshot(fresh) };
          }
          // Deleting the active album means promoting another one to live; deleting a
          // parked album just drops it and leaves the active fields untouched.
          if (id === s.activeAlbumId) {
            const target = remaining[0];
            applyEdition(target.edition, target.trackCC);
            return { albums: remaining, activeAlbumId: target.id, ...loadSnapshot(target) };
          }
          return { albums: remaining };
        }),

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

      setAlbumName: (name) =>
        set((s) => {
          const albumName = name.trim() || DEFAULT_ALBUM_NAME;
          // Keep the parked snapshot's name in sync so the selector stays current.
          const albums = s.albums.map((a) =>
            a.id === s.activeAlbumId ? { ...a, albumName } : a,
          );
          return { albumName, albums };
        }),

      toggleLocked: () =>
        set((s) => {
          const locked = !s.locked;
          // Keep the parked snapshot in sync so the lock survives album switches.
          const albums = s.albums.map((a) =>
            a.id === s.activeAlbumId ? { ...a, locked } : a,
          );
          return { locked, albums };
        }),

      addOne: (id) =>
        set((s) => {
          const counts = { ...s.counts, [id]: clampCount((s.counts[id] ?? 0) + 1) };
          return { counts, ...withActivity(s, counts) };
        }),

      removeOne: (id) =>
        set((s) => ({ counts: { ...s.counts, [id]: clampCount((s.counts[id] ?? 0) - 1) } })),

      setCount: (id, n) =>
        set((s) => {
          const next = clampCount(n);
          const increased = next > (s.counts[id] ?? 0);
          const counts = { ...s.counts, [id]: next };
          return { counts, ...(increased ? withActivity(s, counts) : {}) };
        }),

      importCounts: (map, mode) =>
        set((s) => {
          const added = Object.values(map).some((n) => n > 0);
          const counts =
            mode === 'replace'
              ? { ...map }
              : (() => {
                  const merged = { ...s.counts };
                  for (const [id, n] of Object.entries(map)) merged[id] = clampCount(n);
                  return merged;
                })();
          // Bump the import marker so the achievement banner can recognise this
          // batch as an import and summarise it rather than firing one per unlock.
          return { counts, importSeq: s.importSeq + 1, ...(added ? withActivity(s, counts) : {}) };
        }),

      // Clears the collection and its live time counters for a fresh start; earned
      // badges stay permanent via the separate unlockedAchievements ledger.
      reset: () => set({ counts: {}, activityDays: [], completedOn: null, firstStickerAt: undefined }),

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
          return { counts, swaps, ...(settled.receivedIds.length ? withActivity(s, counts) : {}) };
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
        if (!state) return;
        applyEdition(state.edition ?? DEFAULT_EDITION, state.trackCC ?? DEFAULT_TRACK_CC);
        // Pre-multi-album saves have no album list: seed it from the live fields so
        // the active album is represented and its name matches the top level.
        if (!state.activeAlbumId) state.activeAlbumId = DEFAULT_ALBUM_ID;
        if (!Array.isArray(state.albums) || state.albums.length === 0) {
          state.albums = [snapshotActive(state)];
        } else if (!state.albums.some((a) => a.id === state.activeAlbumId)) {
          state.albums = [...state.albums, snapshotActive(state)];
        } else {
          state.albums = state.albums.map((a) =>
            a.id === state.activeAlbumId ? { ...a, albumName: state.albumName } : a,
          );
        }
      },
    },
  ),
);
