import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { Album, AlbumGroup, Counts, Edition, Swap } from '../types';
import type { CollectionPayload } from '../sync/payload';
import { reconstructActive } from '../sync/serialize';
import { album, applyAlbumLayout, buildAlbumFor, DEFAULT_EDITION, DEFAULT_TRACK_CC } from '../data/sampleAlbum';
import { ACTIVE_ALBUM_TYPE_ID, typeById } from '../data/albumTypes';
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
const PERSISTED_RAW =
  typeof localStorage !== 'undefined' ? localStorage.getItem(PERSIST_KEY) : null;

export const HAD_PERSISTED_COLLECTION = PERSISTED_RAW != null;

/**
 * Whether the persisted save already uses the multi-album shape (has an `albums`
 * array). Distinguishes a pre-multi-album *upgrader* (no albums array — its single
 * album must be seeded from the top-level fields) from a current user who simply has
 * no albums yet (brand-new install, or deleted them all → show the collection picker).
 * Read once from the raw blob at load, before Zustand's shallow merge hides the shape.
 */
const PERSISTED_HAS_ALBUMS = (() => {
  if (!PERSISTED_RAW) return false;
  try {
    const parsed = JSON.parse(PERSISTED_RAW) as { state?: { albums?: unknown } };
    return Array.isArray(parsed?.state?.albums);
  } catch {
    return false;
  }
})();

/**
 * The full collecting state of a single album. The active album's fields are
 * mirrored at the top level of the store (so every view keeps reading them
 * directly); the inactive albums are parked in `albums` until selected.
 */
export interface AlbumSnapshot {
  id: string;
  albumName: string;
  /** Which collection this album belongs to (AlbumType id, e.g. '2026-fwc' or
   *  '2026-fwc-adrenalyn'). Optional so legacy/foreign snapshots (older saves and
   *  cross-device payloads) load and default to the active type via typeById(). */
  albumTypeId?: string;
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
  /** Collection type of the active album (AlbumType id). Always a concrete id at the
   *  top level — loadSnapshot defaults legacy/foreign albums to the active type. */
  albumTypeId: string;
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
  /** User-defined album groups for combined swapping. Synced in a later stage. */
  groups: AlbumGroup[];

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

  // Album management. Optionally pick the collection type + variant + name (the
  // collection picker / New-album flow pass these); all default sensibly when omitted.
  createAlbum: (opts?: { albumTypeId?: string; variantId?: string; name?: string }) => void;
  switchAlbum: (id: string) => void;
  deleteAlbum: (id: string) => void;
  /** Record the user's manual album order (local-only display preference). */
  reorderAlbums: (orderedIds: string[]) => void;

  // Album groups (combined swapping)
  createGroup: (name: string, memberIds: string[]) => string;
  renameGroup: (id: string, name: string) => void;
  setGroupMembers: (id: string, memberIds: string[]) => void;
  disbandGroup: (id: string) => void;
  /**
   * Record a physical internal move of one copy of `stickerId` from one album to another.
   * `writableIds` is the group's writable member ids (the caller resolves writability from
   * sync metadata, which this store deliberately does not see) — a move touching anything
   * outside that set is refused.
   */
  applyInternalMove: (
    fromId: string, toId: string, stickerId: string, writableIds: Set<string>,
  ) => void;

  // Combined (group) swaps
  createCombinedSwap: (
    groupId: string,
    input: {
      name: string; notes?: string;
      theirNeeds: string[]; theirSwaps: string[]; theirNeedsQty?: Record<string, number>;
      giving: string[]; receiving: string[];
      givingQty?: Record<string, number>; receivingQty?: Record<string, number>;
    },
  ) => string;
  updateCombinedSwap: (
    groupId: string, swapId: string,
    patch: {
      name?: string; notes?: string;
      giving?: string[]; receiving?: string[];
      givingQty?: Record<string, number>; receivingQty?: Record<string, number>;
      theirNeeds?: string[]; theirSwaps?: string[]; theirNeedsQty?: Record<string, number>;
      deselectedGiving?: string[]; deselectedReceiving?: string[];
    },
  ) => void;
  deleteCombinedSwap: (groupId: string, swapId: string) => void;
  closeCombinedSwap: (
    groupId: string, swapId: string,
    settled: {
      givenIds: string[]; receivedIds: string[];
      giveQty?: Record<string, number>; receiveQty?: Record<string, number>;
      settledByAlbum: Record<string, Record<string, number>>;
    },
  ) => void;
  rollbackCombinedSwap: (groupId: string, swapId: string) => void;

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

/**
 * The top-level fields that mirror the active album. Narrower than `CollectionState` so a
 * component can assemble one from individual store subscriptions (see `useLiveAlbums`)
 * without faking the actions half of the store.
 */
export type ActiveMirror = Pick<
  CollectionState,
  | 'activeAlbumId' | 'albumName' | 'albumTypeId' | 'counts' | 'swaps' | 'edition' | 'trackCC'
  | 'locked' | 'albumLayout' | 'firstStickerAt' | 'activityDays' | 'completedOn'
  | 'unlockedAchievements'
>;

/**
 * Capture the active album's live top-level fields as a parkable snapshot.
 *
 * Shared with the sync layer rather than duplicated: the two copies drifted once (the
 * sync one dropped `albumTypeId`, so an active album of a non-default collection synced
 * without its type and returned as a default-type album).
 */
const snapshotActive = reconstructActive;

/** Spread a parked album's data back onto the top-level (active) fields. */
function loadSnapshot(a: AlbumSnapshot) {
  return {
    counts: a.counts,
    swaps: a.swaps,
    edition: a.edition,
    trackCC: a.trackCC,
    albumTypeId: a.albumTypeId ?? ACTIVE_ALBUM_TYPE_ID,
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
 * The album list with the active album's entry rebuilt from the live top-level fields.
 *
 * `albums` parks the active album only on switch/create, so its stored entry is stale for
 * the whole time that album is current — every edit lands at the top level instead (see
 * `applyAlbumDeltas`, which deliberately skips the active album's parked copy). Anything
 * that shows per-album data for the WHOLE list must read it through here, or the current
 * album renders its pre-edit state: the bug that showed a group swap's received sticker on
 * every album card except the one the user was standing in.
 *
 * Replaces in place and never appends: while the collection is empty (`activeAlbumId: ''`,
 * `albums: []`) there is no active album to reconstruct, and inventing one would hide the
 * collection picker that App.tsx gates on an empty list.
 */
export function liveAlbums(s: ActiveMirror & { albums: AlbumSnapshot[] }): AlbumSnapshot[] {
  if (!s.activeAlbumId || !s.albums.some((a) => a.id === s.activeAlbumId)) return s.albums;
  const active = snapshotActive(s);
  return s.albums.map((a) => (a.id === active.id ? active : a));
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

const ownedUnique = (counts: Counts, layout: Album) =>
  layout.stickers.reduce((acc, s) => acc + ((counts[s.id] ?? 0) >= 1 ? 1 : 0), 0);

/** Local calendar day as YYYY-MM-DD, used to group collecting activity. */
function todayKey(ts = Date.now()): string {
  const d = new Date(ts);
  const m = `${d.getMonth() + 1}`.padStart(2, '0');
  const day = `${d.getDate()}`.padStart(2, '0');
  return `${d.getFullYear()}-${m}-${day}`;
}

/** An album's own activity log — the fields `withActivity` reads and rewrites. */
type ActivityFields = Pick<AlbumSnapshot, 'firstStickerAt' | 'activityDays' | 'completedOn'>;

/**
 * Stamp the first-sticker time, log today as an active collecting day, and—once
 * every unique sticker is owned—freeze the album completion date. Pass the
 * resulting counts so completion can be detected.
 *
 * `layout` is the album being credited — completion is only meaningful against that
 * album's own type/edition/CC sticker set. The active album passes the live `album`
 * singleton; a parked album in a combined settlement passes its own built layout, so a
 * shorter live layout can't stamp it complete (or a longer one hide that it is).
 */
function withActivity(
  s: ActivityFields,
  nextCounts: Counts | undefined,
  layout: Album,
): ActivityFields {
  const today = todayKey();
  let completedOn = s.completedOn;
  if (!completedOn && nextCounts && layout.stickers.length > 0 && ownedUnique(nextCounts, layout) === layout.stickers.length) {
    completedOn = today;
  }
  return {
    firstStickerAt: s.firstStickerAt ?? Date.now(),
    activityDays: s.activityDays.includes(today) ? s.activityDays : [...s.activityDays, today].sort(),
    completedOn,
  };
}

/** What `applyAlbumDeltas` changed: the store patch, plus the deltas it really wrote. */
interface AppliedDeltas {
  patch: { counts?: Counts; albums?: AlbumSnapshot[] };
  /** albumId -> stickerId -> the delta that actually landed. Never contains a zero. */
  applied: Record<string, Record<string, number>>;
}

/**
 * Apply per-album count deltas (albumId -> stickerId -> ±n) across the active album
 * (top-level `counts`) and any parked `albums`, clamped ≥ 0. The active album's counts
 * live only at the top level (its parked snapshot is refreshed on switch), so its delta
 * is applied there and skipped in the `albums` map.
 *
 * Reports back the deltas it ACTUALLY wrote, which can differ from the ones asked for:
 * the ≥0 clamp swallows part (or all) of a decrement, and an album this device does not
 * have is skipped entirely. Callers that persist a settlement must store the applied
 * deltas — storing the intended ones makes rollback reverse more than ever happened and
 * invent copies the user never had. Mirrors `settleSwapCounts` on the solo path, which
 * likewise records a delta only when the count really moved.
 */
function applyAlbumDeltas(
  s: CollectionState,
  deltas: Record<string, Record<string, number>>,
): AppliedDeltas {
  const patch: { counts?: Counts; albums?: AlbumSnapshot[] } = {};
  const applied: Record<string, Record<string, number>> = {};

  /** Clamp one album's deltas onto its counts, recording only the changes that stuck. */
  const write = (albumId: string, before: Counts, d: Record<string, number>): Counts => {
    const counts = { ...before };
    for (const [id, n] of Object.entries(d)) {
      const was = counts[id] ?? 0;
      const now = clampCount(was + n);
      counts[id] = now;
      if (now !== was) (applied[albumId] ??= {})[id] = now - was;
    }
    return counts;
  };

  const activeDelta = deltas[s.activeAlbumId];
  if (activeDelta) patch.counts = write(s.activeAlbumId, s.counts, activeDelta);

  const touchesParked = s.albums.some((a) => a.id !== s.activeAlbumId && deltas[a.id]);
  if (touchesParked) {
    patch.albums = s.albums.map((a) => {
      const d = a.id === s.activeAlbumId ? undefined : deltas[a.id];
      return d ? { ...a, counts: write(a.id, a.counts, d) } : a;
    });
  }
  return { patch, applied };
}

/**
 * The live counts + swaps of any album by id. The active album's parked snapshot is only
 * refreshed on switch, so its authoritative copy is the top level; every other album reads
 * from `albums`. Undefined when this device has no such album.
 */
function albumFields(s: CollectionState, albumId: string): { counts: Counts; swaps: Swap[] } | undefined {
  if (albumId === s.activeAlbumId) return { counts: s.counts, swaps: s.swaps };
  return s.albums.find((a) => a.id === albumId);
}

/** Map over a group's swaps by id, replacing the matched swap with `fn(swap)`. */
function patchGroupSwap(
  groups: AlbumGroup[], groupId: string, swapId: string, fn: (sw: Swap) => Swap,
): AlbumGroup[] {
  return groups.map((g) =>
    g.id !== groupId ? g : { ...g, swaps: g.swaps.map((sw) => (sw.id === swapId ? fn(sw) : sw)) },
  );
}

export const useCollection = create<CollectionState>()(
  persist(
    (set) => ({
      counts: {},
      swaps: [],
      edition: DEFAULT_EDITION,
      trackCC: DEFAULT_TRACK_CC,
      albumName: DEFAULT_ALBUM_NAME,
      albumTypeId: ACTIVE_ALBUM_TYPE_ID,
      locked: false,
      albumLayout: 'compact',
      activityDays: [],
      completedOn: null,
      unlockedAchievements: {},
      importSeq: 0,
      theme: 'dark',
      hasSeenAlbumOnboarding: false,
      groups: [],
      // Brand-new installs start album-less: the collection picker (App.tsx, shown when
      // albums is empty) creates the user's first album instead of seeding a default one.
      // Returning users are re-seeded from persisted data in onRehydrateStorage.
      activeAlbumId: '',
      albums: [],

      createAlbum: (opts) =>
        set((s) => {
          const id = newId();
          const albumTypeId = opts?.albumTypeId ?? ACTIVE_ALBUM_TYPE_ID;
          const type = typeById(albumTypeId);
          const edition = opts?.variantId ?? type.defaultVariant;
          const albumName = opts?.name?.trim() || nextAlbumName(s.albums.map((a) => a.albumName));
          const fresh: AlbumSnapshot = {
            id,
            albumName,
            albumTypeId,
            counts: {},
            swaps: [],
            edition,
            trackCC: DEFAULT_TRACK_CC,
            locked: false,
            albumLayout: 'compact',
            firstStickerAt: undefined,
            activityDays: [],
            completedOn: null,
            unlockedAchievements: {},
          };
          // Park the album we're leaving (none on a first-run empty store), then make
          // the new one active & live.
          const albums = s.albums
            .map((a) => (a.id === s.activeAlbumId ? snapshotActive(s) : a))
            .concat(fresh);
          applyAlbumLayout(fresh.albumTypeId, fresh.edition, fresh.trackCC);
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
          applyAlbumLayout(target.albumTypeId, target.edition, target.trackCC);
          return { albums, activeAlbumId: id, ...loadSnapshot(target) };
        }),

      deleteAlbum: (id) =>
        set((s) => {
          const remaining = s.albums.filter((a) => a.id !== id);
          // Drop the deleted album from any group; auto-disband a group left with <2 members.
          const groups = s.groups
            .map((g) => (g.memberIds.includes(id) ? { ...g, memberIds: g.memberIds.filter((m) => m !== id) } : g))
            .filter((g) => g.memberIds.length >= 2);
          // Deleting the last album returns the user to the collection picker (albums: []),
          // rather than silently rebuilding a default album they never chose. The App gate
          // renders the picker whenever albums is empty, so no view sees a missing album.
          if (remaining.length === 0) {
            return { albums: [], activeAlbumId: '', groups };
          }
          // Deleting the active album means promoting another one to live; deleting a
          // parked album just drops it and leaves the active fields untouched.
          if (id === s.activeAlbumId) {
            const target = remaining[0];
            applyAlbumLayout(target.albumTypeId, target.edition, target.trackCC);
            return { albums: remaining, activeAlbumId: target.id, groups, ...loadSnapshot(target) };
          }
          return { albums: remaining, groups };
        }),

      setTheme: (theme) => set({ theme }),

      toggleTheme: () => set((s) => ({ theme: s.theme === 'dark' ? 'light' : 'dark' })),

      setLastSeenWhatsNewId: (id) => set({ lastSeenWhatsNewId: id }),

      setAlbumOnboardingSeen: () => set({ hasSeenAlbumOnboarding: true }),

      setEdition: (edition) =>
        set((s) => {
          applyAlbumLayout(s.albumTypeId, edition, s.trackCC);
          return { edition };
        }),

      setTrackCC: (trackCC) =>
        set((s) => {
          applyAlbumLayout(s.albumTypeId, s.edition, trackCC);
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

      createGroup: (name, memberIds) => {
        const id = newId();
        const group: AlbumGroup = { id, name: name.trim() || 'Group', memberIds: [...memberIds], swaps: [] };
        set((s) => ({ groups: [...s.groups, group] }));
        return id;
      },

      renameGroup: (id, name) =>
        set((s) => ({
          groups: s.groups.map((g) => (g.id === id ? { ...g, name: name.trim() || g.name } : g)),
        })),

      setGroupMembers: (id, memberIds) =>
        set((s) => ({
          groups: s.groups.map((g) => (g.id === id ? { ...g, memberIds: [...memberIds] } : g)),
        })),

      disbandGroup: (id) => set((s) => ({ groups: s.groups.filter((g) => g.id !== id) })),

      applyInternalMove: (fromId, toId, stickerId, writableIds) =>
        set((s) => {
          // Both ends must still be writable: a share can be downgraded to read-only by a
          // background sync while the moves panel is on screen.
          if (fromId === toId || !writableIds.has(fromId) || !writableIds.has(toId)) return s;
          const source = albumFields(s, fromId);
          const target = albumFields(s, toId);
          if (!source || !target) return s;
          // Same `1 + committed` floor the give path uses: the source keeps one copy for
          // itself plus every copy its own open swaps have already promised away. Without
          // it, double-tapping Apply before the pool memo recomputes empties the source.
          const committed = computeReservations(source.swaps).committedGive.get(stickerId) ?? 0;
          if ((source.counts[stickerId] ?? 0) - 1 < 1 + committed) return s;
          return applyAlbumDeltas(s, { [fromId]: { [stickerId]: -1 }, [toId]: { [stickerId]: 1 } }).patch;
        }),

      createCombinedSwap: (groupId, input) => {
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
          receivingQty: input.receivingQty,
        };
        set((s) => ({
          groups: s.groups.map((g) => (g.id === groupId ? { ...g, swaps: [swap, ...g.swaps] } : g)),
        }));
        return id;
      },

      updateCombinedSwap: (groupId, swapId, patch) =>
        set((s) => ({
          groups: patchGroupSwap(s.groups, groupId, swapId, (sw) => ({
            ...sw,
            ...(patch.name !== undefined ? { name: patch.name } : {}),
            ...(patch.notes !== undefined ? { notes: patch.notes.trim() || undefined } : {}),
            ...(patch.giving ? { giving: patch.giving } : {}),
            ...(patch.receiving ? { receiving: patch.receiving } : {}),
            ...(patch.givingQty ? { givingQty: patch.givingQty } : {}),
            ...(patch.receivingQty ? { receivingQty: patch.receivingQty } : {}),
            ...(patch.theirNeeds ? { theirNeeds: patch.theirNeeds } : {}),
            ...(patch.theirSwaps ? { theirSwaps: patch.theirSwaps } : {}),
            ...(patch.theirNeedsQty ? { theirNeedsQty: patch.theirNeedsQty } : {}),
            ...(patch.deselectedGiving ? { deselectedGiving: patch.deselectedGiving } : {}),
            ...(patch.deselectedReceiving ? { deselectedReceiving: patch.deselectedReceiving } : {}),
          })),
        })),

      deleteCombinedSwap: (groupId, swapId) =>
        set((s) => ({
          groups: s.groups.map((g) =>
            g.id !== groupId ? g : { ...g, swaps: g.swaps.filter((sw) => sw.id !== swapId) },
          ),
        })),

      closeCombinedSwap: (groupId, swapId, settled) =>
        set((s) => {
          const group = s.groups.find((g) => g.id === groupId);
          const target = group?.swaps.find((sw) => sw.id === swapId);
          if (!group || !target || target.status !== 'open') return s;
          const { patch, applied } = applyAlbumDeltas(s, settled.settledByAlbum);
          const groups = patchGroupSwap(s.groups, groupId, swapId, (sw) => ({
            ...sw,
            status: 'closed',
            closedAt: Date.now(),
            giving: settled.givenIds,
            receiving: settled.receivedIds,
            givingQty: settled.giveQty,
            receivingQty: settled.receiveQty,
            // What was really written, so rollbackCombinedSwap reverses exactly that.
            settledByAlbum: applied,
            deselectedGiving: [],
            deselectedReceiving: [],
          }));
          // Receiving stickers counts as a collecting day, exactly as on the solo path, for
          // EVERY album that gained a copy — a combined swap routes copies into parked
          // albums too, and each keeps its own streak and completion date. Each is measured
          // against its own layout: the active album against the live `album` singleton, a
          // parked one against what its type/edition/CC builds, so a completion stamp can
          // never land on an album that isn't actually finished.
          const gained = (id: string) => Object.values(applied[id] ?? {}).some((n) => n > 0);
          const albums = patch.albums?.map((a) =>
            a.id !== s.activeAlbumId && gained(a.id)
              ? { ...a, ...withActivity(a, a.counts, buildAlbumFor(a.albumTypeId, a.edition, a.trackCC)) }
              : a,
          );
          return {
            ...patch,
            ...(albums ? { albums } : {}),
            groups,
            ...(gained(s.activeAlbumId) ? withActivity(s, patch.counts ?? s.counts, album) : {}),
          };
        }),

      rollbackCombinedSwap: (groupId, swapId) =>
        set((s) => {
          const group = s.groups.find((g) => g.id === groupId);
          const target = group?.swaps.find((sw) => sw.id === swapId);
          if (!group || !target || target.status !== 'closed' || !target.settledByAlbum) return s;
          const reversed: Record<string, Record<string, number>> = {};
          for (const [aid, d] of Object.entries(target.settledByAlbum)) {
            reversed[aid] = {};
            for (const [id, n] of Object.entries(d)) reversed[aid][id] = -n;
          }
          const { patch } = applyAlbumDeltas(s, reversed);
          const groups = patchGroupSwap(s.groups, groupId, swapId, (sw) => ({
            ...sw,
            status: 'open',
            closedAt: undefined,
            settledByAlbum: undefined,
          }));
          return { ...patch, groups };
        }),

      addOne: (id) =>
        set((s) => {
          const counts = { ...s.counts, [id]: clampCount((s.counts[id] ?? 0) + 1) };
          return { counts, ...withActivity(s, counts, album) };
        }),

      removeOne: (id) =>
        set((s) => ({ counts: { ...s.counts, [id]: clampCount((s.counts[id] ?? 0) - 1) } })),

      setCount: (id, n) =>
        set((s) => {
          const next = clampCount(n);
          const increased = next > (s.counts[id] ?? 0);
          const counts = { ...s.counts, [id]: next };
          return { counts, ...(increased ? withActivity(s, counts, album) : {}) };
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
          return { counts, importSeq: s.importSeq + 1, ...(added ? withActivity(s, counts, album) : {}) };
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
          return { counts, swaps, ...(settled.receivedIds.length ? withActivity(s, counts, album) : {}) };
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
          const groups = payload.groups ?? [];
          const activeInCloud = cloudAlbums.find((a) => a.id === s.activeAlbumId);
          if (activeInCloud) {
            applyAlbumLayout(activeInCloud.albumTypeId, activeInCloud.edition, activeInCloud.trackCC);
            return { albums, groups, ...loadSnapshot(activeInCloud) };
          }
          if (!albums.some((a) => a.id === s.activeAlbumId)) {
            const fallback = albums[0];
            if (!fallback) return { albums, groups };
            applyAlbumLayout(fallback.albumTypeId, fallback.edition, fallback.trackCC);
            return { albums, activeAlbumId: fallback.id, groups, ...loadSnapshot(fallback) };
          }
          return { albums, groups }; // active is a shared/private album — leave top-level alone
        }),

      applyMergedAlbum: (albumId, snapshot) =>
        set((s) => {
          const albums = s.albums.some((a) => a.id === albumId)
            ? s.albums.map((a) => (a.id === albumId ? snapshot : a))
            : [...s.albums, snapshot];
          if (s.activeAlbumId === albumId) {
            applyAlbumLayout(snapshot.albumTypeId, snapshot.edition, snapshot.trackCC);
            return { albums, ...loadSnapshot(snapshot) };
          }
          return { albums };
        }),
    }),
    {
      name: PERSIST_KEY,
      // Rebuild the album to match the persisted type + edition + CC tracking, and
      // reconcile the album list across the brand-new / upgrader / returning cases.
      onRehydrateStorage: () => (state) => {
        if (!state) return;
        // Tag every album with a collection type (pre-multi-type saves have none).
        if (Array.isArray(state.albums)) {
          for (const a of state.albums) if (!a.albumTypeId) a.albumTypeId = ACTIVE_ALBUM_TYPE_ID;
        }
        if (!state.albumTypeId) state.albumTypeId = ACTIVE_ALBUM_TYPE_ID;
        applyAlbumLayout(state.albumTypeId, state.edition ?? DEFAULT_EDITION, state.trackCC ?? DEFAULT_TRACK_CC);

        // Brand-new install: no persisted collection → stay album-less so the collection
        // picker (App.tsx) creates the first album instead of a default being seeded.
        if (!HAD_PERSISTED_COLLECTION) return;

        if (!PERSISTED_HAS_ALBUMS) {
          // Pre-multi-album upgrader: top-level collection data but no album list. Seed one
          // from the live fields so the existing collection becomes the user's first album.
          if (!state.activeAlbumId) state.activeAlbumId = DEFAULT_ALBUM_ID;
          state.albums = [snapshotActive(state)];
          return;
        }

        // Multi-album save. If the user deleted every album (albums: []), leave it empty
        // so the picker runs. Otherwise make sure the active album is present + name-synced.
        if (state.albums.length === 0) return;
        if (!state.albums.some((a) => a.id === state.activeAlbumId)) {
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
