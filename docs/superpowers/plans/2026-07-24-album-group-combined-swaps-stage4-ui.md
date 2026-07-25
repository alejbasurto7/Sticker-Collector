# Album Groups & Combined Swaps — Stage 4 (UI) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the UI layer that lets a user manage album groups and work them as one combined swap pool, on top of the already-shipped Stage 1–3 pool logic, store, and sync.

**Architecture:** A pure `buildGroupMembers` seam joins `collectionStore` albums (active-top-level + parked) with `syncStore` link metadata into `GroupMember[]`; a thin `useGroupMembers` hook wraps it reactively. A new `AlbumGroupsSheet` (opened from a new `👥 Groups` entry in the Library sheet) does group CRUD. On the Swaps tab, a `.mini-seg` lens toggle switches a writable member between its solo swaps and the group's combined pool (combined-swaps list, internal-moves panel, share-list). `NewSwapDialog`, `SwapDetail`, and `SwapClose` gain an optional `groupCtx` prop that routes them through the group store actions and pool math. Every consumer resolves members per-device and treats a group with < 2 resolvable members as inert.

**Tech Stack:** React 18 + Zustand (`useCollection`, `useSyncMeta`) + TypeScript + Vite + Vitest. Single global stylesheet `src/styles.css` (plain kebab-case classes, no CSS Modules). No component test runner — **pure helpers are unit-tested with Vitest; components are verified in the browser against spec §G.**

## Global Constraints

- Store hooks are **`useCollection`** (from `src/store/collectionStore.ts`) and **`useSyncMeta`** (from `src/store/syncStore.ts`). There is no `useCollectionStore`/`useSyncStore`. Subscribe with one narrow selector per field (codebase convention).
- The `AlbumSnapshot` name field is **`albumName`**, not `name`. Active album fields (`counts`/`edition`/`trackCC`/`albumName`/`swaps`) are **mirrored at the store top level**; the parked snapshot of the active album in `albums[]` may be stale — always read the active member from top level.
- **`writable = !forcedReadOnly(link)`** (`src/sync/albumMode.ts:31`); **`name = resolveAlbumName(id, snapshotName, localAlbumNames)`** (`albumMode.ts:48`). A read-only joined share is a **view-only member**: contributes needs, never written, never gives, never a settlement target, excluded from internal moves.
- A group is **inert** on a device with **< 2 resolvable members** (no pool, no combined-swap creation). A combined swap needs **≥ 2 writable** resolvable members to run.
- The combined lens is only reachable from a **writable** member's Swaps tab (gate on `!useForcedReadOnly()`). Album tab and Stats tab stay per-album, always.
- `computeStatsFor(counts, edition, trackCC)` returns `completionPct` as a **0..1 fraction** — render percent via `displayPct(pct)`.
- Sticker chips render via the existing `StickerChips` component (id-based, album-agnostic). Reuse it unchanged.
- **Correction to the spec/handoff:** the `👥 Groups` entry is described as "already reserved" in `LibrarySheet.tsx`, but it does **not** exist yet — Task 3 adds it fresh.
- Run every command from the worktree: `cd .claude/worktrees/album-group-combined-swaps`. `npx tsc -b` and `npm test` must stay green.

---

## File Structure

**New files**
- `src/sync/groupMembers.ts` — pure `buildGroupMembers` + `ResolvedGroupMember`/`GroupSwapCtx` types + `groupForAlbum` helper. (node-safe, type-only store imports, mirrors `albumMode.ts`.)
- `src/sync/groupMembers.test.ts` — unit tests for the seam.
- `src/sync/useGroupMembers.ts` — reactive hook wrapping `buildGroupMembers`.
- `src/components/AlbumGroupsSheet.tsx` — group list + create/rename/disband + member picker (self-contained `.modal-backdrop > .modal`).
- `src/components/InternalMovesPanel.tsx` — the "Internal moves (N)" panel with per-move Apply.

**Modified files**
- `src/utils/listExport.ts` (+ `listExport.test.ts`) — add pure `buildGroupListExport(pool, name)`.
- `src/components/LibrarySheet.tsx` — add `👥 Groups` button + `onOpenGroups` prop.
- `src/App.tsx` — `groupsOpen` state, mount `AlbumGroupsSheet`, pass `onOpenGroups`.
- `src/components/SwapsView.tsx` — lens toggle + combined view (list, New combined swap, share, internal-moves panel).
- `src/components/NewSwapDialog.tsx` — optional `groupCtx` → group candidates + two-sided quantities + `createCombinedSwap`/`updateCombinedSwap`.
- `src/components/SwapDetail.tsx` — thread `groupCtx` to `NewSwapDialog`/`SwapClose`; group rollback/delete/export.
- `src/components/SwapClose.tsx` — optional `groupCtx` → `routeReceived`/`routeGiven` → `settledByAlbum` → `closeCombinedSwap`; ambiguous `[change ▾]`; view-only hand-off reminders.
- `src/styles.css` — classes for the new surfaces.

**Reused as-is (do not modify):** `src/utils/groupSwap.ts` (`computeGroupPool`, `computeGroupCandidates`, `routeReceived`, `routeGiven`), all `collectionStore` group/combined-swap actions, `StickerChips`, `computeStatsFor`, `displayPct`, `AlbumCard` styling classes.

---

### Task 1: `buildGroupMembers` seam + `useGroupMembers` hook

Builds `GroupMember[]` (plus each member's solo swaps, for reservation roll-up) from the two stores, resolving members per-device. This is the join every later task depends on.

**Files:**
- Create: `src/sync/groupMembers.ts`
- Test: `src/sync/groupMembers.test.ts`
- Create: `src/sync/useGroupMembers.ts`

**Interfaces:**
- Consumes: `GroupMember` (`src/utils/groupSwap.ts:7`), `AlbumSnapshot` (`src/store/collectionStore.ts:35`), `AlbumLink`/`SyncMetaState` (`src/store/syncStore.ts`), `forcedReadOnly`/`resolveAlbumName` (`src/sync/albumMode.ts`), `AlbumGroup`/`Swap`/`Counts`/`Edition` (`src/types.ts`).
- Produces:
  - `interface ResolvedGroupMember extends GroupMember { swaps: Swap[] }`
  - `interface GroupSwapCtx { groupId: string; members: ResolvedGroupMember[] }`
  - `interface ActiveAlbumFields { id: string; counts: Counts; edition: Edition; trackCC: boolean; albumName: string; swaps: Swap[] }`
  - `buildGroupMembers(memberIds: string[], parked: AlbumSnapshot[], active: ActiveAlbumFields, albumLinks: Record<string, AlbumLink>, localAlbumNames: Record<string, string>): ResolvedGroupMember[]` — drops unresolved ids (per-device resolution).
  - `groupForAlbum(groups: AlbumGroup[], albumId: string): AlbumGroup | undefined`
  - `useGroupMembers(groupId?: string): { group: AlbumGroup; members: ResolvedGroupMember[] } | null` (from the hook file).

- [ ] **Step 1: Write the failing test**

Create `src/sync/groupMembers.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { buildGroupMembers, groupForAlbum } from './groupMembers';
import type { AlbumSnapshot } from '../store/collectionStore';
import type { AlbumLink } from '../store/syncStore';

const snap = (id: string, over: Partial<AlbumSnapshot> = {}): AlbumSnapshot => ({
  id, albumName: id, counts: {}, swaps: [], edition: 'latam', trackCC: false,
  locked: false, activityDays: [], completedOn: null, unlockedAchievements: {}, ...over,
});
const active = { id: 'A', counts: { 'MEX-1': 2 }, edition: 'latam' as const, trackCC: false, albumName: 'A', swaps: [] };
const joinerRO: AlbumLink = {
  albumId: 'C', role: 'joiner', access: 'read-only',
  code: 'x', codeHash: 'x', writerId: 'w', lastVersion: 0, lastSyncedAt: null, status: 'synced',
};

describe('buildGroupMembers', () => {
  it('reads the ACTIVE member from top-level fields, parked members from the snapshot', () => {
    const parked = [snap('A', { counts: { 'MEX-1': 99 } }), snap('B', { counts: { 'MEX-1': 0 } })];
    const members = buildGroupMembers(['A', 'B'], parked, active, {}, {});
    expect(members.map((m) => m.id)).toEqual(['A', 'B']);
    expect(members[0].counts).toEqual({ 'MEX-1': 2 }); // top-level wins over stale parked 99
    expect(members[1].counts).toEqual({ 'MEX-1': 0 });
    expect(members.every((m) => m.writable)).toBe(true);
  });

  it('drops ids with no resolvable album (per-device resolution)', () => {
    const members = buildGroupMembers(['A', 'GHOST'], [snap('A')], active, {}, {});
    expect(members.map((m) => m.id)).toEqual(['A']);
  });

  it('marks a read-only joined share as a non-writable (view-only) member', () => {
    const members = buildGroupMembers(['C'], [snap('C')], active, { C: joinerRO }, {});
    expect(members[0].writable).toBe(false);
  });

  it('resolves the per-device display name via localAlbumNames', () => {
    const members = buildGroupMembers(['B'], [snap('B', { albumName: 'synced' })], active, {}, { B: 'my alias' });
    expect(members[0].name).toBe('my alias');
  });

  it('carries each member solo swaps for reservation roll-up', () => {
    const sw = { id: 's1', name: 'x', createdAt: 0, status: 'open' as const, theirNeeds: [], theirSwaps: [], giving: [], receiving: [] };
    const members = buildGroupMembers(['B'], [snap('B', { swaps: [sw] })], active, {}, {});
    expect(members[0].swaps).toEqual([sw]);
  });
});

describe('groupForAlbum', () => {
  it('finds the single group containing the album, else undefined', () => {
    const groups = [{ id: 'g1', name: 'K', memberIds: ['A', 'B'], swaps: [] }];
    expect(groupForAlbum(groups, 'B')?.id).toBe('g1');
    expect(groupForAlbum(groups, 'Z')).toBeUndefined();
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/sync/groupMembers.test.ts`
Expected: FAIL — module `./groupMembers` not found.

- [ ] **Step 3: Write the implementation**

Create `src/sync/groupMembers.ts`:

```ts
// Pure, node-safe seam: join collectionStore albums with syncStore link metadata
// into the GroupMember shape the pool math consumes. Type-only store imports keep
// this module (and its tests) in the plain-node Vitest env, mirroring albumMode.ts.
import type { AlbumGroup, Counts, Edition, Swap } from '../types';
import type { GroupMember } from '../utils/groupSwap';
import type { AlbumSnapshot } from '../store/collectionStore';
import type { AlbumLink } from '../store/syncStore';
import { forcedReadOnly, resolveAlbumName } from './albumMode';

/** A resolved member plus its own solo swaps (for combined-swap reservation roll-up). */
export interface ResolvedGroupMember extends GroupMember {
  swaps: Swap[];
}

/** Group context threaded into NewSwapDialog / SwapDetail / SwapClose for group mode. */
export interface GroupSwapCtx {
  groupId: string;
  members: ResolvedGroupMember[];
}

/** The active album's authoritative top-level fields (parked snapshot may be stale). */
export interface ActiveAlbumFields {
  id: string;
  counts: Counts;
  edition: Edition;
  trackCC: boolean;
  albumName: string;
  swaps: Swap[];
}

/** Resolve each memberId against local albums (active from top-level, others parked); drop absent ids. */
export function buildGroupMembers(
  memberIds: string[],
  parked: AlbumSnapshot[],
  active: ActiveAlbumFields,
  albumLinks: Record<string, AlbumLink>,
  localAlbumNames: Record<string, string>,
): ResolvedGroupMember[] {
  const out: ResolvedGroupMember[] = [];
  for (const id of memberIds) {
    const src =
      id === active.id
        ? { albumName: active.albumName, counts: active.counts, edition: active.edition, trackCC: active.trackCC, swaps: active.swaps }
        : parked.find((a) => a.id === id);
    if (!src) continue; // resolved-out on this device
    out.push({
      id,
      name: resolveAlbumName(id, src.albumName, localAlbumNames),
      counts: src.counts,
      edition: src.edition,
      trackCC: src.trackCC,
      writable: !forcedReadOnly(albumLinks[id]),
      swaps: src.swaps,
    });
  }
  return out;
}

/** The (at most one) group an album belongs to. */
export function groupForAlbum(groups: AlbumGroup[], albumId: string): AlbumGroup | undefined {
  return groups.find((g) => g.memberIds.includes(albumId));
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run src/sync/groupMembers.test.ts`
Expected: PASS (all cases).

- [ ] **Step 5: Write the reactive hook**

Create `src/sync/useGroupMembers.ts`:

```ts
import { useMemo } from 'react';
import { useCollection } from '../store/collectionStore';
import { useSyncMeta } from '../store/syncStore';
import { buildGroupMembers } from './groupMembers';
import type { ResolvedGroupMember } from './groupMembers';
import type { AlbumGroup } from '../types';

/** Resolve a group's members reactively for this device, or null if the group is unknown. */
export function useGroupMembers(
  groupId?: string,
): { group: AlbumGroup; members: ResolvedGroupMember[] } | null {
  const group = useCollection((s) => (groupId ? s.groups.find((g) => g.id === groupId) : undefined));
  const parked = useCollection((s) => s.albums);
  const activeAlbumId = useCollection((s) => s.activeAlbumId);
  const counts = useCollection((s) => s.counts);
  const edition = useCollection((s) => s.edition);
  const trackCC = useCollection((s) => s.trackCC);
  const albumName = useCollection((s) => s.albumName);
  const swaps = useCollection((s) => s.swaps);
  const albumLinks = useSyncMeta((s) => s.albumLinks);
  const localAlbumNames = useSyncMeta((s) => s.localAlbumNames);

  return useMemo(() => {
    if (!group) return null;
    const members = buildGroupMembers(
      group.memberIds, parked,
      { id: activeAlbumId, counts, edition, trackCC, albumName, swaps },
      albumLinks, localAlbumNames,
    );
    return { group, members };
  }, [group, parked, activeAlbumId, counts, edition, trackCC, albumName, swaps, albumLinks, localAlbumNames]);
}
```

- [ ] **Step 6: Typecheck**

Run: `npx tsc -b`
Expected: clean. (Confirm the top-level selector field names exist: `activeAlbumId`, `counts`, `edition`, `trackCC`, `albumName`, `swaps`, `albums`, `groups`.)

- [ ] **Step 7: Commit**

```bash
git add src/sync/groupMembers.ts src/sync/groupMembers.test.ts src/sync/useGroupMembers.ts
git commit -m "feat(groups): buildGroupMembers seam + useGroupMembers hook"
```

---

### Task 2: Combined-pool list export

Pure exporter that turns a `GroupPool` into the same "Figuritas App - List" text `parseExport` consumes, so the family's combined needs/spares can be shared like a solo list.

**Files:**
- Modify: `src/utils/listExport.ts`
- Test: `src/utils/listExport.test.ts`

**Interfaces:**
- Consumes: `GroupPool` (`src/utils/groupSwap.ts:33`), `album`/`stickerById` (`src/data/sampleAlbum`).
- Produces: `buildGroupListExport(pool: GroupPool, name: string): string`.

- [ ] **Step 1: Write the failing test**

Append to `src/utils/listExport.test.ts` (import `buildGroupListExport` alongside existing imports):

```ts
import { buildGroupListExport } from './listExport';
import type { GroupPool } from './groupSwap';

describe('buildGroupListExport', () => {
  it('emits I need / To Swap sections from the pool, round-trippable through parseExport', () => {
    // Pick two ids known to exist in the sample album layout.
    const pool: GroupPool = {
      get: { 'MEX-3': 2 }, writableGet: { 'MEX-3': 2 }, give: { 'MEX-9': 1 }, internalMoves: [],
    };
    const text = buildGroupListExport(pool, 'Kids');
    expect(text).toContain('Figuritas App - List');
    expect(text).toContain('Kids');
    expect(text).toContain('I need');
    expect(text).toContain('To Swap');
    // get qty > 1 survives as "(×2)"
    expect(text).toMatch(/\(×2\)/);
  });

  it('omits an empty section', () => {
    const text = buildGroupListExport({ get: {}, writableGet: {}, give: { 'MEX-9': 1 }, internalMoves: [] }, 'Kids');
    expect(text).not.toContain('I need');
    expect(text).toContain('To Swap');
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run src/utils/listExport.test.ts`
Expected: FAIL — `buildGroupListExport` is not exported.

- [ ] **Step 3: Implement**

Append to `src/utils/listExport.ts`:

```ts
import type { GroupPool } from './groupSwap';

/**
 * Build a shareable "Figuritas App - List" from a combined group pool: pool.get →
 * "I need" (with "(×N)" when more than one copy is wanted), pool.give → "To Swap"
 * (with "(×N)" for multiple spares). Same format as buildListExport, so it round-
 * trips through parseExport for the other collector.
 */
export function buildGroupListExport(pool: GroupPool, name: string): string {
  const needLines: string[] = [];
  const swapLines: string[] = [];

  for (const page of album.pages) {
    const needNums: string[] = [];
    const swapNums: string[] = [];
    for (const stickerId of page.stickerIds) {
      const sticker = stickerById[stickerId];
      if (!sticker) continue;
      const need = pool.get[stickerId] ?? 0;
      const give = pool.give[stickerId] ?? 0;
      if (need > 0) needNums.push(need > 1 ? `${sticker.number} (×${need})` : sticker.number);
      if (give > 0) swapNums.push(give > 1 ? `${sticker.number} (×${give})` : sticker.number);
    }
    if (needNums.length > 0) needLines.push(`${page.code} ${page.emoji}: ${needNums.join(', ')}`);
    if (swapNums.length > 0) swapLines.push(`${page.code} ${page.emoji}: ${swapNums.join(', ')}`);
  }

  const parts: string[] = ['Figuritas App - List', name];
  if (needLines.length > 0) parts.push('I need', ...needLines);
  if (swapLines.length > 0) parts.push('To Swap', ...swapLines);
  return parts.join('\n');
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `npx vitest run src/utils/listExport.test.ts`
Expected: PASS. (If `MEX-3`/`MEX-9` aren't valid ids in the sample album, pick ids from an existing `listExport`/`swap` test fixture; the assertion only needs two real ids in different states.)

- [ ] **Step 5: Commit**

```bash
git add src/utils/listExport.ts src/utils/listExport.test.ts
git commit -m "feat(groups): buildGroupListExport for the combined pool"
```

---

### Task 3: Album Groups management screen (Library sheet entry + App wiring)

A `👥 Groups` entry in the Library sheet opens a self-contained sheet to create/name a group, pick members, and disband. Member picker offers writable albums as full members and read-only shares as **view-only** (badged); Save requires ≥ 2 **writable** members.

**Files:**
- Create: `src/components/AlbumGroupsSheet.tsx`
- Modify: `src/components/LibrarySheet.tsx` (props + button)
- Modify: `src/App.tsx` (state + mount)

**Interfaces:**
- Consumes: `useCollection` group state + actions `createGroup(name, memberIds) => string`, `renameGroup(id, name)`, `setGroupMembers(id, memberIds)`, `disbandGroup(id)`; `useAlbumMode`/`useResolvedAlbumName` (`src/sync/useAlbumMode.ts`); `forcedReadOnly` + `useSyncMeta(s => s.albumLinks)`; `computeStatsFor`/`displayPct`; `orderAlbums` (`collectionStore.ts:260`); `MODE_BADGE` (`albumMode.ts:8`); `monogram`/`coverTint` (`src/utils/albumCover.ts`).
- Produces: `AlbumGroupsSheet` (default export, props `{ onClose: () => void }`); `LibrarySheet` gains prop `onOpenGroups: () => void`.

**Behavior spec (from §E / §G precondition):**
- List existing groups: each row shows group name, member count, an **Edit** (rename + change members) and a **Disband** (with confirm) action.
- **New group** flow: name input + member checklist over `orderAlbums(albums, albumOrder)`. Each row is a selectable card (reuse `album-cover`/`mode-pill`/`album-card-*` classes) with a checkbox; a read-only joined album shows a `view-only` badge and, when selected, counts as a view-only member. Disable **Save** until ≥ 2 selected members are **writable** (`!forcedReadOnly(albumLinks[id])`); show a hint like "Pick at least 2 editable albums."
- Save calls `createGroup(name, memberIds)`; Edit calls `renameGroup` and/or `setGroupMembers`.
- Follows the dialog convention: own `.modal-backdrop > .modal`, `onClose` on backdrop, `stopPropagation` on `.modal`, nested create/edit form gated by local state (mirror `LibrarySheet`'s `naming` block).

- [ ] **Step 1: Add the `👥 Groups` entry to LibrarySheet**

In `src/components/LibrarySheet.tsx`: add `onOpenGroups: () => void` to `Props` (near `onOpenCloudSync`), destructure it, and add a button in the action `.btn-row` area (after "Join a shared album", before/again matching the `☁️ Cloud sync` style):

```tsx
<button type="button" className="btn full" style={{ marginTop: 8 }} onClick={onOpenGroups}>
  👥 Groups
</button>
```

- [ ] **Step 2: Wire App state + mount**

In `src/App.tsx`: add `const [groupsOpen, setGroupsOpen] = useState(false);` alongside the other surface booleans. Pass `onOpenGroups={() => { setLibraryOpen(false); setGroupsOpen(true); }}` to `<LibrarySheet .../>` (replace-the-sheet handoff, matching `onOpenCloudSync`). Mount near the other sheets:

```tsx
{groupsOpen && <AlbumGroupsSheet onClose={() => setGroupsOpen(false)} />}
```

Import `AlbumGroupsSheet` at the top.

- [ ] **Step 3: Build `AlbumGroupsSheet.tsx`**

Create `src/components/AlbumGroupsSheet.tsx`. Key wiring:

```tsx
import { useMemo, useState } from 'react';
import { useCollection, orderAlbums } from '../store/collectionStore';
import { useSyncMeta } from '../store/syncStore';
import { forcedReadOnly } from '../sync/albumMode';
import { useAlbumMode, useResolvedAlbumName } from '../sync/useAlbumMode';
import { MODE_BADGE } from '../sync/albumMode';
import { computeStatsFor, /* Stats */ } from '../utils/stats';
import { displayPct } from '../utils/displayPct';
import { monogram, coverTint } from '../utils/albumCover';
import type { AlbumGroup } from '../types';
```

- Read `albums`, `albumOrder`, `groups`, and actions `createGroup`/`renameGroup`/`setGroupMembers`/`disbandGroup` via narrow selectors.
- Local state: `editing: AlbumGroup | null`, `creating: boolean`, `name: string`, `selected: Set<string>`.
- `ordered = useMemo(() => orderAlbums(albums, albumOrder), [albums, albumOrder])`.
- A member-row subcomponent that, per album, uses `useAlbumMode(album.id)` + `useResolvedAlbumName(...)` + `useSyncMeta(s => s.albumLinks[album.id])` to show the card and a `view-only` badge when `forcedReadOnly(link)`. Progress via `computeStatsFor(album.counts, album.edition, album.trackCC)` → `displayPct`.
- `writableCount = [...selected].filter(id => !forcedReadOnly(albumLinks[id])).length`; Save `disabled={writableCount < 2}`.
- List view: groups.map → row with name, `${g.memberIds.length} members`, Edit → opens form seeded from the group, Disband → confirm → `disbandGroup(g.id)`.
- Empty state when `groups.length === 0`: a short explainer + the New group button.

> Note: calling `useAlbumMode`/`useResolvedAlbumName`/`useSyncMeta` **per row** means the member row must be its own component (Rules of Hooks — no hooks inside `.map` callbacks). Mirror how `AlbumCard` is a standalone component used inside `LibrarySheet`'s map.

- [ ] **Step 4: Typecheck**

Run: `npx tsc -b`
Expected: clean.

- [ ] **Step 5: Browser-verify (spec §G precondition + regression)**

Run: `npm run dev`, open the printed URL. Create two albums **Leo** and **Kai** (Library → ＋ New album ×2). Then Library → **👥 Groups → New group** → name **Kids** → select Leo + Kai → **Save**.
- ✓ Group **Kids** appears in the list with "2 members".
- ✓ With only one album selected, **Save** is disabled.
- ✓ Edit → rename works and persists after closing/reopening the sheet.
- ✓ Reload the page — the group persists (localStorage).

- [ ] **Step 6: Commit**

```bash
git add src/components/AlbumGroupsSheet.tsx src/components/LibrarySheet.tsx src/App.tsx
git commit -m "feat(groups): Album Groups management sheet + Library entry"
```

---

### Task 4: SwapsView combined lens (toggle + combined list + internal moves + share)

When the active album is a writable, resolvable member of a group with ≥ 2 resolvable members, show a `.mini-seg` toggle `[ <album> | <group> (both) ]`. The group side shows combined swaps, a "New combined swap" button, a "Share combined list" action, and an Internal-moves panel.

**Files:**
- Modify: `src/components/SwapsView.tsx`
- Create: `src/components/InternalMovesPanel.tsx`

**Interfaces:**
- Consumes: `useGroupMembers` (Task 1), `groupForAlbum` (Task 1), `computeGroupPool`/`GroupPool` (`groupSwap.ts`), `applyInternalMove(fromId, toId, stickerId)` (store), `buildGroupListExport` (Task 2), `copyToClipboard` (`src/utils/share`), `labelFor` (`src/utils/group.ts:20`), existing `SwapCard`/`SwapDetail`/`NewSwapDialog`.
- Produces: `InternalMovesPanel` (props `{ moves: InternalMove[]; members: ResolvedGroupMember[]; onApply: (m: InternalMove) => void }`); combined `GroupSwapCtx` (Task 1) passed into `NewSwapDialog`/`SwapDetail`.

- [ ] **Step 1: Build `InternalMovesPanel.tsx`**

```tsx
import type { InternalMove } from '../utils/groupSwap';
import type { ResolvedGroupMember } from '../sync/groupMembers';
import { labelFor } from '../utils/group';

interface Props {
  moves: InternalMove[];
  members: ResolvedGroupMember[];
  onApply: (m: InternalMove) => void;
}

export default function InternalMovesPanel({ moves, members, onApply }: Props) {
  if (moves.length === 0) return null;
  const nameOf = (id: string) => members.find((m) => m.id === id)?.name ?? id;
  return (
    <div className="internal-moves">
      <div className="section-title">Internal moves ({moves.length})</div>
      {moves.map((m, i) => (
        <div className="internal-move-row" key={`${m.id}-${m.fromId}-${m.toId}-${i}`}>
          <span>{labelFor(m.id)}: {nameOf(m.fromId)} → {nameOf(m.toId)}</span>
          <button type="button" className="btn" onClick={() => onApply(m)}>Apply</button>
        </div>
      ))}
    </div>
  );
}
```

- [ ] **Step 2: Add the lens to `SwapsView.tsx`**

- Read `activeAlbumId = useCollection(s => s.activeAlbumId)`, `groups = useCollection(s => s.groups)`, `applyInternalMove = useCollection(s => s.applyInternalMove)`.
- `const group = groupForAlbum(groups, activeAlbumId);`
- `const gm = useGroupMembers(group?.id);` (hook accepts `undefined`).
- `const canLens = !readOnly && !!gm && gm.members.length >= 2;` (active writable member of a resolvable group.)
- `const [lens, setLens] = useState<'album' | 'group'>('album');` — guard usage with `canLens` so it silently falls back to album view when the group goes inert.
- When `canLens`, render the `.mini-seg` toggle above the toolbar:

```tsx
{canLens && (
  <span className="mini-seg lens-seg" role="group" aria-label="Swap scope">
    <button type="button" className={lens === 'album' ? 'on' : ''} aria-pressed={lens === 'album'} onClick={() => setLens('album')}>{albumName}</button>
    <button type="button" className={lens === 'group' ? 'on' : ''} aria-pressed={lens === 'group'} onClick={() => setLens('group')}>{gm!.group.name} (both)</button>
  </span>
)}
```
(`albumName` from `useCollection(s => s.albumName)`.)

- When `canLens && lens === 'group'`, render the **combined view** instead of the album swaps list:
  - `const pool = useMemo(() => computeGroupPool(gm!.members), [gm]);`
  - `const combinedCtx: GroupSwapCtx = { groupId: gm!.group.id, members: gm!.members };`
  - Combined swaps come from `gm!.group.swaps` — split open/closed and render with the existing `SwapCard` (compute conflicts is solo-only; pass `conflicts={0}` for combined cards or skip the banner — combined conflicts are out of scope for Stage 4).
  - Toolbar: `＋ New combined swap` → `setCreating(true)` (NewSwapDialog gets `groupCtx={combinedCtx}`); `🔗 Share combined list` → `copyToClipboard(buildGroupListExport(pool, gm!.group.name))` with a transient "Copied" confirmation (mirror existing copy affordances).
  - `<InternalMovesPanel moves={pool.internalMoves} members={gm!.members} onApply={(mv) => applyInternalMove(mv.fromId, mv.toId, mv.id)} />`.
  - The detail modal for a combined swap opens `<SwapDetail swap={liveOpenSwap} groupCtx={combinedCtx} onClose={...} />`; re-read the live swap from `gm!.group.swaps` (not top-level `swaps`) so edits reflect.
- When `lens === 'album'` (or `!canLens`), the existing album view is unchanged; `NewSwapDialog`/`SwapDetail` are mounted **without** `groupCtx`.

> Because `useGroupMembers`/`computeGroupPool` run every render, keep them above the early `readOnly` returns and memoize the pool. Do not call hooks conditionally.

- [ ] **Step 3: Typecheck**

Run: `npx tsc -b`
Expected: clean (this will surface the `groupCtx` prop needs on `NewSwapDialog`/`SwapDetail` — added in Tasks 5–6; if implementing strictly in order, temporarily add the optional prop stubs, or implement Tasks 5–6 before this typecheck. Recommended order: 4 → 5 → 6, typecheck at the end of 6).

- [ ] **Step 4: Browser-verify (spec §G scenarios 1 & 3, regression)**

Run: `npm run dev`. With the **Kids** group from Task 3:
- Scenario 1 (Internal move): Leo `MEX-7`×2, Kai ×0 → open **Kids** lens → `MEX-7` appears under **Internal moves** (Leo→Kai) and in neither give nor get; **Apply** → Leo ×1, Kai ×1 (verify on each album's Album tab).
- Scenario 3 (Surplus + internal): Leo `MEX-9`×3, Kai ×0 → Kids lens → `MEX-9` under Internal moves (Leo→Kai) **and** the Share-combined-list text offers it under "To Swap".
- Regression: an album in **no** group shows **no** toggle and behaves exactly as before.

- [ ] **Step 5: Commit** (after Tasks 5–6 typecheck clean, or now if prop stubs are in place)

```bash
git add src/components/SwapsView.tsx src/components/InternalMovesPanel.tsx
git commit -m "feat(groups): combined lens on Swaps tab + internal-moves panel"
```

---

### Task 5: NewSwapDialog group mode

Reuse `NewSwapDialog` for combined swaps: run candidates against the pool (`computeGroupCandidates`), support two-sided quantities (receive side can be ×N), roll up reservations across the group's combined swaps + each member's solo swaps, and persist via `createCombinedSwap`/`updateCombinedSwap`.

**Files:**
- Modify: `src/components/NewSwapDialog.tsx`

**Interfaces:**
- Consumes: `GroupSwapCtx` (Task 1); `computeGroupCandidates(members, parsed, reservations)` (`groupSwap.ts:100`); `computeReservations(swaps, excludeId)` (`swap.ts:66`); store `createCombinedSwap(groupId, input)` / `updateCombinedSwap(groupId, swapId, patch)`; `useCollection(s => s.groups.find(g => g.id === ctx.groupId)?.swaps)`.
- Produces: `NewSwapDialog` gains optional prop `groupCtx?: GroupSwapCtx`.

- [ ] **Step 1: Add the prop + branch data source**

Add `groupCtx?: GroupSwapCtx` to `Props`. When `groupCtx` is set:
- `reservationSwaps = [...(groupSwaps ?? []), ...groupCtx.members.flatMap(m => m.swaps)]` where `groupSwaps = useCollection(s => s.groups.find(g => g.id === groupCtx.groupId)?.swaps ?? [])`.
- `reservations = useMemo(() => computeReservations(reservationSwaps, editSwap?.id), [reservationSwaps, editSwap])`.
- `candidates = useMemo(() => parsed ? computeGroupCandidates(groupCtx.members, parsed, reservations) : null, [parsed, groupCtx, reservations])`.
- Solo path is unchanged: when `groupCtx` is undefined, keep `computeCandidates(counts, parsed, reservations)` with `computeReservations(swaps, editSwap?.id)`.

> `GroupCandidates` (`groupSwap.ts:86`) has the same `youGive/giveQty/giveReserved/getReserved` fields as `SwapCandidates` **plus** `getQty`. Read `getQty` only in group mode.

- [ ] **Step 2: Receive-side quantities in the UI**

The get side currently assumes 1 copy per id. In group mode:
- `getQty` state seeded from `candidates.getQty` (like `giveQty` is seeded from `candidates.giveQty`). In `findMatches`, set `getQty = new Map(Object.entries(c.getQty))` when `groupCtx`.
- Pass `quantities={getQty}` to the "you get" `<StickerChips>` in group mode so ×N badges show (`StickerChips` already supports `quantities`).
- Section total: in group mode show copies via `sumCopies(get, getQty)` instead of `get.size`.

- [ ] **Step 3: Persist via the group action**

In `save()`, when `groupCtx`:
- Build `receivingQty` = `{ [id]: n }` for ids still in `get` with `n = getQty.get(id) ?? 1` and `n > 1`.
- Build the input object: `{ name, notes, theirNeeds: parsed.needs, theirSwaps: parsed.swaps, theirNeedsQty: parsed.needQty, giving: [...give], receiving: [...get], givingQty, receivingQty }`.
- `editSwap ? updateCombinedSwap(groupCtx.groupId, editSwap.id, input) : createCombinedSwap(groupCtx.groupId, input)`.
- Solo path unchanged (`createSwap`/`updateSwap`).

- [ ] **Step 4: Typecheck**

Run: `npx tsc -b`
Expected: clean.

- [ ] **Step 5: Browser-verify (spec §G scenarios 2 & 4)**

Run: `npm run dev`. With **Kids**:
- Scenario 2 (Get ×2): Leo & Kai `MEX-3`×0 → Kids → New combined swap → paste `MEX 🇲🇽: 3 (×2)` (a list where the other collector offers 2× MEX-3) → Find matches → **You can get** shows `MEX-3` **×2**.
- Scenario 4 (Mixed CC): Leo trackCC on & `CC-5`×0, Kai trackCC off → Kids swap vs a list offering `CC-5` → `CC-5` offered as get (target 1, Leo only); Kai never involved.
- Scenario 8 (Reservation): promise Leo's `MEX-9` spare in a **solo** Leo swap (leave open) → Kids → New combined swap vs a list needing `MEX-9` → `MEX-9` not auto-offered / ⚠️-flagged.

- [ ] **Step 6: Commit**

```bash
git add src/components/NewSwapDialog.tsx
git commit -m "feat(groups): NewSwapDialog group mode (pool candidates + two-sided qty)"
```

---

### Task 6: SwapDetail + SwapClose group mode (settlement routing)

Thread `groupCtx` through `SwapDetail` into `SwapClose`; in group mode `SwapClose` routes received/given copies to albums (`routeReceived`/`routeGiven`), builds `settledByAlbum`, shows `[change ▾]` for ambiguous receives and `🤝 give to <owner> — not recorded` for view-only needs, and calls `closeCombinedSwap`. Rollback/delete/export use the group actions.

**Files:**
- Modify: `src/components/SwapDetail.tsx`
- Modify: `src/components/SwapClose.tsx`

**Interfaces:**
- Consumes: `GroupSwapCtx`; `routeReceived(members, received)` / `routeGiven(members, given, reservedSpares?)` (`groupSwap.ts`); `computeReservations` per member for `reservedSpares`; store `closeCombinedSwap(groupId, swapId, settled)`, `rollbackCombinedSwap(groupId, swapId)`, `updateCombinedSwap`, `deleteCombinedSwap`; `buildSwapExport`.
- Produces: `SwapDetail` and `SwapClose` gain optional `groupCtx?: GroupSwapCtx`.

- [ ] **Step 1: Thread `groupCtx` through SwapDetail**

Add `groupCtx?: GroupSwapCtx` to `SwapDetail` `Props`. In group mode, swap the store actions it calls: rollback → `rollbackCombinedSwap(groupCtx.groupId, swap.id)`; delete → `deleteCombinedSwap(...)`; edit opens `<NewSwapDialog editSwap={swap} groupCtx={groupCtx} .../>`; "Mark as swapped" opens `<SwapClose swap={swap} groupCtx={groupCtx} .../>`. Export (`buildSwapExport`) is unchanged (id-based). Solo mode keeps `rollbackSwap`/`deleteSwap`/etc.

- [ ] **Step 2: Group-mode receive routing in SwapClose**

Add `groupCtx?: GroupSwapCtx` to `SwapClose` `Props`. In group mode:
- Build `received: Record<string, number>` from the checked receive ids and `swap.receivingQty` (default 1 per id).
- `const routing = routeReceived(groupCtx.members, received);` (recompute when the user overrides an ambiguous assignment — keep an override map `Record<stickerId, chosenAlbumId>` and apply it over `routing.writes` before settling).
- Render the received list per copy: for each id show `→ <memberName>` from `routing.writes`; when the id is in `routing.ambiguous`, render a `[change ▾]` `<select>` over `options` that updates the override map; for each `routing.handoffs` entry render `🤝 give to <memberName> — not recorded` (no count written).

- [ ] **Step 3: Group-mode give routing + settle**

- `reservedSpares: Record<string, Record<string, number>>` = for each member, `Object.fromEntries(computeReservations(member.swaps).committedGive)` keyed by member id (honours each album's solo give-floor).
- `given: Record<string, number>` from checked give ids and `giveQty`.
- `const giveRouting = routeGiven(groupCtx.members, given, reservedSpares);`
- Merge into `settledByAlbum`: start from `routing.writes` (positive) then add `giveRouting.writes` (negative) — `addWrite`-style merge (same albumId+stickerId sums).
- Call `closeCombinedSwap(groupCtx.groupId, swap.id, { givenIds: [...given], receivedIds: [...received-ids], giveQty: settledGiveQty, receiveQty: received, settledByAlbum })`.
- The "You gave" side shows a quiet `from <memberName>` label (from `giveRouting.writes`) and **no** override control (give is fully automatic per §D).

- [ ] **Step 4: Typecheck + full suite**

Run: `npx tsc -b && npm test`
Expected: tsc clean; all existing tests (256) still pass.

- [ ] **Step 5: Browser-verify (spec §G scenarios 5, 6, 7, 9)**

Run: `npm run dev`. With **Kids**:
- Scenario 5 (both-need, 1 copy): Leo & Kai `MEX-7`×0; combined swap receiving 1× `MEX-7` → Mark as swapped → auto → **Leo** (first member) with `→ Kai [change ▾]`; confirm → chosen ×1, other still 0.
- Scenario 6 (two copies): Leo & Kai `MEX-3`×0; receiving 2× `MEX-3` → +1 to **each**, no prompt.
- Scenario 7 (give auto): Leo `MEX-9`×2, Kai ×1; combined swap giving 1× `MEX-9` → decrements **Leo** (holder), "from Leo" label, **no** override control.
- Scenario 9 (rollback): close scenario 5's swap → swap detail → rollback → per-album counts revert exactly.

- [ ] **Step 6: Commit**

```bash
git add src/components/SwapDetail.tsx src/components/SwapClose.tsx src/components/SwapsView.tsx src/components/InternalMovesPanel.tsx
git commit -m "feat(groups): combined swap settlement routing (SwapDetail + SwapClose group mode)"
```

---

### Task 7: CSS for the new surfaces

Style the lens toggle, internal-moves panel, group member cards, and group list in `src/styles.css`, matching the existing token/class conventions (`--bg-elev-2`, `--green-bright`, `--border`, `--text-dim`).

**Files:**
- Modify: `src/styles.css`

- [ ] **Step 1: Add styles**

- `.lens-seg` — override `.mini-seg { margin-left: auto }` so the lens spans full width above the toolbar: `.lens-seg { margin-left: 0; width: 100%; display: flex; margin-bottom: 10px; } .lens-seg button { flex: 1; }`.
- `.internal-moves` — a card (`background: var(--bg-elev); border: 1px solid var(--border); border-radius: var(--radius); padding: 10px; margin-top: 12px;`); `.internal-move-row { display: flex; align-items: center; justify-content: space-between; gap: 8px; padding: 6px 0; }`.
- `.group-member-badge` (view-only tag) — reuse the pill look: `font-size: .72rem; color: var(--text-dim); border: 1px solid var(--border); border-radius: 999px; padding: 1px 7px;`.
- `.close-route` / `.close-handoff` — small dim rows under a received sticker for the `→ album` / `🤝 give to owner` lines; a compact `select.route-change`.
- Any group-list row spacing needed by `AlbumGroupsSheet`.

- [ ] **Step 2: Browser-verify (light + dark)**

Run: `npm run dev`. Toggle the theme (header) and confirm the lens toggle, internal-moves panel, member cards, and close-screen route/hand-off rows read cleanly in both themes and don't cause horizontal scroll on a narrow (mobile) viewport.

- [ ] **Step 3: Commit**

```bash
git add src/styles.css
git commit -m "style(groups): CSS for lens, internal moves, member cards, close routing"
```

---

### Task 8: Full §G smoke test + suite gate

Run the complete acceptance script and the automated gate; fix any gaps before declaring Stage 4 done.

**Files:** none (verification only).

- [ ] **Step 1: Automated gate**

Run: `npx tsc -b && npm test`
Expected: tsc clean; full suite green (≥ 256 tests, plus the new `groupMembers`/`buildGroupListExport` tests).

- [ ] **Step 2: Single-device §G scenarios**

Run: `npm run dev` and execute §G scenarios **1–9 and 12** end-to-end (they're single-profile). Scenario 12 (Member delete): delete **Kai** → Kai pruned from **Kids**, group auto-disbands (< 2 members). Confirm the **Regression** line: an album in no group shows no lens toggle.

- [ ] **Step 3: Multi-device scenarios (best-effort)**

Scenarios 10 (collaborative member), 11 (view-only member), 13 (cross-device group) need two browser profiles sharing a Cloud/Shared code. Run them if two profiles are available; otherwise record them as **manually deferred** in the handoff and confirm the view-only/collaborative code paths at least render correctly with a locally-simulated read-only link (Scenario 11's `🤝 give to owner` reminder is the key visual to verify).

- [ ] **Step 4: Update the handoff + finish**

Mark Stage 4 done in `docs/superpowers/plans/2026-07-24-album-group-combined-swaps-HANDOFF.md`. Then invoke `superpowers:finishing-a-development-branch` to decide integration.

```bash
git add docs/superpowers/plans/2026-07-24-album-group-combined-swaps-HANDOFF.md
git commit -m "docs(groups): Stage 4 UI complete; smoke test run"
```

---

## Self-Review

**Spec coverage (§E + §G):**
- §E group management → Task 3. §E combined lens (toggle, combined swaps, share list, internal moves) → Task 4. §C New Swap group mode → Task 5. §D settlement routing (ambiguous `[change ▾]`, view-only hand-offs, automatic gives) → Task 6. Combined export → Task 2 (+ wired in Task 4). CSS → Task 7. §G smoke test → per-task browser checks + Task 8.
- §A storage/sync, §B pool math, §C `computeGroupCandidates`, §D routing helpers, `mergeGroups` — **already shipped in Stages 1–3**, consumed here, not rebuilt.
- View-only membership: enforced in Task 3 (picker/save gate), Task 5 (`getQty` from writable surplus only — already handled inside `computeGroupCandidates`), Task 6 (`routeReceived.handoffs`).

**Placeholder scan:** pure-function tasks (1, 2) carry full code + tests. Component tasks (3–7) carry exact prop signatures, store-action names, class names, and per-step browser-verification tied to numbered §G scenarios rather than "add error handling."

**Type consistency:** `GroupSwapCtx`/`ResolvedGroupMember` defined once in Task 1 and consumed by Tasks 4/5/6. Store action names verified against `collectionStore.ts` (`createCombinedSwap`, `updateCombinedSwap`, `closeCombinedSwap`, `rollbackCombinedSwap`, `deleteCombinedSwap`, `applyInternalMove`, `createGroup`, `renameGroup`, `setGroupMembers`, `disbandGroup`). Pool/routing signatures verified against `groupSwap.ts` (`computeGroupPool`, `computeGroupCandidates`, `routeReceived`, `routeGiven`). `GroupCandidates.getQty` is the group-only receive quantity → `Swap.receivingQty`.

**Known ordering note:** Task 4's typecheck depends on the optional `groupCtx` props added in Tasks 5–6. Implement 4→5→6 and run the full `tsc -b` at the end of Task 6 (or add the optional prop signatures first). Combined-swap conflict banners are intentionally out of scope for Stage 4 (solo `computeConflicts` only).
