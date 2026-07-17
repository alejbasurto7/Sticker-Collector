# Per-album Sync — Stage 1 (Merge Engine) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the pure, fully-unit-tested **3-way merge engine** and **payload types** that per-album sync is built on — `merge3(base, local, remote)` over an album or a whole collection — with **no app wiring and no behaviour change yet**.

**Architecture:** Two new pure modules under `src/sync/`: `payload.ts` (the wire types `AlbumPayload` / `CollectionPayload` / `ChannelPayload` + type guards) and `merge.ts` (the leaf helpers `mergeCounts` / `mergeSwaps` / `scalar3`, the composed `mergeAlbum`, and `mergeCollection`). Every function is pure — no `localStorage`, no zustand, no `Date.now()` — so the whole engine is testable with Vitest in the node env, exactly like the existing `src/sync/serialize.test.ts`. Later stages (2: engine/store wiring + migration, 3: sharing UI) consume these functions.

**Tech Stack:** TypeScript 5.6 (`strict`), Vitest 4 (node env, pure-function tests only). No new dependencies.

## Global Constraints

- **Pure functions only.** `merge.ts` and `payload.ts` must not import zustand, `localStorage`, `supabase`, or call `Date.now()` / `Math.random()` / `crypto`. Types from the store are imported with **`import type`** (erased at build), matching `src/sync/serialize.ts`.
- **No backend/SQL changes** anywhere in this feature.
- **Merge is deterministic and commutative.** For any inputs, `merge3` must produce identical output regardless of which device runs it, so all devices converge. Every same-key collision tie-break must be a fixed rule on the *values*, never wall-clock or per-device identity.
- **Tombstone simplification (deviation from spec, intentional):** the spec wrote `deletedAlbumIds: Record<albumId, number>`; this plan uses `deletedAlbumIds?: string[]` — a monotonic set of deleted ids, no timestamp. Reason: the 3-way merge has no per-key clock to stamp, and a monotonic id-set keeps merge pure/deterministic and CRDT-clean. Deletion is honored **only** via an explicit tombstone (added by the Stage 2 delete action), **never** inferred from an album's mere absence — this is what makes carve-out ≠ deletion work.
- **Payload version:** `export const PAYLOAD_V = 1;` stamped on every payload the engine produces.
- **Test command:** `npm test` (Vitest, runs all `src/**/*.test.ts`). Single file while iterating: `npx vitest run src/sync/merge.test.ts`. Type-check: `npm run build`. Run `npm test` before every commit.
- **Branch:** `claude/per-album-sync-sharing` (already checked out).
- **Spec:** `docs/superpowers/specs/2026-07-17-per-album-sync-sharing-design.md` — the merge rule table in "The merge engine" section is the source of truth for every field's behaviour.

---

## File Structure

- **Create** `src/sync/payload.ts` — wire types `AlbumPayload`, `CollectionPayload`, `ChannelPayload`; `PAYLOAD_V`; type guards `isAlbumPayload` / `isCollectionPayload`. One responsibility: the shape of what travels in a Supabase row's `data` and how to recognise it.
- **Create** `src/sync/payload.test.ts` — guard tests.
- **Create** `src/sync/merge.ts` — pure merge: `mergeCounts`, `mergeSwaps`, `scalar3`, `mergeAlbum`, `mergeCollection`, plus internal `deepEqual`. One responsibility: reconcile base+local+remote.
- **Create** `src/sync/merge.test.ts` — the bulk of Stage 1's tests.

`AlbumSnapshot` is imported (type-only) from `../store/collectionStore`; `Counts` / `Swap` / `Edition` from `../types`. No existing files are modified in Stage 1.

---

## Task 1: Leaf helpers — `mergeCounts` and `scalar3`

**Files:**
- Create: `src/sync/merge.ts` (this task adds `mergeCounts` + `scalar3` only)
- Test: `src/sync/merge.test.ts`

**Interfaces:**
- Consumes: `type { Counts } from '../types'`.
- Produces (used by Task 3 and Task 5):
  - `mergeCounts(base: Counts, local: Counts, remote: Counts): Counts` — 3-way per stickerId; only-one-side-changed wins; both-changed → `max`; zero results are omitted.
  - `scalar3<T extends string | number | boolean>(base: T | undefined, local: T, remote: T): T` — 3-way scalar; collision → `local >= remote ? local : remote` (works for strings lexically and booleans numerically). `base === undefined` (no common ancestor) skips the ancestor checks and goes straight to the collision rule.

- [ ] **Step 1: Write the failing tests**

Create `src/sync/merge.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { mergeCounts, scalar3 } from './merge';

describe('mergeCounts', () => {
  it('keeps independent changes from both sides', () => {
    expect(mergeCounts({}, { A: 1 }, { B: 1 })).toEqual({ A: 1, B: 1 });
  });

  it('takes the side that changed vs. base (local)', () => {
    expect(mergeCounts({ A: 1 }, { A: 2 }, { A: 1 })).toEqual({ A: 2 });
  });

  it('takes the side that changed vs. base (remote), pruning zeros', () => {
    // remote removed A (1 -> 0); local unchanged. Removal wins; 0 is omitted.
    expect(mergeCounts({ A: 1 }, { A: 1 }, { A: 0 })).toEqual({});
  });

  it('on a true same-sticker collision, max wins (and is order-independent)', () => {
    expect(mergeCounts({ A: 1 }, { A: 0 }, { A: 2 })).toEqual({ A: 2 });
    expect(mergeCounts({ A: 1 }, { A: 2 }, { A: 0 })).toEqual({ A: 2 });
  });

  it('keeps equal values from both sides', () => {
    expect(mergeCounts({}, { A: 1 }, { A: 1 })).toEqual({ A: 1 });
  });
});

describe('scalar3', () => {
  it('returns the value when both sides agree', () => {
    expect(scalar3('latam', 'na', 'na')).toBe('na');
  });

  it('takes the changed side (local changed, remote at base)', () => {
    expect(scalar3('latam', 'na', 'latam')).toBe('na');
  });

  it('takes the changed side (remote changed, local at base)', () => {
    expect(scalar3('latam', 'latam', 'na')).toBe('na');
  });

  it('resolves a true collision deterministically, both orders equal', () => {
    // 'na' >= 'latam' lexically -> 'na' wins regardless of argument order.
    expect(scalar3('latam', 'na', 'latam')).toBe('na');
    const a = scalar3('x', 'na', 'latam');
    const b = scalar3('x', 'latam', 'na');
    expect(a).toBe(b);
    expect(a).toBe('na');
  });

  it('handles booleans (true beats false on collision)', () => {
    expect(scalar3(undefined as boolean | undefined, true, false)).toBe(true);
    expect(scalar3(undefined as boolean | undefined, false, true)).toBe(true);
  });

  it('with no common ancestor, agreement still wins', () => {
    expect(scalar3(undefined, 'na', 'na')).toBe('na');
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run src/sync/merge.test.ts`
Expected: FAIL — `Failed to resolve import "./merge"` / `mergeCounts is not a function`.

- [ ] **Step 3: Write the minimal implementation**

Create `src/sync/merge.ts`:

```ts
import type { Counts } from '../types';

/**
 * 3-way merge of a counts map. A sticker only one side changed keeps that
 * side's value; a sticker both sides changed differently resolves to the max
 * (bias toward not losing owned/spares) — deterministic and order-independent,
 * so all devices converge. Zero results are omitted (absent === 0 === missing).
 */
export function mergeCounts(base: Counts, local: Counts, remote: Counts): Counts {
  const ids = new Set<string>([
    ...Object.keys(base),
    ...Object.keys(local),
    ...Object.keys(remote),
  ]);
  const out: Counts = {};
  for (const id of ids) {
    const b = base[id] ?? 0;
    const l = local[id] ?? 0;
    const r = remote[id] ?? 0;
    let v: number;
    if (l === r) v = l;
    else if (l === b) v = r;
    else if (r === b) v = l;
    else v = Math.max(l, r);
    if (v > 0) out[id] = v;
  }
  return out;
}

/**
 * 3-way merge of a single scalar. The side that differs from the common
 * ancestor wins; if both differ, a fixed comparator on the values picks the
 * winner (`>=` is lexical for strings, numeric for booleans) so every device
 * agrees. `base === undefined` means no common ancestor (e.g. first join).
 */
export function scalar3<T extends string | number | boolean>(
  base: T | undefined,
  local: T,
  remote: T,
): T {
  if (local === remote) return local;
  if (base !== undefined) {
    if (local === base) return remote;
    if (remote === base) return local;
  }
  return local >= remote ? local : remote;
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run src/sync/merge.test.ts`
Expected: PASS (12 assertions across both describes).

- [ ] **Step 5: Commit**

```bash
git add src/sync/merge.ts src/sync/merge.test.ts
git commit -m "feat(sync): pure mergeCounts + scalar3 (3-way merge leaves)"
```

---

## Task 2: `deepEqual` + `mergeSwaps`

**Files:**
- Modify: `src/sync/merge.ts` (add `deepEqual` + `mergeSwaps`)
- Test: `src/sync/merge.test.ts` (add a `mergeSwaps` describe)

**Interfaces:**
- Consumes: `type { Swap } from '../types'`.
- Produces (used by Task 3):
  - `mergeSwaps(base: Swap[], local: Swap[], remote: Swap[]): Swap[]` — 3-way by `swap.id`. Add on one side is kept; an edit on one side is kept; a delete (present in base, gone from one side, unchanged on the other) is honored; an edit-vs-delete keeps the edit; a same-swap edit-vs-edit collision keeps the one with the later `closedAt ?? createdAt`, tie-broken by id. Output sorted by `createdAt` desc, then id asc.
- Internal only (not exported): `deepEqual(a, b): boolean`.

- [ ] **Step 1: Write the failing tests**

Add to `src/sync/merge.test.ts` (add `mergeSwaps` to the existing import from `./merge`):

```ts
import { mergeSwaps } from './merge';
import type { Swap } from '../types';

function swap(id: string, over: Partial<Swap> = {}): Swap {
  return {
    id,
    name: `swap ${id}`,
    createdAt: 100,
    status: 'open',
    theirNeeds: [],
    theirSwaps: [],
    giving: [],
    receiving: [],
    ...over,
  };
}

describe('mergeSwaps', () => {
  it('keeps a swap added on only one side', () => {
    const s1 = swap('s1');
    expect(mergeSwaps([], [s1], [])).toEqual([s1]);
    expect(mergeSwaps([], [], [s1])).toEqual([s1]);
  });

  it('unions two independently-added swaps (sorted newest-first)', () => {
    const a = swap('a', { createdAt: 200 });
    const b = swap('b', { createdAt: 100 });
    expect(mergeSwaps([], [a], [b])).toEqual([a, b]);
  });

  it('honors a delete: unchanged local, removed remotely', () => {
    const s1 = swap('s1');
    expect(mergeSwaps([s1], [s1], [])).toEqual([]);
  });

  it('keeps an edit over a concurrent delete', () => {
    const base = swap('s1', { name: 'old' });
    const edited = swap('s1', { name: 'new' });
    expect(mergeSwaps([base], [edited], [])).toEqual([edited]);
  });

  it('takes the edited side when the other is unchanged', () => {
    const base = swap('s1', { name: 'old' });
    const edited = swap('s1', { name: 'new' });
    expect(mergeSwaps([base], [base], [edited])).toEqual([edited]);
  });

  it('resolves an edit-vs-edit collision by later closedAt, deterministically', () => {
    const base = swap('s1', { status: 'open' });
    const localEdit = swap('s1', { status: 'closed', closedAt: 500, name: 'L' });
    const remoteEdit = swap('s1', { status: 'closed', closedAt: 900, name: 'R' });
    expect(mergeSwaps([base], [localEdit], [remoteEdit])).toEqual([remoteEdit]);
    expect(mergeSwaps([base], [remoteEdit], [localEdit])).toEqual([remoteEdit]);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run src/sync/merge.test.ts`
Expected: FAIL — `mergeSwaps is not a function`.

- [ ] **Step 3: Write the implementation**

Append to `src/sync/merge.ts` (and add the `Swap` import at the top):

```ts
import type { Counts, Swap } from '../types';
```

```ts
/** Structural equality for plain JSON-ish values (swaps: scalars, arrays, records). */
function deepEqual(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (typeof a !== typeof b || a === null || b === null) return false;
  if (Array.isArray(a) || Array.isArray(b)) {
    if (!Array.isArray(a) || !Array.isArray(b) || a.length !== b.length) return false;
    return a.every((x, i) => deepEqual(x, b[i]));
  }
  if (typeof a === 'object') {
    const ao = a as Record<string, unknown>;
    const bo = b as Record<string, unknown>;
    const ak = Object.keys(ao);
    const bk = Object.keys(bo);
    if (ak.length !== bk.length) return false;
    return ak.every((k) => deepEqual(ao[k], bo[k]));
  }
  return false;
}

/** Deterministic winner of a same-id edit-vs-edit collision: later close/create, then id. */
function laterSwap(a: Swap, b: Swap): Swap {
  const at = a.closedAt ?? a.createdAt;
  const bt = b.closedAt ?? b.createdAt;
  if (at !== bt) return at > bt ? a : b;
  return a.id >= b.id ? a : b;
}

/**
 * 3-way merge of swap lists, keyed by id. A swap added on one side survives; an
 * edit on one side survives; a delete (in base, gone from one side, unchanged on
 * the other) is honored; an edit racing a delete keeps the edit; two conflicting
 * edits resolve via {@link laterSwap}. Output is sorted newest-first, id-stable.
 */
export function mergeSwaps(base: Swap[], local: Swap[], remote: Swap[]): Swap[] {
  const byId = (arr: Swap[]) => new Map(arr.map((s) => [s.id, s]));
  const b = byId(base);
  const l = byId(local);
  const r = byId(remote);
  const ids = new Set<string>([...l.keys(), ...r.keys()]);
  const out: Swap[] = [];
  for (const id of ids) {
    const bs = b.get(id);
    const ls = l.get(id);
    const rs = r.get(id);
    if (ls && rs) {
      if (deepEqual(ls, rs)) out.push(ls);
      else if (bs && deepEqual(ls, bs)) out.push(rs); // only remote edited
      else if (bs && deepEqual(rs, bs)) out.push(ls); // only local edited
      else out.push(laterSwap(ls, rs)); // both edited (or both new & differ)
    } else if (ls && !rs) {
      if (bs && deepEqual(ls, bs)) continue; // unchanged locally, remote deleted -> drop
      out.push(ls); // new locally, or edited-vs-delete -> keep
    } else if (!ls && rs) {
      if (bs && deepEqual(rs, bs)) continue; // unchanged remotely, local deleted -> drop
      out.push(rs);
    }
  }
  return out.sort((x, y) => y.createdAt - x.createdAt || (x.id < y.id ? -1 : x.id > y.id ? 1 : 0));
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `npx vitest run src/sync/merge.test.ts`
Expected: PASS (all Task 1 + Task 2 assertions).

- [ ] **Step 5: Commit**

```bash
git add src/sync/merge.ts src/sync/merge.test.ts
git commit -m "feat(sync): mergeSwaps 3-way merge with deletion + edit-collision rules"
```

---

## Task 3: `mergeAlbum` (compose the full snapshot merge)

**Files:**
- Modify: `src/sync/merge.ts` (add `mergeAlbum`)
- Test: `src/sync/merge.test.ts` (add a `mergeAlbum` describe)

**Interfaces:**
- Consumes: `type { AlbumSnapshot } from '../store/collectionStore'`; `mergeCounts`, `mergeSwaps`, `scalar3` (Tasks 1–2).
- Produces (used by Task 5 and Stage 2):
  - `mergeAlbum(base: AlbumSnapshot | undefined, local: AlbumSnapshot, remote: AlbumSnapshot): AlbumSnapshot` — field-by-field per the spec table: `counts`/`swaps` 3-way; `albumName`/`edition`/`trackCC`/`locked` via `scalar3`; `activityDays` set-union (sorted); `unlockedAchievements` union keeping the earliest timestamp; `firstStickerAt` min of defined; `completedOn` earliest non-null; `id` from `local`. `base === undefined` (first join) → counts/swaps union, scalars fall to the collision rule.

- [ ] **Step 1: Write the failing tests**

Add to `src/sync/merge.test.ts`:

```ts
import { mergeAlbum } from './merge';
import type { AlbumSnapshot } from '../store/collectionStore';

function album(over: Partial<AlbumSnapshot> = {}): AlbumSnapshot {
  return {
    id: 'alb1',
    albumName: 'My Album',
    counts: {},
    swaps: [],
    edition: 'latam',
    trackCC: true,
    locked: false,
    activityDays: [],
    completedOn: null,
    unlockedAchievements: {},
    ...over,
  };
}

describe('mergeAlbum', () => {
  it('merges counts and swaps and unions activity days', () => {
    const base = album({ counts: { A: 1 }, activityDays: ['2026-07-01'] });
    const local = album({ counts: { A: 1, B: 1 }, activityDays: ['2026-07-02'] });
    const remote = album({ counts: { A: 1, C: 1 }, activityDays: ['2026-07-03'] });
    const m = mergeAlbum(base, local, remote);
    expect(m.counts).toEqual({ A: 1, B: 1, C: 1 });
    expect(m.activityDays).toEqual(['2026-07-02', '2026-07-03']);
  });

  it('keeps the earliest achievement timestamp and earliest first-sticker time', () => {
    const local = album({ firstStickerAt: 500, unlockedAchievements: { first: 500 } });
    const remote = album({ firstStickerAt: 300, unlockedAchievements: { first: 900, streak: 700 } });
    const m = mergeAlbum(album(), local, remote);
    expect(m.firstStickerAt).toBe(300);
    expect(m.unlockedAchievements).toEqual({ first: 500, streak: 700 });
  });

  it('takes the earliest non-null completedOn', () => {
    const local = album({ completedOn: '2026-07-10' });
    const remote = album({ completedOn: '2026-07-05' });
    expect(mergeAlbum(album(), local, remote).completedOn).toBe('2026-07-05');
    expect(mergeAlbum(album(), album(), album()).completedOn).toBeNull();
  });

  it('resolves a name collision deterministically and keeps local id', () => {
    const base = album({ albumName: 'Base' });
    const local = album({ id: 'localId', albumName: 'Alpha' });
    const remote = album({ id: 'remoteId', albumName: 'Zeta' });
    const m = mergeAlbum(base, local, remote);
    expect(m.albumName).toBe('Zeta'); // 'Zeta' >= 'Alpha'
    expect(m.id).toBe('localId');
  });

  it('first join (no base) unions both sides counts', () => {
    const local = album({ counts: { A: 1 } });
    const remote = album({ counts: { B: 1 } });
    expect(mergeAlbum(undefined, local, remote).counts).toEqual({ A: 1, B: 1 });
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run src/sync/merge.test.ts`
Expected: FAIL — `mergeAlbum is not a function`.

- [ ] **Step 3: Write the implementation**

Append to `src/sync/merge.ts` (add the type-only import at the top):

```ts
import type { AlbumSnapshot } from '../store/collectionStore';
```

```ts
/**
 * 3-way merge of a full album snapshot, field by field (see the spec's merge
 * table). Independent edits on any field survive; only same-key collisions
 * tie-break, always deterministically. `base === undefined` means a first join:
 * counts/swaps union, scalars fall straight to the collision rule.
 */
export function mergeAlbum(
  base: AlbumSnapshot | undefined,
  local: AlbumSnapshot,
  remote: AlbumSnapshot,
): AlbumSnapshot {
  const firstDefs = [local.firstStickerAt, remote.firstStickerAt].filter(
    (x): x is number => typeof x === 'number',
  );
  const completedDefs = [local.completedOn, remote.completedOn].filter(
    (x): x is string => !!x,
  );
  const unlockedAchievements: Record<string, number> = { ...remote.unlockedAchievements };
  for (const [k, v] of Object.entries(local.unlockedAchievements)) {
    unlockedAchievements[k] = unlockedAchievements[k] == null ? v : Math.min(unlockedAchievements[k], v);
  }
  return {
    id: local.id,
    albumName: scalar3(base?.albumName, local.albumName, remote.albumName),
    counts: mergeCounts(base?.counts ?? {}, local.counts, remote.counts),
    swaps: mergeSwaps(base?.swaps ?? [], local.swaps, remote.swaps),
    edition: scalar3(base?.edition, local.edition, remote.edition),
    trackCC: scalar3(base?.trackCC, local.trackCC, remote.trackCC),
    locked: scalar3(base?.locked, local.locked, remote.locked),
    firstStickerAt: firstDefs.length ? Math.min(...firstDefs) : undefined,
    activityDays: [...new Set([...local.activityDays, ...remote.activityDays])].sort(),
    completedOn: completedDefs.length ? completedDefs.sort()[0] : null,
    unlockedAchievements,
  };
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `npx vitest run src/sync/merge.test.ts`
Expected: PASS (all describes).

- [ ] **Step 5: Commit**

```bash
git add src/sync/merge.ts src/sync/merge.test.ts
git commit -m "feat(sync): mergeAlbum composes the full 3-way snapshot merge"
```

---

## Task 4: Payload types + guards

**Files:**
- Create: `src/sync/payload.ts`
- Test: `src/sync/payload.test.ts`

**Interfaces:**
- Consumes: `type { AlbumSnapshot } from '../store/collectionStore'`.
- Produces (used by Task 5 and Stage 2):
  - `const PAYLOAD_V = 1`
  - `interface AlbumPayload { kind: 'album'; v: number; access: 'collaborative' | 'read-only'; sharingEndedAt?: number; album: AlbumSnapshot }`
  - `interface CollectionPayload { kind: 'collection'; v: number; albums: AlbumSnapshot[]; deletedAlbumIds?: string[] }`
  - `type ChannelPayload = AlbumPayload | CollectionPayload`
  - `isAlbumPayload(p: unknown): p is AlbumPayload`
  - `isCollectionPayload(p: unknown): p is CollectionPayload`

- [ ] **Step 1: Write the failing tests**

Create `src/sync/payload.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import {
  PAYLOAD_V,
  isAlbumPayload,
  isCollectionPayload,
  type AlbumPayload,
  type CollectionPayload,
} from './payload';

const albumSnap = {
  id: 'a', albumName: 'A', counts: {}, swaps: [], edition: 'latam' as const,
  trackCC: true, locked: false, activityDays: [], completedOn: null, unlockedAchievements: {},
};

describe('payload guards', () => {
  it('recognises an album payload', () => {
    const p: AlbumPayload = { kind: 'album', v: PAYLOAD_V, access: 'collaborative', album: albumSnap };
    expect(isAlbumPayload(p)).toBe(true);
    expect(isCollectionPayload(p)).toBe(false);
  });

  it('recognises a collection payload', () => {
    const p: CollectionPayload = { kind: 'collection', v: PAYLOAD_V, albums: [albumSnap] };
    expect(isCollectionPayload(p)).toBe(true);
    expect(isAlbumPayload(p)).toBe(false);
  });

  it('rejects junk and header-less blobs', () => {
    expect(isAlbumPayload(null)).toBe(false);
    expect(isAlbumPayload({})).toBe(false);
    expect(isCollectionPayload({ kind: 'collection', v: 1, albums: 'nope' })).toBe(false);
    expect(isAlbumPayload({ kind: 'album', v: 1, access: 'read-only' })).toBe(false); // no album
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run src/sync/payload.test.ts`
Expected: FAIL — `Failed to resolve import "./payload"`.

- [ ] **Step 3: Write the implementation**

Create `src/sync/payload.ts`:

```ts
// Type-only import (erased at build) keeps this module free of the store's
// runtime, so it stays importable in the plain-node Vitest env.
import type { AlbumSnapshot } from '../store/collectionStore';

/** Bump when the payload shape changes in a non-back-compatible way. */
export const PAYLOAD_V = 1;

/** One individually-shared album (its own Supabase row). */
export interface AlbumPayload {
  kind: 'album';
  v: number;
  access: 'collaborative' | 'read-only';
  /** Set by the owner to end the share; joiners see it and go Local (Stage 3). */
  sharingEndedAt?: number;
  album: AlbumSnapshot;
}

/** The whole-collection ("Cloud") row: every Cloud-mode album. */
export interface CollectionPayload {
  kind: 'collection';
  v: number;
  albums: AlbumSnapshot[];
  /** Monotonic set of deleted album ids (tombstones). Absence is NOT a delete. */
  deletedAlbumIds?: string[];
}

export type ChannelPayload = AlbumPayload | CollectionPayload;

const isObj = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v);

export function isAlbumPayload(p: unknown): p is AlbumPayload {
  return isObj(p) && p.kind === 'album' && isObj(p.album);
}

export function isCollectionPayload(p: unknown): p is CollectionPayload {
  return isObj(p) && p.kind === 'collection' && Array.isArray(p.albums);
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `npx vitest run src/sync/payload.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/sync/payload.ts src/sync/payload.test.ts
git commit -m "feat(sync): channel payload types (album/collection) + guards"
```

---

## Task 5: `mergeCollection` (album-set merge, carve-out safe, tombstones)

**Files:**
- Modify: `src/sync/merge.ts` (add `mergeCollection`)
- Test: `src/sync/merge.test.ts` (add a `mergeCollection` describe)

**Interfaces:**
- Consumes: `mergeAlbum` (Task 3); `type { CollectionPayload } from './payload'` and `PAYLOAD_V`.
- Produces (used by Stage 2):
  - `mergeCollection(base: CollectionPayload, local: CollectionPayload, remote: CollectionPayload, managedIds: Set<string>): CollectionPayload`
    - `managedIds` = the album ids this device currently holds in **Cloud** mode.
    - Albums in `remote` **not** in `managedIds` are preserved untouched (this is carve-out safety: another device not managing an album never deletes it here).
    - Each managed id is 3-way `mergeAlbum`'d when present on both sides, else kept from local.
    - Deletion is honored **only** via a tombstone present in any side's `deletedAlbumIds`; absence never deletes. Tombstones union (monotonic).

- [ ] **Step 1: Write the failing tests**

Add to `src/sync/merge.test.ts` (extend the `./merge` and `./payload` imports):

```ts
import { mergeCollection } from './merge';
import { PAYLOAD_V, type CollectionPayload } from './payload';

function coll(albums: AlbumSnapshot[], deleted?: string[]): CollectionPayload {
  return { kind: 'collection', v: PAYLOAD_V, albums, ...(deleted ? { deletedAlbumIds: deleted } : {}) };
}

describe('mergeCollection', () => {
  it('3-way merges a managed album present on both sides', () => {
    const base = coll([album({ id: 'x', counts: { A: 1 } })]);
    const local = coll([album({ id: 'x', counts: { A: 1, B: 1 } })]);
    const remote = coll([album({ id: 'x', counts: { A: 1, C: 1 } })]);
    const m = mergeCollection(base, local, remote, new Set(['x']));
    expect(m.albums.find((a) => a.id === 'x')!.counts).toEqual({ A: 1, B: 1, C: 1 });
  });

  it('preserves a remote album this device does not manage (carve-out safety)', () => {
    const base = coll([]);
    const local = coll([album({ id: 'mine' })]);
    const remote = coll([album({ id: 'mine' }), album({ id: 'others' })]);
    const m = mergeCollection(base, local, remote, new Set(['mine']));
    expect(m.albums.map((a) => a.id).sort()).toEqual(['mine', 'others']);
  });

  it('does NOT delete a managed album merely absent from remote', () => {
    const base = coll([album({ id: 'x' })]);
    const local = coll([album({ id: 'x' })]);
    const remote = coll([]); // another device carved x out (no tombstone)
    const m = mergeCollection(base, local, remote, new Set(['x']));
    expect(m.albums.map((a) => a.id)).toEqual(['x']);
  });

  it('adds a newly-created local album to the row', () => {
    const m = mergeCollection(coll([]), coll([album({ id: 'new' })]), coll([]), new Set(['new']));
    expect(m.albums.map((a) => a.id)).toEqual(['new']);
  });

  it('honors a tombstoned deletion across devices', () => {
    const base = coll([album({ id: 'x' })]);
    const local = coll([album({ id: 'x' })]); // this device still has x
    const remote = coll([], ['x']); // other device deleted it (tombstone)
    const m = mergeCollection(base, local, remote, new Set(['x']));
    expect(m.albums.map((a) => a.id)).toEqual([]);
    expect(m.deletedAlbumIds).toEqual(['x']);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run src/sync/merge.test.ts`
Expected: FAIL — `mergeCollection is not a function`.

- [ ] **Step 3: Write the implementation**

Append to `src/sync/merge.ts` (add the imports at the top):

```ts
import { PAYLOAD_V, type CollectionPayload } from './payload';
```

```ts
/**
 * 3-way merge of the whole-collection row. `managedIds` are the album ids this
 * device holds in Cloud mode. Albums the device does not manage are preserved
 * untouched (so another device not managing an album never deletes it here);
 * managed albums are 3-way merged. Deletion is honored ONLY via an explicit
 * tombstone (never inferred from absence), and tombstones union monotonically.
 */
export function mergeCollection(
  base: CollectionPayload,
  local: CollectionPayload,
  remote: CollectionPayload,
  managedIds: Set<string>,
): CollectionPayload {
  const tomb = new Set<string>([
    ...(base.deletedAlbumIds ?? []),
    ...(local.deletedAlbumIds ?? []),
    ...(remote.deletedAlbumIds ?? []),
  ]);
  const mapOf = (p: CollectionPayload) => new Map(p.albums.map((a) => [a.id, a]));
  const b = mapOf(base);
  const l = mapOf(local);
  const r = mapOf(remote);
  const out = new Map<string, AlbumSnapshot>();

  // 1. Preserve every remote album this device does not manage (unless deleted).
  for (const [id, a] of r) {
    if (!managedIds.has(id) && !tomb.has(id)) out.set(id, a);
  }
  // 2. Merge each managed album; deletions come only from tombstones.
  for (const id of managedIds) {
    if (tomb.has(id)) continue;
    const lA = l.get(id);
    if (!lA) continue; // managed but absent locally: nothing to contribute
    const rA = r.get(id);
    out.set(id, rA ? mergeAlbum(b.get(id), lA, rA) : lA);
  }

  return {
    kind: 'collection',
    v: PAYLOAD_V,
    albums: [...out.values()],
    ...(tomb.size ? { deletedAlbumIds: [...tomb].sort() } : {}),
  };
}
```

- [ ] **Step 4: Run the full suite to verify everything passes**

Run: `npm test`
Expected: PASS — the whole repo suite, including all `src/sync/merge.test.ts` and `src/sync/payload.test.ts` cases and the pre-existing `serialize.test.ts` / `syncCode.test.ts`.

- [ ] **Step 5: Type-check, then commit**

Run: `npm run build`
Expected: `tsc -b` passes with no errors; Vite build completes.

```bash
git add src/sync/merge.ts src/sync/merge.test.ts
git commit -m "feat(sync): mergeCollection album-set merge (carve-out safe, tombstones)"
```

---

## Self-Review (Stage 1 vs. spec)

- **Merge rule table** (spec "The merge engine") — every row implemented and tested: counts (Task 1), swaps incl. delete/edit-collision (Task 2), activityDays union / achievements earliest / firstStickerAt min / completedOn earliest / scalars (Task 3), collection album-set union + carve-out-not-delete + tombstones (Task 5). ✅
- **First-join union** (spec "First-join behavior") — `mergeAlbum(undefined, …)` test in Task 3. ✅
- **Payload `kind` header** (spec "Cloud row payloads") — types + guards in Task 4; legacy header-less coercion is a Stage 2 concern (engine/normalise), noted below. ✅ (scope-correct)
- **Determinism/convergence** — collision tests assert order-independence (counts, scalar, swaps). ✅
- **Placeholder scan** — no TBD/TODO; every step has complete code and an exact command with expected result. ✅
- **Type consistency** — `mergeCounts`/`mergeSwaps`/`scalar3`/`mergeAlbum`/`mergeCollection` names and signatures are identical between their Interfaces blocks, implementations, and call sites; `PAYLOAD_V` and payload interfaces match across Tasks 4–5. ✅

---

## Subsequent stages (to be written as their own plans, after Stage 1)

These are **outlined** here for context; each will be a fully-detailed plan like this one (the repo's `stage1a → stage1b` pattern).

### Stage 2 — syncMeta v2, multi-channel engine & migration

Makes the existing whole-collection sync run through the new architecture with **no user-visible change**; adds nothing to the UI.

- **`src/sync/serialize.ts`** — add `normalizeRemote(data): ChannelPayload | null` that accepts the new payloads and coerces a header-less legacy row to `{ kind:'collection', v:1, albums }` (back-compat). Add `sliceCloudPayload(state, managedIds)` (build a `CollectionPayload` from the store's Cloud-mode albums) and `sliceAlbumPayload(state, albumId, access)`.
- **`src/store/syncStore.ts`** — migrate `useSyncMeta` to **v2**: `{ collection: LinkMeta | null, albumLinks: Record<string, AlbumLink>, privateAlbumIds: string[], localAlbumNames: Record<string, string>, bases: Record<string, ChannelPayload> }`, with a zustand persist `version: 2` + `migrate` moving the old single link into `collection`. Actions per channel (`setCollectionLink`, `upsertAlbumLink`, `removeAlbumLink`, `setBase`, `setLocalAlbumName`, `markChannelSynced`, …).
- **`src/store/collectionStore.ts`** — add `applyMergedCollection(payload)` and `applyMergedAlbum(albumId, snapshot)` reconciliation actions (adopt/merge album lists from a merged payload); a `deleteAlbum` that records a tombstone in the Cloud base; expose a selector for `managedIds` (Cloud-mode album ids).
- **`src/sync/engine.ts`** — refactor from singleton to a per-channel manager: for each active channel, debounce a push that does `pull → merge3 → sync_push(base_version)` with the merge functions from Stage 1, then `setBase(merged)` and apply locally; per-channel `writerId`/`lastVersion`/`applyingRemote`; read-only-joiner channels are pull-only. Keep the existing Supabase RPCs untouched.
- **Migration/back-compat tests**; extend `serialize.test.ts` for `normalizeRemote` + slicing.
- **End state:** today's sync keeps working, now as the Cloud channel, merge-based.

### Stage 3 — Sharing UI, read-only gating & revocation

The user-facing feature set.

- **`src/components/EditionDialog.tsx`** — per-album **Sharing** control (Local / Cloud / Shared) with sub-labels; access-level picker (Read-only / Collaborative) for Shared; the two name fields (synced *Album name* — disabled for read-only joiners — and local *Display name on this device*); per-album status chip.
- **`src/components/SyncSection.tsx` / `SyncDialog.tsx`** — reframe to manage the Cloud channel; add "Enter a code" that peeks and branches on `kind` (`collection` → Cloud join; `album` → add a new joiner album, apply access, force-lock if read-only). Replace the old "keep mine or theirs" prompt with a non-destructive merge.
- **Read-only enforcement** — `effectiveReadOnly(albumId)` selector; force-lock the header 🔒 (disabled) and gate the **Swaps** tab actions (`SwapsView`, `SwapDetail`, `NewSwapDialog`) — new gating, since `locked` doesn't currently touch swaps.
- **Name resolution** — `localAlbumNames[id] ?? snapshot.albumName` wherever a name renders (header, album selector, delete confirm).
- **Revocation** — joiner "Leave shared album" (keep-as-Local or delete); owner "Stop sharing" writes `sharingEndedAt`, joiners are notified on pull and convert to Local.
- **Globals** — make `theme` / `activeAlbumId` / `importSeq` device-local (drop from the merged/synced payload).

---

## Execution Handoff

Stage 1 is a self-contained, fully-tested module with no app wiring, so it's safe to execute on its own. See the two execution options below.
