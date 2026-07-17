# Per-album Sync — Stage 2 (syncMeta v2, multi-channel engine & migration) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Wire the Stage 1 merge engine into the app: replace the single-link whole-collection sync with a **multi-channel** engine (one **Cloud** channel + N **album** channels) that reconciles via `merge3`, migrate the sync-metadata store to a v2 multi-channel shape, and keep today's whole-collection sync working **with no user-visible change** (the per-album *UI* is Stage 3).

**Architecture:** `src/sync/serialize.ts` gains pure **slicers** (`sliceCloudPayload`, `sliceAlbumPayload`), a **normalizer** (`normalizeRemote`, incl. legacy back-compat), and `cloudManagedIds`. `src/store/syncStore.ts` becomes a multi-channel store (`collection` + `albumLinks` + `privateAlbumIds` + `localAlbumNames` + `bases`) with a persist **v1→v2 migration**. `src/store/collectionStore.ts` gains `applyMergedCollection` / `applyMergedAlbum` reconciliation actions (replacing the old `applyRemoteState`). `src/sync/engine.ts` becomes a per-channel push/pull/merge manager; its public linking API (`createLink`/`peekRemote`/`linkWithRemote`/`linkWithLocal`/`unlink`) is preserved but now targets the **Cloud** channel, so the existing (unchanged) `SyncSection`/`SyncDialog` UI keeps working. Album-channel plumbing exists and is unit-tested but stays dormant until Stage 3's UI creates album links.

**Tech Stack:** React 18, TypeScript 5.6 (`strict`), Zustand 4.5 (`persist`), Supabase JS (unchanged RPCs), Vitest 4 (node env).

## Global Constraints

- **No backend/SQL changes.** The `collections` table and the `sync_pull`/`sync_push` RPCs are untouched; all merge is client-side, guarded by the existing server `version` (optimistic concurrency).
- **Behaviour-preserving for the Cloud channel:** after this stage, a device that had whole-collection sync keeps syncing all its albums across its own devices exactly as before — now via the Cloud channel + `merge3`. No data loss on migration.
- **Consume Stage 1 as-is:** import `mergeAlbum`, `mergeCollection` from `../sync/merge` and `PAYLOAD_V`, payload types, guards from `../sync/payload`. Do not modify Stage 1 files except where a task explicitly says so.
- **Determinism:** every pushed payload is produced by `merge3`, whose output is already sorted/deterministic. Do not re-sort or re-key on top of it.
- **Globals are device-local:** `theme`, `activeAlbumId`, `importSeq` are NOT part of any synced payload (Stage 1 `CollectionPayload` already omits them). The old `pickSyncState` (which included them) is replaced by `sliceCloudPayload`.
- **Trust boundary:** `normalizeRemote` MUST validate an incoming album payload's `access` (`'collaborative'|'read-only'`) and numeric `v`, and reject otherwise — the Stage 1 guards intentionally did not (final-review carry-forward).
- **Read-only semantics:** an album channel where our `role==='joiner'` and `access==='read-only'` is **pull-only** (never pushed). An album channel where `role==='owner'` and `access==='read-only'` pushes local as authoritative (does not merge in others' writes).
- **Test command:** `npm test` (Vitest, all `src/**/*.test.ts`). Type-check/build: `npm run build`. Run `npm test` + `npm run build` before each commit.
- **Branch:** `claude/per-album-sync-sharing` (Stage 1 already merged into it).
- **Spec:** `docs/superpowers/specs/2026-07-17-per-album-sync-sharing-design.md` (sections "Data model", "The multi-channel sync engine", "Migration").
- **Merge-with-`main` note (not a task — record for the eventual rebase):** `main` has added an `albumLayout` field to `AlbumSnapshot` (parallel work) that this branch does not have. When this branch rebases onto/merges `main`, `mergeAlbum` (Stage 1, `src/sync/merge.ts`) must gain `albumLayout: scalar3(base?.albumLayout, local.albumLayout, remote.albumLayout)` or that field will be dropped on every merge. Flag it at merge time.

---

## File Structure

- **Modify** `src/sync/serialize.ts` — keep `hasCollectionData`; **remove** `pickSyncState` (superseded); add pure `reconstructActive`, `sliceCloudPayload`, `sliceAlbumPayload`, `cloudManagedIds`, `normalizeRemote`, `legacyToCollection`. Repurpose `sanitizeRemote` into `normalizeRemote`. One responsibility: convert between store state and wire payloads, and validate incoming rows.
- **Modify** `src/sync/serialize.test.ts` — replace `pickSyncState` tests; add slicer/normalizer/back-compat tests. Keep `hasCollectionData` tests.
- **Modify** `src/store/syncStore.ts` — multi-channel `SyncMetaState` (v2) + per-channel actions + persist `version: 2` + `migrate`.
- **Create** `src/store/syncStore.test.ts` — v1→v2 migration + action tests.
- **Modify** `src/store/collectionStore.ts` — replace `applyRemoteState` with `applyMergedCollection(payload, nonCloudIds)` and add `applyMergedAlbum(albumId, snapshot)`; export the pure `snapshotActive` helper (reused by the slicers) — or keep it private and have the slicer take explicit fields (Task 1 decides). No change to existing collection/swap/album CRUD.
- **Create** `src/store/collectionStore.test.ts` — reconciliation tests (`applyMergedCollection`, `applyMergedAlbum`).
- **Modify** `src/sync/engine.ts` — per-channel manager; Cloud-targeted public linking API preserved; album-channel push/pull added (dormant).
- **Modify** `src/sync/useSync.ts` — boot the engine off any active channel (collection or album links), not just the old single `codeHash`.

Everything a task can prove with a pure function is unit-tested; the engine's event loop is validated by extracting its decision logic into pure helpers (tested) plus a manual smoke check.

---

## Task 1: Pure slicers + `cloudManagedIds`

**Files:**
- Modify: `src/sync/serialize.ts`
- Test: `src/sync/serialize.test.ts`

**Interfaces:**
- Consumes: `type { Counts, Edition, Swap } from '../types'`; `type { AlbumSnapshot } from '../store/collectionStore'`; `PAYLOAD_V`, `type { AlbumPayload, CollectionPayload } from './payload'`.
- Produces (used by Tasks 2, 5, 6):
  - `type SliceState` — the read-only slice of collection state the slicers need (top-level active fields + `albums` + `activeAlbumId`). Reuse the existing `SyncPayload` field set minus the globals, or define a focused type.
  - `reconstructActive(s: SliceState): AlbumSnapshot` — build the active album's snapshot from the live top-level fields (id = `activeAlbumId`).
  - `allAlbums(s: SliceState): AlbumSnapshot[]` — the full album list with the active album's entry refreshed from top-level (never a stale parked copy).
  - `cloudManagedIds(albumIds: string[], albumLinkIds: string[], privateIds: string[]): Set<string>` — album ids that belong to the Cloud channel (all ids minus shared minus private).
  - `sliceCloudPayload(s: SliceState, managedIds: Set<string>): CollectionPayload` — `{ kind:'collection', v: PAYLOAD_V, albums: allAlbums(s).filter(a => managedIds.has(a.id)) }`.
  - `sliceAlbumPayload(s: SliceState, albumId: string, access: 'collaborative'|'read-only'): AlbumPayload | null` — the single album's snapshot wrapped as an album payload, or `null` if the album isn't present.

- [ ] **Step 1: Write the failing tests**

Replace the `pickSyncState` describe in `src/sync/serialize.test.ts` with slicer tests (keep `emptyState`/`samplePayload` helpers, adapting field names as needed):

```ts
import {
  reconstructActive, allAlbums, cloudManagedIds, sliceCloudPayload, sliceAlbumPayload,
} from './serialize';

function state() {
  return {
    counts: { 'MEX-1': 2 }, swaps: [], edition: 'latam' as const, trackCC: true,
    albumName: 'Active', locked: false, firstStickerAt: 10, activityDays: ['2026-07-01'],
    completedOn: null, unlockedAchievements: {},
    activeAlbumId: 'A',
    albums: [
      { id: 'A', albumName: 'stale-A', counts: {}, swaps: [], edition: 'latam' as const, trackCC: true, locked: false, activityDays: [], completedOn: null, unlockedAchievements: {} },
      { id: 'B', albumName: 'B', counts: { 'ARG-1': 1 }, swaps: [], edition: 'latam' as const, trackCC: true, locked: false, activityDays: [], completedOn: null, unlockedAchievements: {} },
    ],
  };
}

describe('reconstructActive / allAlbums', () => {
  it('reconstructs the active album from live top-level fields, not the stale parked copy', () => {
    const a = reconstructActive(state());
    expect(a.id).toBe('A');
    expect(a.albumName).toBe('Active');       // top-level, not 'stale-A'
    expect(a.counts).toEqual({ 'MEX-1': 2 });
  });
  it('allAlbums refreshes the active entry and keeps the rest', () => {
    const all = allAlbums(state());
    expect(all.find((x) => x.id === 'A')!.albumName).toBe('Active');
    expect(all.find((x) => x.id === 'B')!.counts).toEqual({ 'ARG-1': 1 });
  });
});

describe('cloudManagedIds', () => {
  it('excludes shared and private albums', () => {
    expect([...cloudManagedIds(['A', 'B', 'C'], ['B'], ['C'])].sort()).toEqual(['A']);
  });
});

describe('sliceCloudPayload / sliceAlbumPayload', () => {
  it('slices only managed albums into a collection payload', () => {
    const p = sliceCloudPayload(state(), new Set(['A']));
    expect(p.kind).toBe('collection');
    expect(p.albums.map((a) => a.id)).toEqual(['A']);
    expect(p.albums[0].albumName).toBe('Active');
  });
  it('slices a single album into an album payload with access', () => {
    const p = sliceAlbumPayload(state(), 'B', 'read-only');
    expect(p).not.toBeNull();
    expect(p!.kind).toBe('album');
    expect(p!.access).toBe('read-only');
    expect(p!.album.id).toBe('B');
  });
  it('returns null for a missing album', () => {
    expect(sliceAlbumPayload(state(), 'ZZZ', 'collaborative')).toBeNull();
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run src/sync/serialize.test.ts`
Expected: FAIL — the new functions don't exist yet.

- [ ] **Step 3: Implement**

In `src/sync/serialize.ts`, replace `pickSyncState` and add the slicers. Keep `hasCollectionData` and `isObject`.

```ts
import type { Counts, Edition, Swap } from '../types';
import type { AlbumSnapshot } from '../store/collectionStore';
import { PAYLOAD_V, type AlbumPayload, type CollectionPayload, isAlbumPayload, isCollectionPayload } from './payload';

/** The read-only slice of collection state the slicers need. */
export interface SliceState {
  counts: Counts; swaps: Swap[]; edition: Edition; trackCC: boolean; albumName: string;
  locked: boolean; firstStickerAt?: number; activityDays: string[]; completedOn: string | null;
  unlockedAchievements: Record<string, number>;
  albums: AlbumSnapshot[]; activeAlbumId: string;
}

/** Build the active album's snapshot from the live top-level fields. */
export function reconstructActive(s: SliceState): AlbumSnapshot {
  return {
    id: s.activeAlbumId, albumName: s.albumName, counts: s.counts, swaps: s.swaps,
    edition: s.edition, trackCC: s.trackCC, locked: s.locked, firstStickerAt: s.firstStickerAt,
    activityDays: s.activityDays, completedOn: s.completedOn, unlockedAchievements: s.unlockedAchievements,
  };
}

/** Full album list with the active album refreshed from top-level (never the stale parked copy). */
export function allAlbums(s: SliceState): AlbumSnapshot[] {
  const active = reconstructActive(s);
  return s.albums.some((a) => a.id === active.id)
    ? s.albums.map((a) => (a.id === active.id ? active : a))
    : [...s.albums, active];
}

/** Album ids that belong to the Cloud channel: all, minus shared, minus private. */
export function cloudManagedIds(albumIds: string[], albumLinkIds: string[], privateIds: string[]): Set<string> {
  const excluded = new Set<string>([...albumLinkIds, ...privateIds]);
  return new Set(albumIds.filter((id) => !excluded.has(id)));
}

export function sliceCloudPayload(s: SliceState, managedIds: Set<string>): CollectionPayload {
  return { kind: 'collection', v: PAYLOAD_V, albums: allAlbums(s).filter((a) => managedIds.has(a.id)) };
}

export function sliceAlbumPayload(
  s: SliceState, albumId: string, access: 'collaborative' | 'read-only',
): AlbumPayload | null {
  const album = allAlbums(s).find((a) => a.id === albumId);
  return album ? { kind: 'album', v: PAYLOAD_V, access, album } : null;
}
```

(Leave `hasCollectionData` and `isObject` in place; `normalizeRemote`/`legacyToCollection` come in Task 2. If `pickSyncState` is still imported anywhere, that consumer is `engine.ts`, rewritten in Task 5 — leave a temporary re-export `export const pickSyncState = ...` only if the build breaks before Task 5; otherwise delete it.)

- [ ] **Step 4: Run to verify it passes**

Run: `npx vitest run src/sync/serialize.test.ts`  → PASS.

- [ ] **Step 5: Commit**

```bash
git add src/sync/serialize.ts src/sync/serialize.test.ts
git commit -m "feat(sync): pure payload slicers + cloudManagedIds"
```
(End every commit body in this plan with: `Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>`)

---

## Task 2: `normalizeRemote` (+ legacy back-compat, access/v validation)

**Files:**
- Modify: `src/sync/serialize.ts`
- Test: `src/sync/serialize.test.ts`

**Interfaces:**
- Produces (used by Task 5):
  - `legacyToCollection(data): CollectionPayload | null` — coerce a header-less legacy row (old whole-collection blob) into a `CollectionPayload`, reconstructing the active album from its top-level fields.
  - `normalizeRemote(data: unknown): ChannelPayload | null` — validate a pulled row's `data`: a well-formed `AlbumPayload` (with `v: number` and `access` ∈ {`collaborative`,`read-only`}) or `CollectionPayload`, or a header-less legacy blob (→ `legacyToCollection`). Returns `null` for anything else.

- [ ] **Step 1: Write the failing tests**

```ts
import { normalizeRemote, legacyToCollection } from './serialize';

const snap = (id: string) => ({ id, albumName: id, counts: {}, swaps: [], edition: 'latam' as const, trackCC: true, locked: false, activityDays: [], completedOn: null, unlockedAchievements: {} });

describe('normalizeRemote', () => {
  it('accepts a valid album payload', () => {
    const p = { kind: 'album', v: 1, access: 'collaborative', album: snap('A') };
    expect(normalizeRemote(p)).toEqual(p);
  });
  it('rejects an album payload with a bad access value', () => {
    expect(normalizeRemote({ kind: 'album', v: 1, access: 'nope', album: snap('A') })).toBeNull();
  });
  it('rejects an album payload with a non-numeric v', () => {
    expect(normalizeRemote({ kind: 'album', v: 'x', access: 'read-only', album: snap('A') })).toBeNull();
  });
  it('accepts a valid collection payload', () => {
    const p = { kind: 'collection', v: 1, albums: [snap('A')] };
    expect(normalizeRemote(p)).toEqual(p);
  });
  it('coerces a header-less legacy blob to a collection payload (active reconstructed)', () => {
    const legacy = {
      counts: { 'MEX-1': 3 }, swaps: [], edition: 'latam', trackCC: true, albumName: 'Live',
      locked: false, activityDays: [], completedOn: null, unlockedAchievements: {},
      activeAlbumId: 'A', albums: [{ ...snap('A'), albumName: 'stale', counts: {} }, snap('B')],
    };
    const out = normalizeRemote(legacy)!;
    expect(out.kind).toBe('collection');
    const a = (out as any).albums.find((x: any) => x.id === 'A');
    expect(a.albumName).toBe('Live');          // reconstructed from top-level, not 'stale'
    expect(a.counts).toEqual({ 'MEX-1': 3 });
    expect((out as any).albums.map((x: any) => x.id).sort()).toEqual(['A', 'B']);
  });
  it('rejects junk', () => {
    expect(normalizeRemote(null)).toBeNull();
    expect(normalizeRemote('nope')).toBeNull();
    expect(normalizeRemote({})).toBeNull();
  });
});
```

- [ ] **Step 2: Run to verify it fails** → `npx vitest run src/sync/serialize.test.ts` FAIL.

- [ ] **Step 3: Implement**

Add to `src/sync/serialize.ts`:

```ts
import type { ChannelPayload } from './payload';

/** Coerce a header-less legacy whole-collection blob into a CollectionPayload. */
export function legacyToCollection(data: unknown): CollectionPayload | null {
  if (!isObject(data) || !Array.isArray(data.albums) || typeof data.activeAlbumId !== 'string') return null;
  if (!isObject(data.counts)) return null;
  const s = data as unknown as SliceState;
  return { kind: 'collection', v: PAYLOAD_V, albums: allAlbums(s) };
}

/** Validate/normalise a pulled row's `data` into a ChannelPayload, or null. */
export function normalizeRemote(data: unknown): ChannelPayload | null {
  if (isAlbumPayload(data)) {
    if (typeof data.v !== 'number') return null;
    if (data.access !== 'collaborative' && data.access !== 'read-only') return null;
    return data;
  }
  if (isCollectionPayload(data)) {
    if (typeof (data as CollectionPayload).v !== 'number') return null;
    return data;
  }
  return legacyToCollection(data); // header-less legacy row (or null)
}
```

Delete the old `sanitizeRemote` (its callers move to `normalizeRemote` in Task 5; if the build breaks before Task 5, keep a thin `export const sanitizeRemote = normalizeRemote;` alias and remove it in Task 5).

- [ ] **Step 4: Run to verify it passes** → PASS.
- [ ] **Step 5: Commit**

```bash
git add src/sync/serialize.ts src/sync/serialize.test.ts
git commit -m "feat(sync): normalizeRemote with legacy back-compat + access/v validation"
```

---

## Task 3: `useSyncMeta` v2 (multi-channel) + persist migration

**Files:**
- Modify: `src/store/syncStore.ts`
- Test: `src/store/syncStore.test.ts` (new)

**Interfaces:**
- Consumes: `type { ChannelPayload } from '../sync/payload'`.
- Produces (used by Tasks 5, 6 and Stage 3):
  - `interface LinkMeta { code: string; codeHash: string; writerId: string; lastVersion: number; lastSyncedAt: number | null; status: SyncStatus }`
  - `interface AlbumLink extends LinkMeta { albumId: string; role: 'owner'|'joiner'; access: 'collaborative'|'read-only' }`
  - `SyncMetaState` = `{ collection: LinkMeta | null; albumLinks: Record<string, AlbumLink>; privateAlbumIds: string[]; localAlbumNames: Record<string, string>; bases: Record<string, ChannelPayload> }` plus actions:
    - `setCollectionLink(p: { code: string; codeHash: string; writerId: string }): void` — creates the Cloud link (status `syncing`, version 0).
    - `clearCollectionLink(): void`
    - `upsertAlbumLink(link: AlbumLink): void`
    - `removeAlbumLink(albumId: string): void`
    - `setPrivate(albumId: string, isPrivate: boolean): void`
    - `setLocalAlbumName(albumId: string, name: string | null): void` (null clears)
    - `tombstoneAlbum(albumId: string): void` — add `albumId` to `bases.collection.deletedAlbumIds` (create an empty collection base if absent).
    - `setBase(key: string, payload: ChannelPayload): void`
    - `setChannelStatus(key: string, status: SyncStatus): void` — `key` is `'collection'` or an albumId.
    - `markChannelSynced(key: string, version: number): void` — set that channel's `lastVersion`, `lastSyncedAt=Date.now()`, `status='synced'`.
  - Persist: name `figuritas-sync-v1` (unchanged key), `version: 2`, `migrate` that folds a v1 single link into `collection`.

- [ ] **Step 1: Write the failing tests** (`src/store/syncStore.test.ts`)

```ts
import { describe, it, expect, beforeEach } from 'vitest';
import { useSyncMeta } from './syncStore';

// Reset the store between tests (zustand persists to a jsdom-less localStorage shim; in the node
// env localStorage is undefined, so persist is a no-op and the store starts at its initial state).
beforeEach(() => {
  useSyncMeta.setState({ collection: null, albumLinks: {}, privateAlbumIds: [], localAlbumNames: {}, bases: {} }, true);
});

describe('syncMeta v2 actions', () => {
  it('creates and clears the Cloud link', () => {
    useSyncMeta.getState().setCollectionLink({ code: 'C', codeHash: 'H', writerId: 'W' });
    expect(useSyncMeta.getState().collection).toMatchObject({ codeHash: 'H', lastVersion: 0, status: 'syncing' });
    useSyncMeta.getState().clearCollectionLink();
    expect(useSyncMeta.getState().collection).toBeNull();
  });
  it('upserts and removes an album link', () => {
    const link = { albumId: 'X', code: 'c', codeHash: 'h', writerId: 'w', role: 'owner' as const, access: 'collaborative' as const, lastVersion: 0, lastSyncedAt: null, status: 'syncing' as const };
    useSyncMeta.getState().upsertAlbumLink(link);
    expect(useSyncMeta.getState().albumLinks.X.role).toBe('owner');
    useSyncMeta.getState().removeAlbumLink('X');
    expect(useSyncMeta.getState().albumLinks.X).toBeUndefined();
  });
  it('records a tombstone into the collection base', () => {
    useSyncMeta.getState().tombstoneAlbum('gone');
    expect(useSyncMeta.getState().bases.collection).toMatchObject({ kind: 'collection', deletedAlbumIds: ['gone'] });
  });
  it('marks a channel synced', () => {
    useSyncMeta.getState().setCollectionLink({ code: 'C', codeHash: 'H', writerId: 'W' });
    useSyncMeta.getState().markChannelSynced('collection', 7);
    expect(useSyncMeta.getState().collection!.lastVersion).toBe(7);
    expect(useSyncMeta.getState().collection!.status).toBe('synced');
  });
});

describe('v1 -> v2 migration', () => {
  it('folds a legacy single link into the collection channel', async () => {
    const { migrateSyncMeta } = await import('./syncStore');
    const v1 = { code: 'OLD', codeHash: 'OLDHASH', writerId: 'wid', linkedAt: 1, lastVersion: 5, lastSyncedAt: 99 };
    const v2 = migrateSyncMeta(v1, 1);
    expect(v2.collection).toMatchObject({ code: 'OLD', codeHash: 'OLDHASH', writerId: 'wid', lastVersion: 5 });
    expect(v2.albumLinks).toEqual({});
    expect(v2.privateAlbumIds).toEqual([]);
    expect(v2.bases).toEqual({});
  });
  it('migrates an unlinked v1 to a null collection', () => {
    // dynamic import already loaded above
    const { migrateSyncMeta } = require('./syncStore');
    const v2 = migrateSyncMeta({ code: null, codeHash: null, writerId: null, lastVersion: 0, lastSyncedAt: null }, 1);
    expect(v2.collection).toBeNull();
  });
});
```

- [ ] **Step 2: Run to verify it fails** → `npx vitest run src/store/syncStore.test.ts` FAIL.

- [ ] **Step 3: Implement** — rewrite `src/store/syncStore.ts`:

```ts
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

      setCollectionLink: (p) => set({ collection: freshLink(p) }),
      clearCollectionLink: () => set({ collection: null }),
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
    }),
    {
      name: 'figuritas-sync-v1',
      version: 2,
      migrate: migrateSyncMeta,
      // Persist everything except transient statuses (recomputed at runtime).
      partialize: (s) => ({
        collection: s.collection ? { ...s.collection, status: 'unlinked' } : null,
        albumLinks: Object.fromEntries(Object.entries(s.albumLinks).map(([k, v]) => [k, { ...v, status: 'unlinked' as SyncStatus }])),
        privateAlbumIds: s.privateAlbumIds, localAlbumNames: s.localAlbumNames, bases: s.bases,
      }),
    },
  ),
);
```

Note: `markChannelSynced` uses `Date.now()` — that's fine here (a store action in the browser, not a pure merge function). The migration test calls `migrateSyncMeta` directly (pure, no `Date.now`).

- [ ] **Step 4: Run to verify it passes** → PASS. Then `npm run build` (type-check) clean.
- [ ] **Step 5: Commit**

```bash
git add src/store/syncStore.ts src/store/syncStore.test.ts
git commit -m "feat(sync): multi-channel syncMeta v2 + v1 migration"
```

---

## Task 4: `applyMergedCollection` + `applyMergedAlbum` reconciliation

**Files:**
- Modify: `src/store/collectionStore.ts`
- Test: `src/store/collectionStore.test.ts` (new)

**Interfaces:**
- Consumes: `type { CollectionPayload } from '../sync/payload'`; existing `AlbumSnapshot`, `loadSnapshot`, `snapshotActive`, `applyEdition`.
- Produces (used by Task 5):
  - `applyMergedCollection(payload: CollectionPayload, nonCloudIds: Set<string>): void` — the store's new Cloud-mode album set becomes `payload.albums`; albums whose id is in `nonCloudIds` (shared/private) are preserved untouched. If the active album is one of the Cloud albums, refresh the top-level mirror from the merged version (and `applyEdition`); if the active album vanished entirely, promote a fallback; otherwise leave the top-level alone.
  - `applyMergedAlbum(albumId: string, snapshot: AlbumSnapshot): void` — replace (or adopt) that album with `snapshot`; if it is the active album, refresh the top-level mirror + `applyEdition`.
  - **Remove** the old `applyRemoteState` (superseded) and its `SyncPayload` import.

- [ ] **Step 1: Write the failing tests** (`src/store/collectionStore.test.ts`)

```ts
import { describe, it, expect, beforeEach } from 'vitest';
import { useCollection } from './collectionStore';

const snap = (id: string, over = {}) => ({ id, albumName: id, counts: {}, swaps: [], edition: 'latam' as const, trackCC: true, locked: false, activityDays: [], completedOn: null, unlockedAchievements: {}, ...over });

beforeEach(() => {
  // Seed a known state: active album 'A' plus a shared album 'S'.
  useCollection.setState({
    counts: { 'MEX-1': 1 }, swaps: [], edition: 'latam', trackCC: true, albumName: 'A',
    locked: false, activityDays: [], completedOn: null, unlockedAchievements: {}, importSeq: 0, theme: 'dark',
    activeAlbumId: 'A',
    albums: [snap('A', { albumName: 'A', counts: { 'MEX-1': 1 } }), snap('S', { albumName: 'Shared' })],
  } as any, false);
});

describe('applyMergedCollection', () => {
  it('replaces cloud albums with the merged set and preserves shared/private albums', () => {
    const payload = { kind: 'collection' as const, v: 1, albums: [snap('A', { albumName: 'A', counts: { 'MEX-1': 2 } })] };
    useCollection.getState().applyMergedCollection(payload, new Set(['S'])); // 'S' is non-cloud
    const st = useCollection.getState();
    expect(st.albums.map((a) => a.id).sort()).toEqual(['A', 'S']);
    // active 'A' is a cloud album -> top-level refreshed from merged
    expect(st.counts).toEqual({ 'MEX-1': 2 });
    expect(st.albums.find((a) => a.id === 'S')!.albumName).toBe('Shared'); // untouched
  });
  it('adopts a brand-new cloud album from the payload', () => {
    const payload = { kind: 'collection' as const, v: 1, albums: [snap('A', { counts: { 'MEX-1': 1 } }), snap('NEW')] };
    useCollection.getState().applyMergedCollection(payload, new Set(['S']));
    expect(useCollection.getState().albums.map((a) => a.id).sort()).toEqual(['A', 'NEW', 'S']);
  });
});

describe('applyMergedAlbum', () => {
  it('refreshes the active album in place from the merged snapshot', () => {
    useCollection.getState().applyMergedAlbum('A', snap('A', { counts: { 'ARG-1': 5 } }) as any);
    expect(useCollection.getState().counts).toEqual({ 'ARG-1': 5 });
  });
  it('updates a non-active album without touching the top-level mirror', () => {
    useCollection.getState().applyMergedAlbum('S', snap('S', { albumName: 'Shared2' }) as any);
    const st = useCollection.getState();
    expect(st.albums.find((a) => a.id === 'S')!.albumName).toBe('Shared2');
    expect(st.albumName).toBe('A'); // active top-level unchanged
  });
});
```

- [ ] **Step 2: Run to verify it fails** → FAIL.

- [ ] **Step 3: Implement** — in `src/store/collectionStore.ts`, remove `applyRemoteState` (and the `import type { SyncPayload }`) and add:

```ts
      applyMergedCollection: (payload, nonCloudIds) =>
        set((s) => {
          const kept = s.albums.filter((a) => nonCloudIds.has(a.id)); // shared/private stay
          const albums = [...kept, ...payload.albums];
          const activeInCloud = payload.albums.find((a) => a.id === s.activeAlbumId);
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
```

Update the `CollectionState` interface: remove `applyRemoteState`, add the two new action signatures. (The `onRehydrateStorage` reconciliation and all other actions stay unchanged.)

- [ ] **Step 4: Run to verify it passes** → PASS. `npm run build` clean.
- [ ] **Step 5: Commit**

```bash
git add src/store/collectionStore.ts src/store/collectionStore.test.ts
git commit -m "feat(sync): applyMergedCollection/applyMergedAlbum reconciliation"
```

---

## Task 5: Multi-channel engine refactor

**Files:**
- Modify: `src/sync/engine.ts`
- Test: `src/sync/engine.test.ts` (new — pure decision helpers only)

**This is the integration task.** The event loop is not fully unit-testable; extract its pure decision logic into helpers and test those, then wire the loop.

**Interfaces:**
- Consumes: `useCollection`, `useSyncMeta` (+ its `LinkMeta`/`AlbumLink` types), `supabase`, the Stage-1 `mergeAlbum`/`mergeCollection`, Task-1/2 slicers + `normalizeRemote` + `cloudManagedIds`, Task-4 `applyMergedCollection`/`applyMergedAlbum`, `syncCode` helpers.
- Preserves (the existing UI depends on these — do not rename): `createLink(): Promise<string>`, `peekRemote(input): Promise<PeekResult>`, `linkWithRemote(peek)`, `linkWithLocal(peek)`, `unlink()`, `startEngine()`, `stopEngine()`. In this stage they operate on the **Cloud** channel.
- Adds (dormant until Stage 3): `createAlbumShare(albumId, access): Promise<string>`, `joinAlbumCode(peek, opts)`, `leaveAlbumShare(albumId, keepLocal)`, `stopSharing(albumId)` — you may stub these as exported no-op-returning-TODO signatures ONLY if a Stage-3 task will implement them; otherwise omit. **Do not** invent UI. (Recommended for this stage: implement `createAlbumShare` + the album push/pull paths since they share code with Cloud, and leave join/leave/stop to Stage 3.)

**Design (follow precisely):**

1. **Channel descriptors.** Build from `useSyncMeta`:
   - Cloud: present iff `collection !== null` → `{ key: 'collection', kind: 'collection', codeHash, writerId, lastVersion, writable: true }`.
   - Each album link → `{ key: albumId, kind: 'album', albumId, codeHash, writerId, lastVersion, role, access, writable: !(role==='joiner' && access==='read-only') }`.

2. **`managedIds()`** = `cloudManagedIds(collectionAlbumIds, Object.keys(albumLinks), privateAlbumIds)` where `collectionAlbumIds` = ids from `allAlbums(collectionState)`.

3. **`nonCloudIds()`** = `new Set([...Object.keys(albumLinks), ...privateAlbumIds])`.

4. **`localSlice(channel)`**: Cloud → `sliceCloudPayload(state, managedIds())`; album → `sliceAlbumPayload(state, albumId, access)` (skip channel if `null`).

5. **`baseFor(channel)`**: `useSyncMeta.getState().bases[key]` or an empty payload of the right kind (`{ kind:'collection', v, albums: [] }` / built from local for album).

6. **`mergeFor(channel, base, local, remote)`**:
   - Cloud → `mergeCollection(base, local, remote ?? {kind:'collection',v,albums:[]}, managedIds())`.
   - Album, writable, NOT read-only-owner → `remote ? { ...local, album: mergeAlbum((base as AlbumPayload)?.album, local.album, remote.album) } : local`.
   - Album, **read-only owner** → `local` (authoritative; ignore remote).

7. **`doPushChannel(key)`** (writable channels): set status `syncing`; `local = localSlice`; pull `remote = normalizeRemote(row.data)` + `remoteVersion`; `base = baseFor`; `merged = mergeFor(...)`. If `remote` is our own writer echo, skip. `sync_push(codeHash, merged, writerId, base_version = remoteVersion ?? channel.lastVersion)`. On success: `setBase(key, merged)`; if `merged` differs from `local`, apply it (`applyMergedCollection(merged, nonCloudIds())` / `applyMergedAlbum(albumId, merged.album)`) under the `applyingRemote` guard; `markChannelSynced(key, newVersion)`. On lost race (RPC returns a newer row): re-run once from the pull step (bounded retry, e.g. max 3), else set status `error`/`offline`.

8. **`doPullChannel(key)`** (all channels): pull; if `row.writer_id !== writerId && row.version > lastVersion`: `remote = normalizeRemote`; if valid → `base`, `merged = mergeFor` (for a read-only **joiner**, `merged = remote` directly — adopt owner truth, no local merge); apply under guard; `setBase`; `markChannelSynced(version)`. Read-only joiner never pushes.

9. **Lifecycle.** `startEngine()`: if not configured or no active channel, return. Subscribe `useCollection` → on change (unless `applyingRemote`) `schedulePush(key)` for every **writable** channel. Add `focus`/`visibilitychange`/`online` listeners → pull all channels. Poll every `POLL_MS` → pull all channels. Initial: pull all channels. `stopEngine()` tears down the subscription, all per-channel debounce timers, the poll, and listeners.

10. **Debounce.** `pushTimers: Map<string, timeout>`; `schedulePush(key)` resets that channel's timer (`PUSH_DEBOUNCE_MS`).

11. **`applyingRemote`** stays a single module boolean set around every store apply (Cloud or album), so the store subscription doesn't echo an applied merge back as a local edit.

12. **Cloud-targeted linking API** (rewrite the existing functions):
    - `createLink()` → generate code+hash+writerId, `setCollectionLink(...)`, seed the row via `doPushChannel('collection')`, `startEngine()`, return the code.
    - `peekRemote(input)` → unchanged shape, but on success set `remoteData` through `normalizeRemote` when deciding; keep `localHasData`.
    - `linkWithRemote(peek)` → `setCollectionLink(...)`; apply the peeked remote as the Cloud channel (merge into empty base = adopt/union), `startEngine()`.
    - `linkWithLocal(peek)` → `setCollectionLink(...)`; `markChannelSynced('collection', peek.remoteVersion)` so the base_version matches; `doPushChannel('collection')`; `startEngine()`.
    - `unlink()` → `stopEngine()`, `clearCollectionLink()` (album links, if any, are left intact — Stage 3 manages them; for this stage there are none).

**Test (`src/sync/engine.test.ts`) — pure decision helpers only.** Export `mergeFor`, `managedIds` computation via a pure exported `computeManagedIds(collectionState, syncMeta)`, and `isWritable(channel)` so they can be unit-tested without network. Example:

```ts
import { describe, it, expect } from 'vitest';
import { isWritable } from './engine';

describe('isWritable', () => {
  it('a read-only joiner channel is not writable', () => {
    expect(isWritable({ kind: 'album', role: 'joiner', access: 'read-only' } as any)).toBe(false);
  });
  it('a read-only owner channel IS writable (authoritative)', () => {
    expect(isWritable({ kind: 'album', role: 'owner', access: 'read-only' } as any)).toBe(true);
  });
  it('a collaborative channel and the cloud channel are writable', () => {
    expect(isWritable({ kind: 'album', role: 'joiner', access: 'collaborative' } as any)).toBe(true);
    expect(isWritable({ kind: 'collection' } as any)).toBe(true);
  });
});
```

- [ ] **Step 1: Write the failing test** (`isWritable`, `computeManagedIds`, `mergeFor` read-only-owner returns local). Run → FAIL.
- [ ] **Step 2: Implement the engine refactor** per the design above.
- [ ] **Step 3: Run the pure helper tests** → PASS. `npm test` (full suite) → PASS. `npm run build` → clean.
- [ ] **Step 4: Manual smoke** — with Supabase env configured, verify in the running app (`npm run dev`) that: creating a Cloud code on device A and joining on device B still syncs the whole collection both ways; edits on either side converge; going offline/online recovers. Record the result in the report. (If Supabase env is not available in the exec environment, state that and rely on the unit tests + a follow-up manual check.)
- [ ] **Step 5: Commit**

```bash
git add src/sync/engine.ts src/sync/engine.test.ts
git commit -m "feat(sync): multi-channel engine (cloud + album channels) via merge3"
```

---

## Task 6: Boot wiring (`useSync.ts`)

**Files:**
- Modify: `src/sync/useSync.ts`
- Test: covered by Task 5's smoke + type-check (this is a 3-line wiring change).

**Interfaces:**
- `useSyncBoot()` must start the engine when ANY channel is active (`collection !== null` OR `Object.keys(albumLinks).length > 0`), and restart when that set changes.

- [ ] **Step 1: Implement**

```ts
import { useEffect } from 'react';
import { isSyncConfigured } from '../lib/supabase';
import { useSyncMeta } from '../store/syncStore';
import { startEngine, stopEngine } from './engine';

/** Boot the sync engine for the app's lifetime. Restarts when the set of active channels changes. */
export function useSyncBoot() {
  const hasCollection = useSyncMeta((s) => s.collection !== null);
  const albumLinkKey = useSyncMeta((s) => Object.keys(s.albumLinks).sort().join(','));
  useEffect(() => {
    if (!isSyncConfigured || (!hasCollection && !albumLinkKey)) return;
    startEngine();
    return () => stopEngine();
  }, [hasCollection, albumLinkKey]);
}
```

- [ ] **Step 2: Verify** — `npm run build` clean; `npm test` full suite green. Confirm the app still boots and the Settings → Sync section behaves as before (no visible change).
- [ ] **Step 3: Commit**

```bash
git add src/sync/useSync.ts
git commit -m "feat(sync): boot engine off any active channel"
```

---

## Self-Review (Stage 2 vs. spec)

- **Data model** (spec "Data model") — `LinkMeta`/`AlbumLink`/`SyncMetaState` v2 with `bases`, `localAlbumNames`, `privateAlbumIds` → Task 3. ✅
- **Payloads + `kind` back-compat** (spec "Cloud row payloads") — `normalizeRemote` + `legacyToCollection` → Task 2. ✅
- **Globals device-local** — `sliceCloudPayload` omits `theme`/`activeAlbumId`/`importSeq`; old `pickSyncState` removed → Task 1. ✅
- **Multi-channel engine + read-only pull-only / read-only-owner authoritative** (spec "The multi-channel sync engine", "Read-only enforcement") — Task 5. ✅ (UI-side read-only gating is Stage 3.)
- **Carve-out ≠ deletion** — `managedIds`/`nonCloudIds` scoping + `tombstoneAlbum` → Tasks 1, 3, 5. ✅ (Wiring `deleteAlbum`→`tombstoneAlbum` is Stage 3.)
- **Migration** (spec "Migration") — persist `version: 2` + `migrateSyncMeta` → Task 3. ✅
- **No backend/SQL changes** — engine uses existing RPCs only. ✅
- **Placeholder scan** — every step has concrete code or an exact command; the engine task carries a precise numbered design where verbatim code across an event loop would be misleading. No "TBD".
- **Type consistency** — `LinkMeta`/`AlbumLink`, `ChannelPayload`/`CollectionPayload`/`AlbumPayload`, `managedIds`/`nonCloudIds`, `applyMergedCollection(payload, nonCloudIds)` signatures match across Tasks 1/3/4/5.

---

## Deferred to Stage 3 (do NOT build here)

- Per-album sharing UI (mode selector, access picker, two name fields), reframed Sync section, join-by-`kind` flow.
- Read-only UI gating (header 🔒 disabled, Swaps-tab actions disabled).
- Wiring `deleteAlbum` → `tombstoneAlbum` for Cloud albums; `leaveAlbumShare`/`stopSharing`/`sharingEndedAt` handling.
- `createAlbumShare`/`joinAlbumCode` UI entry points (the engine paths they call may be implemented here but stay dormant).

---

## Execution Handoff

Stage 2 is a self-contained subsystem refactor with a behaviour-preserving end state (Cloud sync unchanged, now merge-based). Execute subagent-driven (fresh implementer per task + task review + final whole-branch review), same as Stage 1. Use a mid-tier model for the engine task (Task 5 is integration/judgment, not transcription); the pure tasks (1-4) can use the cheapest tier.
