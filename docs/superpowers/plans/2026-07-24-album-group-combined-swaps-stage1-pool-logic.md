# Album Groups & Combined Swaps — Stage 1: Data model + pure pool logic — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add the group data-model types and a pure, fully unit-tested `groupSwap.ts` module that computes the netted combined pool, swap candidates against another collector, and settlement routing — with no store, React, or global-singleton dependency.

**Architecture:** All logic is pure functions over a reduced `GroupMember` view (`{ id, name, counts, edition, trackCC, writable }`). The pool nets **writable** members per sticker (target = # writable members whose layout holds it); **view-only** (read-only joined) members contribute only informational needs. Later stages (store, sync, UI) call these functions; this stage ships nothing user-visible but leaves `npm test` green.

**Tech Stack:** TypeScript 5.6 (strict), Vitest 4. No new dependencies.

Spec: [docs/superpowers/specs/2026-07-17-album-group-combined-swaps-design.md](../specs/2026-07-17-album-group-combined-swaps-design.md) — §A (types), §B (pool math), §C (candidates), §D (settlement routing).

## Global Constraints

- **Language/tests:** TypeScript strict; unit tests are **Vitest** (`npm test` → `vitest run`), style `import { describe, it, expect } from 'vitest'` (see [src/utils/swap.test.ts](../../../src/utils/swap.test.ts)).
- **Purity:** `groupSwap.ts` may import only: types (`type`-only), and `buildAlbumFromType` + `activeType` from [src/data/albumTypes.ts](../../../src/data/albumTypes.ts) (node-safe pure data), and types/helpers from [src/utils/swap.ts](../../../src/utils/swap.ts) / [src/utils/import.ts](../../../src/utils/import.ts). **No** store, React, `window`, or `src/data/sampleAlbum.ts` singleton imports.
- **Sticker id space unchanged:** ids like `MEX-1`, `CC-5`, `FWC-trophy-00`.
- **Netting rule:** `target(id)` = number of **writable** members whose album layout includes `id`; `held/deficit/surplus` over writable members only; **view-only** members add only to `get` (informational). A sticker is give / get / neither among writable members.
- **Optional CC section:** a member's layout includes the Coca-Cola page iff `trackCC` is true, mirroring [sampleAlbum.ts](../../../src/data/sampleAlbum.ts)'s `enabledOptional = trackCC ? ['CC'] : []`.

## File Structure

- **Modify** [src/types.ts](../../../src/types.ts) — add `AlbumGroup`; add `Swap.receivingQty` and `Swap.settledByAlbum` (optional fields).
- **Create** `src/utils/groupSwap.ts` — `GroupMember`, `memberStickerIds`, `computeGroupPool`, `computeGroupCandidates`, `routeReceived`, `routeGiven`.
- **Create** `src/utils/groupSwap.test.ts` — Vitest coverage for all of the above.

---

### Task 1: Data-model types

**Files:**
- Modify: `src/types.ts` (append `AlbumGroup`; extend `Swap`)

**Interfaces:**
- Produces: `AlbumGroup { id: string; name: string; memberIds: string[]; swaps: Swap[] }`; `Swap.receivingQty?: Record<string, number>`; `Swap.settledByAlbum?: Record<string, Record<string, number>>`.

- [ ] **Step 1: Add the optional `Swap` fields.** In `src/types.ts`, inside `interface Swap`, immediately after the existing `settledDelta?` field, add:

```ts
  /**
   * Combined (group) swaps only. Copies to RECEIVE per sticker id — a combined swap
   * can be missing the same sticker in more than one album. Absent/≤1 means one copy.
   */
  receivingQty?: Record<string, number>;
  /**
   * Combined (group) swaps only. Per-album net count change settlement applied
   * (albumId -> stickerId -> delta). Replaces the flat `settledDelta` for group swaps;
   * rollbackSwap / undoLastTrade reverse it per album.
   */
  settledByAlbum?: Record<string, Record<string, number>>;
```

- [ ] **Step 2: Add the `AlbumGroup` type.** At the end of `src/types.ts`, append:

```ts
/**
 * A user-defined grouping of albums (of the same type) worked as one pool for
 * swapping. `memberIds` reference AlbumSnapshot ids the user can settle into;
 * `swaps` are the group's combined swaps (kept apart from each album's own swaps).
 */
export interface AlbumGroup {
  id: string;
  name: string;
  memberIds: string[];
  swaps: Swap[];
}
```

- [ ] **Step 3: Type-check.**

Run: `npx tsc -b`
Expected: no errors (types compile; nothing consumes them yet).

- [ ] **Step 4: Commit.**

```bash
git add src/types.ts
git commit -m "feat(groups): AlbumGroup type + combined-swap Swap fields"
```

---

### Task 2: `GroupMember` + `memberStickerIds`

**Files:**
- Create: `src/utils/groupSwap.ts`
- Test: `src/utils/groupSwap.test.ts`

**Interfaces:**
- Consumes: `buildAlbumFromType`, `activeType` from `../data/albumTypes`; `Counts`, `Edition` from `../types`.
- Produces:
  - `interface GroupMember { id: string; name: string; counts: Counts; edition: Edition; trackCC: boolean; writable: boolean }`
  - `memberStickerIds(m: GroupMember): Set<string>`

- [ ] **Step 1: Write the failing test.** Create `src/utils/groupSwap.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { memberStickerIds, type GroupMember } from './groupSwap';

const member = (over: Partial<GroupMember> = {}): GroupMember => ({
  id: 'a', name: 'A', counts: {}, edition: 'latam', trackCC: false, writable: true, ...over,
});

describe('memberStickerIds', () => {
  it('includes team stickers and excludes CC when trackCC is off', () => {
    const ids = memberStickerIds(member({ trackCC: false }));
    expect(ids.has('MEX-1')).toBe(true);
    expect(ids.has('CC-5')).toBe(false);
  });

  it('includes CC stickers when trackCC is on; latam has CC-14, na does not', () => {
    expect(memberStickerIds(member({ trackCC: true, edition: 'latam' })).has('CC-14')).toBe(true);
    expect(memberStickerIds(member({ trackCC: true, edition: 'na' })).has('CC-14')).toBe(false);
    expect(memberStickerIds(member({ trackCC: true, edition: 'na' })).has('CC-5')).toBe(true);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails.**

Run: `npx vitest run src/utils/groupSwap.test.ts`
Expected: FAIL — `Cannot find module './groupSwap'`.

- [ ] **Step 3: Write the minimal implementation.** Create `src/utils/groupSwap.ts`:

```ts
import type { Counts, Edition } from '../types';
import { activeType, buildAlbumFromType } from '../data/albumTypes';

/** A group member reduced to what pool math needs — no store/singleton dependency. */
export interface GroupMember {
  id: string;
  name: string;
  counts: Counts;
  edition: Edition;
  trackCC: boolean;
  /** false for a view-only (read-only joined) member. */
  writable: boolean;
}

/** The set of sticker ids present in a member's own album layout. */
export function memberStickerIds(m: GroupMember): Set<string> {
  // Mirrors sampleAlbum.applyEdition: the CC section is opt-in via trackCC.
  const album = buildAlbumFromType(activeType, {
    variant: m.edition,
    enabledOptional: m.trackCC ? ['CC'] : [],
  });
  return new Set(album.stickers.map((s) => s.id));
}
```

- [ ] **Step 4: Run the test to verify it passes.**

Run: `npx vitest run src/utils/groupSwap.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit.**

```bash
git add src/utils/groupSwap.ts src/utils/groupSwap.test.ts
git commit -m "feat(groups): GroupMember + memberStickerIds"
```

---

### Task 3: `computeGroupPool` (netting + internal moves + view-only needs)

**Files:**
- Modify: `src/utils/groupSwap.ts`
- Test: `src/utils/groupSwap.test.ts`

**Interfaces:**
- Consumes: `GroupMember`, `memberStickerIds` (Task 2).
- Produces:
  - `interface InternalMove { id: string; fromId: string; toId: string }`
  - `interface GroupPool { get: Record<string, number>; writableGet: Record<string, number>; give: Record<string, number>; internalMoves: InternalMove[] }`
  - `computeGroupPool(members: GroupMember[]): GroupPool`
  - Semantics per sticker `id` (over members whose layout includes `id`): `deficit` = # writable with count 0; `surplus` = Σ max(0,count−1) over writable; `viewDeficit` = # view-only with count 0. `give = max(0, surplus−deficit)`; `writableGet = max(0, deficit−surplus)`; `get = writableGet + viewDeficit`; `internalMoves` pairs surplus copies to deficit writable members, `min(deficit, surplus)` of them.

- [ ] **Step 1: Write the failing tests.** Append to `src/utils/groupSwap.test.ts`:

```ts
import { computeGroupPool } from './groupSwap';

const w = (id: string, counts: Counts): GroupMember =>
  ({ id, name: id, counts, edition: 'latam', trackCC: false, writable: true });
const v = (id: string, counts: Counts): GroupMember =>
  ({ id, name: id, counts, edition: 'latam', trackCC: false, writable: false });

describe('computeGroupPool', () => {
  it('A=2,B=0 → internal move A→B, nothing external', () => {
    const pool = computeGroupPool([w('A', { 'MEX-7': 2 }), w('B', { 'MEX-7': 0 })]);
    expect(pool.give['MEX-7']).toBeUndefined();
    expect(pool.get['MEX-7']).toBeUndefined();
    expect(pool.internalMoves).toEqual([{ id: 'MEX-7', fromId: 'A', toId: 'B' }]);
  });

  it('both missing → external get ×2', () => {
    const pool = computeGroupPool([w('A', { 'MEX-3': 0 }), w('B', { 'MEX-3': 0 })]);
    expect(pool.get['MEX-3']).toBe(2);
    expect(pool.writableGet['MEX-3']).toBe(2);
    expect(pool.give['MEX-3']).toBeUndefined();
  });

  it('A=3,B=0 → external give ×1 AND internal move', () => {
    const pool = computeGroupPool([w('A', { 'MEX-9': 3 }), w('B', { 'MEX-9': 0 })]);
    expect(pool.give['MEX-9']).toBe(1);
    expect(pool.get['MEX-9']).toBeUndefined();
    expect(pool.internalMoves).toEqual([{ id: 'MEX-9', fromId: 'A', toId: 'B' }]);
  });

  it('A=2,B=1 → external give ×1, no move', () => {
    const pool = computeGroupPool([w('A', { 'MEX-4': 2 }), w('B', { 'MEX-4': 1 })]);
    expect(pool.give['MEX-4']).toBe(1);
    expect(pool.internalMoves).toEqual([]);
  });

  it('mixed trackCC: CC-5 only in A → target 1, only A can need it', () => {
    const a: GroupMember = { id: 'A', name: 'A', counts: { 'CC-5': 0 }, edition: 'latam', trackCC: true, writable: true };
    const b: GroupMember = { id: 'B', name: 'B', counts: {}, edition: 'latam', trackCC: false, writable: true };
    const pool = computeGroupPool([a, b]);
    expect(pool.get['CC-5']).toBe(1); // only A participates, and it is missing it
  });

  it('view-only member adds to get but not to give/writableGet', () => {
    // A (writable) complete; V (view-only) missing → informational get, no give.
    const pool = computeGroupPool([w('A', { 'MEX-2': 1 }), v('V', { 'MEX-2': 0 })]);
    expect(pool.get['MEX-2']).toBe(1);
    expect(pool.writableGet['MEX-2']).toBeUndefined();
    expect(pool.give['MEX-2']).toBeUndefined();
  });
});
```

- [ ] **Step 2: Run to verify failure.**

Run: `npx vitest run src/utils/groupSwap.test.ts`
Expected: FAIL — `computeGroupPool` not exported.

- [ ] **Step 3: Implement `computeGroupPool`.** Append to `src/utils/groupSwap.ts`:

```ts
export interface InternalMove {
  id: string;
  fromId: string;
  toId: string;
}

export interface GroupPool {
  /** id -> external copies wanted from outsiders (writable gaps + view-only needs). */
  get: Record<string, number>;
  /** id -> copies that can be settled into a writable album (writable gaps only). */
  writableGet: Record<string, number>;
  /** id -> external spare copies available to give away (writable surplus only). */
  give: Record<string, number>;
  /** concrete copies to shuffle between writable members. */
  internalMoves: InternalMove[];
}

/** Net the whole group per sticker; see the module's netting rule. Deterministic. */
export function computeGroupPool(members: GroupMember[]): GroupPool {
  const idSets = new Map<string, Set<string>>();
  for (const m of members) idSets.set(m.id, memberStickerIds(m));

  const domain = new Set<string>();
  for (const set of idSets.values()) for (const id of set) domain.add(id);

  const get: Record<string, number> = {};
  const writableGet: Record<string, number> = {};
  const give: Record<string, number> = {};
  const internalMoves: InternalMove[] = [];

  for (const id of [...domain].sort()) {
    const deficitIds: string[] = []; // writable members with count 0
    const surplusUnits: string[] = []; // one entry per writable spare copy, labelled by member id
    let viewDeficit = 0;
    for (const m of members) {
      if (!idSets.get(m.id)!.has(id)) continue;
      const c = m.counts[id] ?? 0;
      if (m.writable) {
        if (c === 0) deficitIds.push(m.id);
        for (let k = 0; k < Math.max(0, c - 1); k++) surplusUnits.push(m.id);
      } else if (c === 0) {
        viewDeficit++;
      }
    }
    const deficit = deficitIds.length;
    const surplus = surplusUnits.length;
    const g = Math.max(0, surplus - deficit);
    const wGet = Math.max(0, deficit - surplus);
    if (g > 0) give[id] = g;
    if (wGet > 0) writableGet[id] = wGet;
    if (wGet + viewDeficit > 0) get[id] = wGet + viewDeficit;
    const pairs = Math.min(deficit, surplus);
    for (let k = 0; k < pairs; k++) {
      internalMoves.push({ id, fromId: surplusUnits[k], toId: deficitIds[k] });
    }
  }
  return { get, writableGet, give, internalMoves };
}
```

- [ ] **Step 4: Run to verify pass.**

Run: `npx vitest run src/utils/groupSwap.test.ts`
Expected: PASS (all `computeGroupPool` tests + Task 2 tests).

- [ ] **Step 5: Commit.**

```bash
git add src/utils/groupSwap.ts src/utils/groupSwap.test.ts
git commit -m "feat(groups): computeGroupPool netting + internal moves + view-only needs"
```

---

### Task 4: `computeGroupCandidates` (match pool vs another collector)

**Files:**
- Modify: `src/utils/groupSwap.ts`
- Test: `src/utils/groupSwap.test.ts`

**Interfaces:**
- Consumes: `computeGroupPool` (Task 3); `ParsedList` from `../utils/import`; `Reservations` from `../utils/swap`.
- Produces:
  - `interface GroupCandidates { youGive: string[]; giveQty: Record<string, number>; youGet: string[]; getQty: Record<string, number>; giveReserved: Set<string>; getReserved: Set<string> }`
  - `computeGroupCandidates(members: GroupMember[], other: ParsedList, reservations?: Reservations): GroupCandidates`

- [ ] **Step 1: Write the failing tests.** Append to `src/utils/groupSwap.test.ts`:

```ts
import { computeGroupCandidates } from './groupSwap';
import type { ParsedList } from './import';
import type { Reservations } from './swap';

const list = (over: Partial<ParsedList> = {}): ParsedList =>
  ({ needs: [], swaps: [], swapQty: {}, needQty: {}, all: {}, unmatched: [], ...over });

describe('computeGroupCandidates', () => {
  it('offers pooled surplus for their need, capped by their needed copies', () => {
    const members = [w('A', { 'MEX-9': 3 }), w('B', { 'MEX-9': 3 })]; // pooled give = 4
    const c = computeGroupCandidates(members, list({ needs: ['MEX-9'], needQty: { 'MEX-9': 2 } }));
    expect(c.youGive).toEqual(['MEX-9']);
    expect(c.giveQty['MEX-9']).toBe(2); // min(theirNeed 2, surplus 4)
  });

  it('requests two copies when both writable members miss it', () => {
    const members = [w('A', { 'MEX-3': 0 }), w('B', { 'MEX-3': 0 })];
    const c = computeGroupCandidates(members, list({ swaps: ['MEX-3'], swapQty: { 'MEX-3': 5 } }));
    expect(c.youGet).toEqual(['MEX-3']);
    expect(c.getQty['MEX-3']).toBe(2); // min(want 2, their spare 5)
  });

  it('flags a give whose only spare is reserved elsewhere', () => {
    const members = [w('A', { 'MEX-9': 2 }), w('B', { 'MEX-9': 1 })]; // pooled give = 1
    const reservations: Reservations = { committedGive: new Map([['MEX-9', 1]]), committedGet: new Set() };
    const c = computeGroupCandidates(members, list({ needs: ['MEX-9'] }), reservations);
    expect(c.youGive).toEqual(['MEX-9']);
    expect(c.giveReserved.has('MEX-9')).toBe(true);
  });

  it('includes a view-only need in youGet', () => {
    const members = [w('A', { 'MEX-2': 1 }), v('V', { 'MEX-2': 0 })];
    const c = computeGroupCandidates(members, list({ swaps: ['MEX-2'] }));
    expect(c.youGet).toEqual(['MEX-2']);
    expect(c.getQty['MEX-2']).toBe(1);
  });
});
```

- [ ] **Step 2: Run to verify failure.**

Run: `npx vitest run src/utils/groupSwap.test.ts`
Expected: FAIL — `computeGroupCandidates` not exported.

- [ ] **Step 3: Implement.** Add the import at the top of `src/utils/groupSwap.ts` (with the existing imports) and append the function:

```ts
// top of file, with other imports:
import type { ParsedList } from './import';
import type { Reservations } from './swap';
```

```ts
export interface GroupCandidates {
  youGive: string[];
  giveQty: Record<string, number>;
  youGet: string[];
  getQty: Record<string, number>;
  giveReserved: Set<string>;
  getReserved: Set<string>;
}

/**
 * Two-way overlap of another collector's parsed list against the group pool.
 * Mirrors computeCandidates (swap.ts) but over pooled surplus/gaps; reservations
 * flag (never hide) a spare already promised, or a sticker already being received.
 */
export function computeGroupCandidates(
  members: GroupMember[],
  other: ParsedList,
  reservations?: Reservations,
): GroupCandidates {
  const pool = computeGroupPool(members);
  const committedGive = reservations?.committedGive;
  const committedGet = reservations?.committedGet;

  const youGive: string[] = [];
  const giveQty: Record<string, number> = {};
  const giveReserved = new Set<string>();
  const youGet: string[] = [];
  const getQty: Record<string, number> = {};
  const getReserved = new Set<string>();

  for (const id of new Set(other.needs)) {
    const spare = pool.give[id] ?? 0;
    if (spare < 1) continue;
    youGive.push(id);
    giveQty[id] = Math.min(other.needQty?.[id] ?? 1, spare);
    if ((committedGive?.get(id) ?? 0) >= spare) giveReserved.add(id);
  }
  for (const id of new Set(other.swaps)) {
    const want = pool.get[id] ?? 0;
    if (want < 1) continue;
    youGet.push(id);
    getQty[id] = Math.min(want, other.swapQty?.[id] ?? 1);
    if (committedGet?.has(id)) getReserved.add(id);
  }
  return { youGive, giveQty, youGet, getQty, giveReserved, getReserved };
}
```

- [ ] **Step 4: Run to verify pass.**

Run: `npx vitest run src/utils/groupSwap.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit.**

```bash
git add src/utils/groupSwap.ts src/utils/groupSwap.test.ts
git commit -m "feat(groups): computeGroupCandidates over the pooled surplus/gaps"
```

---

### Task 5: `routeReceived` (settlement routing for received copies)

**Files:**
- Modify: `src/utils/groupSwap.ts`
- Test: `src/utils/groupSwap.test.ts`

**Interfaces:**
- Consumes: `GroupMember`, `memberStickerIds` (Task 2).
- Produces:
  - `interface ReceiveRouting { writes: Record<string, Record<string, number>>; ambiguous: { id: string; chosenIds: string[]; options: { id: string; name: string }[] }[]; handoffs: { id: string; memberId: string; memberName: string }[] }`
  - `routeReceived(members: GroupMember[], received: Record<string, number>): ReceiveRouting`
  - Rules per `id` with `qty` copies (over members whose layout includes `id`): assign one copy to each **writable needer** (count 0) in member order, up to `qty`; any copies beyond the writable needers go as `+extra` to the first writable includer (spare); if writable needers > `qty`, record `ambiguous` (`chosenIds` = the first `qty` needers, `options` = all writable needers); every **view-only needer** yields a `handoff` reminder (never a write).

- [ ] **Step 1: Write the failing tests.** Append to `src/utils/groupSwap.test.ts`:

```ts
import { routeReceived } from './groupSwap';

describe('routeReceived', () => {
  it('routes to the only needer, unambiguously', () => {
    const members = [w('A', { 'MEX-9': 1 }), w('B', { 'MEX-9': 0 })];
    const r = routeReceived(members, { 'MEX-9': 1 });
    expect(r.writes).toEqual({ B: { 'MEX-9': 1 } });
    expect(r.ambiguous).toEqual([]);
  });

  it('splits two copies one-each with no ambiguity', () => {
    const members = [w('A', { 'MEX-3': 0 }), w('B', { 'MEX-3': 0 })];
    const r = routeReceived(members, { 'MEX-3': 2 });
    expect(r.writes).toEqual({ A: { 'MEX-3': 1 }, B: { 'MEX-3': 1 } });
    expect(r.ambiguous).toEqual([]);
  });

  it('auto-assigns the first needer and flags ambiguity when one copy, two needers', () => {
    const members = [w('A', { 'MEX-7': 0 }), w('B', { 'MEX-7': 0 })];
    const r = routeReceived(members, { 'MEX-7': 1 });
    expect(r.writes).toEqual({ A: { 'MEX-7': 1 } });
    expect(r.ambiguous).toEqual([
      { id: 'MEX-7', chosenIds: ['A'], options: [{ id: 'A', name: 'A' }, { id: 'B', name: 'B' }] },
    ]);
  });

  it('reminds to hand off to a view-only needer without writing it', () => {
    const members = [w('A', { 'MEX-2': 1 }), v('V', { 'MEX-2': 0 })];
    const r = routeReceived(members, { 'MEX-2': 1 });
    // A already has it, so the extra copy lands as A's spare; V is a hand-off reminder only.
    expect(r.writes).toEqual({ A: { 'MEX-2': 1 } });
    expect(r.handoffs).toEqual([{ id: 'MEX-2', memberId: 'V', memberName: 'V' }]);
  });
});
```

- [ ] **Step 2: Run to verify failure.**

Run: `npx vitest run src/utils/groupSwap.test.ts`
Expected: FAIL — `routeReceived` not exported.

- [ ] **Step 3: Implement.** Append to `src/utils/groupSwap.ts`:

```ts
export interface ReceiveRouting {
  /** albumId -> stickerId -> copies to ADD (positive). */
  writes: Record<string, Record<string, number>>;
  /** stickers where a limited number of copies was auto-split among 2+ writable needers. */
  ambiguous: { id: string; chosenIds: string[]; options: { id: string; name: string }[] }[];
  /** view-only members missing a received sticker — physical hand-off reminders, never written. */
  handoffs: { id: string; memberId: string; memberName: string }[];
}

function addWrite(writes: Record<string, Record<string, number>>, albumId: string, id: string, n: number) {
  (writes[albumId] ??= {})[id] = (writes[albumId][id] ?? 0) + n;
}

/** Default routing of received copies to writable needers; view-only needs become reminders. */
export function routeReceived(members: GroupMember[], received: Record<string, number>): ReceiveRouting {
  const idSets = new Map(members.map((m) => [m.id, memberStickerIds(m)]));
  const writes: Record<string, Record<string, number>> = {};
  const ambiguous: ReceiveRouting['ambiguous'] = [];
  const handoffs: ReceiveRouting['handoffs'] = [];

  for (const [id, qty] of Object.entries(received)) {
    if (qty <= 0) continue;
    const includers = members.filter((m) => idSets.get(m.id)!.has(id));
    const writableNeeders = includers.filter((m) => m.writable && (m.counts[id] ?? 0) === 0);
    const assign = Math.min(writableNeeders.length, qty);
    for (let k = 0; k < assign; k++) addWrite(writes, writableNeeders[k].id, id, 1);
    const extra = qty - assign;
    if (extra > 0) {
      const target = includers.find((m) => m.writable);
      if (target) addWrite(writes, target.id, id, extra);
    }
    if (writableNeeders.length > qty && writableNeeders.length > 1) {
      ambiguous.push({
        id,
        chosenIds: writableNeeders.slice(0, qty).map((m) => m.id),
        options: writableNeeders.map((m) => ({ id: m.id, name: m.name })),
      });
    }
    for (const vm of includers.filter((m) => !m.writable && (m.counts[id] ?? 0) === 0)) {
      handoffs.push({ id, memberId: vm.id, memberName: vm.name });
    }
  }
  return { writes, ambiguous, handoffs };
}
```

- [ ] **Step 4: Run to verify pass.**

Run: `npx vitest run src/utils/groupSwap.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit.**

```bash
git add src/utils/groupSwap.ts src/utils/groupSwap.test.ts
git commit -m "feat(groups): routeReceived settlement routing + view-only hand-offs"
```

---

### Task 6: `routeGiven` (settlement routing for given copies)

**Files:**
- Modify: `src/utils/groupSwap.ts`
- Test: `src/utils/groupSwap.test.ts`

**Interfaces:**
- Consumes: `GroupMember`, `memberStickerIds` (Task 2).
- Produces:
  - `interface GiveRouting { writes: Record<string, Record<string, number>>; short: Record<string, number> }`
  - `routeGiven(members: GroupMember[], given: Record<string, number>, reservedSpares?: Record<string, Record<string, number>>): GiveRouting`
  - Rules per `id` with `qty` copies: source from writable members with **available spare** = `max(0, count−1) − reservedSpares[albumId][id]`, most-available first (ties in member order); record negative writes; any shortfall in `short`.

- [ ] **Step 1: Write the failing tests.** Append to `src/utils/groupSwap.test.ts`:

```ts
import { routeGiven } from './groupSwap';

describe('routeGiven', () => {
  it('decrements from the writable member holding the spare', () => {
    const members = [w('A', { 'MEX-9': 2 }), w('B', { 'MEX-9': 1 })];
    const r = routeGiven(members, { 'MEX-9': 1 });
    expect(r.writes).toEqual({ A: { 'MEX-9': -1 } });
    expect(r.short).toEqual({});
  });

  it('prefers the member with the most spares', () => {
    const members = [w('A', { 'MEX-9': 2 }), w('B', { 'MEX-9': 4 })];
    const r = routeGiven(members, { 'MEX-9': 1 });
    expect(r.writes).toEqual({ B: { 'MEX-9': -1 } });
  });

  it('skips a spare reserved by that album\'s own solo swap', () => {
    // A has 2 (1 spare) but it is reserved; B has 3 (2 spare) → give comes from B.
    const members = [w('A', { 'MEX-9': 2 }), w('B', { 'MEX-9': 3 })];
    const r = routeGiven(members, { 'MEX-9': 1 }, { A: { 'MEX-9': 1 } });
    expect(r.writes).toEqual({ B: { 'MEX-9': -1 } });
  });

  it('records a shortfall when the pool cannot cover the give', () => {
    const members = [w('A', { 'MEX-9': 1 }), w('B', { 'MEX-9': 1 })];
    const r = routeGiven(members, { 'MEX-9': 1 });
    expect(r.writes).toEqual({});
    expect(r.short).toEqual({ 'MEX-9': 1 });
  });
});
```

- [ ] **Step 2: Run to verify failure.**

Run: `npx vitest run src/utils/groupSwap.test.ts`
Expected: FAIL — `routeGiven` not exported.

- [ ] **Step 3: Implement.** Append to `src/utils/groupSwap.ts`:

```ts
export interface GiveRouting {
  /** albumId -> stickerId -> copies to REMOVE (negative). */
  writes: Record<string, Record<string, number>>;
  /** id -> copies the pool could not source (should not happen for pool-derived gives). */
  short: Record<string, number>;
}

/** Route each given copy to a writable member with an unreserved spare (most spares first). */
export function routeGiven(
  members: GroupMember[],
  given: Record<string, number>,
  reservedSpares: Record<string, Record<string, number>> = {},
): GiveRouting {
  const idSets = new Map(members.map((m) => [m.id, memberStickerIds(m)]));
  const writes: Record<string, Record<string, number>> = {};
  const short: Record<string, number> = {};

  for (const [id, qty] of Object.entries(given)) {
    let remaining = qty;
    const sources = members
      .filter((m) => m.writable && idSets.get(m.id)!.has(id))
      .map((m) => ({
        id: m.id,
        avail: Math.max(0, (m.counts[id] ?? 0) - 1) - (reservedSpares[m.id]?.[id] ?? 0),
      }))
      .filter((s) => s.avail > 0)
      .sort((a, b) => b.avail - a.avail); // most spares first; stable keeps member order on ties
    for (const s of sources) {
      if (remaining <= 0) break;
      const take = Math.min(s.avail, remaining);
      addWrite(writes, s.id, id, -take);
      remaining -= take;
    }
    if (remaining > 0) short[id] = remaining;
  }
  return { writes, short };
}
```

- [ ] **Step 4: Run to verify pass.**

Run: `npx vitest run src/utils/groupSwap.test.ts`
Expected: PASS.

- [ ] **Step 5: Full suite + type-check, then commit.**

Run: `npm test` (expect the whole suite green, including the new file) and `npx tsc -b` (no errors).

```bash
git add src/utils/groupSwap.ts src/utils/groupSwap.test.ts
git commit -m "feat(groups): routeGiven settlement routing with reservation-aware sourcing"
```

---

## Self-review notes (author)

- **Spec coverage:** §A types → Task 1; §B netting/internal-moves/view-only → Task 3; §C candidates (two-sided qty, reservations, view-only get) → Task 4; §D received routing (unambiguous / two-copy / ambiguous default / view-only hand-off) → Task 5, give routing (most-spares, reservation floor) → Task 6. Sync/merge and store/UI are **out of scope for Stage 1** (Stages 2–4).
- **Type consistency:** `writes` shape `Record<albumId, Record<stickerId, number>>` is identical in `ReceiveRouting`/`GiveRouting` and matches `Swap.settledByAlbum` (Task 1) so Stage 2 can persist a merged delta directly.
- **Determinism:** `computeGroupPool` sorts its id domain; member order is preserved everywhere → stable outputs for tests and for the "first needer" auto-route rule.

## Next stages (separate plans, authored when reached)

- **Stage 2 — Store:** `groups` state + CRUD (owned/writable membership), combined-swap CRUD, combined `closeSwap`/`rollbackSwap` applying `routeReceived`/`routeGiven` via an active-or-parked write helper, `applyInternalMove`, member-delete pruning + auto-disband.
- **Stage 3 — Sync:** `CollectionPayload.groups` + `mergeGroups` wired into `mergeCollection`; `serialize`/`applyMergedCollection` carry `groups`; back-compat for `groups`-less rows.
- **Stage 4 — UI:** Library `👥 Groups` screen, Swaps-tab combined lens, `NewSwapDialog`/`SwapClose` group mode, internal-moves panel, combined export — verified with the spec's §G smoke test.
