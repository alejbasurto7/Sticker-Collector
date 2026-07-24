# Album Groups & Combined Swaps — Stage 3: Sync/merge — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:executing-plans (inline). Steps use `- [ ]` checkboxes.

**Goal:** Sync `groups` across the user's own Cloud devices by carrying them in `CollectionPayload` and 3-way-merging them, with no engine change.

**Architecture:** `groups` rides the Cloud channel. `sliceCloudPayload` includes them, `mergeCollection` merges them via a new `mergeGroups` (name = `scalar3`, `memberIds` = 3-way set merge, `swaps` = `mergeSwaps`, group add/edit/delete like `mergeSwaps`), and `applyMergedCollection` adopts the merged set. The engine already pipes `sliceCloudPayload → mergeCollection → applyMergedCollection` ([engine.ts:119,153,208](../../../src/sync/engine.ts)), so nothing there changes.

**Tech Stack:** Vitest. Consumes Stage 1 `AlbumGroup`.

Spec §A "Sync — groups ride the Cloud channel".

## Global Constraints

- Merges are pure and **convergent/commutative** (identical result on every device): sort outputs, and never depend on local/remote argument order for the final value.
- Back-compat: a row/base without a `groups` key is treated as `[]`; `groups` is **omitted** from a payload when empty (no `groups: []` written to rows for users with no groups).
- `merge.test.ts` conventions: `import { ... } from './merge'`, `expect(fn(...)).toEqual(...)`.

## File Structure

- **Modify** [src/sync/payload.ts](../../../src/sync/payload.ts) — `CollectionPayload.groups?`.
- **Modify** [src/sync/merge.ts](../../../src/sync/merge.ts) — `mergeGroup`, `mergeGroups`; wire into `mergeCollection`.
- **Modify** [src/sync/serialize.ts](../../../src/sync/serialize.ts) — `SliceState`/`SyncPayload` gain `groups?`; `sliceCloudPayload` carries them.
- **Modify** [src/store/collectionStore.ts](../../../src/store/collectionStore.ts) — `applyMergedCollection` adopts `payload.groups`.
- **Modify** `src/sync/merge.test.ts`, `src/store/collectionStore.test.ts`.

---

### Task 1: `CollectionPayload.groups` + `mergeGroups` wired into `mergeCollection`

**Files:** Modify `payload.ts`, `merge.ts`, `merge.test.ts`

**Interfaces:**
- Produces: `CollectionPayload.groups?: AlbumGroup[]`; `mergeGroup(base: AlbumGroup | undefined, local: AlbumGroup, remote: AlbumGroup): AlbumGroup`; `mergeGroups(base: AlbumGroup[], local: AlbumGroup[], remote: AlbumGroup[]): AlbumGroup[]`; `mergeCollection` output gains `groups` when non-empty.

- [ ] **Step 1: payload.ts.** Add the import and the field.

Import (top, after the existing `AlbumSnapshot` import):
```ts
import type { AlbumGroup } from '../types';
```
In `interface CollectionPayload`, after `deletedAlbumIds?: string[];`:
```ts
  /** Album groups (combined swapping). Synced across your own Cloud devices; omitted when empty. */
  groups?: AlbumGroup[];
```

- [ ] **Step 2: merge.ts — implement `mergeGroup`/`mergeGroups`.** Extend the types import:
```ts
import type { AlbumGroup, Counts, Swap } from '../types';
```
Append after `mergeAlbum` (before `mergeCollection`):
```ts
/** 3-way merge of an id set: an add/remove made on one side survives; convergent (sorted). */
function merge3IdSet(base: string[], local: string[], remote: string[]): string[] {
  const bs = new Set(base), ls = new Set(local), rs = new Set(remote);
  const out: string[] = [];
  for (const id of new Set([...local, ...remote, ...base])) {
    const inB = bs.has(id), inL = ls.has(id), inR = rs.has(id);
    const present = inL === inR ? inL : inL === inB ? inR : inL; // one side always equals base
    if (present) out.push(id);
  }
  return out.sort();
}

/** 3-way merge of one group: name scalar, memberIds set-merge, swaps via mergeSwaps. */
export function mergeGroup(
  base: AlbumGroup | undefined, local: AlbumGroup, remote: AlbumGroup,
): AlbumGroup {
  return {
    id: local.id,
    name: scalar3(base?.name, local.name, remote.name),
    memberIds: merge3IdSet(base?.memberIds ?? [], local.memberIds, remote.memberIds),
    swaps: mergeSwaps(base?.swaps ?? [], local.swaps, remote.swaps),
  };
}

/** 3-way merge of the group list keyed by id (add/edit/delete like mergeSwaps). */
export function mergeGroups(
  base: AlbumGroup[], local: AlbumGroup[], remote: AlbumGroup[],
): AlbumGroup[] {
  const byId = (arr: AlbumGroup[]) => new Map(arr.map((g) => [g.id, g]));
  const b = byId(base), l = byId(local), r = byId(remote);
  const out: AlbumGroup[] = [];
  for (const id of new Set([...l.keys(), ...r.keys()])) {
    const bg = b.get(id), lg = l.get(id), rg = r.get(id);
    if (lg && rg) out.push(mergeGroup(bg, lg, rg));
    else if (lg && !(bg && deepEqual(lg, bg))) out.push(lg); // new locally or edited-vs-delete
    else if (rg && !(bg && deepEqual(rg, bg))) out.push(rg);
  }
  return out.sort((x, y) => (x.id < y.id ? -1 : x.id > y.id ? 1 : 0));
}
```

- [ ] **Step 3: merge.ts — wire into `mergeCollection`.** Just before the `return {` in `mergeCollection`, add:
```ts
  const groups = mergeGroups(base.groups ?? [], local.groups ?? [], remote.groups ?? []);
```
And in that return object, after the `deletedAlbumIds` spread line, add:
```ts
    ...(groups.length ? { groups } : {}),
```

- [ ] **Step 4: Tests.** Append to `src/sync/merge.test.ts`:
```ts
import { mergeGroups } from './merge';
import type { AlbumGroup } from '../types';

const grp = (over: Partial<AlbumGroup> = {}): AlbumGroup =>
  ({ id: 'g1', name: 'Kids', memberIds: ['A', 'B'], swaps: [], ...over });

describe('mergeGroups', () => {
  it('keeps a group added on either side (first-join union)', () => {
    expect(mergeGroups([], [grp()], []).map((g) => g.id)).toEqual(['g1']);
    expect(mergeGroups([], [], [grp()]).map((g) => g.id)).toEqual(['g1']);
  });

  it('unions member additions from both sides', () => {
    const base = [grp({ memberIds: ['A'] })];
    const local = [grp({ memberIds: ['A', 'B'] })];
    const remote = [grp({ memberIds: ['A', 'C'] })];
    expect(mergeGroups(base, local, remote)[0].memberIds).toEqual(['A', 'B', 'C']);
  });

  it('honors a member removed on one side, unchanged on the other', () => {
    const base = [grp({ memberIds: ['A', 'B'] })];
    const local = [grp({ memberIds: ['A'] })]; // removed B
    const remote = [grp({ memberIds: ['A', 'B'] })];
    expect(mergeGroups(base, local, remote)[0].memberIds).toEqual(['A']);
  });

  it('honors a group deleted on one side, unchanged on the other', () => {
    const base = [grp()];
    expect(mergeGroups(base, [], [grp()])).toEqual([]); // local deleted, remote unchanged
  });

  it('converges on name regardless of argument order', () => {
    const base = [grp({ name: 'Kids' })];
    const a = mergeGroups(base, [grp({ name: 'Boys' })], [grp({ name: 'Kids' })])[0].name;
    const b = mergeGroups(base, [grp({ name: 'Kids' })], [grp({ name: 'Boys' })])[0].name;
    expect(a).toBe('Boys');
    expect(b).toBe('Boys'); // only one side changed -> that side wins, order-independent
  });
});
```

- [ ] **Step 5: Run + commit.** `npx vitest run src/sync/merge.test.ts` → PASS; `npx tsc -b` → clean.
```bash
git add src/sync/payload.ts src/sync/merge.ts src/sync/merge.test.ts
git commit -m "feat(groups): CollectionPayload.groups + mergeGroups in mergeCollection"
```

---

### Task 2: `sliceCloudPayload` carries `groups`

**Files:** Modify `serialize.ts`, `serialize.test.ts`

**Interfaces:**
- `SliceState.groups?: AlbumGroup[]`; `SyncPayload.groups?: AlbumGroup[]`; `sliceCloudPayload` output includes `groups` when non-empty.

- [ ] **Step 1: serialize.ts.** Add the import:
```ts
import type { AlbumGroup } from '../types';
```
In `interface SyncPayload`, after `activeAlbumId: string;`:
```ts
  groups?: AlbumGroup[];
```
In `interface SliceState`, after `albums: AlbumSnapshot[]; activeAlbumId: string;`:
```ts
  groups?: AlbumGroup[];
```
Change `sliceCloudPayload` to carry groups:
```ts
export function sliceCloudPayload(s: SliceState, managedIds: Set<string>): CollectionPayload {
  return {
    kind: 'collection', v: PAYLOAD_V,
    albums: allAlbums(s).filter((a) => managedIds.has(a.id)),
    ...(s.groups?.length ? { groups: s.groups } : {}),
  };
}
```

- [ ] **Step 2: Test.** Append to `src/sync/serialize.test.ts` (reuse whatever `SliceState` factory the file already defines; if none, build a minimal object inline). Add:
```ts
import { sliceCloudPayload } from './serialize';

describe('sliceCloudPayload groups', () => {
  const baseState: any = {
    counts: {}, swaps: [], edition: 'latam', trackCC: false, albumName: 'A', locked: false,
    activityDays: [], completedOn: null, unlockedAchievements: {}, albumLayout: 'compact',
    activeAlbumId: 'A', albums: [{ id: 'A', albumName: 'A', counts: {}, swaps: [], edition: 'latam', trackCC: false, locked: false, activityDays: [], completedOn: null, unlockedAchievements: {} }],
  };

  it('omits groups when there are none', () => {
    const p = sliceCloudPayload({ ...baseState, groups: [] }, new Set(['A']));
    expect('groups' in p).toBe(false);
  });

  it('carries groups when present', () => {
    const groups = [{ id: 'g1', name: 'Kids', memberIds: ['A', 'B'], swaps: [] }];
    const p = sliceCloudPayload({ ...baseState, groups }, new Set(['A']));
    expect(p.groups).toEqual(groups);
  });
});
```

- [ ] **Step 3: Run + commit.** `npx vitest run src/sync/serialize.test.ts` → PASS; `npx tsc -b` → clean.
```bash
git add src/sync/serialize.ts src/sync/serialize.test.ts
git commit -m "feat(groups): sliceCloudPayload carries groups into the Cloud row"
```

---

### Task 3: `applyMergedCollection` adopts merged `groups`

**Files:** Modify `collectionStore.ts`, `collectionStore.test.ts`

**Interfaces:** `applyMergedCollection` sets `groups: payload.groups ?? []` on every return.

- [ ] **Step 1: Implement.** In `applyMergedCollection`, right after `const albums = [...kept, ...cloudAlbums];`, add:
```ts
          const groups = payload.groups ?? [];
```
Then add `groups` to each of the four `return`s:
- `return { albums, ...loadSnapshot(activeInCloud) };` → `return { albums, groups, ...loadSnapshot(activeInCloud) };`
- `if (!fallback) return { albums };` → `if (!fallback) return { albums, groups };`
- `return { albums, activeAlbumId: fallback.id, ...loadSnapshot(fallback) };` → add `groups,` after `albums,`
- `return { albums }; // active is a shared/private album — leave top-level alone` → `return { albums, groups }; // active is a shared/private album — leave top-level alone`

- [ ] **Step 2: Test.** Append to `src/store/collectionStore.test.ts`:
```ts
describe('applyMergedCollection adopts groups', () => {
  beforeEach(() => {
    useCollection.setState({
      activeAlbumId: 'A', counts: {}, groups: [],
      albums: [snap('A', { counts: {} }), snap('S')],
    } as any, false);
  });

  it('adopts the merged group set from the payload', () => {
    const groups = [{ id: 'g1', name: 'Kids', memberIds: ['A', 'S'], swaps: [] }];
    useCollection.getState().applyMergedCollection(
      { kind: 'collection', v: 1, albums: [snap('A')], groups } as any, new Set(['S']),
    );
    expect(useCollection.getState().groups).toEqual(groups);
  });

  it('clears groups when the merged payload has none', () => {
    useCollection.setState({ groups: [{ id: 'g1', name: 'x', memberIds: ['A', 'S'], swaps: [] }] } as any, false);
    useCollection.getState().applyMergedCollection(
      { kind: 'collection', v: 1, albums: [snap('A')] } as any, new Set(['S']),
    );
    expect(useCollection.getState().groups).toEqual([]);
  });
});
```

- [ ] **Step 3: Full suite + type-check, then commit.** `npm test` → whole suite green; `npx tsc -b` → clean.
```bash
git add src/store/collectionStore.ts src/store/collectionStore.test.ts
git commit -m "feat(groups): applyMergedCollection adopts merged groups"
```

---

## Self-review notes

- **Spec coverage:** §A "groups ride the Cloud channel" → Task 1 (payload+merge) + Task 2 (slice) + Task 3 (apply); `mergeGroups` sub-rules (name scalar / memberIds set / swaps) → Task 1; back-compat (no `groups` key → `[]`, omitted when empty) → Tasks 1–2.
- **No engine change:** verified `sliceCloudPayload`/`mergeCollection`/`applyMergedCollection` are the three seams and all get `groups`.
- **Convergence:** `merge3IdSet` and `mergeGroups` both sort; `mergeGroup` uses `scalar3`/`mergeSwaps` (already convergent). Per-device member *resolution* (UI) is Stage 4.
