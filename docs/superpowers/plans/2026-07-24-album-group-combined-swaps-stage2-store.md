# Album Groups & Combined Swaps — Stage 2: Store actions — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans (inline) to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Add `groups` state and the store actions that manage groups, combined swaps, combined settlement (per-album deltas via an active-or-parked helper), internal moves, and member-delete pruning — all vitest-tested.

**Architecture:** The store stays a thin mechanic. Combined settlement receives a pre-computed `settledByAlbum` map (the Stage 4 UI builds it from Stage 1's `routeReceived`/`routeGiven`) and applies it across the active (top-level) album and parked `albums` via a new `applyAlbumDeltas` helper — the same active-or-parked pattern as `applyMergedAlbum`. Group routing/writable logic is NOT here (it needs sync metadata; it lives in Stage 4).

**Tech Stack:** Zustand + persist, Vitest.

Spec §A (storage, active/parked hazard), §D (settlement). Consumes Stage 1 types (`AlbumGroup`, `Swap.receivingQty`, `Swap.settledByAlbum`).

## Global Constraints

- Vitest store tests follow [collectionStore.test.ts](../../../src/store/collectionStore.test.ts): seed with `useCollection.setState({...} as any, false)`, act via `useCollection.getState().fn()`, assert via `useCollection.getState()`.
- `groups` is **top-level** state (not per-album) — it is NOT part of `snapshotActive`/`loadSnapshot`. Persisted locally by the existing persist config; **sync wiring is Stage 3** (do not touch `serialize.ts`/`payload.ts`/`merge.ts` here).
- Counts are clamped `≥ 0` (`clampCount`). Combined writes never mutate inputs.
- Reuse `newId()` and `Date.now()` exactly as existing swap actions do.

## File Structure

- **Modify** [src/store/collectionStore.ts](../../../src/store/collectionStore.ts) — `groups` state + `AlbumGroup` import; `applyAlbumDeltas` helper; group CRUD; combined-swap CRUD; `closeCombinedSwap`/`rollbackCombinedSwap`; `applyInternalMove`; `deleteAlbum` pruning.
- **Modify** [src/store/collectionStore.test.ts](../../../src/store/collectionStore.test.ts) — tests for the above.

---

### Task 1: `groups` state + group CRUD

**Files:** Modify `collectionStore.ts`, `collectionStore.test.ts`

**Interfaces:**
- Produces on the store: `groups: AlbumGroup[]`; `createGroup(name: string, memberIds: string[]): string`; `renameGroup(id: string, name: string): void`; `setGroupMembers(id: string, memberIds: string[]): void`; `disbandGroup(id: string): void`.

- [ ] **Step 1: Import the type.** In `collectionStore.ts`, extend the types import:

```ts
import type { AlbumGroup, Counts, Edition, Swap } from '../types';
```

- [ ] **Step 2: Declare state + action signatures.** In `interface CollectionState`, after the `albumOrder?: string[];` field add:

```ts
  /** User-defined album groups for combined swapping. Synced in a later stage. */
  groups: AlbumGroup[];
```

And in the actions section (after `reorderAlbums`), add:

```ts
  // Album groups (combined swapping)
  createGroup: (name: string, memberIds: string[]) => string;
  renameGroup: (id: string, name: string) => void;
  setGroupMembers: (id: string, memberIds: string[]) => void;
  disbandGroup: (id: string) => void;
```

- [ ] **Step 3: Initialize + implement.** In the store creator, add `groups: [],` next to `albums: [...]`. Then add the actions (place them after `reorderAlbums`):

```ts
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
```

- [ ] **Step 4: Write the tests.** Append to `collectionStore.test.ts`:

```ts
import type { AlbumGroup } from '../types';

describe('group CRUD', () => {
  beforeEach(() => {
    useCollection.setState({ groups: [] } as any, false);
  });

  it('creates a group with trimmed name and members, returning its id', () => {
    const id = useCollection.getState().createGroup('  Kids  ', ['A', 'S']);
    const g = useCollection.getState().groups.find((x) => x.id === id)!;
    expect(g.name).toBe('Kids');
    expect(g.memberIds).toEqual(['A', 'S']);
    expect(g.swaps).toEqual([]);
  });

  it('renames, replaces members, and disbands', () => {
    const id = useCollection.getState().createGroup('G', ['A', 'S']);
    useCollection.getState().renameGroup(id, 'Family');
    useCollection.getState().setGroupMembers(id, ['A', 'S', 'B']);
    let g = useCollection.getState().groups.find((x) => x.id === id)!;
    expect(g.name).toBe('Family');
    expect(g.memberIds).toEqual(['A', 'S', 'B']);
    useCollection.getState().disbandGroup(id);
    expect(useCollection.getState().groups.find((x) => x.id === id)).toBeUndefined();
  });
});
```

- [ ] **Step 5: Run + commit.**

Run: `npx vitest run src/store/collectionStore.test.ts` → PASS. Run: `npx tsc -b` → no errors.

```bash
git add src/store/collectionStore.ts src/store/collectionStore.test.ts
git commit -m "feat(groups): groups state + group CRUD actions"
```

---

### Task 2: `applyAlbumDeltas` helper + `applyInternalMove`

**Files:** Modify `collectionStore.ts`, `collectionStore.test.ts`

**Interfaces:**
- Produces (module-internal): `applyAlbumDeltas(s: CollectionState, deltas: Record<string, Record<string, number>>): { counts?: Counts; albums?: AlbumSnapshot[] }`.
- Produces on the store: `applyInternalMove(fromId: string, toId: string, stickerId: string): void`.

- [ ] **Step 1: Implement the helper.** In `collectionStore.ts`, after the `withActivity` function, add:

```ts
/**
 * Apply per-album count deltas (albumId -> stickerId -> ±n) across the active album
 * (top-level `counts`) and any parked `albums`, clamped ≥ 0. The active album's counts
 * live only at the top level (its parked snapshot is refreshed on switch), so its delta
 * is applied there and skipped in the `albums` map. Returns just the fields that changed.
 */
function applyAlbumDeltas(
  s: CollectionState,
  deltas: Record<string, Record<string, number>>,
): { counts?: Counts; albums?: AlbumSnapshot[] } {
  const patch: { counts?: Counts; albums?: AlbumSnapshot[] } = {};
  const activeDelta = deltas[s.activeAlbumId];
  if (activeDelta) {
    const counts = { ...s.counts };
    for (const [id, d] of Object.entries(activeDelta)) counts[id] = clampCount((counts[id] ?? 0) + d);
    patch.counts = counts;
  }
  const touchesParked = s.albums.some((a) => a.id !== s.activeAlbumId && deltas[a.id]);
  if (touchesParked) {
    patch.albums = s.albums.map((a) => {
      const d = a.id === s.activeAlbumId ? undefined : deltas[a.id];
      if (!d) return a;
      const counts = { ...a.counts };
      for (const [id, n] of Object.entries(d)) counts[id] = clampCount((counts[id] ?? 0) + n);
      return { ...a, counts };
    });
  }
  return patch;
}
```

- [ ] **Step 2: Declare + implement `applyInternalMove`.** Add the signature in `CollectionState` (after `disbandGroup`):

```ts
  /** Record a physical internal move of one copy of `stickerId` from one album to another. */
  applyInternalMove: (fromId: string, toId: string, stickerId: string) => void;
```

And the action (after `disbandGroup`):

```ts
      applyInternalMove: (fromId, toId, stickerId) =>
        set((s) => applyAlbumDeltas(s, { [fromId]: { [stickerId]: -1 }, [toId]: { [stickerId]: 1 } })),
```

- [ ] **Step 2b: Split `snapshotActive` for the test seed.** (No code change — note that tests seed both the top-level and the parked `albums` entry for the active album, because top-level counts are authoritative for the active album.)

- [ ] **Step 3: Write the tests.** Append to `collectionStore.test.ts`:

```ts
describe('applyInternalMove', () => {
  beforeEach(() => {
    useCollection.setState({
      counts: { 'MEX-7': 2 }, activeAlbumId: 'A',
      albums: [snap('A', { counts: { 'MEX-7': 2 } }), snap('B', { counts: { 'MEX-7': 0 } })],
    } as any, false);
  });

  it('moves a copy from the active album to a parked album', () => {
    useCollection.getState().applyInternalMove('A', 'B', 'MEX-7');
    const st = useCollection.getState();
    expect(st.counts['MEX-7']).toBe(1); // active decremented at top level
    expect(st.albums.find((a) => a.id === 'B')!.counts['MEX-7']).toBe(1); // parked incremented
  });

  it('moves a copy between two parked albums without touching the active mirror', () => {
    useCollection.setState({
      counts: { 'MEX-7': 9 }, activeAlbumId: 'A',
      albums: [snap('A', { counts: { 'MEX-7': 9 } }), snap('B', { counts: { 'MEX-7': 3 } }), snap('C', { counts: { 'MEX-7': 0 } })],
    } as any, false);
    useCollection.getState().applyInternalMove('B', 'C', 'MEX-7');
    const st = useCollection.getState();
    expect(st.counts['MEX-7']).toBe(9); // active untouched
    expect(st.albums.find((a) => a.id === 'B')!.counts['MEX-7']).toBe(2);
    expect(st.albums.find((a) => a.id === 'C')!.counts['MEX-7']).toBe(1);
  });
});
```

- [ ] **Step 4: Run + commit.**

Run: `npx vitest run src/store/collectionStore.test.ts` → PASS. `npx tsc -b` → clean.

```bash
git add src/store/collectionStore.ts src/store/collectionStore.test.ts
git commit -m "feat(groups): applyAlbumDeltas helper + applyInternalMove"
```

---

### Task 3: combined-swap CRUD

**Files:** Modify `collectionStore.ts`, `collectionStore.test.ts`

**Interfaces:**
- Produces on the store:
  - `createCombinedSwap(groupId: string, input: { name: string; notes?: string; theirNeeds: string[]; theirSwaps: string[]; theirNeedsQty?: Record<string, number>; giving: string[]; receiving: string[]; givingQty?: Record<string, number>; receivingQty?: Record<string, number> }): string`
  - `updateCombinedSwap(groupId: string, swapId: string, patch: { name?: string; notes?: string; giving?: string[]; receiving?: string[]; givingQty?: Record<string, number>; receivingQty?: Record<string, number>; theirNeeds?: string[]; theirSwaps?: string[]; theirNeedsQty?: Record<string, number>; deselectedGiving?: string[]; deselectedReceiving?: string[] }): void`
  - `deleteCombinedSwap(groupId: string, swapId: string): void`

- [ ] **Step 1: Declare the signatures** in `CollectionState` (after `applyInternalMove`):

```ts
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
```

- [ ] **Step 2: Implement.** Add a helper above the store and the three actions (after `applyInternalMove`):

```ts
/** Map over a group's swaps by id, replacing the matched swap with `fn(swap)`. */
function patchGroupSwap(
  groups: AlbumGroup[], groupId: string, swapId: string, fn: (sw: Swap) => Swap,
): AlbumGroup[] {
  return groups.map((g) =>
    g.id !== groupId ? g : { ...g, swaps: g.swaps.map((sw) => (sw.id === swapId ? fn(sw) : sw)) },
  );
}
```

```ts
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
```

- [ ] **Step 3: Tests.** Append to `collectionStore.test.ts`:

```ts
describe('combined-swap CRUD', () => {
  let gid: string;
  beforeEach(() => {
    useCollection.setState({ groups: [] } as any, false);
    gid = useCollection.getState().createGroup('Kids', ['A', 'B']);
  });

  it('creates a combined swap on the group with receivingQty', () => {
    const sid = useCollection.getState().createCombinedSwap(gid, {
      name: 'Carlos', theirNeeds: [], theirSwaps: [], giving: ['MEX-9'], receiving: ['MEX-3'],
      receivingQty: { 'MEX-3': 2 },
    });
    const g = useCollection.getState().groups.find((x) => x.id === gid)!;
    expect(g.swaps[0].id).toBe(sid);
    expect(g.swaps[0].receiving).toEqual(['MEX-3']);
    expect(g.swaps[0].receivingQty).toEqual({ 'MEX-3': 2 });
    expect(g.swaps[0].status).toBe('open');
  });

  it('updates and deletes a combined swap', () => {
    const sid = useCollection.getState().createCombinedSwap(gid, {
      name: 'x', theirNeeds: [], theirSwaps: [], giving: [], receiving: [],
    });
    useCollection.getState().updateCombinedSwap(gid, sid, { name: 'Renamed', giving: ['MEX-1'] });
    let g = useCollection.getState().groups.find((x) => x.id === gid)!;
    expect(g.swaps[0].name).toBe('Renamed');
    expect(g.swaps[0].giving).toEqual(['MEX-1']);
    useCollection.getState().deleteCombinedSwap(gid, sid);
    g = useCollection.getState().groups.find((x) => x.id === gid)!;
    expect(g.swaps).toEqual([]);
  });
});
```

- [ ] **Step 4: Run + commit.**

Run: `npx vitest run src/store/collectionStore.test.ts` → PASS. `npx tsc -b` → clean.

```bash
git add src/store/collectionStore.ts src/store/collectionStore.test.ts
git commit -m "feat(groups): combined-swap CRUD (create/update/delete)"
```

---

### Task 4: `closeCombinedSwap` + `rollbackCombinedSwap`

**Files:** Modify `collectionStore.ts`, `collectionStore.test.ts`

**Interfaces:**
- Produces on the store:
  - `closeCombinedSwap(groupId: string, swapId: string, settled: { givenIds: string[]; receivedIds: string[]; giveQty?: Record<string, number>; receiveQty?: Record<string, number>; settledByAlbum: Record<string, Record<string, number>> }): void`
  - `rollbackCombinedSwap(groupId: string, swapId: string): void`
- Consumes: `applyAlbumDeltas` (Task 2), `patchGroupSwap` (Task 3).

- [ ] **Step 1: Declare the signatures** in `CollectionState` (after `deleteCombinedSwap`):

```ts
  closeCombinedSwap: (
    groupId: string, swapId: string,
    settled: {
      givenIds: string[]; receivedIds: string[];
      giveQty?: Record<string, number>; receiveQty?: Record<string, number>;
      settledByAlbum: Record<string, Record<string, number>>;
    },
  ) => void;
  rollbackCombinedSwap: (groupId: string, swapId: string) => void;
```

- [ ] **Step 2: Implement** (after `deleteCombinedSwap`):

```ts
      closeCombinedSwap: (groupId, swapId, settled) =>
        set((s) => {
          const group = s.groups.find((g) => g.id === groupId);
          if (!group || !group.swaps.some((sw) => sw.id === swapId)) return s;
          const patch = applyAlbumDeltas(s, settled.settledByAlbum);
          const groups = patchGroupSwap(s.groups, groupId, swapId, (sw) => ({
            ...sw,
            status: 'closed',
            closedAt: Date.now(),
            giving: settled.givenIds,
            receiving: settled.receivedIds,
            givingQty: settled.giveQty,
            receivingQty: settled.receiveQty,
            settledByAlbum: settled.settledByAlbum,
            deselectedGiving: [],
            deselectedReceiving: [],
          }));
          return { ...patch, groups };
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
          const patch = applyAlbumDeltas(s, reversed);
          const groups = patchGroupSwap(s.groups, groupId, swapId, (sw) => ({
            ...sw,
            status: 'open',
            closedAt: undefined,
            settledByAlbum: undefined,
          }));
          return { ...patch, groups };
        }),
```

- [ ] **Step 3: Tests.** Append to `collectionStore.test.ts`:

```ts
describe('closeCombinedSwap / rollbackCombinedSwap', () => {
  let gid: string;
  beforeEach(() => {
    useCollection.setState({
      counts: { 'MEX-9': 2 }, activeAlbumId: 'A', groups: [],
      albums: [snap('A', { counts: { 'MEX-9': 2 } }), snap('B', { counts: { 'MEX-3': 0 } })],
    } as any, false);
    gid = useCollection.getState().createGroup('Kids', ['A', 'B']);
  });

  it('applies per-album deltas, marks closed, and stores settledByAlbum', () => {
    const sid = useCollection.getState().createCombinedSwap(gid, {
      name: 'c', theirNeeds: [], theirSwaps: [], giving: ['MEX-9'], receiving: ['MEX-3'],
    });
    useCollection.getState().closeCombinedSwap(gid, sid, {
      givenIds: ['MEX-9'], receivedIds: ['MEX-3'],
      settledByAlbum: { A: { 'MEX-9': -1 }, B: { 'MEX-3': 1 } },
    });
    const st = useCollection.getState();
    expect(st.counts['MEX-9']).toBe(1); // active A decremented
    expect(st.albums.find((a) => a.id === 'B')!.counts['MEX-3']).toBe(1); // parked B incremented
    const sw = st.groups[0].swaps[0];
    expect(sw.status).toBe('closed');
    expect(sw.settledByAlbum).toEqual({ A: { 'MEX-9': -1 }, B: { 'MEX-3': 1 } });
  });

  it('rollback reverses the exact per-album deltas and reopens', () => {
    const sid = useCollection.getState().createCombinedSwap(gid, {
      name: 'c', theirNeeds: [], theirSwaps: [], giving: ['MEX-9'], receiving: ['MEX-3'],
    });
    useCollection.getState().closeCombinedSwap(gid, sid, {
      givenIds: ['MEX-9'], receivedIds: ['MEX-3'],
      settledByAlbum: { A: { 'MEX-9': -1 }, B: { 'MEX-3': 1 } },
    });
    useCollection.getState().rollbackCombinedSwap(gid, sid);
    const st = useCollection.getState();
    expect(st.counts['MEX-9']).toBe(2); // restored
    expect(st.albums.find((a) => a.id === 'B')!.counts['MEX-3']).toBe(0); // restored
    expect(st.groups[0].swaps[0].status).toBe('open');
    expect(st.groups[0].swaps[0].settledByAlbum).toBeUndefined();
  });
});
```

- [ ] **Step 4: Run + commit.**

Run: `npx vitest run src/store/collectionStore.test.ts` → PASS. `npx tsc -b` → clean.

```bash
git add src/store/collectionStore.ts src/store/collectionStore.test.ts
git commit -m "feat(groups): closeCombinedSwap + rollbackCombinedSwap (per-album settlement)"
```

---

### Task 5: `deleteAlbum` prunes groups + auto-disbands

**Files:** Modify `collectionStore.ts`, `collectionStore.test.ts`

**Interfaces:**
- Modifies `deleteAlbum(id)`: after removing the album, drop `id` from every group's `memberIds` and remove any group left with `< 2` members.

- [ ] **Step 1: Implement.** In `deleteAlbum`, compute pruned groups once at the top of the `set` callback (right after `const remaining = s.albums.filter((a) => a.id !== id);`):

```ts
          const groups = s.groups
            .map((g) => (g.memberIds.includes(id) ? { ...g, memberIds: g.memberIds.filter((m) => m !== id) } : g))
            .filter((g) => g.memberIds.length >= 2);
```

Then add `groups` to **each** of the three `return` objects in `deleteAlbum` (the last-album rebuild, the active-deleted promotion, and the parked-drop):

```ts
          // last-album rebuild branch:
          return { albums: [fresh], activeAlbumId: fresh.id, groups, ...loadSnapshot(fresh) };
          // active-deleted branch:
          return { albums: remaining, activeAlbumId: target.id, groups, ...loadSnapshot(target) };
          // parked-drop branch:
          return { albums: remaining, groups };
```

- [ ] **Step 2: Tests.** Append to `collectionStore.test.ts`:

```ts
describe('deleteAlbum prunes groups', () => {
  beforeEach(() => {
    useCollection.setState({
      activeAlbumId: 'A', counts: {}, groups: [],
      albums: [snap('A'), snap('B'), snap('C')],
    } as any, false);
  });

  it('removes a deleted member and keeps a group with ≥2 members', () => {
    const gid = useCollection.getState().createGroup('G', ['A', 'B', 'C']);
    useCollection.getState().deleteAlbum('C'); // C is parked
    const g = useCollection.getState().groups.find((x) => x.id === gid)!;
    expect(g.memberIds).toEqual(['A', 'B']);
  });

  it('auto-disbands a group that drops below 2 members', () => {
    const gid = useCollection.getState().createGroup('G', ['B', 'C']);
    useCollection.getState().deleteAlbum('C');
    expect(useCollection.getState().groups.find((x) => x.id === gid)).toBeUndefined();
  });
});
```

- [ ] **Step 3: Full suite + type-check, then commit.**

Run: `npm test` → whole suite green. `npx tsc -b` → clean.

```bash
git add src/store/collectionStore.ts src/store/collectionStore.test.ts
git commit -m "feat(groups): deleteAlbum prunes group membership + auto-disbands"
```

---

## Self-review notes

- **Spec coverage:** §A group entity → Task 1; active/parked write hazard → Task 2 (`applyAlbumDeltas`); §D settlement application + rollback → Task 4; internal-move application → Task 2; member-delete pruning/auto-disband → Task 5. Combined-swap persistence shape (`receivingQty`, `settledByAlbum`) → Tasks 3–4.
- **Out of scope (Stage 3):** syncing `groups` (payload/serialize/merge) — the store persists them locally only for now.
- **Type consistency:** `settledByAlbum` shape `Record<albumId, Record<stickerId, number>>` matches Stage 1's `routeReceived`/`routeGiven` `writes` and the `Swap.settledByAlbum` type.
