# Group Swap Album Indicator Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Show, on every combined-swap screen, which album each sticker comes out of and which album it goes into.

**Architecture:** One pure function (`routeForDisplay`) flattens the existing `routeGiven` / `routeReceived` output into per-sticker display data; a pure mapper (`chipBadges`) turns that into render-ready badge descriptors; a small `AlbumMark` component draws the album's tinted monogram. `StickerChips` gains a single optional `badges` prop, so every non-group screen renders byte-identically to today. Nothing is persisted — routing is derived on every render.

**Tech Stack:** React 18 + TypeScript, Zustand store, Vitest (node environment), plain CSS in a single `src/styles.css`.

**Spec:** [2026-07-28-group-swap-album-indicator-design.md](../specs/2026-07-28-group-swap-album-indicator-design.md)
**Mockups:** [2026-07-28-group-swap-album-indicator.html](../specs/mockups/2026-07-28-group-swap-album-indicator.html) (variant A)

## Global Constraints

- **Branch:** `feat/group-swap-album-indicator` is already checked out with the spec committed. Do not create another branch.
- **No persistence.** Do not add fields to `Swap`, `AlbumGroup`, `CollectionPayload`, or any merge function. Routing is derived every render.
- **Solo swaps must not change.** When `StickerChips` receives no `badges` prop it must render exactly the markup it renders today.
- **The give side is never interactive.** No control, dropdown, or click target on give-side routing on any screen (spec §C — fungible surplus).
- **Reuse the album identity vocabulary.** Colour comes from `coverTint(album.id)` and the existing `tint-0..5` classes; the letter from `monogram(album.name)`. Never introduce a second palette or a two-letter monogram.
- **Marks are ordered by group `memberIds` order**, never by `Object.keys` insertion order.
- **Tests are node-only.** Vitest runs `environment: 'node'` with `include: ['src/**/*.test.ts']`. Test files must be `.ts` (not `.tsx`) and must not import React components.
- **Verification commands:** `npm test` (vitest) and `npm run build` (runs `tsc -b` then vite build).

## Deviations from the spec (decided during planning, with reasons)

1. **§D contrast — one ink, not per-tint inks.** The spec anticipated darkening the ink for individual failing tints. Measured against `#06210f` (the `.album-cover` ink): green 6.35, blue 4.63, amber 7.94, red 4.53, purple **4.31 FAIL**, teal 6.85. Only purple fails, and blue passes — the opposite of what the spec guessed. Pure `#000` passes all six (min 5.31, purple). So `.amark` uses `color: #000` — a single rule with no per-tint exception to maintain, imperceptibly different from `#06210f` at 9.5px. Task 2 makes this an enforced unit test rather than a review-time eyeball.
2. **§C "one optional prop" — honoured, but the prop carries resolved albums.** `ChipRouting` holds member *ids*; the chip needs names. Rather than adding a second lookup prop, a pure `chipBadges()` mapper resolves ids to `{id, name, viewOnly}` first, so `StickerChips` still takes exactly one new prop.
3. **§G component-level test is NOT included.** The repo runs vitest node-only with no jsdom and no `@testing-library/react` (vitest.config.ts states this is deliberate: "Node environment is enough: tests only touch pure functions"). Adding a component-test stack for one assertion is disproportionate to the change. Instead the "renders identically without badges" guarantee is enforced structurally — `badges` is optional and every new render path sits behind `badge &&` — and verified by manual smoke row 9. **Flag for the user:** if you would rather add jsdom + RTL, that is a separate task before Task 3.

---

### Task 1: The pure routing seam

Flattens existing routing output into per-sticker display data. Pure, node-testable, no React.

**Files:**
- Modify: `src/utils/groupSwap.ts` (append; existing exports untouched)
- Test: `src/utils/groupSwap.test.ts` (append to the existing suite)

**Interfaces:**
- Consumes: existing `GroupMember`, `routeGiven`, `routeReceived` from the same file; `computeReservations`, `giveQtyOf` from `./swap` (verified: `swap.ts` imports only `../types` and `./import`, so there is no import cycle).
- Produces: `ChipRouting`, `DisplayRouting`, `routeForDisplay(members, giving, receiving, reservedSpares?)`, `reservedSparesOf(members)`, `swapRoutingInput(swap)` — used by Tasks 3–6.

- [ ] **Step 1: Write the failing tests**

Append to `src/utils/groupSwap.test.ts`. The `w` / `v` helpers already exist in that file (writable / view-only member factories).

```ts
describe('routeForDisplay', () => {
  const spares = (n: number) => ({ 'MEX-9': n });

  it('give routed to one member yields one mark', () => {
    const members = [w('A', { 'MEX-9': 2 }), w('B', { 'MEX-9': 1 })];
    const r = routeForDisplay(members, { 'MEX-9': 1 }, {});
    expect(r.give['MEX-9'].memberIds).toEqual(['A']);
  });

  it('two copies from one member is still one mark (qty lives on the chip)', () => {
    const members = [w('A', { 'MEX-9': 3 }), w('B', { 'MEX-9': 1 })];
    const r = routeForDisplay(members, { 'MEX-9': 2 }, {});
    expect(r.give['MEX-9'].memberIds).toEqual(['A']);
  });

  it('two copies from two members yields two marks in group order', () => {
    const members = [w('A', { 'MEX-9': 2 }), w('B', { 'MEX-9': 2 })];
    const r = routeForDisplay(members, { 'MEX-9': 2 }, {});
    expect(r.give['MEX-9'].memberIds).toEqual(['A', 'B']);
  });

  it('two needers and two copies: both marked, not ambiguous', () => {
    const members = [w('A', { 'MEX-7': 0 }), w('B', { 'MEX-7': 0 })];
    const r = routeForDisplay(members, {}, { 'MEX-7': 2 });
    expect(r.get['MEX-7'].memberIds).toEqual(['A', 'B']);
    expect(r.get['MEX-7'].ambiguousAmong).toBeUndefined();
  });

  it('two needers and one copy: one mark plus ambiguousAmong', () => {
    const members = [w('A', { 'MEX-3': 0 }), w('B', { 'MEX-3': 0 })];
    const r = routeForDisplay(members, {}, { 'MEX-3': 1 });
    expect(r.get['MEX-3'].memberIds).toEqual(['A']);
    expect(r.get['MEX-3'].ambiguousAmong).toEqual(['A', 'B']);
  });

  it('a view-only needer becomes a handoff, never a write target', () => {
    const members = [w('A', { 'ARG-2': 0 }), v('G', { 'ARG-2': 0 })];
    const r = routeForDisplay(members, {}, { 'ARG-2': 1 });
    expect(r.get['ARG-2'].memberIds).toEqual(['A']);
    expect(r.get['ARG-2'].handoffIds).toEqual(['G']);
  });

  it('a sticker only a view-only member needs has no write target at all', () => {
    const members = [w('A', { 'ARG-2': 1 }), v('G', { 'ARG-2': 0 })];
    const r = routeForDisplay(members, {}, { 'ARG-2': 1 });
    expect(r.get['ARG-2'].memberIds).toEqual([]);
    expect(r.get['ARG-2'].handoffIds).toEqual(['G']);
  });

  it('a member whose layout excludes the sticker never appears', () => {
    const members = [
      { ...w('A', { 'CC-5': 0 }), trackCC: true },
      { ...w('B', { 'CC-5': 0 }), trackCC: false },
    ];
    const r = routeForDisplay(members, {}, { 'CC-5': 1 });
    expect(r.get['CC-5'].memberIds).toEqual(['A']);
  });

  it('a give the pool cannot source yields no marks and does not throw', () => {
    const members = [w('A', { 'MEX-9': 1 }), w('B', { 'MEX-9': 1 })];
    const r = routeForDisplay(members, { 'MEX-9': 1 }, {});
    expect(r.give['MEX-9'].memberIds).toEqual([]);
  });

  it("respects a spare reserved by that album's own solo swap", () => {
    const members = [w('A', { 'MEX-9': 2 }), w('B', { 'MEX-9': 3 })];
    const r = routeForDisplay(members, { 'MEX-9': 1 }, {}, { A: spares(1) });
    expect(r.give['MEX-9'].memberIds).toEqual(['B']);
  });

  it('is per-sticker independent: dropping one id leaves the others identical', () => {
    const members = [w('A', { 'MEX-9': 2, 'BRA-4': 2 }), w('B', { 'MEX-9': 1, 'BRA-4': 1 })];
    const both = routeForDisplay(members, { 'MEX-9': 1, 'BRA-4': 1 }, {});
    const one = routeForDisplay(members, { 'BRA-4': 1 }, {});
    expect(one.give['BRA-4']).toEqual(both.give['BRA-4']);
  });

  it('orders marks by group member order, not by writes insertion order', () => {
    const members = [w('B', { 'MEX-7': 0 }), w('A', { 'MEX-7': 0 })];
    const r = routeForDisplay(members, {}, { 'MEX-7': 2 });
    expect(r.get['MEX-7'].memberIds).toEqual(['B', 'A']);
  });
});

describe('swapRoutingInput', () => {
  // theirNeeds / theirSwaps are required on Swap — omitting them fails typecheck.
  const base = {
    id: 's1', name: 'Carlos', status: 'open' as const, createdAt: 0,
    theirNeeds: [], theirSwaps: [],
    giving: [] as string[], receiving: [] as string[],
  };

  it('reads promised give quantities and receiving quantities', () => {
    const swap = { ...base, giving: ['MEX-9'], givingQty: { 'MEX-9': 2 },
      receiving: ['MEX-7'], receivingQty: { 'MEX-7': 2 } };
    expect(swapRoutingInput(swap)).toEqual({
      giving: { 'MEX-9': 2 },
      receiving: { 'MEX-7': 2 },
    });
  });

  it('defaults a missing receivingQty to one copy', () => {
    const swap = { ...base, giving: [], receiving: ['MEX-7'] };
    expect(swapRoutingInput(swap).receiving).toEqual({ 'MEX-7': 1 });
  });

  it('uses the promised set, ignoring deselection', () => {
    const swap = { ...base, giving: ['MEX-9'], receiving: ['MEX-7'],
      deselectedReceiving: ['MEX-7'] };
    expect(Object.keys(swapRoutingInput(swap).receiving)).toEqual(['MEX-7']);
  });
});

describe('reservedSparesOf', () => {
  it("maps each member to its own open swaps' committed gives", () => {
    const swap = {
      id: 's1', name: 'x', status: 'open' as const, createdAt: 0,
      theirNeeds: [], theirSwaps: [],
      giving: ['MEX-9'], receiving: [] as string[],
    };
    expect(reservedSparesOf([{ id: 'A', swaps: [swap] }, { id: 'B', swaps: [] }]))
      .toEqual({ A: { 'MEX-9': 1 }, B: {} });
  });
});
```

Update the import block at the top of the file to add the new names:

```ts
import {
  memberStickerIds,
  computeGroupPool,
  computeGroupCandidates,
  routeReceived,
  routeGiven,
  routeForDisplay,
  reservedSparesOf,
  swapRoutingInput,
  type GroupMember,
} from './groupSwap';
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npm test -- src/utils/groupSwap.test.ts`
Expected: FAIL — `routeForDisplay is not a function` (and the same for the other two new names).

- [ ] **Step 3: Implement**

Append to `src/utils/groupSwap.ts`. Extend the existing import lines at the top of the file:

```ts
import type { Counts, Edition, Swap } from '../types';
import { computeReservations, giveQtyOf } from './swap';
```

(`Swap` joins the existing `../types` import; `./swap` is currently a type-only import of `Reservations` — keep that line and add this value import beside it.)

```ts
/** Where one sticker's copies come from / go to, for display only. Never persisted. */
export interface ChipRouting {
  /** Distinct member ids this sticker leaves from (give) or lands in (get), in group order. */
  memberIds: string[];
  /** Set when more writable albums need it than copies are coming — user picks at close. */
  ambiguousAmong?: string[];
  /** View-only members missing it: a physical hand-off, never written to counts. */
  handoffIds?: string[];
}

export interface DisplayRouting {
  give: Record<string, ChipRouting>;
  get: Record<string, ChipRouting>;
}

/**
 * Flatten routeGiven / routeReceived into per-sticker display data. Adds no routing
 * logic of its own so the badges can never disagree with settlement.
 *
 * One mark per DISTINCT member: quantity is already carried by the chip's ×N badge, so
 * an album supplying both copies gets one mark, not two.
 */
export function routeForDisplay(
  members: GroupMember[],
  giving: Record<string, number>,
  receiving: Record<string, number>,
  reservedSpares: Record<string, Record<string, number>> = {},
): DisplayRouting {
  const order = new Map(members.map((m, i) => [m.id, i]));
  // writes is keyed by album id in insertion order; re-sort so marks follow group order.
  const inOrder = (ids: string[]) => [...ids].sort((a, b) => (order.get(a) ?? 0) - (order.get(b) ?? 0));

  const given = routeGiven(members, giving, reservedSpares);
  const received = routeReceived(members, receiving);

  const give: Record<string, ChipRouting> = {};
  for (const id of Object.keys(giving)) {
    give[id] = {
      memberIds: inOrder(Object.keys(given.writes).filter((aid) => (given.writes[aid][id] ?? 0) < 0)),
    };
  }

  const get: Record<string, ChipRouting> = {};
  for (const id of Object.keys(receiving)) {
    const amb = received.ambiguous.find((a) => a.id === id);
    const handoffIds = received.handoffs.filter((h) => h.id === id).map((h) => h.memberId);
    get[id] = {
      memberIds: inOrder(Object.keys(received.writes).filter((aid) => (received.writes[aid][id] ?? 0) > 0)),
      ...(amb ? { ambiguousAmong: inOrder(amb.options.map((o) => o.id)) } : {}),
      ...(handoffIds.length ? { handoffIds: inOrder(handoffIds) } : {}),
    };
  }

  return { give, get };
}

/** Each member's own solo-swap give reservations, so the per-album give floor holds. */
export function reservedSparesOf(
  members: { id: string; swaps: Swap[] }[],
): Record<string, Record<string, number>> {
  return Object.fromEntries(
    members.map((m) => [m.id, Object.fromEntries(computeReservations(m.swaps).committedGive)]),
  );
}

/**
 * The promised copies on a swap, as routeForDisplay wants them. Deliberately the
 * PROMISED set, not the checked set: routing is per-sticker independent, so this keeps
 * an unchecked chip's marks from blanking out and jumping back when it is re-checked.
 */
export function swapRoutingInput(swap: Swap): {
  giving: Record<string, number>;
  receiving: Record<string, number>;
} {
  const giving: Record<string, number> = {};
  for (const id of swap.giving) giving[id] = giveQtyOf(swap, id);
  const receiving: Record<string, number> = {};
  for (const id of swap.receiving) receiving[id] = Math.max(1, swap.receivingQty?.[id] ?? 1);
  return { giving, receiving };
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npm test -- src/utils/groupSwap.test.ts`
Expected: PASS, including all pre-existing tests in the file.

- [ ] **Step 5: Commit**

```bash
git add src/utils/groupSwap.ts src/utils/groupSwap.test.ts
git commit -m "feat(group-swap): derive per-sticker album routing for display"
```

---

### Task 2: Contrast-verified album mark

The identity primitive, with the spec's §D contrast rule turned into an executable test.

**Files:**
- Create: `src/utils/contrast.ts`
- Create: `src/utils/contrast.test.ts`
- Create: `src/components/AlbumMark.tsx`
- Modify: `src/styles.css` (append near the existing `.tint-*` block, around line 1809)

**Interfaces:**
- Consumes: `coverTint`, `monogram` from `src/utils/albumCover.ts`; `AlbumMarkInfo` from Task 3's `chipBadges.ts` is NOT yet available — define `AlbumMarkInfo` here in Task 3 order? No: `AlbumMarkInfo` is defined in `src/utils/chipBadges.ts` (Task 3). To avoid a forward dependency, **Task 2 defines its props inline** and Task 3 makes `AlbumMarkInfo` structurally identical, so `<AlbumMark {...info} />` compiles.
- Produces: `contrastRatio(hexA, hexB)`, `relativeLuminance(hex)`; `<AlbumMark id name viewOnly? size? />`; CSS classes `.amark`, `.amark-md`, `.amark.viewonly`, `.amark.ghost`.

- [ ] **Step 1: Write the failing contrast test**

Create `src/utils/contrast.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { contrastRatio } from './contrast';

/** The six album tints from styles.css. Keep in sync with the .tint-N rules. */
const TINTS: Record<string, string> = {
  'tint-0': '#18b563',
  'tint-1': '#3b82f6',
  'tint-2': '#f59e0b',
  'tint-3': '#ef4444',
  'tint-4': '#a855f7',
  'tint-5': '#14b8a6',
};

/** The .amark ink. Pure black, not .album-cover's #06210f, which fails on tint-4. */
const AMARK_INK = '#000000';

describe('contrastRatio', () => {
  it('is 21 for black on white and 1 for a colour on itself', () => {
    expect(contrastRatio('#000000', '#ffffff')).toBeCloseTo(21, 1);
    expect(contrastRatio('#18b563', '#18b563')).toBeCloseTo(1, 5);
  });

  it('is order-independent', () => {
    expect(contrastRatio('#000000', '#a855f7')).toBeCloseTo(contrastRatio('#a855f7', '#000000'), 5);
  });
});

describe('album mark legibility (spec §D)', () => {
  for (const [name, bg] of Object.entries(TINTS)) {
    it(`${name} clears 4.5:1 against the mark ink`, () => {
      expect(contrastRatio(AMARK_INK, bg)).toBeGreaterThanOrEqual(4.5);
    });
  }

  it('documents why the ink is not .album-cover’s #06210f: tint-4 fails with it', () => {
    expect(contrastRatio('#06210f', TINTS['tint-4'])).toBeLessThan(4.5);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm test -- src/utils/contrast.test.ts`
Expected: FAIL — cannot resolve `./contrast`.

- [ ] **Step 3: Implement the contrast util**

Create `src/utils/contrast.ts`:

```ts
/** WCAG 2.1 relative luminance / contrast, used to keep the album mark legible at chip size. */

function channelToLinear(srgb8: number): number {
  const s = srgb8 / 255;
  return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
}

/** Relative luminance of a `#rrggbb` colour, per WCAG 2.1. */
export function relativeLuminance(hex: string): number {
  const h = hex.replace('#', '');
  const [r, g, b] = [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16));
  return (
    0.2126 * channelToLinear(r) + 0.7152 * channelToLinear(g) + 0.0722 * channelToLinear(b)
  );
}

/** Contrast ratio between two `#rrggbb` colours: 1 (identical) to 21 (black on white). */
export function contrastRatio(a: string, b: string): number {
  const [hi, lo] = [relativeLuminance(a), relativeLuminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npm test -- src/utils/contrast.test.ts`
Expected: PASS — all six tints clear 4.5:1, and the `#06210f`/tint-4 case is confirmed below 4.5.

- [ ] **Step 5: Add the CSS**

In `src/styles.css`, immediately after the `.tint-5 { background: #14b8a6; }` line (currently line 1809):

```css
/* ---------- Album identity mark ----------
   The .album-cover tile at chip scale, sharing the same tint-N backgrounds and
   monogram so an album looks identical here, in the Library sheet and in the
   switcher. Ink is pure black rather than .album-cover's #06210f: at this size
   every tint must clear 4.5:1, and #06210f fails on tint-4 (4.31). Enforced by
   src/utils/contrast.test.ts. */
.amark {
  display: inline-grid;
  place-items: center;
  flex: none;
  width: 15px;
  height: 15px;
  border-radius: 5px;
  font-size: 9.5px;
  font-weight: 800;
  line-height: 1;
  color: #000;
}
/* Legend row size. */
.amark-md {
  width: 20px;
  height: 20px;
  border-radius: 6px;
  font-size: 11.5px;
}
/* A view-only member: the sticker is handed over physically, never written. */
.amark.viewonly {
  opacity: 0.65;
  box-shadow: inset 0 0 0 1px rgba(255, 255, 255, 0.3);
}
/* "More albums need this than copies are coming" — resolved at close. */
.amark.ghost {
  background: transparent;
  border: 1px dashed var(--text-dim);
  color: var(--text-dim);
}
```

- [ ] **Step 6: Create the component**

Create `src/components/AlbumMark.tsx`:

```tsx
import { coverTint, monogram } from '../utils/albumCover';

interface Props {
  id: string;
  name: string;
  /** Read-only joined member: a sticker "landing" here is a hand-off, never written. */
  viewOnly?: boolean;
  /** 'md' is the legend row; 'sm' (default) sits on a chip. */
  size?: 'sm' | 'md';
}

/**
 * An album's identity mark — the same tint and monogram as its AlbumCard cover.
 * Decorative-with-a-name: not focusable, so a chip stays one tab stop.
 */
export default function AlbumMark({ id, name, viewOnly, size = 'sm' }: Props) {
  const cls = ['amark', `tint-${coverTint(id)}`];
  if (size === 'md') cls.push('amark-md');
  if (viewOnly) cls.push('viewonly');
  return (
    <span className={cls.join(' ')} title={viewOnly ? `${name} — view-only` : name}>
      {monogram(name)}
    </span>
  );
}
```

- [ ] **Step 7: Verify the build typechecks**

Run: `npm run build`
Expected: succeeds. (`AlbumMark` is unused so far; TypeScript does not error on unused exports.)

- [ ] **Step 8: Commit**

```bash
git add src/utils/contrast.ts src/utils/contrast.test.ts src/components/AlbumMark.tsx src/styles.css
git commit -m "feat(group-swap): add contrast-verified AlbumMark identity primitive"
```

---

### Task 3: Badge mapper, legend, and badged chips

Turns routing into render-ready badges, and teaches `StickerChips` to draw them.

**Files:**
- Create: `src/utils/chipBadges.ts`
- Create: `src/utils/chipBadges.test.ts`
- Create: `src/components/GroupLegend.tsx`
- Modify: `src/components/StickerChips.tsx`
- Modify: `src/styles.css`

**Interfaces:**
- Consumes: `ChipRouting`, `DisplayRouting` (Task 1); `AlbumMark` (Task 2); existing `labelFor` from `src/utils/group.ts`.
- Produces: `AlbumMarkInfo`, `ChipBadge`, `chipBadges(routing, members, direction)`, `describeBadge(badge, qty)`; `<GroupLegend members={...} />`; `StickerChips` prop `badges?: Map<string, ChipBadge>`.

- [ ] **Step 1: Write the failing mapper tests**

Create `src/utils/chipBadges.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { chipBadges, describeBadge, type AlbumMarkInfo } from './chipBadges';
import type { ChipRouting } from './groupSwap';

const MEMBERS: AlbumMarkInfo[] = [
  { id: 'A', name: 'Leo' },
  { id: 'B', name: 'Kai' },
  { id: 'G', name: 'Grandpa', viewOnly: true },
];

const routing = (over: Partial<ChipRouting>): Record<string, ChipRouting> => ({
  'MEX-7': { memberIds: [], ...over },
});

describe('chipBadges', () => {
  it('resolves member ids to marks, preserving routing order', () => {
    const m = chipBadges(routing({ memberIds: ['B', 'A'] }), MEMBERS, 'get');
    expect(m.get('MEX-7')!.marks.map((x) => x.name)).toEqual(['Kai', 'Leo']);
    expect(m.get('MEX-7')!.direction).toBe('get');
  });

  it('flags ambiguity and resolves hand-offs separately from write targets', () => {
    const m = chipBadges(
      routing({ memberIds: ['A'], ambiguousAmong: ['A', 'B'], handoffIds: ['G'] }),
      MEMBERS,
      'get',
    );
    const b = m.get('MEX-7')!;
    expect(b.ambiguous).toBe(true);
    expect(b.marks.map((x) => x.name)).toEqual(['Leo']);
    expect(b.handoffs.map((x) => x.name)).toEqual(['Grandpa']);
  });

  it('drops ids with no matching member instead of rendering a blank mark', () => {
    const m = chipBadges(routing({ memberIds: ['A', 'GONE'] }), MEMBERS, 'give');
    expect(m.get('MEX-7')!.marks.map((x) => x.id)).toEqual(['A']);
  });

  it('produces an entry for every routed sticker, even an unrouted one', () => {
    const m = chipBadges(routing({ memberIds: [] }), MEMBERS, 'give');
    expect(m.get('MEX-7')!.marks).toEqual([]);
  });
});

describe('describeBadge', () => {
  const badge = (over: Partial<ReturnType<typeof mk>> = {}) => ({ ...mk(), ...over });
  function mk() {
    return { direction: 'get' as const, marks: [] as AlbumMarkInfo[], ambiguous: false, handoffs: [] as AlbumMarkInfo[] };
  }

  it('names a single destination', () => {
    expect(describeBadge(badge({ marks: [MEMBERS[0]] }), 1)).toBe('1 copy, to Leo');
  });

  it('joins two destinations and pluralises copies', () => {
    expect(describeBadge(badge({ marks: [MEMBERS[0], MEMBERS[1]] }), 2)).toBe('2 copies, to Leo and Kai');
  });

  it('says "from" on the give side', () => {
    expect(describeBadge(badge({ direction: 'give', marks: [MEMBERS[1]] }), 1)).toBe('1 copy, from Kai');
  });

  it('spells out an ambiguous copy', () => {
    expect(describeBadge(badge({ marks: [MEMBERS[0]], ambiguous: true }), 1)).toBe(
      '1 copy, to Leo — another album needs it too, you choose at close',
    );
  });

  it('describes a hand-off-only sticker', () => {
    expect(describeBadge(badge({ handoffs: [MEMBERS[2]] }), 1)).toBe(
      '1 copy, for Grandpa — hand over, not recorded',
    );
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npm test -- src/utils/chipBadges.test.ts`
Expected: FAIL — cannot resolve `./chipBadges`.

- [ ] **Step 3: Implement the mapper**

Create `src/utils/chipBadges.ts`:

```ts
import type { ChipRouting } from './groupSwap';

/** The fields AlbumMark needs to draw one album. */
export interface AlbumMarkInfo {
  id: string;
  name: string;
  viewOnly?: boolean;
}

/** One chip's routing, resolved to renderable albums. */
export interface ChipBadge {
  direction: 'give' | 'get';
  /** Albums this copy leaves from / lands in. */
  marks: AlbumMarkInfo[];
  /** More albums need it than copies are coming — the user picks at close. */
  ambiguous: boolean;
  /** View-only members needing it: handed over physically, never written. */
  handoffs: AlbumMarkInfo[];
}

/**
 * Resolve ChipRouting member ids into marks. Keeps StickerChips to a single new
 * prop by doing the id → album lookup before it reaches the component.
 */
export function chipBadges(
  routing: Record<string, ChipRouting>,
  members: AlbumMarkInfo[],
  direction: 'give' | 'get',
): Map<string, ChipBadge> {
  const byId = new Map(members.map((m) => [m.id, m]));
  const resolve = (ids: string[] = []) =>
    ids.map((id) => byId.get(id)).filter((m): m is AlbumMarkInfo => !!m);

  const out = new Map<string, ChipBadge>();
  for (const [id, r] of Object.entries(routing)) {
    out.set(id, {
      direction,
      marks: resolve(r.memberIds),
      ambiguous: !!r.ambiguousAmong?.length,
      handoffs: resolve(r.handoffIds),
    });
  }
  return out;
}

const list = (names: string[]) =>
  names.length <= 1 ? names.join('') : `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`;

/** Screen-reader sentence for a badged chip — colour is never the only signal. */
export function describeBadge(badge: ChipBadge, qty: number): string {
  const copies = `${qty} cop${qty === 1 ? 'y' : 'ies'}`;
  const names = badge.marks.map((m) => m.name);
  const handNames = badge.handoffs.map((m) => m.name);

  let core: string;
  if (names.length) {
    core = badge.direction === 'give' ? `from ${list(names)}` : `to ${list(names)}`;
    if (handNames.length) core += ` — also hand one to ${list(handNames)}`;
  } else if (handNames.length) {
    core = `for ${list(handNames)} — hand over, not recorded`;
  } else {
    core = 'not routed to an album';
  }

  return `${copies}, ${core}${badge.ambiguous ? ' — another album needs it too, you choose at close' : ''}`;
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npm test -- src/utils/chipBadges.test.ts`
Expected: PASS.

- [ ] **Step 5: Add the legend component**

Create `src/components/GroupLegend.tsx`:

```tsx
import type { AlbumMarkInfo } from '../utils/chipBadges';
import AlbumMark from './AlbumMark';

interface Props {
  members: AlbumMarkInfo[];
}

/** Maps each mark to its album, so the badges are learnable on first sight. */
export default function GroupLegend({ members }: Props) {
  if (members.length === 0) return null;
  return (
    <div className="group-legend">
      {members.map((m) => (
        <span className="legend-item" key={m.id}>
          <AlbumMark {...m} size="md" />
          {m.name}
          {m.viewOnly && <span className="group-member-badge">view-only</span>}
        </span>
      ))}
    </div>
  );
}
```

- [ ] **Step 6: Teach StickerChips to draw badges**

Rewrite `src/components/StickerChips.tsx` as:

```tsx
import { groupByPage, labelFor } from '../utils/group';
import { describeBadge, type ChipBadge } from '../utils/chipBadges';
import AlbumMark from './AlbumMark';

interface Props {
  ids: string[];
  selected: Set<string>;
  onToggle?: (id: string) => void;
  /** Map of sticker id → tooltip message for conflicted stickers. */
  conflicts?: Map<string, string>;
  /** Map of sticker id → copies. Anything >1 renders a "×N" badge on the chip. */
  quantities?: Map<string, number>;
  /**
   * Group mode only: sticker id → which albums this copy leaves from / lands in.
   * Absent on every solo swap, where chips render exactly as they always have.
   */
  badges?: Map<string, ChipBadge>;
  readOnly?: boolean;
}

/** Selectable sticker chips, grouped by page. Used in swap create / detail / close. */
export default function StickerChips({
  ids,
  selected,
  onToggle,
  conflicts,
  quantities,
  badges,
  readOnly,
}: Props) {
  const groups = groupByPage(ids);
  if (groups.length === 0) {
    return <p className="empty-note" style={{ padding: '6px 0' }}>Nothing here.</p>;
  }

  return (
    <div>
      {groups.map(({ page, stickers }) => (
        <div key={page.id} className="chip-group-row">
          <span className="chip-group-title">
            {page.emoji} {page.code}
          </span>
          <div className="chip-grid">
            {stickers.map((s) => {
              const isSel = selected.has(s.id);
              const conflictMsg = conflicts?.get(s.id);
              const qty = quantities?.get(s.id) ?? 1;
              const badge = badges?.get(s.id);
              const cls = ['chip'];
              if (isSel) cls.push('sel');
              if (conflictMsg) cls.push('conflict');
              if (badge) cls.push('badged');
              if (badge?.ambiguous) cls.push('amb');
              return (
                <button
                  key={s.id}
                  type="button"
                  className={cls.join(' ')}
                  onClick={() => !readOnly && onToggle?.(s.id)}
                  disabled={readOnly}
                  title={qty > 1 ? `${qty} copies` : undefined}
                  aria-label={badge ? `${labelFor(s.id)}, ${describeBadge(badge, qty)}` : undefined}
                >
                  {page.prefixNumbers ? page.code : ''}{s.number}
                  {qty > 1 && <span className="chip-qty">×{qty}</span>}
                  {badge && (
                    <span className="badge-row">
                      {badge.marks.map((m) => (
                        <AlbumMark key={m.id} {...m} />
                      ))}
                      {badge.handoffs.map((m) => (
                        <AlbumMark key={`h-${m.id}`} {...m} viewOnly />
                      ))}
                      {badge.ambiguous && <span className="amark ghost">?</span>}
                    </span>
                  )}
                  {conflictMsg && <span className="chip-warn" title={conflictMsg}>⚠️</span>}
                </button>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}
```

Note the only import change is adding `labelFor` to the existing `../utils/group` import — verify `labelFor` is exported there (it is; `SwapClose` and `InternalMovesPanel` already use it).

- [ ] **Step 7: Add the chip and legend CSS**

In `src/styles.css`, immediately after the existing `.chip .chip-qty { ... }` rule (currently ending around line 1499):

```css
/* A chip carrying album-routing marks (combined swaps only). */
.chip.badged {
  padding-bottom: 6px;
}
.chip .badge-row {
  display: flex;
  gap: 3px;
  justify-content: center;
  margin-top: 5px;
}
/* More albums need this than copies are coming — resolved on the close screen. */
.chip.amb {
  border-color: var(--gold);
  border-style: dashed;
}

/* Which mark means which album, shown above the give list in group mode. */
.group-legend {
  display: flex;
  gap: 12px;
  flex-wrap: wrap;
  align-items: center;
  margin: 8px 0 2px;
  font-size: 12px;
  color: var(--text-dim);
}
.group-legend .legend-item {
  display: inline-flex;
  align-items: center;
  gap: 5px;
}
```

- [ ] **Step 8: Verify build and full test suite**

Run: `npm run build && npm test`
Expected: build succeeds; all tests pass (solo-swap call sites still compile because `badges` is optional).

- [ ] **Step 9: Commit**

```bash
git add src/utils/chipBadges.ts src/utils/chipBadges.test.ts src/components/GroupLegend.tsx src/components/StickerChips.tsx src/styles.css
git commit -m "feat(group-swap): render album routing marks on sticker chips"
```

---

### Task 4: Wire the swap detail screen

The first surface where the user sees routing. Preview only — no controls.

**Files:**
- Modify: `src/components/SwapDetail.tsx`

**Interfaces:**
- Consumes: `routeForDisplay`, `reservedSparesOf`, `swapRoutingInput` (Task 1); `chipBadges` (Task 3); `GroupLegend` (Task 3); existing `groupCtx.members` (`ResolvedGroupMember[]`, which already carries `id`, `name`, `writable`, `swaps`).
- Produces: nothing consumed by later tasks.

- [ ] **Step 1: Add the imports**

In `src/components/SwapDetail.tsx`, extend the existing imports:

```tsx
import { computeConflicts, giveQtyOf } from '../utils/swap';
import { routeForDisplay, reservedSparesOf, swapRoutingInput } from '../utils/groupSwap';
import { chipBadges, type AlbumMarkInfo } from '../utils/chipBadges';
import GroupLegend from './GroupLegend';
```

- [ ] **Step 2: Derive the badges**

Insert after the existing `recvConflicts` / `conflictCount` block (just before `const giving = new Set(...)`, currently around line 99):

```tsx
  // Group mode: which album each promised copy leaves from / lands in. Derived live
  // from current counts every render — preview only, nothing persisted.
  const markAlbums: AlbumMarkInfo[] = useMemo(
    () => (groupCtx?.members ?? []).map((m) => ({ id: m.id, name: m.name, viewOnly: !m.writable })),
    [groupCtx],
  );

  const badges = useMemo(() => {
    if (!groupCtx) return null;
    const { giving: g, receiving: r } = swapRoutingInput(swap);
    const routing = routeForDisplay(groupCtx.members, g, r, reservedSparesOf(groupCtx.members));
    return {
      give: chipBadges(routing.give, markAlbums, 'give'),
      get: chipBadges(routing.get, markAlbums, 'get'),
    };
  }, [groupCtx, swap, markAlbums]);
```

- [ ] **Step 3: Render the legend and pass the badges**

Replace the two `StickerChips` blocks (currently lines 202–220) with:

```tsx
        {groupCtx && <GroupLegend members={markAlbums} />}

        <div className="section-title">You give ({giveCopies})</div>
        <StickerChips
          ids={swap.giving}
          selected={giving}
          conflicts={giveConflicts}
          quantities={giveQty}
          badges={badges?.give}
          onToggle={toggleGiving}
          readOnly={!isOpen || readOnly}
        />

        <div className="section-title">You get ({groupCtx ? receiveCopies : receiving.size})</div>
        <StickerChips
          ids={swap.receiving}
          selected={receiving}
          conflicts={recvConflicts}
          quantities={groupCtx ? receiveQty : undefined}
          badges={badges?.get}
          onToggle={toggleReceiving}
          readOnly={!isOpen || readOnly}
        />

        {groupCtx && isOpen && (
          <p className="modal-sub" style={{ margin: '10px 0 0' }}>
            <span className="amark ghost" style={{ verticalAlign: '-3px' }}>?</span>{' '}
            = more than one album needs it and only one copy is coming — you'll pick at close.
          </p>
        )}
```

- [ ] **Step 4: Verify**

Run: `npm run build && npm test`
Expected: build succeeds, all tests pass.

Then manual: `npm run dev`, open a combined swap from the group lens, and confirm marks appear on both chip lists with the legend above. Open a **solo** swap and confirm no legend and no marks.

- [ ] **Step 5: Commit**

```bash
git add src/components/SwapDetail.tsx
git commit -m "feat(group-swap): show album routing on the combined swap detail"
```

---

### Task 5: Wire the new combined swap dialog

Shows who each match is for, before the swap is saved.

**Files:**
- Modify: `src/components/NewSwapDialog.tsx`

**Interfaces:**
- Consumes: `routeForDisplay`, `reservedSparesOf` (Task 1); `chipBadges` (Task 3); `GroupLegend` (Task 3); the existing `candidates` object from `computeGroupCandidates`, whose `giveQty` / `getQty` are already `Record<string, number>` — exactly `routeForDisplay`'s input shape.
- Produces: nothing consumed by later tasks.

- [ ] **Step 1: Add the imports**

In `src/components/NewSwapDialog.tsx`, extend the existing imports:

```tsx
import { routeForDisplay, reservedSparesOf } from '../utils/groupSwap';
import { chipBadges, type AlbumMarkInfo } from '../utils/chipBadges';
import GroupLegend from './GroupLegend';
```

(`computeGroupCandidates` is already imported; keep it.)

- [ ] **Step 2: Derive the badges from the candidates**

Insert immediately after the `candidates` `useMemo` (currently around line 102):

```tsx
  const markAlbums: AlbumMarkInfo[] = useMemo(
    () => (groupCtx?.members ?? []).map((m) => ({ id: m.id, name: m.name, viewOnly: !m.writable })),
    [groupCtx],
  );

  // Routing is per-sticker independent, so these marks stay put as candidates are
  // toggled on and off — they describe every offered sticker, not just the checked ones.
  const badges = useMemo(() => {
    if (!groupCtx || !candidates) return null;
    const routing = routeForDisplay(
      groupCtx.members,
      candidates.giveQty,
      candidates.getQty,
      reservedSparesOf(groupCtx.members),
    );
    return {
      give: chipBadges(routing.give, markAlbums, 'give'),
      get: chipBadges(routing.get, markAlbums, 'get'),
    };
  }, [groupCtx, candidates, markAlbums]);
```

**Note on types:** `candidates` is a union of `GroupCandidates` and the solo `Candidates`; only the group branch has `getQty`. The `!groupCtx` guard narrows it at runtime. If TypeScript cannot narrow the union here, cast at the call site with `candidates as GroupCandidates` and import that type from `../utils/groupSwap` — do not widen the shared type.

- [ ] **Step 3: Render the legend and pass the badges**

Add the legend directly above the `You can give` section title (currently line 215), inside the `{candidates && (<>` fragment:

```tsx
            {groupCtx && <GroupLegend members={markAlbums} />}
```

Then add `badges={badges?.give}` to the first `StickerChips` (the `youGive` one) and `badges={badges?.get}` to the second (`youGet`), leaving every other prop untouched.

- [ ] **Step 4: Verify**

Run: `npm run build && npm test`
Expected: build succeeds, all tests pass.

Then manual: `npm run dev` → group lens → **New combined swap** → paste a list → **Find matches**. Confirm marks on both candidate lists, and that toggling one chip does not change any other chip's marks.

- [ ] **Step 5: Commit**

```bash
git add src/components/NewSwapDialog.tsx
git commit -m "feat(group-swap): show album routing on combined swap candidates"
```

---

### Task 6: Rework the close screen

Badges replace the grey route text; a focused panel keeps only what still needs a decision.

**Files:**
- Modify: `src/components/SwapClose.tsx`
- Modify: `src/styles.css` (add `.needs-call`; **remove** the now-dead `.close-routes` / `.close-route` / `.close-handoff` rules, currently lines 2690–2715)

**Interfaces:**
- Consumes: everything from Tasks 1–3. The existing `receiveRouting` / `giveRouting` / `routeOverride` / `confirm()` settlement logic is **unchanged** — only presentation changes.
- Produces: nothing.

- [ ] **Step 1: Add the imports**

In `src/components/SwapClose.tsx`, extend the existing imports:

```tsx
import { useMemo, useState } from 'react';
import { routeForDisplay, reservedSparesOf, swapRoutingInput, routeReceived, routeGiven } from '../utils/groupSwap';
import { chipBadges, type AlbumMarkInfo } from '../utils/chipBadges';
import GroupLegend from './GroupLegend';
```

(`routeReceived` / `routeGiven` are already imported — keep them; they drive settlement.)

- [ ] **Step 2: Derive the display badges, honouring the override**

Insert after the existing `nameOf` helper (currently around line 58):

```tsx
  const markAlbums: AlbumMarkInfo[] = useMemo(
    () => members.map((m) => ({ id: m.id, name: m.name, viewOnly: !m.writable })),
    [members],
  );

  /**
   * Badges describe the PROMISED set, while receiveRouting/giveRouting above settle the
   * CHECKED set. Routing is per-sticker independent, so the two agree on every checked
   * chip — and using the promised set stops an unchecked chip's marks from blanking out
   * and jumping back when it is re-checked.
   */
  const badges = useMemo(() => {
    if (!groupCtx) return null;
    const { giving: g, receiving: r } = swapRoutingInput(swap);
    const routing = routeForDisplay(members, g, r, reservedSparesOf(members));
    // Reflect the user's ambiguous-copy override on the chip itself.
    for (const [id, chosen] of Object.entries(routeOverride)) {
      if (routing.get[id]) routing.get[id] = { ...routing.get[id], memberIds: [chosen] };
    }
    return {
      give: chipBadges(routing.give, markAlbums, 'give'),
      get: chipBadges(routing.get, markAlbums, 'get'),
    };
  }, [groupCtx, members, swap, routeOverride, markAlbums]);
```

- [ ] **Step 3: Replace the route text with badges and the decision panel**

Replace everything from `<div className="section-title">You gave ...` through the closing of the received `.close-routes` block (currently lines 128–187) with:

```tsx
        {groupCtx && <GroupLegend members={markAlbums} />}

        <div className="section-title">You gave ({givenCopies})</div>
        <StickerChips
          ids={swap.giving}
          selected={given}
          quantities={giveQty}
          badges={badges?.give}
          onToggle={(id) => toggle(given, setGiven, id)}
        />

        <div className="section-title">You received ({groupCtx ? receivedCopies : received.size})</div>
        <StickerChips
          ids={swap.receiving}
          selected={received}
          quantities={groupCtx ? receiveQty : undefined}
          badges={badges?.get}
          onToggle={(id) => toggle(received, setReceived, id)}
        />

        {groupCtx && receiveRouting && (needsCall.length > 0 || handoffRows.length > 0) && (
          <div className="needs-call">
            <div className="nc-title">⚠️ Needs your call</div>
            {needsCall.map((amb) => (
              <div className="nc-row" key={amb.id}>
                <span className="nc-sticker">{labelFor(amb.id)}</span>
                <span style={{ color: 'var(--text-dim)' }}>
                  {amb.options.length} albums need it, {receiveQty.get(amb.id) ?? 1} copy →
                </span>
                <select
                  className="route-change"
                  value={routeOverride[amb.id] ?? amb.chosenIds[0]}
                  onChange={(e) => setRouteOverride((prev) => ({ ...prev, [amb.id]: e.target.value }))}
                >
                  {amb.options.map((o) => (
                    <option key={o.id} value={o.id}>{o.name}</option>
                  ))}
                </select>
              </div>
            ))}
            {handoffRows.map((h) => (
              <div className="nc-row" key={`${h.id}-${h.memberId}`}>
                <span className="nc-sticker">{labelFor(h.id)}</span>
                <span className="nc-handoff">🤝 hand to {h.memberName} — not recorded</span>
              </div>
            ))}
          </div>
        )}
```

Add these two derivations immediately above the `return (`, so the panel only ever lists stickers that are actually being settled:

```tsx
  // Only checked stickers are settled, so only they can still need a decision.
  const needsCall = (receiveRouting?.ambiguous ?? []).filter(
    (a) => a.chosenIds.length === 1 && received.has(a.id),
  );
  const handoffRows = (receiveRouting?.handoffs ?? []).filter((h) => received.has(h.id));
```

The now-unused `receiveTargets` helper and the `nameOf` helper may become dead. Delete `receiveTargets`; **keep `nameOf` only if still referenced** — check with `grep -n "nameOf\|receiveTargets" src/components/SwapClose.tsx` and remove whichever has no remaining callers. `confirm()` must not be touched.

- [ ] **Step 4: Swap the CSS**

In `src/styles.css`, **delete** the `.close-routes`, `.close-route`, `.close-route .route-change`, and `.close-handoff` rules (currently lines 2690–2715) and replace them with:

```css
/* Combined-swap close: the only routing that still needs a human decision —
   an ambiguous single copy, or a view-only member's hand-off. Everything
   unambiguous is already stated by the chips' album marks. */
.needs-call {
  margin-top: 12px;
  background: rgba(245, 197, 66, 0.08);
  border: 1px solid rgba(245, 197, 66, 0.35);
  border-radius: var(--radius-sm);
  padding: 10px 12px;
}
.needs-call .nc-title {
  font-size: 12px;
  font-weight: 800;
  color: var(--gold);
  margin-bottom: 8px;
}
.needs-call .nc-row {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 13px;
  flex-wrap: wrap;
}
.needs-call .nc-row + .nc-row {
  margin-top: 8px;
  border-top: 1px solid rgba(245, 197, 66, 0.2);
  padding-top: 8px;
}
.needs-call .nc-sticker {
  font-weight: 800;
  font-size: 12.5px;
  background: var(--bg-elev-2);
  border: 1px solid var(--border);
  border-radius: 8px;
  padding: 4px 8px;
}
.needs-call .route-change {
  background: var(--bg-elev-2);
  color: var(--text);
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  padding: 3px 6px;
  font-size: 13px;
  font-family: inherit;
}
.needs-call .nc-handoff {
  color: var(--green-bright);
  font-weight: 600;
}
```

- [ ] **Step 5: Confirm no dead references remain**

Run: `grep -rn "close-route\|close-handoff\|close-routes" src/`
Expected: no matches.

- [ ] **Step 6: Verify**

Run: `npm run build && npm test`
Expected: build succeeds, all tests pass.

- [ ] **Step 7: Commit**

```bash
git add src/components/SwapClose.tsx src/styles.css
git commit -m "feat(group-swap): badge routing at close, keep only real decisions"
```

---

### Task 7: Full verification

**Files:** none modified unless a defect is found.

- [ ] **Step 1: Run the whole suite and a production build**

Run: `npm test && npm run build`
Expected: all tests pass; build succeeds with no TypeScript errors.

- [ ] **Step 2: Work the manual smoke script**

Run `npm run dev` and work through spec §H against the two-album group (**Leo** + **Kai**, group **Kids**, plus a read-only joined share **Grandpa** as a view-only member):

- [ ] Both missing `MEX-7`, receiving ×2 → chip `7 ×2` shows **two** marks on new-swap, detail and close
- [ ] Both missing `MEX-3`, receiving ×1 → one concrete mark + dashed `?`; close lists exactly one "Needs your call" row with the album `<select>`
- [ ] Changing that `<select>` switches the chip's concrete mark to the chosen album
- [ ] Leo `MEX-9`×2 / Kai ×1, giving 1 → give chip shows a single **L** mark, and there is **no** control anywhere on the give side
- [ ] Leo tracks CC, Kai does not, receiving `CC-5` → chip shows **L** only
- [ ] Only Grandpa needs `ARG-2` → view-only mark on the chip; close shows `🤝 hand to Grandpa — not recorded`; **no** count written to Grandpa
- [ ] On the close screen, toggling one sticker off leaves every other chip's marks unchanged
- [ ] A 4-member group → four marks still fit a 64px chip without reflowing the grid
- [ ] **Regression:** a solo (non-group) swap shows no legend and no marks, identical to before

- [ ] **Step 3: Confirm nothing was persisted**

Run: `git diff main --stat -- src/types.ts src/sync/`
Expected: **no output** — no changes to types or to any sync/merge code, per the spec's no-persistence constraint.

- [ ] **Step 4: Commit any fixes**

If a smoke step failed, fix it, re-run Step 1, and commit with a `fix(group-swap): …` message. If everything passed, there is nothing to commit.

---

## Self-Review

**Spec coverage:**

| Spec section | Task |
|---|---|
| §A `AlbumMark` primitive, tint/monogram reuse | Task 2 |
| §A ink / contrast | Task 2 (measured; deviation 1 documented above) |
| §B `ChipRouting`, `routeForDisplay`, derivation table | Task 1 |
| §B per-surface inputs, `reservedSparesOf`, `swapRoutingInput` | Task 1 (helpers), Tasks 4–6 (use) |
| §C `StickerChips` one optional prop | Task 3 (deviation 2: prop carries resolved albums) |
| §C `GroupLegend` on all three surfaces | Task 3 (component), Tasks 4–6 (render) |
| §C new swap / detail / close behaviour table | Tasks 5 / 4 / 6 |
| §C "Needs your call" panel, `.close-routes` removed | Task 6 |
| §C give side non-interactive | Global constraint; verified in Task 7 |
| §D aria-labels, title, non-focusable marks | Task 3 (`describeBadge`, `AlbumMark`) |
| §D ≥4.5:1 contrast | Task 2 (enforced by `contrast.test.ts`) |
| §E all seven edge cases | Task 1 tests (rows 1–6), Task 3 test (unknown id), `SwapsView` gating (row 7, pre-existing) |
| §F no persistence | Global constraint; verified in Task 7 Step 3 |
| §G pure-logic test table | Task 1 |
| §G component-level test | **Not implemented** — deviation 3 above, flagged for the user |
| §H manual smoke | Task 7 |

**Placeholder scan:** No TBD/TODO. Every code step contains the actual code. Task 5 Step 2 contains a conditional instruction (union narrowing) but states the exact fallback and forbids widening the shared type.

**Type consistency:** `ChipRouting` (Task 1) → consumed by `chipBadges` (Task 3) with matching field names `memberIds` / `ambiguousAmong` / `handoffIds`. `AlbumMarkInfo` (`{id, name, viewOnly?}`, Task 3) is structurally identical to `AlbumMark`'s props (Task 2), so `<AlbumMark {...info} />` compiles. `ChipBadge.direction` is set by `chipBadges` and read by `describeBadge` — both `'give' | 'get'`. `reservedSparesOf` takes `{id, swaps}[]` and `ResolvedGroupMember` satisfies it structurally.
