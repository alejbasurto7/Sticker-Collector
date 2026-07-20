import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { Counts, Edition, Swap } from '../types';
import type { CollectionPayload } from '../sync/payload';
import { album, applyEdition, DEFAULT_EDITION, DEFAULT_TRACK_CC } from '../data/sampleAlbum';
import { computeReservations, settleSwapCounts, reverseSettlement } from '../utils/swap';

type ImportMode = 'replace' | 'merge';
export type Theme = 'dark' | 'light';
export type AlbumLayout = 'compact' | 'pages';

/** Default name given to a freshly created album (deduplicated when it collides). */
const NEW_ALBUM_NAME = 'New Album';
const DEFAULT_ALBUM_ID = 'usa-mex-can-26';
const DEFAULT_ALBUM_NAME = 'My Album';

/** localStorage key for the persisted collection (see the persist config below). */
const PERSIST_KEY = 'figuritas-collection-v1';

/**
 * Whether a persisted collection already existed at startup — i.e. this is a returning
 * user (an upgrader), not a brand-new install. Read once at module load, before Zustand
 * rehydrates; guarded so non-browser (test) environments stay safe. Consumed by the
 * What's New gate in App.tsx so first-time users never see release notes for features
 * that are already new to them.
 */
export const HAD_PERSISTED_COLLECTION =
  typeof localStorage !== 'undefined' && localStorage.getItem(PERSIST_KEY) != null;

/**
 * The full collecting state of a single album. The active album's fields are
 * mirrored at the top level of the store (so every view keeps reading them
 * directly); the inactive albums are parked in `albums` until selected.
 */
export interface AlbumSnapshot {
  id: string;
  albumName: string;
  counts: Counts;
  swaps: Swap[];
  edition: Edition;
  trackCC: boolean;
  /** When true the album is read-only: tapping sticker cells does nothing. */
  locked: boolean;
  /** Album-tab layout for the All filter. Optional so legacy snapshots default to compact. */
  albumLayout?: AlbumLayout;
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
  /** Album-tab layout for the All filter on the active album ('compact' | 'pages'). */
  albumLayout: AlbumLayout;
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

  /** UI colour scheme. Global preference, not tied to any album. */
  theme: Theme;

  /** Release id of the last What's New carousel the user has seen (undefined = never). */
  lastSeenWhatsNewId?: string;

  /** Whether the first-album onboarding carousel has been shown and dismissed. */
  hasSeenAlbumOnboarding: boolean;

  /** Every album the user has, including a (possibly stale) snapshot of the active one. */
  albums: AlbumSnapshot[];
  /** Id of the album whose data is currently mirrored at the top level. */
  activeAlbumId: string;
  /**
   * The user's manual album arrangement as an ordered list of album ids. LOCAL-ONLY:
   * never serialized to the sync payload, so each device keeps its own order and a
   * Cloud/Shared sync round-trip (which re-sorts `albums` by id) cannot clobber it.
   * Missing/empty (legacy) means "no manual order" → natural `albums` order.
   */
  albumOrder?: string[];

  setTheme: (theme: Theme) => void;
  toggleTheme: () => void;
  /** Record that the user has seen the What's New carousel for release `id`. */
  setLastSeenWhatsNewId: (id: string) => void;
  /** Record that the first-album onboarding carousel has been shown and dismissed. */
  setAlbumOnboardingSeen: () => void;
  setEdition: (edition: Edition) => void;
  setTrackCC: (trackCC: boolean) => void;
  setAlbumName: (name: string) => void;
  /** Flip the active album between locked (read-only) and unlocked (editable). */
  toggleLocked: () => void;
  /** Set the active album's All-filter layout, mirroring into its parked snapshot. */
  setAlbumLayout: (layout: AlbumLayout) => void;

  // Album management
  createAlbum: () => void;
  switchAlbum: (id: string) => void;
  deleteAlbum: (id: string) => void;
  /** Record the user's manual album order (local-only display preference). */
  reorderAlbums: (orderedIds: string[]) => void;

  // Collection actions
  addOne: (id: string) => void;
  removeOne: (id: string) => void;
  setCount: (id: string, n: number) => void;
  importCounts: (map: Counts, mode: ImportMode) => void;
  reset: () => void;

  // Swap actions
  createSwap: (input: {
    name: string;
    notes?: string;
    theirNeeds: string[];
    theirSwaps: string[];
    giving: string[];
    receiving: string[];
    theirNeedsQty?: Record<string, number>;
    givingQty?: Record<string, number>;
  }) => string;
  updateSwap: (
    id: string,
    patch: {
      giving?: string[];
      receiving?: string[];
      name?: string;
      notes?: string;
      theirNeeds?: string[];
      theirSwaps?: string[];
      theirNeedsQty?: Record<string, number>;
      givingQty?: Record<string, number>;
      deselectedGiving?: string[];
      deselectedReceiving?: string[];
    },
  ) => void;
  closeSwap: (
    id: string,
    settled: { givenIds: string[]; receivedIds: string[]; giveQty?: Record<string, number> },
  ) => void;
  rollbackSwap: (id: string) => void;
  deleteSwap: (id: string) => void;
  undoLastTrade: () => void;

  // Achievements
  markUnlocked: (keys: string[]) => void;

  // Per-album sync: apply a merged collection (cloud albums replaced, non-cloud preserved).
  applyMergedCollection: (payload: CollectionPayload, nonCloudIds: Set<string>) => void;

  // Per-album sync: apply a merged album snapshot (adopted or replaced).
  applyMergedAlbum: (albumId: string, snapshot: AlbumSnapshot) => void;
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
    albumLayout: s.albumLayout,
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
    albumLayout: a.albumLayout ?? 'compact',
    albumName: a.albumName,
    firstStickerAt: a.firstStickerAt,
    activityDays: a.activityDays,
    completedOn: a.completedOn,
    unlockedAchievements: a.unlockedAchievements,
  };
}

/**
 * Apply the local manual order to the album list. Self-healing:
 *  - albums whose id appears in `order` come first, in `order` sequence;
 *  - albums not listed (newly created / joined / added by a sync merge) are appended
 *    in their natural `albums` position;
 *  - ids in `order` with no matching album are ignored.
 * Undefined/empty `order` returns the input order unchanged. Pure; never mutates inputs.
 */
export function orderAlbums(albums: AlbumSnapshot[], order?: string[]): AlbumSnapshot[] {
  if (!order || order.length === 0) return albums;
  const rank = new Map(order.map((id, i) => [id, i] as const));
  const listed = albums
    .filter((a) => rank.has(a.id))
    .sort((x, y) => rank.get(x.id)! - rank.get(y.id)!);
  const rest = albums.filter((a) => !rank.has(a.id)); // preserves natural order
  return [...listed, ...rest];
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
      albumLayout: 'compact',
      activityDays: [],
      completedOn: null,
      unlockedAchievements: {},
      importSeq: 0,
      theme: 'dark',
      hasSeenAlbumOnboarding: false,
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
          albumLayout: 'compact',
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
            albumLayout: 'compact',
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
              albumLayout: 'compact',
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

      setTheme: (theme) => set({ theme }),

      toggleTheme: () => set((s) => ({ theme: s.theme === 'dark' ? 'light' : 'dark' })),

      setLastSeenWhatsNewId: (id) => set({ lastSeenWhatsNewId: id }),

      setAlbumOnboardingSeen: () => set({ hasSeenAlbumOnboarding: true }),

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

      setAlbumLayout: (layout) =>
        set((s) => {
          // Mirror into the parked snapshot so the choice survives album switches.
          const albums = s.albums.map((a) =>
            a.id === s.activeAlbumId ? { ...a, albumLayout: layout } : a,
          );
          return { albumLayout: layout, albums };
        }),

      reorderAlbums: (orderedIds) => set({ albumOrder: orderedIds }),

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
                  // Merge is additive: each map entry is a COPY DELTA added on
                  // top of the current count, never an absolute overwrite.
                  const merged = { ...s.counts };
                  for (const [id, n] of Object.entries(map))
                    merged[id] = clampCount((merged[id] ?? 0) + n);
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
          notes: input.notes?.trim() || undefined,
          createdAt: Date.now(),
          status: 'open',
          theirNeeds: input.theirNeeds,
          theirSwaps: input.theirSwaps,
          theirNeedsQty: input.theirNeedsQty,
          giving: input.giving,
          receiving: input.receiving,
          givingQty: input.givingQty,
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
                  ...(patch.notes !== undefined ? { notes: patch.notes.trim() || undefined } : {}),
                  ...(patch.theirNeeds ? { theirNeeds: patch.theirNeeds } : {}),
                  ...(patch.theirSwaps ? { theirSwaps: patch.theirSwaps } : {}),
                  ...(patch.theirNeedsQty ? { theirNeedsQty: patch.theirNeedsQty } : {}),
                  ...(patch.givingQty ? { givingQty: patch.givingQty } : {}),
                  ...(patch.deselectedGiving ? { deselectedGiving: patch.deselectedGiving } : {}),
                  ...(patch.deselectedReceiving
                    ? { deselectedReceiving: patch.deselectedReceiving }
                    : {}),
                }
              : sw,
          ),
        })),

      closeSwap: (id, settled) =>
        set((s) => {
          // Copies still reserved by OTHER open swaps must survive this settlement, so a
          // give here can never strip a spare already promised to someone else.
          const others = computeReservations(s.swaps, id);
          const { counts, delta } = settleSwapCounts(s.counts, settled, others.committedGive);
          const swaps = s.swaps.map((sw) =>
            sw.id === id
              ? {
                  ...sw,
                  status: 'closed' as const,
                  closedAt: Date.now(),
                  giving: settled.givenIds,
                  receiving: settled.receivedIds,
                  // Preserve how many copies of each sticker were actually handed over.
                  givingQty: settled.giveQty,
                  // Exact per-sticker change, so rollbackSwap can reverse it precisely.
                  settledDelta: delta,
                  // Settlement rewrites the lists to exactly what was traded, so any
                  // parked deselections no longer apply.
                  deselectedGiving: [],
                  deselectedReceiving: [],
                }
              : sw,
          );
          // Receiving new stickers counts as a collecting day.
          return { counts, swaps, ...(settled.receivedIds.length ? withActivity(s, counts) : {}) };
        }),

      rollbackSwap: (id) =>
        set((s) => {
          const target = s.swaps.find((sw) => sw.id === id);
          if (!target || target.status !== 'closed') return s;
          const counts = reverseSettlement(s.counts, target);
          const swaps = s.swaps.map((sw) =>
            sw.id === id
              ? { ...sw, status: 'open' as const, closedAt: undefined, settledDelta: undefined }
              : sw,
          );
          return { counts, swaps };
        }),

      deleteSwap: (id) => set((s) => ({ swaps: s.swaps.filter((sw) => sw.id !== id) })),

      undoLastTrade: () =>
        set((s) => {
          const last = [...s.swaps]
            .filter((sw) => sw.status === 'closed')
            .sort((a, b) => (b.closedAt ?? 0) - (a.closedAt ?? 0))[0];
          if (!last) return s;
          // Reverse the exact settlement (multi-copy gives and floored gives included),
          // then drop the swap. Falls back to a naive per-copy reversal for old swaps.
          const counts = reverseSettlement(s.counts, last);
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

      applyMergedCollection: (payload, nonCloudIds) =>
        set((s) => {
          const kept = s.albums.filter((a) => nonCloudIds.has(a.id)); // shared/private keep their LIVE local copy
          // A shared/private album can linger in the Cloud row (carve-out ≠ deletion, so mergeCollection
          // preserves it there). Its authoritative copy is its OWN channel — the Cloud payload's copy is
          // stale — so never adopt a nonCloud album from the payload here (that clobbered live edits,
          // e.g. a just-created swap on the active shared album).
          const cloudAlbums = payload.albums.filter((a) => !nonCloudIds.has(a.id));
          const albums = [...kept, ...cloudAlbums];
          const activeInCloud = cloudAlbums.find((a) => a.id === s.activeAlbumId);
          if (activeInCloud) {
            applyEdition(activeInCloud.edition, activeInCloud.trackCC);
            return { albums, ...loadSnapshot(activeInCloud) };
          }
          if (!albums.some((a) => a.id === s.activeAlbumId)) {
            const fallback = albums[0];
            if (!fallback) return { albums };
            applyEdition(fallback.edition, fallback.trackCC);
            return { albums, activeAlbumId: fallback.id, ...loadSnapshot(fallback) };
          }
          return { albums }; // active is a shared/private album — leave top-level alone
        }),

      applyMergedAlbum: (albumId, snapshot) =>
        set((s) => {
          const albums = s.albums.some((a) => a.id === albumId)
            ? s.albums.map((a) => (a.id === albumId ? snapshot : a))
            : [...s.albums, snapshot];
          if (s.activeAlbumId === albumId) {
            applyEdition(snapshot.edition, snapshot.trackCC);
            return { albums, ...loadSnapshot(snapshot) };
          }
          return { albums };
        }),
    }),
    {
      name: PERSIST_KEY,
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
