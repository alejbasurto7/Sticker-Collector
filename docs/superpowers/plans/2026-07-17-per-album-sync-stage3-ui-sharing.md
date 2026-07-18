# Per-album Sync — Stage 3 (sharing UI, read-only gating & revocation) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Surface the dormant multi-channel engine to users: a per-album **Local / Cloud / Shared** control (with a Read-only / Collaborative access level), a unified join-by-`kind` flow, per-device display names, client-side read-only gating (header lock + Swaps tab), and soft revocation (joiner leave, owner stop-sharing + notification).

**Architecture:** Stage 2 left the engine able to push/pull/merge any album channel once a link exists, but nothing creates album links. Stage 3 adds the **album-linking actions** to `src/sync/engine.ts` (`createAlbumShare`, `joinAlbumCode`, `leaveAlbumShare`, `stopSharing`, `setAlbumMode`, `setShareAccess`, `deleteAlbumEverywhere`, `sharingEndedAt` pull-handling) on top of the existing generic loop, a small **pure-helpers** module `src/sync/albumMode.ts` (mode derivation, effective-read-only, name resolution) with matching **hooks** in `src/sync/useAlbumMode.ts`, and the **UI** that drives it (a new `AlbumSharing` control inside `EditionDialog`, a `kind`-aware `SyncDialog` join, a `RevocationNotice` banner, and read-only gating across the header + Swaps tab). No new store shape except a transient `revokedNotice` field.

**Tech Stack:** React 18, TypeScript 5.6 (`strict`), Zustand 4.5 (`persist`), Supabase JS (unchanged RPCs), Vitest 4 (node env), `qrcode` (already a dep, used by `SyncDialog`).

## Global Constraints

- **No backend/SQL changes.** The `collections` table and the `sync_pull`/`sync_push` RPCs are untouched; all sharing is client-side, guarded by the existing server `version` (optimistic concurrency).
- **Consume Stage 1/2 as-is.** Import merge from `../sync/merge`, payload types/guards + `PAYLOAD_V` from `../sync/payload`, slicers/`normalizeRemote` from `../sync/serialize`, and store actions from `../store/syncStore` / `../store/collectionStore`. Do not modify Stage 1/2 files except where a task explicitly says so.
- **Mode is derived, never stored on the blob.** An album is **Shared** iff it has an entry in `albumLinks`, **Local** iff its id is in `privateAlbumIds`, else **Cloud**. The synced `AlbumSnapshot` never carries channel identity.
- **Read-only is client-side only** (honest, per spec "Security note"): a read-only **joiner** channel is pull-only; the UI disables edits. A read-only **owner** channel is authoritative (engine already ignores others' writes — Stage 2 `mergeFor`). No server enforcement.
- **Two name layers.** The synced `AlbumSnapshot.albumName` (merges; disabled for read-only joiners) vs. the local `localAlbumNames[id]` alias (never synced, always editable). Everywhere a name renders, resolve `localAlbumNames[id] ?? snapshot.albumName`.
- **Globals stay device-local** (`theme`, `activeAlbumId`, `importSeq`) — unchanged from Stage 2.
- **Determinism / echo-safety.** Any direct store write from the engine that must not echo-push wraps the write in the module `applyingRemote` guard (see `applyMerged`). Link-set changes call `restartEngine()` (stop+start, idempotent) so channels/timers rebuild — the same pattern the existing `unlink()` uses.
- **Test command:** `npm test` (Vitest, all `src/**/*.test.ts`). Type-check/build: `npm run build`. Run `npm test` + `npm run build` before each commit.
- **Branch:** `claude/per-album-sync-sharing` (Stages 1 & 2 already merged into it).
- **Spec:** `docs/superpowers/specs/2026-07-17-per-album-sync-sharing-design.md` (sections "UI / UX", "Read-only enforcement", "Revocation", "Terminology & the channel model").
- **Merge-with-`main` note (not a task):** `main` added an `albumLayout` field to `AlbumSnapshot`; on the eventual rebase, `mergeAlbum` must gain `albumLayout: scalar3(...)` and the new `AlbumSnapshot` literals in this plan (join adoption, none create raw snapshots — they spread `peek.album`) stay correct because they spread rather than construct. Flag at merge time.

---

## File Structure

- **Create** `src/sync/albumMode.ts` — pure, node-safe (type-only store imports): `AlbumMode`, `albumMode`, `forcedReadOnly`, `effectiveReadOnly`, `resolveAlbumName`, `deleteDisposition`, `pickLocalAlbumId`. One responsibility: derive user-facing facts from `syncMeta` + an album, with zero React/network.
- **Create** `src/sync/albumMode.test.ts` — unit tests for every helper above.
- **Create** `src/sync/useAlbumMode.ts` — thin React hooks over the two stores + `albumMode.ts`: `useAlbumMode`, `useForcedReadOnly`, `useEffectiveReadOnly`, `useResolvedAlbumName`.
- **Modify** `src/store/syncStore.ts` — add a transient `revokedNotice: string | null` + `setRevokedNotice` / `clearRevokedNotice` (not persisted).
- **Modify** `src/sync/engine.ts` — add album-linking actions + `restartEngine` + broaden `peekRemote` to report `kind` + `sharingEndedAt` pull-handling. The existing Cloud linking API and the generic push/pull loop are unchanged except where noted.
- **Modify** `src/sync/engine.test.ts` — add tests for the newly-extracted pure helpers that live in the engine (none required if all pure logic lives in `albumMode.ts`; keep the file's existing tests).
- **Create** `src/components/AlbumSharing.tsx` — the per-album Sharing control (mode selector, access picker, create-code + QR, owner manage/stop-sharing, joiner leave, status chip, two name fields). Rendered inside `EditionDialog`'s Album section.
- **Create** `src/components/RevocationNotice.tsx` — a dismissible banner shown when `revokedNotice` is set; mounted in `App`.
- **Modify** `src/components/EditionDialog.tsx` — render `<AlbumSharing />`; route album delete through `deleteAlbumEverywhere`; resolve the delete-confirm name.
- **Modify** `src/components/SyncDialog.tsx` — unified join: branch on `peek.kind` (`collection` → today's flow; `album` → `joinAlbumCode`), with a joiner display-name field.
- **Modify** `src/components/SyncSection.tsx` — reframe copy to "your own devices (Cloud)".
- **Modify** `src/App.tsx` — resolve the header album name; force-lock the header 🔒 for a read-only joiner; mount `<RevocationNotice />`.
- **Modify** `src/components/PageSection.tsx` — lock sticker cells on `useEffectiveReadOnly()` (not just `s.locked`).
- **Modify** `src/components/SwapsView.tsx` + `src/components/SwapDetail.tsx` — gate create/edit/close/delete/rollback behind `useEffectiveReadOnly()`, with an explanatory badge.

Pure logic is unit-tested (`albumMode.ts`). Engine actions and UI are validated by type-check + build + a scripted manual smoke, matching the repo's "no component test runner" reality (same as Stage 2 Tasks 5–6).

---

## Task 1: Pure album-mode / read-only / name helpers

**Files:**
- Create: `src/sync/albumMode.ts`
- Test: `src/sync/albumMode.test.ts`

**Interfaces:**
- Consumes: `type { AlbumLink, SyncMetaState } from '../store/syncStore'` (type-only — keeps this module out of the store runtime so it stays node-testable).
- Produces (used by Tasks 2–8):
  - `type AlbumMode = 'local' | 'cloud' | 'shared'`
  - `albumMode(albumId: string, meta: Pick<SyncMetaState, 'albumLinks' | 'privateAlbumIds'>): AlbumMode`
  - `forcedReadOnly(link: AlbumLink | undefined): boolean` — true only for a **read-only joiner** link.
  - `effectiveReadOnly(locked: boolean, link: AlbumLink | undefined): boolean` — `locked || forcedReadOnly(link)`.
  - `resolveAlbumName(albumId: string, snapshotName: string, localAlbumNames: Record<string, string>): string`
  - `deleteDisposition(albumId: string, meta: Pick<SyncMetaState, 'albumLinks' | 'privateAlbumIds'>): 'unlink' | 'tombstone' | 'local'` — how a delete must propagate: `unlink` a shared album, `tombstone` a Cloud album, purely `local` for a Local album.
  - `pickLocalAlbumId(remoteId: string, existingIds: Iterable<string>, gen: () => string): string` — `remoteId` unless it collides, else `gen()`.

- [ ] **Step 1: Write the failing tests** (`src/sync/albumMode.test.ts`)

```ts
import { describe, it, expect } from 'vitest';
import {
  albumMode, forcedReadOnly, effectiveReadOnly, resolveAlbumName, deleteDisposition, pickLocalAlbumId,
} from './albumMode';
import type { AlbumLink } from '../store/syncStore';

const link = (over: Partial<AlbumLink> = {}): AlbumLink => ({
  albumId: 'A', code: 'c', codeHash: 'h', writerId: 'w', role: 'owner', access: 'collaborative',
  lastVersion: 0, lastSyncedAt: null, status: 'synced', ...over,
});

describe('albumMode', () => {
  it('is shared when a link exists', () => {
    expect(albumMode('A', { albumLinks: { A: link() }, privateAlbumIds: [] })).toBe('shared');
  });
  it('is local when private', () => {
    expect(albumMode('A', { albumLinks: {}, privateAlbumIds: ['A'] })).toBe('local');
  });
  it('is cloud otherwise', () => {
    expect(albumMode('A', { albumLinks: {}, privateAlbumIds: [] })).toBe('cloud');
  });
  it('a link wins over a private flag (shared beats local)', () => {
    expect(albumMode('A', { albumLinks: { A: link() }, privateAlbumIds: ['A'] })).toBe('shared');
  });
});

describe('forcedReadOnly / effectiveReadOnly', () => {
  it('forced only for a read-only joiner', () => {
    expect(forcedReadOnly(link({ role: 'joiner', access: 'read-only' }))).toBe(true);
    expect(forcedReadOnly(link({ role: 'owner', access: 'read-only' }))).toBe(false);
    expect(forcedReadOnly(link({ role: 'joiner', access: 'collaborative' }))).toBe(false);
    expect(forcedReadOnly(undefined)).toBe(false);
  });
  it('effective = locked OR forced', () => {
    expect(effectiveReadOnly(true, undefined)).toBe(true);
    expect(effectiveReadOnly(false, link({ role: 'joiner', access: 'read-only' }))).toBe(true);
    expect(effectiveReadOnly(false, undefined)).toBe(false);
  });
});

describe('resolveAlbumName', () => {
  it('prefers the local alias, falls back to the snapshot name', () => {
    expect(resolveAlbumName('A', 'Shared', { A: 'My alias' })).toBe('My alias');
    expect(resolveAlbumName('A', 'Shared', {})).toBe('Shared');
  });
});

describe('deleteDisposition', () => {
  it('unlink a shared album, tombstone a cloud album, local for a private album', () => {
    expect(deleteDisposition('A', { albumLinks: { A: link() }, privateAlbumIds: [] })).toBe('unlink');
    expect(deleteDisposition('A', { albumLinks: {}, privateAlbumIds: [] })).toBe('tombstone');
    expect(deleteDisposition('A', { albumLinks: {}, privateAlbumIds: ['A'] })).toBe('local');
  });
});

describe('pickLocalAlbumId', () => {
  it('keeps the remote id when free, generates on collision', () => {
    expect(pickLocalAlbumId('A', ['B', 'C'], () => 'GEN')).toBe('A');
    expect(pickLocalAlbumId('A', ['A', 'B'], () => 'GEN')).toBe('GEN');
  });
});
```

- [ ] **Step 2: Run to verify it fails** → `npx vitest run src/sync/albumMode.test.ts` FAIL (module missing).

- [ ] **Step 3: Implement** (`src/sync/albumMode.ts`)

```ts
// Pure, node-safe derivations over sync metadata. Type-only store imports keep this
// module free of the store runtime, so it (and its tests) run in the plain-node Vitest env.
import type { AlbumLink, SyncMetaState } from '../store/syncStore';

export type AlbumMode = 'local' | 'cloud' | 'shared';

type MetaSlice = Pick<SyncMetaState, 'albumLinks' | 'privateAlbumIds'>;

/** An album is Shared iff linked, Local iff private, else Cloud. A link wins over a private flag. */
export function albumMode(albumId: string, meta: MetaSlice): AlbumMode {
  if (meta.albumLinks[albumId]) return 'shared';
  if (meta.privateAlbumIds.includes(albumId)) return 'local';
  return 'cloud';
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
```

- [ ] **Step 4: Run to verify it passes** → `npx vitest run src/sync/albumMode.test.ts` PASS. Then `npm run build` clean.

- [ ] **Step 5: Commit**

```bash
git add src/sync/albumMode.ts src/sync/albumMode.test.ts
git commit -m "feat(sync): pure album-mode / read-only / name helpers

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 2: Engine — owner share, mode switch, access flip, delete-wiring

**Files:**
- Modify: `src/sync/engine.ts`

**Interfaces:**
- Consumes: existing `doPushChannel`, `schedulePush`, `startEngine`, `stopEngine`, `applyingRemote`, `newWriterId`, `generateSyncCode`, `hashSyncCode`, `PAYLOAD_V`; Task-1 `deleteDisposition`.
- Produces (used by Tasks 5–8):
  - `restartEngine(): void` — `stopEngine(); startEngine();` (idempotent; rebuilds channels/timers after a link-set change).
  - `createAlbumShare(albumId: string, access: 'collaborative' | 'read-only'): Promise<string>` — make THIS device the owner of a new shared-album channel; returns the code.
  - `setAlbumMode(albumId: string, mode: 'cloud' | 'local'): void` — carve an unlinked album in/out of the Cloud channel (no share involved).
  - `setShareAccess(albumId: string, access: 'collaborative' | 'read-only'): void` — owner flips the access level; pushes so joiners read it.
  - `deleteAlbumEverywhere(albumId: string): Promise<void>` — delete locally AND propagate per `deleteDisposition` (unlink a share / tombstone a Cloud album / nothing for Local).

- [ ] **Step 1: Implement** — add to `src/sync/engine.ts`.

First add the Task-1 import to the existing serialize/merge import group at the top:

```ts
import { deleteDisposition } from './albumMode';
```

Then add, in the "linking actions" region (after `unlink()`):

```ts
/** Rebuild channels/timers after a link-set change. Idempotent (mirrors unlink()'s pattern). */
export function restartEngine(): void {
  stopEngine();
  startEngine();
}

/** A locally-unique album id for an adopted/forked album (opaque; ids elsewhere are opaque too). */
function newAlbumId(): string {
  return crypto.randomUUID();
}

/**
 * Make THIS device the OWNER of a new shared-album channel for `albumId`. Ensures the album is
 * not marked Local, creates the owner link, seeds the album row, and (re)starts the engine.
 * The album is automatically carved out of the Cloud channel because `computeManagedIds`
 * excludes `albumLinks` keys — no tombstone (other Cloud devices keep their copy: carve-out ≠ delete).
 */
export async function createAlbumShare(
  albumId: string, access: 'collaborative' | 'read-only',
): Promise<string> {
  const code = generateSyncCode();
  const codeHash = await hashSyncCode(code);
  useSyncMeta.getState().setPrivate(albumId, false);
  useSyncMeta.getState().upsertAlbumLink({
    albumId, code, codeHash, writerId: newWriterId(),
    role: 'owner', access, lastVersion: 0, lastSyncedAt: null, status: 'syncing',
  });
  await doPushChannel(albumId); // seed the album row (base version 0 -> insert)
  restartEngine();
  return code;
}

/** Carve an UNLINKED album in/out of the Cloud channel. `local` = private (this device only). */
export function setAlbumMode(albumId: string, mode: 'cloud' | 'local'): void {
  useSyncMeta.getState().setPrivate(albumId, mode === 'local');
  schedulePush('collection'); // reflect the carve-in/out on the Cloud row (no-op if unlinked)
}

/** Owner flips a share's access level; push so joiners pick up the new level on their next pull. */
export function setShareAccess(albumId: string, access: 'collaborative' | 'read-only'): void {
  const link = useSyncMeta.getState().albumLinks[albumId];
  if (!link || link.role !== 'owner') return;
  useSyncMeta.getState().upsertAlbumLink({ ...link, access });
  schedulePush(albumId);
}

/**
 * Delete `albumId` locally and propagate the deletion correctly: a shared album unlinks its
 * channel here (the cloud row and other participants are untouched — no accounts to revoke); a
 * Cloud album gets an explicit tombstone so every Cloud device removes it (absence alone never
 * deletes); a Local album is purely local. Any recorded tombstone is flushed on the Cloud push.
 */
export async function deleteAlbumEverywhere(albumId: string): Promise<void> {
  const meta = useSyncMeta.getState();
  const disposition = deleteDisposition(albumId, meta);
  if (disposition === 'unlink') meta.removeAlbumLink(albumId);
  else if (disposition === 'tombstone') meta.tombstoneAlbum(albumId);
  else meta.setPrivate(albumId, false); // local: just clear the private flag
  useCollection.getState().deleteAlbum(albumId);
  restartEngine();
  schedulePush('collection'); // flush the tombstone (no-op if the Cloud channel isn't linked)
}
```

Note: `useCollection` and `useSyncMeta` are already imported at the top of `engine.ts`; `generateSyncCode`/`hashSyncCode` are already imported; `PAYLOAD_V` is already imported. Only the `deleteDisposition` import is new.

- [ ] **Step 2: Type-check + full suite** → `npm run build` clean; `npm test` green (no behavior change to existing paths; new exports are additive).

- [ ] **Step 3: Commit**

```bash
git add src/sync/engine.ts
git commit -m "feat(sync): engine album-share create, mode switch, access flip, delete-wiring

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 3: Engine — unified peek (`kind`) + `joinAlbumCode`

**Files:**
- Modify: `src/sync/engine.ts`

**Interfaces:**
- Consumes: existing `peekRemote` internals (`normalizeRemote`, `firstRow`, `isValidSyncCode`, `formatSyncCode`, `hashSyncCode`, `localHasData`), Task-1 `pickLocalAlbumId`, `applyMerged`/`applyingRemote`, `restartEngine`, `newAlbumId`, `PAYLOAD_V`.
- Produces (used by Task 7):
  - Broadened `PeekOk` — now carries `kind: 'collection'` (the shape is otherwise unchanged, so `linkWithRemote`/`linkWithLocal` still accept it).
  - `interface AlbumPeekOk { ok: true; kind: 'album'; code: string; codeHash: string; remoteVersion: number; access: 'collaborative' | 'read-only'; album: AlbumSnapshot; sharingEndedAt?: number }`
  - `type PeekResult = PeekOk | AlbumPeekOk | { ok: false; reason: 'invalid' | 'not-found' | 'network' | 'unconfigured' }`
  - `peekRemote(input: string): Promise<PeekResult>` — now returns an `album` peek for a `kind:'album'` row instead of reporting it not-found.
  - `joinAlbumCode(peek: AlbumPeekOk, opts?: { displayName?: string }): Promise<void>` — adopt the shared album as a new local album (joiner role), set an optional local display name, and start syncing that channel.

- [ ] **Step 1: Implement** — edits to `src/sync/engine.ts`.

Add `pickLocalAlbumId` to the `./albumMode` import:

```ts
import { deleteDisposition, pickLocalAlbumId } from './albumMode';
```

Add `AlbumSnapshot` as a type import (used by `AlbumPeekOk`). It is currently only referenced via payload types; add it explicitly:

```ts
import type { AlbumSnapshot } from '../store/collectionStore';
```

Add `kind: 'collection'` to the existing `PeekOk` interface:

```ts
export interface PeekOk {
  ok: true;
  kind: 'collection';   // <-- add this line
  code: string;
  codeHash: string;
  remoteVersion: number;
  remoteData: unknown;
  localHasData: boolean;
}
```

Add the album-peek result type + broaden `PeekResult` (replace the existing `PeekResult` type alias):

```ts
/** A peeked shared-album row (Stage 3 join flow). */
export interface AlbumPeekOk {
  ok: true;
  kind: 'album';
  code: string;
  codeHash: string;
  remoteVersion: number;
  access: 'collaborative' | 'read-only';
  album: AlbumSnapshot;
  sharingEndedAt?: number;
}

export type PeekResult =
  | PeekOk
  | AlbumPeekOk
  | { ok: false; reason: 'invalid' | 'not-found' | 'network' | 'unconfigured' };
```

Rewrite the body of `peekRemote` so a valid `album` row becomes an `AlbumPeekOk` (and set `kind: 'collection'` on the collection branch):

```ts
export async function peekRemote(input: string): Promise<PeekResult> {
  if (!supabase) return { ok: false, reason: 'unconfigured' };
  if (!isValidSyncCode(input)) return { ok: false, reason: 'invalid' };
  const code = formatSyncCode(input);
  const codeHash = await hashSyncCode(code);
  try {
    const { data, error } = await supabase.rpc('sync_pull', { p_code_hash: codeHash });
    if (error) return { ok: false, reason: 'network' };
    const row = firstRow(data);
    if (!row) return { ok: false, reason: 'not-found' };
    const remote = normalizeRemote(row.data);
    if (!remote) return { ok: false, reason: 'not-found' };
    if (remote.kind === 'album') {
      return {
        ok: true, kind: 'album', code, codeHash, remoteVersion: row.version,
        access: remote.access, album: remote.album, sharingEndedAt: remote.sharingEndedAt,
      };
    }
    return {
      ok: true, kind: 'collection', code, codeHash, remoteVersion: row.version,
      remoteData: remote, localHasData: localHasData(),
    };
  } catch {
    return { ok: false, reason: 'network' };
  }
}
```

Update `linkWithRemote` to set the new `kind` field's expectation — it reads `peek.remoteData`, unchanged, so no edit is needed there beyond the type now requiring `kind: 'collection'` (already the case for any collection peek). Then add `joinAlbumCode` (after `linkWithLocal`):

```ts
/**
 * Join a shared-album code: adopt the owner's album as a NEW local album (joiner role) under a
 * locally-unique id, seed the merge base, optionally set a local display alias, make it active,
 * and start syncing. Collaborative joins merge from here on; a read-only join is pull-only (the
 * engine's read-only-joiner path adopts the owner's truth and never pushes).
 */
export async function joinAlbumCode(peek: AlbumPeekOk, opts?: { displayName?: string }): Promise<void> {
  const existingIds = useCollection.getState().albums.map((a) => a.id);
  const localId = pickLocalAlbumId(peek.album.id, existingIds, newAlbumId);
  const album: AlbumSnapshot = { ...peek.album, id: localId };

  // Adopt the owner's copy without echoing it straight back as a local edit.
  applyingRemote = true;
  try {
    useCollection.getState().applyMergedAlbum(localId, album);
  } finally {
    applyingRemote = false;
  }

  useSyncMeta.getState().upsertAlbumLink({
    albumId: localId, code: peek.code, codeHash: peek.codeHash, writerId: newWriterId(),
    role: 'joiner', access: peek.access, lastVersion: peek.remoteVersion, lastSyncedAt: null, status: 'syncing',
  });
  // Seed the base with the adopted snapshot so subsequent 3-way merges have a common ancestor.
  useSyncMeta.getState().setBase(localId, { kind: 'album', v: PAYLOAD_V, access: peek.access, album });
  if (opts?.displayName) useSyncMeta.getState().setLocalAlbumName(localId, opts.displayName);

  useCollection.getState().switchAlbum(localId); // show the joined album
  restartEngine();
}
```

Note: `applyingRemote` is a module-level `let` already declared in `engine.ts`; assigning it here is in-module and legal. `applyMergedAlbum` keys the album by `localId` and stores the `{ ...peek.album, id: localId }` snapshot (id-normalized), so the slot key and the snapshot id agree — and `mergeAlbum` returns `id: local.id`, so the local id stays stable through every later merge regardless of the owner's id.

- [ ] **Step 2: Type-check + full suite** → `npm run build` clean; `npm test` green. (No existing test asserts `peekRemote` rejects album rows; if one does, update it to expect the new `AlbumPeekOk` shape.)

- [ ] **Step 3: Commit**

```bash
git add src/sync/engine.ts
git commit -m "feat(sync): unified peek (kind) + joinAlbumCode join flow

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 4: Engine + store — revocation (leave, stop-sharing, `sharingEndedAt` + notice)

**Files:**
- Modify: `src/store/syncStore.ts`
- Modify: `src/sync/engine.ts`
- Create: `src/components/RevocationNotice.tsx`
- Modify: `src/App.tsx` (mount the notice only)

**Interfaces:**
- Produces:
  - Store: `revokedNotice: string | null`, `setRevokedNotice(msg: string): void`, `clearRevokedNotice(): void` (transient — NOT persisted).
  - Engine: `leaveAlbumShare(albumId: string, keepLocal: boolean): void`, `stopSharing(albumId: string, revertTo: 'cloud' | 'local'): Promise<void>`, and `sharingEndedAt` detection wired into the pull path.
  - `RevocationNotice` React component (default export), mounted in `App`.

- [ ] **Step 1: Store — add the transient notice** (`src/store/syncStore.ts`)

Add to the `SyncMetaState` interface (after `bases`):

```ts
  /** Transient: set when an owner revoked a share we joined; shown once, then cleared. Not persisted. */
  revokedNotice: string | null;
```

Add to the interface's action list:

```ts
  setRevokedNotice: (msg: string) => void;
  clearRevokedNotice: () => void;
```

Add to the store initializer (alongside `bases: {}`):

```ts
      revokedNotice: null,
```

Add the two actions (next to `setBase`):

```ts
      setRevokedNotice: (msg) => set({ revokedNotice: msg }),
      clearRevokedNotice: () => set({ revokedNotice: null }),
```

`partialize` already lists fields explicitly (it does not spread the whole state), so `revokedNotice` is naturally excluded from persistence — no change needed there.

- [ ] **Step 2: Engine — leave / stop-sharing / revocation pull-handling** (`src/sync/engine.ts`)

Add `resolveAlbumName` to the `./albumMode` import:

```ts
import { deleteDisposition, pickLocalAlbumId, resolveAlbumName } from './albumMode';
```

Add the two actions (after `joinAlbumCode`):

```ts
/**
 * A JOINER leaves a shared album. Purely local, always works (no server coordination): drop the
 * link and either keep a private Local fork of the album (`keepLocal`) or delete it entirely.
 */
export function leaveAlbumShare(albumId: string, keepLocal: boolean): void {
  useSyncMeta.getState().removeAlbumLink(albumId);
  if (keepLocal) useSyncMeta.getState().setPrivate(albumId, true);
  else useCollection.getState().deleteAlbum(albumId);
  restartEngine();
}

/**
 * An OWNER stops sharing. Best-effort push a final payload carrying `sharingEndedAt` (so a joiner
 * who pulls learns the share ended), then unlink locally and revert the album to Cloud or Local.
 * Delivery is eventual: a joiner who never reopens simply receives no further updates (spec:
 * "Revocation ... cannot un-download a copy already on the joiner's device").
 */
export async function stopSharing(albumId: string, revertTo: 'cloud' | 'local'): Promise<void> {
  const link = useSyncMeta.getState().albumLinks[albumId];
  if (link && supabase) {
    const slice = sliceAlbumPayload(useCollection.getState(), albumId, link.access);
    if (slice) {
      try {
        const { data: pullData } = await supabase.rpc('sync_pull', { p_code_hash: link.codeHash });
        const baseVersion = firstRow(pullData)?.version ?? link.lastVersion;
        await supabase.rpc('sync_push', {
          p_code_hash: link.codeHash,
          p_data: { ...slice, sharingEndedAt: Date.now() },
          p_writer: link.writerId,
          p_base_version: baseVersion,
        });
      } catch {
        /* best-effort: the local unlink below always proceeds */
      }
    }
  }
  useSyncMeta.getState().removeAlbumLink(albumId);
  useSyncMeta.getState().setPrivate(albumId, revertTo === 'local');
  restartEngine();
}
```

Note: `sliceAlbumPayload` and `firstRow` are already imported/defined in `engine.ts`.

Now wire `sharingEndedAt` detection into the pull path. In `applyPulledRow` (near the top, right after the `if (!row) { ... }` guard), add the joiner-revocation short-circuit:

```ts
function applyPulledRow(channel: Channel, row: Row | null): void {
  if (!row) {
    useSyncMeta.getState().setChannelStatus(channel.key, 'synced');
    return;
  }
  // Owner-side changes a joiner must react to on pull: a stopped share (`sharingEndedAt`) ends the
  // link and converts the album to a private Local fork; a flipped access level is adopted into the
  // local link so read-only gating reflects the owner's choice (the payload carries it — Task 2's
  // owner-side `setShareAccess` pushes it — but nothing consumed it until here).
  if (channel.kind === 'album' && channel.role === 'joiner') {
    const data = normalizeRemote(row.data);
    if (data && data.kind === 'album') {
      if (typeof data.sharingEndedAt === 'number') {
        handleRevoked(channel, data);
        return;
      }
      if (data.access !== channel.access) {
        const link = useSyncMeta.getState().albumLinks[channel.albumId];
        if (link) useSyncMeta.getState().upsertAlbumLink({ ...link, access: data.access });
        channel.access = data.access;        // keep THIS pull's gating consistent with the new level
        channel.writable = isWritable(channel);
      }
    }
  }
  // ...existing body unchanged (the `row.writer_id !== channel.writerId && ...` block, etc.)...
}
```

Note: inside the `channel.kind === 'album'` narrow, `channel` is an `AlbumChannel` whose `access`/`writable` are mutable fields, so reassigning them for the remainder of this pull is legal and keeps the read-only/writable decision below consistent with the freshly-adopted level. `isWritable` is already defined in this file.

Add the `handleRevoked` helper just above `applyPulledRow`:

```ts
/** Joiner-side handling of an owner's stop-sharing: adopt final copy, notify, convert to Local. */
function handleRevoked(channel: AlbumChannel, data: AlbumPayload): void {
  applyMerged(channel, data); // adopt the owner's final snapshot
  const name = resolveAlbumName(
    channel.albumId, data.album.albumName, useSyncMeta.getState().localAlbumNames,
  );
  useSyncMeta.getState().setRevokedNotice(`The owner stopped sharing “${name}”. It's now saved only on this device.`);
  useSyncMeta.getState().removeAlbumLink(channel.albumId);
  useSyncMeta.getState().setPrivate(channel.albumId, true);
  restartEngine();
}
```

`AlbumChannel` and `AlbumPayload` are already in scope (`AlbumChannel` is defined in this file; `AlbumPayload` is imported from `./payload`).

- [ ] **Step 3: Create `RevocationNotice`** (`src/components/RevocationNotice.tsx`)

```tsx
import { useSyncMeta } from '../store/syncStore';

/** A one-shot dismissible banner shown when an owner revoked a shared album we had joined. */
export default function RevocationNotice() {
  const notice = useSyncMeta((s) => s.revokedNotice);
  const clear = useSyncMeta((s) => s.clearRevokedNotice);
  if (!notice) return null;
  return (
    <div className="revocation-notice" role="status">
      <span>{notice}</span>
      <button type="button" className="btn" onClick={clear}>Got it</button>
    </div>
  );
}
```

- [ ] **Step 4: Mount it in `App`** — in `src/App.tsx`, add the import and render it next to the other overlays:

```tsx
import RevocationNotice from './components/RevocationNotice';
```

and, just before `<AchievementToaster />`:

```tsx
      <RevocationNotice />
```

- [ ] **Step 5: Minimal styling** — append to `src/styles.css` (or the app's main stylesheet — confirm the path with `grep -rl "revocation\|achievement-toast\|app-header" src *.css` if unsure; the toaster's stylesheet is the right neighbor):

```css
.revocation-notice {
  position: fixed;
  left: 50%;
  bottom: 88px;
  transform: translateX(-50%);
  max-width: min(92vw, 420px);
  display: flex;
  gap: 12px;
  align-items: center;
  justify-content: space-between;
  padding: 12px 14px;
  border-radius: 12px;
  background: var(--card, #1e1e26);
  border: 1.5px solid var(--border, #33333c);
  box-shadow: 0 8px 30px rgba(0, 0, 0, 0.35);
  z-index: 50;
  font-size: 0.9rem;
}
```

- [ ] **Step 6: Verify** → `npm run build` clean; `npm test` green. Confirm the app boots and (with no share) nothing renders.

- [ ] **Step 7: Commit**

```bash
git add src/store/syncStore.ts src/sync/engine.ts src/components/RevocationNotice.tsx src/App.tsx src/styles.css
git commit -m "feat(sync): soft revocation — leave, stop-sharing, sharingEndedAt notice

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 5: Hooks + display-name resolution wired app-wide

**Files:**
- Create: `src/sync/useAlbumMode.ts`
- Modify: `src/App.tsx`
- Modify: `src/components/EditionDialog.tsx`

**Interfaces:**
- Consumes: Task-1 helpers, `useCollection`, `useSyncMeta`.
- Produces (used by Tasks 6–8):
  - `useAlbumMode(albumId: string): AlbumMode`
  - `useForcedReadOnly(): boolean` — for the ACTIVE album.
  - `useEffectiveReadOnly(): boolean` — for the ACTIVE album (`locked || forced`).
  - `useResolvedAlbumName(albumId: string, snapshotName: string): string`

- [ ] **Step 1: Implement the hooks** (`src/sync/useAlbumMode.ts`)

```ts
import { useCollection } from '../store/collectionStore';
import { useSyncMeta } from '../store/syncStore';
import { albumMode, effectiveReadOnly, forcedReadOnly, resolveAlbumName, type AlbumMode } from './albumMode';

/** The derived Local/Cloud/Shared mode of one album, reactive to the sync-meta store. */
export function useAlbumMode(albumId: string): AlbumMode {
  const albumLinks = useSyncMeta((s) => s.albumLinks);
  const privateAlbumIds = useSyncMeta((s) => s.privateAlbumIds);
  return albumMode(albumId, { albumLinks, privateAlbumIds });
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
```

- [ ] **Step 2: Header title uses the resolved name** — in `src/App.tsx`:

Add the import:

```tsx
import { useResolvedAlbumName } from './sync/useAlbumMode';
```

After the existing `const albumName = useCollection((s) => s.albumName);` and `activeAlbumId` selectors, derive the display name:

```tsx
  const displayName = useResolvedAlbumName(activeAlbumId, albumName);
```

Change the header title from `<h1>{albumName}</h1>` to:

```tsx
          <h1>{displayName}</h1>
```

- [ ] **Step 3: Album selector + delete-confirm use resolved names** — in `src/components/EditionDialog.tsx`:

Add the import:

```tsx
import { useSyncMeta } from '../store/syncStore';
import { resolveAlbumName } from '../sync/albumMode';
```

Read the alias map once in the component body (after the existing selectors):

```tsx
  const localAlbumNames = useSyncMeta((s) => s.localAlbumNames);
```

In the album-selector `<option>`, render the resolved name:

```tsx
                {albums.map((a) => (
                  <option key={a.id} value={a.id}>
                    {resolveAlbumName(a.id, a.albumName, localAlbumNames)}
                  </option>
                ))}
```

In the delete-confirm modal, replace `{albumName}` in the album card with:

```tsx
              <div style={{ fontWeight: 700, fontSize: '1rem' }}>
                {resolveAlbumName(activeAlbumId, albumName, localAlbumNames)}
              </div>
```

- [ ] **Step 4: Verify** → `npm run build` clean; `npm test` green. With no aliases set, names render exactly as before.

- [ ] **Step 5: Commit**

```bash
git add src/sync/useAlbumMode.ts src/App.tsx src/components/EditionDialog.tsx
git commit -m "feat(sync): album-mode hooks + display-name resolution (header, selector, delete)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 6: `AlbumSharing` control in Settings → Album

**Files:**
- Create: `src/components/AlbumSharing.tsx`
- Modify: `src/components/EditionDialog.tsx`

**Interfaces:**
- Consumes: `useCollection` (active album id/name), `useSyncMeta` (link, aliases, status), `useAlbumMode`, engine actions `createAlbumShare`/`setAlbumMode`/`setShareAccess`/`stopSharing`/`leaveAlbumShare`, `isSyncConfigured`, `copyToClipboard`, `QRCode` (from `qrcode`), `formatSyncCode`.
- Produces: `<AlbumSharing />` (default export) rendered inside `EditionDialog`'s Album section, and the `EditionDialog` delete handler routed through `deleteAlbumEverywhere`.

**Behavioral spec (spec "UI / UX → Album section"):**
- Renders for the **active** album only (the one the selector/name fields target). Self-hides when `!isSyncConfigured`.
- **Mode selector** — three segmented buttons **Local · Cloud · Shared**, current mode highlighted:
  - **Local** ← from Cloud: `setAlbumMode(id, 'local')`. From an owner Share: `stopSharing(id, 'local')`. From a joiner Share: this is "Leave & keep a copy" → `leaveAlbumShare(id, true)`.
  - **Cloud** ← from Local: `setAlbumMode(id, 'cloud')`. From an owner Share: `stopSharing(id, 'cloud')`. Disabled for a joiner (you can't move someone else's shared album onto your Cloud; leave first).
  - **Shared** ← from Local/Cloud: open the **access picker** (Read-only / Collaborative) then `createAlbumShare(id, access)` → reveal code + QR. Already-shared → show the manage view.
- **Owner manage view** (mode === shared, role === owner): status chip; access toggle (`setShareAccess`); reveal/copy code + QR; **Stop sharing** (with a revert choice Cloud/Local, defaulting to Cloud).
- **Joiner view** (mode === shared, role === joiner): a "Shared with you (read-only|collaborative)" chip; **Leave shared album** → choice **Keep a copy** (`leaveAlbumShare(id, true)`) or **Leave & delete** (`leaveAlbumShare(id, false)`).
- **Two name fields:** the existing "Album name" field in `EditionDialog` stays (synced; add `disabled={forced}` in Task 8) — and this control adds **"Display name on this device"** bound to `localAlbumNames[id]` via `setLocalAlbumName(id, value || null)`.
- A per-album **status chip** (Synced / Syncing / Offline / error) from the link's `status`.

- [ ] **Step 1: Implement** (`src/components/AlbumSharing.tsx`)

```tsx
import { useState } from 'react';
import QRCode from 'qrcode';
import { isSyncConfigured } from '../lib/supabase';
import { useCollection } from '../store/collectionStore';
import { useSyncMeta, type SyncStatus } from '../store/syncStore';
import { useAlbumMode } from '../sync/useAlbumMode';
import {
  createAlbumShare, setAlbumMode, setShareAccess, stopSharing, leaveAlbumShare,
} from '../sync/engine';
import { copyToClipboard } from '../utils/share';

type Access = 'collaborative' | 'read-only';
const QR_PREFIX = 'sticker-sync:';

const STATUS_LABEL: Record<SyncStatus, string> = {
  unlinked: 'Not linked', syncing: 'Syncing…', synced: 'Synced', offline: 'Offline', error: 'Sync error',
};

export default function AlbumSharing() {
  const activeAlbumId = useCollection((s) => s.activeAlbumId);
  const link = useSyncMeta((s) => s.albumLinks[activeAlbumId]);
  const localAlbumNames = useSyncMeta((s) => s.localAlbumNames);
  const setLocalAlbumName = useSyncMeta((s) => s.setLocalAlbumName);
  const mode = useAlbumMode(activeAlbumId);

  const [picking, setPicking] = useState(false);          // access picker open
  const [code, setCode] = useState('');
  const [qrUrl, setQrUrl] = useState('');
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);
  const [confirmingStop, setConfirmingStop] = useState(false);
  const [confirmingLeave, setConfirmingLeave] = useState(false);
  const [alias, setAlias] = useState(localAlbumNames[activeAlbumId] ?? '');

  if (!isSyncConfigured) return null;

  const isOwner = link?.role === 'owner';

  async function share(access: Access) {
    setBusy(true);
    try {
      const c = await createAlbumShare(activeAlbumId, access);
      setCode(c);
      setQrUrl(await QRCode.toDataURL(`${QR_PREFIX}${c}`, { margin: 1, width: 200 }));
      setPicking(false);
    } finally {
      setBusy(false);
    }
  }

  async function copy() {
    const c = code || link?.code || '';
    if (c && (await copyToClipboard(c))) {
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1600);
    }
  }

  function commitAlias(next: string) {
    setAlias(next);
    setLocalAlbumName(activeAlbumId, next.trim() || null);
  }

  return (
    <div className="settings-field" style={{ marginTop: 12 }}>
      <label className="settings-field-label">Sharing</label>

      {/* Mode selector */}
      <div className="btn-row" role="group" aria-label="Album sync mode">
        <button
          type="button"
          className={`btn full${mode === 'local' ? ' primary' : ''}`}
          disabled={busy}
          onClick={() => {
            if (mode === 'local') return;
            if (mode === 'cloud') setAlbumMode(activeAlbumId, 'local');
            else if (isOwner) void stopSharing(activeAlbumId, 'local');
            else leaveAlbumShare(activeAlbumId, true);
          }}
        >
          Local
        </button>
        <button
          type="button"
          className={`btn full${mode === 'cloud' ? ' primary' : ''}`}
          disabled={busy || (mode === 'shared' && !isOwner)}
          onClick={() => {
            if (mode === 'cloud') return;
            if (mode === 'local') setAlbumMode(activeAlbumId, 'cloud');
            else if (isOwner) void stopSharing(activeAlbumId, 'cloud');
          }}
        >
          Cloud
        </button>
        <button
          type="button"
          className={`btn full${mode === 'shared' ? ' primary' : ''}`}
          disabled={busy}
          onClick={() => { if (mode !== 'shared') setPicking(true); }}
        >
          Shared
        </button>
      </div>

      <p className="modal-sub" style={{ margin: '8px 0 0', fontSize: '0.82rem' }}>
        {mode === 'local' && 'On this device only — never synced.'}
        {mode === 'cloud' && 'Synced across your own devices (the Cloud sync code).'}
        {mode === 'shared' && (isOwner
          ? 'Shared via a code. Anyone with the code can view or edit per the access level below.'
          : 'Shared with you by someone else’s code.')}
      </p>

      {/* Access picker (Local/Cloud -> Shared) */}
      {picking && (
        <div className="settings-field" style={{ marginTop: 10 }}>
          <p className="modal-sub" style={{ margin: '0 0 8px' }}>Who can edit?</p>
          <div className="btn-row" style={{ flexDirection: 'column' }}>
            <button type="button" className="btn full" disabled={busy} onClick={() => share('collaborative')}>
              🤝 Collaborative — they can edit
            </button>
            <button type="button" className="btn full" disabled={busy} onClick={() => share('read-only')}>
              👁️ Read-only — they can only view
            </button>
            <button type="button" className="btn full" disabled={busy} onClick={() => setPicking(false)}>
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Owner manage view */}
      {mode === 'shared' && isOwner && link && (
        <div className="settings-field" style={{ marginTop: 10 }}>
          <div className="sync-status-row">
            <span className={`sync-chip sync-${link.status}`}>{STATUS_LABEL[link.status]}</span>
          </div>

          <div className="btn-row" role="group" aria-label="Access level" style={{ marginTop: 8 }}>
            <button
              type="button"
              className={`btn full${link.access === 'collaborative' ? ' primary' : ''}`}
              onClick={() => setShareAccess(activeAlbumId, 'collaborative')}
            >
              Collaborative
            </button>
            <button
              type="button"
              className={`btn full${link.access === 'read-only' ? ' primary' : ''}`}
              onClick={() => setShareAccess(activeAlbumId, 'read-only')}
            >
              Read-only
            </button>
          </div>

          <div className="sync-code-display" style={{ marginTop: 8 }}>{code || link.code}</div>
          {qrUrl && <img className="sync-qr" src={qrUrl} alt="Album share QR" />}
          <div className="btn-row" style={{ marginTop: 8 }}>
            <button type="button" className="btn full" onClick={copy} aria-live="polite">
              {copied ? '✓ Copied' : 'Copy code'}
            </button>
          </div>

          {!confirmingStop ? (
            <button type="button" className="btn danger full" style={{ marginTop: 8 }} onClick={() => setConfirmingStop(true)}>
              Stop sharing
            </button>
          ) : (
            <>
              <p className="modal-sub" style={{ margin: '8px 0' }}>
                Stop sharing this album? People you shared with keep their own copy, but won’t get
                further updates. Keep this album as:
              </p>
              <div className="btn-row">
                <button type="button" className="btn full" disabled={busy} onClick={() => { setBusy(true); void stopSharing(activeAlbumId, 'cloud').finally(() => { setBusy(false); setConfirmingStop(false); }); }}>
                  ☁️ Cloud
                </button>
                <button type="button" className="btn full" disabled={busy} onClick={() => { setBusy(true); void stopSharing(activeAlbumId, 'local').finally(() => { setBusy(false); setConfirmingStop(false); }); }}>
                  📱 Local
                </button>
              </div>
              <button type="button" className="btn full" style={{ marginTop: 6 }} onClick={() => setConfirmingStop(false)}>
                Cancel
              </button>
            </>
          )}
        </div>
      )}

      {/* Joiner view */}
      {mode === 'shared' && !isOwner && link && (
        <div className="settings-field" style={{ marginTop: 10 }}>
          <div className="sync-status-row">
            <span className={`sync-chip sync-${link.status}`}>{STATUS_LABEL[link.status]}</span>
            <span className="sync-time">
              {link.access === 'read-only' ? 'Shared with you · read-only' : 'Shared with you · collaborative'}
            </span>
          </div>
          {!confirmingLeave ? (
            <button type="button" className="btn danger full" style={{ marginTop: 8 }} onClick={() => setConfirmingLeave(true)}>
              Leave shared album
            </button>
          ) : (
            <>
              <p className="modal-sub" style={{ margin: '8px 0' }}>Leave this shared album?</p>
              <div className="btn-row">
                <button type="button" className="btn full" onClick={() => { leaveAlbumShare(activeAlbumId, true); setConfirmingLeave(false); }}>
                  Keep a copy
                </button>
                <button type="button" className="btn danger full" onClick={() => { leaveAlbumShare(activeAlbumId, false); setConfirmingLeave(false); }}>
                  Leave & delete
                </button>
              </div>
              <button type="button" className="btn full" style={{ marginTop: 6 }} onClick={() => setConfirmingLeave(false)}>
                Cancel
              </button>
            </>
          )}
        </div>
      )}

      {/* Display name on this device (local alias, always editable, never synced) */}
      <div className="settings-field" style={{ marginTop: 12 }}>
        <label htmlFor="album-alias-input" className="settings-field-label">Display name on this device</label>
        <input
          id="album-alias-input"
          type="text"
          className="settings-input"
          placeholder="(optional) shown only here"
          value={alias}
          onChange={(e) => commitAlias(e.target.value)}
        />
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Render it in `EditionDialog` + route delete** (`src/components/EditionDialog.tsx`)

Add the imports:

```tsx
import AlbumSharing from './AlbumSharing';
import { deleteAlbumEverywhere } from '../sync/engine';
```

Render `<AlbumSharing />` inside the Album `<section>`, right after the `settings-actions` block (before the section closes at line ~139):

```tsx
          <AlbumSharing />
```

Change the delete handler to propagate correctly:

```tsx
  async function handleConfirmDelete() {
    await deleteAlbumEverywhere(activeAlbumId);
    setConfirmingDelete(false);
    onClose();
  }
```

- [ ] **Step 3: Verify** → `npm run build` clean; `npm test` green. The control renders only when sync is configured; the mode selector reflects `cloud` for a fresh album.

- [ ] **Step 4: Commit**

```bash
git add src/components/AlbumSharing.tsx src/components/EditionDialog.tsx
git commit -m "feat(sync): per-album Sharing control (mode, access, code/QR, stop/leave, alias)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 7: Unified join-by-`kind` in SyncDialog + Sync section reframe

**Files:**
- Modify: `src/components/SyncDialog.tsx`
- Modify: `src/components/SyncSection.tsx`

**Interfaces:**
- Consumes: broadened `peekRemote` (returns `kind`), `joinAlbumCode`, existing `linkWithRemote`/`linkWithLocal`.
- Produces: a "Enter a code" flow that adds a shared album when the peeked row is `kind:'album'` (with an optional joiner display name), and today's Cloud-join when it's `kind:'collection'`.

- [ ] **Step 1: SyncDialog — branch the join on `kind`** (`src/components/SyncDialog.tsx`)

Update the import to add `joinAlbumCode` and the album-peek type:

```tsx
import { createLink, peekRemote, linkWithRemote, linkWithLocal, joinAlbumCode, type PeekOk, type AlbumPeekOk } from '../sync/engine';
```

Add `'joinAlbum'` to the `Mode` union and an album-peek state slot:

```tsx
type Mode = 'choose' | 'create' | 'enter' | 'direction' | 'joinAlbum';
```

```tsx
  const [albumPeek, setAlbumPeek] = useState<AlbumPeekOk | null>(null);
  const [joinAlias, setJoinAlias] = useState('');
```

In `handleJoin`, after the `if (!res.ok)` error branch, route by kind (the collection branches stay exactly as they are, but move under a `kind === 'collection'` guard):

```tsx
    if (res.kind === 'album') {
      setAlbumPeek(res);
      setBusy(false);
      setMode('joinAlbum');
      return;
    }
    // kind === 'collection' (today's Cloud-join flow, unchanged):
    if (!res.localHasData) {
      linkWithRemote(res);
      setBusy(false);
      onClose();
      return;
    }
    setPeek(res);
    setBusy(false);
    setMode('direction');
```

Add a confirm handler for the album join:

```tsx
  function confirmJoinAlbum() {
    if (!albumPeek) return;
    setBusy(true);
    void joinAlbumCode(albumPeek, { displayName: joinAlias.trim() || undefined }).finally(() => {
      setBusy(false);
      onClose();
    });
  }
```

Add the `joinAlbum` view (place it alongside the other `mode === ...` blocks):

```tsx
        {mode === 'joinAlbum' && albumPeek && (
          <>
            <h2>Join shared album</h2>
            <p className="modal-sub">
              This code shares a single album ({albumPeek.access === 'read-only' ? 'read-only' : 'collaborative'}).
              It’ll be added to your collection{albumPeek.access === 'read-only' ? ' to view' : ' to edit together'}.
            </p>
            <div className="settings-field">
              <label htmlFor="join-alias" className="settings-field-label">Name on this device (optional)</label>
              <input
                id="join-alias"
                type="text"
                className="settings-input"
                placeholder="(optional)"
                value={joinAlias}
                onChange={(e) => setJoinAlias(e.target.value)}
              />
            </div>
            {error && <p className="sync-error">{error}</p>}
            <div className="btn-row">
              <button className="btn full" disabled={busy} onClick={() => { setAlbumPeek(null); setMode('enter'); }}>
                Back
              </button>
              <button className="btn primary full" disabled={busy} onClick={confirmJoinAlbum}>
                {busy ? 'Joining…' : 'Join album'}
              </button>
            </div>
          </>
        )}
```

- [ ] **Step 2: Reframe the Sync section copy** (`src/components/SyncSection.tsx`)

The section already reads only `s.collection`, so it's structurally Cloud-only. Clarify the copy. Change the unlinked description paragraph (lines ~58–61) to:

```tsx
          <p className="modal-sub" style={{ margin: '0 0 12px' }}>
            Cloud sync keeps <strong>your own devices</strong> in step — phone and computer share
            one collection. Automatic, offline-first, no account. (To share a single album with
            someone else, use <strong>Sharing</strong> in the Album section above.)
          </p>
```

And update the `mode === 'enter'` helper text in `SyncDialog` (lines ~150–153) so a user knows the same box also joins a shared-album code:

```tsx
            <p className="modal-sub">
              Type a code from another device. A Cloud code links your own devices; a shared-album
              code adds that one album to your collection.
            </p>
```

- [ ] **Step 3: Verify** → `npm run build` clean; `npm test` green. Entering a collection code still follows the direction/merge flow; an album code routes to the new join view.

- [ ] **Step 4: Commit**

```bash
git add src/components/SyncDialog.tsx src/components/SyncSection.tsx
git commit -m "feat(sync): unified join by kind (album vs collection) + reframe Cloud sync copy

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 8: Read-only gating (header lock, sticker cells, Swaps tab)

**Files:**
- Modify: `src/App.tsx`
- Modify: `src/components/PageSection.tsx`
- Modify: `src/components/SwapsView.tsx`
- Modify: `src/components/SwapDetail.tsx`
- Modify: `src/components/EditionDialog.tsx` (disable the synced Album-name field for a forced read-only joiner)

**Interfaces:**
- Consumes: `useEffectiveReadOnly`, `useForcedReadOnly` (Task 5).

**Behavioral spec (spec "Read-only enforcement"):** for a read-only album we joined, the effective state is locked regardless of the synced `locked`. The header 🔒 renders closed + disabled with a hint; sticker cells ignore taps; Swaps create/edit/close/delete are disabled with a badge.

- [ ] **Step 1: Header lock — force-locked + disabled for a read-only joiner** (`src/App.tsx`)

Add the import:

```tsx
import { useForcedReadOnly } from './sync/useAlbumMode';
```

In the component body:

```tsx
  const forcedReadOnly = useForcedReadOnly();
```

Replace the lock button so a forced read-only album shows a disabled 🔒 with an explanatory title, and a normal album keeps today's toggle:

```tsx
            <button
              className={`icon-btn lock-toggle${locked || forcedReadOnly ? ' locked' : ''}`}
              onClick={forcedReadOnly ? undefined : toggleLocked}
              disabled={forcedReadOnly}
              role="switch"
              aria-checked={locked || forcedReadOnly}
              aria-label={
                forcedReadOnly
                  ? 'Read-only shared album — editing is disabled'
                  : locked
                    ? 'Album locked — tap to unlock and edit'
                    : 'Album unlocked — tap to lock'
              }
              title={forcedReadOnly ? 'Read-only shared album' : locked ? 'Locked (read-only)' : 'Unlocked (editable)'}
            >
              🔒
            </button>
```

(Note the glyph is now always 🔒 when `locked || forcedReadOnly`; when neither, it must show 🔓 — keep the existing conditional: change the button child to `{locked || forcedReadOnly ? '🔒' : '🔓'}`.)

- [ ] **Step 2: Sticker cells honor effective read-only** (`src/components/PageSection.tsx`)

Replace the `s.locked` selector with the effective hook. Change:

```tsx
  const locked = useCollection((s) => s.locked);
```

to:

```tsx
  const locked = useEffectiveReadOnly();
```

and add the import:

```tsx
import { useEffectiveReadOnly } from '../sync/useAlbumMode';
```

(The `locked` prop already flows to `StickerCell`, which ignores taps when locked — no further change.)

- [ ] **Step 3: Swaps tab — gate creation + show a badge** (`src/components/SwapsView.tsx`)

Add the import + hook:

```tsx
import { useEffectiveReadOnly } from '../sync/useAlbumMode';
```

```tsx
  const readOnly = useEffectiveReadOnly();
```

Replace the toolbar so the New-swap button hides and a badge explains why when read-only:

```tsx
      <div className="toolbar">
        {readOnly ? (
          <span className="sync-chip sync-synced" title="Read-only shared album">
            🔒 Read-only — shared by code owner
          </span>
        ) : (
          <button className="btn primary" onClick={() => setCreating(true)}>
            ＋ New swap
          </button>
        )}
      </div>
```

- [ ] **Step 4: Swap detail — gate edit / close / delete / rollback** (`src/components/SwapDetail.tsx`)

Add the import + hook:

```tsx
import { useEffectiveReadOnly } from '../sync/useAlbumMode';
```

```tsx
  const readOnly = useEffectiveReadOnly();
```

Wrap the action controls so they don't render when `readOnly`. Locate the action buttons (Edit, Delete, Rollback, and the "Conclude/Close" trigger — around lines 105–216) and guard each action group with `{!readOnly && ( ... )}`. Where the modal would otherwise be actionless, add a note:

```tsx
        {readOnly && (
          <p className="modal-sub" style={{ margin: '8px 0 0' }}>
            🔒 Read-only — shared by the code owner. You can view this swap but not change it.
          </p>
        )}
```

(Keep the read-only guard minimal and correct: the goal is that no `updateSwap`/`deleteSwap`/`rollbackSwap`/`closeSwap` path is reachable from the UI when `readOnly`. Verify by reading the file and gating each button that calls one of those actions or opens `NewSwapDialog`/`SwapClose`.)

- [ ] **Step 5: Disable the synced Album-name field for a forced read-only joiner** (`src/components/EditionDialog.tsx`)

Add the import + hook:

```tsx
import { useForcedReadOnly } from '../sync/useAlbumMode';
```

```tsx
  const forcedReadOnly = useForcedReadOnly();
```

Add `disabled={forcedReadOnly}` to the existing `#album-name-input` (the synced name is write-gated; the local alias field in `AlbumSharing` stays editable):

```tsx
            <input
              id="album-name-input"
              type="text"
              className="settings-input"
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onBlur={handleNameBlur}
              onKeyDown={handleNameKeyDown}
              disabled={forcedReadOnly}
            />
```

- [ ] **Step 6: Verify** → `npm run build` clean; `npm test` green. Manually: a normal album keeps the 🔓/🔒 toggle and full Swaps; a read-only joined album shows a disabled 🔒, ignores sticker taps, and disables Swaps actions.

- [ ] **Step 7: Commit**

```bash
git add src/App.tsx src/components/PageSection.tsx src/components/SwapsView.tsx src/components/SwapDetail.tsx src/components/EditionDialog.tsx
git commit -m "feat(sync): read-only gating (header lock, sticker cells, Swaps tab)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 9: End-to-end manual smoke + self-review

**Files:** none (verification only).

- [ ] **Step 1: Full suite + build** → `npm test` all green; `npm run build` clean.

- [ ] **Step 2: Manual smoke** (with Supabase env configured; if unavailable in the exec environment, state that and defer to a follow-up device check). Two browser profiles = two "devices":
  1. **Cloud unchanged:** create a Cloud code on A, join on B → whole collection syncs both ways (Stage 2 regression check).
  2. **Collaborative album:** on A, Album → Sharing → Shared → Collaborative → copy code. On B, Settings → Sync → Enter a code → paste → "Join album". Edit counts/swaps on both → they converge; the album is absent from B's Cloud set.
  3. **Read-only album:** share Read-only from A; join on B → B shows a disabled 🔒, can't tap stickers, Swaps actions disabled; A's edits flow to B; B's (dev-tools-forced) writes are transient.
  4. **Display name:** set a "Display name on this device" on B → header/selector reflect it; A is unaffected.
  5. **Leave:** on B, Sharing → Local (or Leave → Keep a copy) → B keeps a private fork, stops syncing.
  6. **Stop sharing:** on A, Stop sharing → Cloud. On B's next pull → RevocationNotice banner appears, album converts to Local.
  7. **Delete propagation:** delete a Cloud album on A → it disappears on B (tombstone); delete a shared album on A → only A unlinks (B keeps its copy).

- [ ] **Step 3: Record results** in the execution report (which scenarios passed; any deferred to a device check).

---

## Self-Review (Stage 3 vs. spec)

- **Per-album mode selector (Local/Cloud/Shared)** — spec "UI / UX → Album section" → Task 6 `AlbumSharing`, Task 1 `albumMode`. ✅
- **Access level (Read-only / Collaborative), owner-authored, flippable** — Task 2 `setShareAccess`, Task 6 picker + owner view. ✅
- **Join by `kind` (one entry, album vs collection)** — spec "Joining a code" → Task 3 `peekRemote` broadening + `joinAlbumCode`, Task 7 SyncDialog branch. ✅
- **Album identity across people (locally-unique id, code ↔ localAlbumId)** — spec "Album identity across people" → Task 1 `pickLocalAlbumId`, Task 3 `joinAlbumCode` (id-normalized adoption; `mergeAlbum` keeps `id: local.id`). ✅
- **Two name layers (synced name + local alias)** — spec "Two name layers" → Task 5 resolution wiring, Task 6 alias field, Task 8 disables synced name for read-only joiner. ✅
- **Read-only enforcement (engine pull-only + header 🔒 disabled + Album cells + Swaps disabled)** — spec "Read-only enforcement" → engine already (Stage 2); Task 8 UI gating. ✅
- **Revocation — joiner leave (keep/delete), owner stop-sharing (`sharingEndedAt`) + notification + convert to Local** — spec "Revocation" → Task 4. ✅
- **Carve-out ≠ deletion; delete propagation (tombstone Cloud, unlink shared, local)** — spec "Edge cases" → Task 1 `deleteDisposition`, Task 2 `deleteAlbumEverywhere`. ✅
- **Reframed Sync section (Cloud only)** — spec "UI / UX → Sync section" → Task 7. ✅
- **No backend/SQL changes** — every action uses the existing RPCs; the only new store field (`revokedNotice`) is transient. ✅
- **Placeholder scan** — every code step shows concrete code; UI-only tasks that can't be unit-tested (no component runner) verify via type-check + build + the Task-9 scripted smoke, matching Stage 2's approach. No "TBD".
- **Type consistency** — `AlbumMode`, `AlbumLink`, `AlbumPeekOk`/`PeekOk` (both now carry `kind`), `createAlbumShare`/`joinAlbumCode`/`stopSharing`/`leaveAlbumShare`/`setAlbumMode`/`setShareAccess`/`deleteAlbumEverywhere`, and the `useAlbumMode`/`useForcedReadOnly`/`useEffectiveReadOnly`/`useResolvedAlbumName` hook signatures match across Tasks 1–8.

---

## Execution Handoff

Stage 3 is UI-and-actions on top of a proven engine. Tasks 1 is pure/TDD; Tasks 2–4 are engine actions (type-check + build + Task-9 smoke); Tasks 5–8 are UI (type-check + build + smoke). Recommended: subagent-driven (fresh implementer per task + task review + final whole-branch review). Use the cheapest tier for Task 1 and the mechanical UI wiring (Tasks 5, 7, 8); a mid-tier model for the engine actions (Tasks 2–4) and the `AlbumSharing` component (Task 6), which carry the most judgment. Because Tasks 6–8 can't be unit-verified here, do not skip the Task-9 manual smoke before declaring Stage 3 done.
