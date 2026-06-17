# Swap Rollback Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a Rollback action to a concluded swap that exactly reverses its collection-count changes and reopens it to `open` status.

**Architecture:** Move the close/rollback count math into two pure functions in `src/utils/swap.ts` (`settleSwapCounts`, `reverseSettlement`) so it is unit-testable without the zustand store's `persist`/`localStorage`. `closeSwap` records the net per-sticker count change it applied onto the swap as `settledDelta`; `rollbackSwap` applies the exact inverse and flips the swap back to `open`. A **↩ Rollback** button in the closed-swap branch of `SwapDetail` wires it up.

**Tech Stack:** React 18 + TypeScript (strict), Zustand (with `persist`), Vite 5. Tests via Vitest (added by this plan).

## Global Constraints

- TypeScript strict mode; `noUnusedLocals` and `noUnusedParameters` are on — no unused imports or vars (remove `quantityAfterGive` from the store import once it is no longer referenced there).
- No new **runtime** dependencies. Vitest is added as a **dev** dependency only.
- Tests import only pure functions from `src/utils/swap.ts`. Do NOT import `src/store/collectionStore.ts` in tests — its `persist` middleware touches `localStorage` and throws in a node environment.
- Pure helpers live in `src/utils/swap.ts` alongside the existing `quantityAfterGive` / `computeReservations`, matching that file's pure-function style.
- Count floor: clamp to `0` minimum (mirrors the store's `clampCount`); use `Math.max(0, x)` in the pure helpers.
- Reuse existing `.btn` CSS classes for the new button — no new CSS.

---

## File Structure

- `src/types.ts` — add optional `settledDelta?: Record<string, number>` to `Swap`.
- `src/utils/swap.ts` — add pure `settleSwapCounts` and `reverseSettlement`.
- `src/utils/swap.test.ts` — **new**, Vitest unit tests for the two pure helpers.
- `src/store/collectionStore.ts` — refactor `closeSwap` to use `settleSwapCounts` + store `settledDelta`; add `rollbackSwap` action (interface + implementation).
- `src/components/SwapDetail.tsx` — add the ↩ Rollback button in the closed-swap branch.
- `vitest.config.ts` — **new**, isolated test config (node env).
- `tsconfig.app.json` — exclude `src/**/*.test.ts` from the production typecheck.
- `package.json` — add `vitest` dev dependency and `"test": "vitest run"` script.

---

### Task 1: Test harness + `settleSwapCounts` pure helper

Sets up Vitest and lands the first pure helper (settlement math + delta recording) with tests, including the conflict/floor case that motivates the whole design.

**Files:**
- Modify: `package.json` (add dev dep + script)
- Create: `vitest.config.ts`
- Modify: `tsconfig.app.json` (exclude test files)
- Modify: `src/types.ts` (add `settledDelta`)
- Modify: `src/utils/swap.ts:94-99` (add `settleSwapCounts` near `quantityAfterGive`)
- Test: `src/utils/swap.test.ts`

**Interfaces:**
- Consumes: existing `quantityAfterGive(current: number, committedByOthers: number): number` from `swap.ts`.
- Produces: `settleSwapCounts(counts: Counts, settled: { givenIds: string[]; receivedIds: string[] }, committedGive: Map<string, number>): { counts: Counts; delta: Record<string, number> }` — returns the post-settlement counts and the net change per touched sticker (gives are negative or omitted-if-floored, receives are `+1`).

- [ ] **Step 1: Install Vitest**

Run: `npm install -D vitest`
Expected: `vitest` added under `devDependencies` in `package.json`; install completes without errors.

- [ ] **Step 2: Add the test script**

In `package.json`, add to `"scripts"`:

```json
    "test": "vitest run"
```

(Place it after `"preview": "vite preview"`, keeping valid JSON — add a comma after the `preview` line.)

- [ ] **Step 3: Create the isolated Vitest config**

Create `vitest.config.ts`:

```ts
import { defineConfig } from 'vitest/config';

// Standalone test config so Vitest does NOT load vite.config.ts (PWA plugin).
// Node environment is enough: tests only touch pure functions in src/utils.
export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
});
```

- [ ] **Step 4: Keep test files out of the production typecheck**

In `tsconfig.app.json`, add an `exclude` sibling to `include` so `tsc -b` (run by `npm run build`) ignores test files:

```json
  "include": ["src"],
  "exclude": ["src/**/*.test.ts"]
```

- [ ] **Step 5: Add the `settledDelta` field to `Swap`**

In `src/types.ts`, inside the `Swap` interface (after the `deselectedReceiving?` field), add:

```ts
  /**
   * Net count change closeSwap applied at settlement, per sticker id
   * (given -1, received +1; floored gives are omitted). Used by
   * rollbackSwap to reverse the close exactly. Absent on swaps closed
   * before this field existed.
   */
  settledDelta?: Record<string, number>;
```

- [ ] **Step 6: Write the failing test for `settleSwapCounts`**

Create `src/utils/swap.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { settleSwapCounts } from './swap';

describe('settleSwapCounts', () => {
  it('decrements a given spare and increments a received sticker', () => {
    const { counts, delta } = settleSwapCounts(
      { A: 2, B: 0 },
      { givenIds: ['A'], receivedIds: ['B'] },
      new Map(),
    );
    expect(counts).toEqual({ A: 1, B: 1 });
    expect(delta).toEqual({ A: -1, B: 1 });
  });

  it('does not decrement (or record a delta for) a give floored by another open swap', () => {
    // A has 2 (1 spare) but another open swap also reserves A, so the spare is held.
    const { counts, delta } = settleSwapCounts(
      { A: 2 },
      { givenIds: ['A'], receivedIds: [] },
      new Map([['A', 1]]),
    );
    expect(counts).toEqual({ A: 2 });
    expect(delta).toEqual({});
  });
});
```

- [ ] **Step 7: Run the test to verify it fails**

Run: `npx vitest run src/utils/swap.test.ts`
Expected: FAIL — `settleSwapCounts is not a function` / no matching export.

- [ ] **Step 8: Implement `settleSwapCounts`**

In `src/utils/swap.ts`, add directly after `quantityAfterGive` (around line 99):

```ts
/**
 * Apply a settlement to the counts, returning the new counts and the net change
 * per touched sticker. Gives use quantityAfterGive (so a give reserved by other
 * open swaps may not actually drop, in which case it records no delta); receives
 * always add one. The delta is what rollbackSwap reverses.
 */
export function settleSwapCounts(
  counts: Counts,
  settled: { givenIds: string[]; receivedIds: string[] },
  committedGive: Map<string, number>,
): { counts: Counts; delta: Record<string, number> } {
  const next: Counts = { ...counts };
  const delta: Record<string, number> = {};
  for (const gid of settled.givenIds) {
    const before = next[gid] ?? 0;
    const after = quantityAfterGive(before, committedGive.get(gid) ?? 0);
    next[gid] = after;
    if (after !== before) delta[gid] = (delta[gid] ?? 0) + (after - before);
  }
  for (const rid of settled.receivedIds) {
    const before = next[rid] ?? 0;
    next[rid] = before + 1;
    delta[rid] = (delta[rid] ?? 0) + 1;
  }
  return { counts: next, delta };
}
```

- [ ] **Step 9: Run the test to verify it passes**

Run: `npx vitest run src/utils/swap.test.ts`
Expected: PASS (2 passing).

- [ ] **Step 10: Commit**

```bash
git add package.json package-lock.json vitest.config.ts tsconfig.app.json src/types.ts src/utils/swap.ts src/utils/swap.test.ts
git commit -m "Add vitest and settleSwapCounts settlement helper"
```

---

### Task 2: `reverseSettlement` pure helper

The inverse of settlement: restore counts from a recorded delta, with a naive fallback for swaps closed before `settledDelta` existed.

**Files:**
- Modify: `src/utils/swap.ts` (add `reverseSettlement` after `settleSwapCounts`)
- Test: `src/utils/swap.test.ts` (add a describe block)

**Interfaces:**
- Consumes: `Swap` type (with optional `settledDelta`, `giving`, `receiving`).
- Produces: `reverseSettlement(counts: Counts, swap: Swap): Counts` — returns counts with the swap's settlement undone; uses `settledDelta` when present, else naive `+1` per `giving` / `−1` per `receiving`, clamped at 0.

- [ ] **Step 1: Write the failing tests for `reverseSettlement`**

Append to `src/utils/swap.test.ts`:

```ts
import { reverseSettlement, settleSwapCounts as _settle } from './swap';
import type { Swap } from '../types';

const baseSwap = (over: Partial<Swap>): Swap => ({
  id: 's1',
  name: 'Test',
  createdAt: 0,
  status: 'closed',
  theirNeeds: [],
  theirSwaps: [],
  giving: [],
  receiving: [],
  ...over,
});

describe('reverseSettlement', () => {
  it('restores counts exactly from a recorded delta', () => {
    const swap = baseSwap({ giving: ['A'], receiving: ['B'], settledDelta: { A: -1, B: 1 } });
    expect(reverseSettlement({ A: 1, B: 1 }, swap)).toEqual({ A: 2, B: 0 });
  });

  it('round-trips a floored give without inventing a copy', () => {
    // Settle a give that is floored by another open swap, then reverse it.
    const start = { A: 2 };
    const { counts, delta } = _settle(start, { givenIds: ['A'], receivedIds: [] }, new Map([['A', 1]]));
    const swap = baseSwap({ giving: ['A'], settledDelta: delta });
    expect(reverseSettlement(counts, swap)).toEqual(start);
  });

  it('falls back to naive reversal when settledDelta is absent (legacy swap)', () => {
    const swap = baseSwap({ giving: ['A'], receiving: ['B'] }); // no settledDelta
    expect(reverseSettlement({ A: 1, B: 1 }, swap)).toEqual({ A: 2, B: 0 });
  });

  it('clamps to zero on naive reversal', () => {
    const swap = baseSwap({ giving: [], receiving: ['B'] });
    expect(reverseSettlement({ B: 0 }, swap)).toEqual({ B: 0 });
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run src/utils/swap.test.ts`
Expected: FAIL — `reverseSettlement is not a function`.

- [ ] **Step 3: Implement `reverseSettlement`**

In `src/utils/swap.ts`, add after `settleSwapCounts`:

```ts
/**
 * Undo a swap's settlement on the counts. Prefers the exact recorded delta;
 * for swaps closed before settledDelta existed, falls back to a naive reversal
 * (re-add each given sticker, remove each received one), clamped at zero.
 */
export function reverseSettlement(counts: Counts, swap: Swap): Counts {
  const next: Counts = { ...counts };
  if (swap.settledDelta) {
    for (const [id, d] of Object.entries(swap.settledDelta)) {
      next[id] = Math.max(0, (next[id] ?? 0) - d);
    }
  } else {
    for (const id of swap.giving) next[id] = Math.max(0, (next[id] ?? 0) + 1);
    for (const id of swap.receiving) next[id] = Math.max(0, (next[id] ?? 0) - 1);
  }
  return next;
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run src/utils/swap.test.ts`
Expected: PASS (6 passing total).

- [ ] **Step 5: Commit**

```bash
git add src/utils/swap.ts src/utils/swap.test.ts
git commit -m "Add reverseSettlement helper with legacy fallback"
```

---

### Task 3: Wire the store — record delta on close, add `rollbackSwap`

Refactor `closeSwap` to use the pure helper and persist `settledDelta`; add the `rollbackSwap` action that reverses counts and reopens the swap.

**Files:**
- Modify: `src/store/collectionStore.ts:5` (import), `:98-100` (interface), `:390-417` (`closeSwap`), add `rollbackSwap` after it.

**Interfaces:**
- Consumes: `settleSwapCounts`, `reverseSettlement` from `../utils/swap`.
- Produces: `rollbackSwap(id: string): void` on the store — reverses a closed swap's counts and sets it back to `open`.

- [ ] **Step 1: Update the swap-utils import**

In `src/store/collectionStore.ts` line 5, replace:

```ts
import { computeReservations, quantityAfterGive } from '../utils/swap';
```

with:

```ts
import { computeReservations, settleSwapCounts, reverseSettlement } from '../utils/swap';
```

- [ ] **Step 2: Declare `rollbackSwap` in the state interface**

In `src/store/collectionStore.ts`, in the `CollectionState` interface right after the `closeSwap` line (around line 98), add:

```ts
  rollbackSwap: (id: string) => void;
```

- [ ] **Step 3: Refactor `closeSwap` to use the helper and store the delta**

Replace the body of `closeSwap` (the `set((s) => { ... })` at ~line 390-417) with:

```ts
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
```

- [ ] **Step 4: Add the `rollbackSwap` implementation**

Immediately after the `closeSwap` action (before `deleteSwap`), add:

```ts
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
```

- [ ] **Step 5: Typecheck**

Run: `npx tsc -b`
Expected: no errors. (Confirms the import change removed the now-unused `quantityAfterGive` and that `rollbackSwap` satisfies the interface.)

- [ ] **Step 6: Run the unit tests (guard against helper regressions)**

Run: `npm test`
Expected: PASS (6 passing).

- [ ] **Step 7: Commit**

```bash
git add src/store/collectionStore.ts
git commit -m "Record settlement delta on close and add rollbackSwap action"
```

---

### Task 4: Add the Rollback button to the closed-swap modal

Surface the action in `SwapDetail` for concluded swaps, with a confirm dialog.

**Files:**
- Modify: `src/components/SwapDetail.tsx:20-21` (selector), add handler, `:161-173` (button row).

**Interfaces:**
- Consumes: `rollbackSwap(id: string): void` from the store; existing `onClose` prop.

- [ ] **Step 1: Select the `rollbackSwap` action**

In `src/components/SwapDetail.tsx`, after the `deleteSwap` selector (line ~20), add:

```ts
  const rollbackSwap = useCollection((s) => s.rollbackSwap);
```

- [ ] **Step 2: Add the rollback handler**

After the `remove` function (around line 107), add:

```ts
  const rollback = () => {
    if (
      confirm(
        `Roll back “${swap.name}”? Your collection counts will be restored and the swap reopened.`,
      )
    ) {
      rollbackSwap(swap.id);
      onClose();
    }
  };
```

- [ ] **Step 3: Render the Rollback button in the button row**

In the `btn-row` block (around line 161-173), add a Rollback button shown only for concluded swaps — place it between the Delete and Close buttons:

```tsx
        <div className="btn-row">
          <button className="btn danger" onClick={remove}>
            Delete
          </button>
          {!isOpen && (
            <button className="btn" onClick={rollback}>
              ↩ Rollback
            </button>
          )}
          <button className="btn" onClick={onClose}>
            Close
          </button>
          {isOpen && (
            <button className="btn primary full" onClick={() => setClosing(true)}>
              🤝 Mark as swapped
            </button>
          )}
        </div>
```

- [ ] **Step 4: Typecheck and build**

Run: `npm run build`
Expected: `tsc -b` passes and `vite build` completes (no type errors, bundle written).

- [ ] **Step 5: Manual verification**

Run: `npm run dev`, then in the browser:
1. Create a swap, give a spare and receive a missing sticker, **Mark as swapped**. Note the affected sticker counts in the Album/Stats.
2. Open the now-concluded swap → tap **↩ Rollback** → confirm.
3. Verify: counts return to their pre-conclude values, the swap moves back under active swaps with the `open` pill, and reopening it shows the lists as editable again.

Expected: all three hold.

- [ ] **Step 6: Commit**

```bash
git add src/components/SwapDetail.tsx
git commit -m "Add Rollback button to concluded swap detail"
```

---

## Self-Review

**Spec coverage:**
- Reverse counts exactly via recorded delta → Tasks 1–3 (`settleSwapCounts` records, `closeSwap` stores, `rollbackSwap`/`reverseSettlement` apply inverse). ✓
- Reopen swap to `open`, preserve it → Task 3 `rollbackSwap`. ✓
- Legacy fallback for swaps without `settledDelta` → Task 2 `reverseSettlement` else-branch + test. ✓
- `settledDelta` field on `Swap` → Task 1 Step 5. ✓
- ↩ Rollback button in closed-swap detail with confirm → Task 4. ✓
- Leave `undoLastTrade` untouched → no task modifies it. ✓
- Three test cases (normal, conflict/floor, legacy) → Tasks 1–2 cover all three (plus a clamp case). ✓
- Known limitation (unchecked-at-conclude stickers not restored) → inherent to reopening with the settled lists; no task attempts fuller fidelity, matching the spec's out-of-scope note. ✓

**Placeholder scan:** No TBD/TODO/"handle edge cases"; every code step shows complete code. ✓

**Type consistency:** `settleSwapCounts(counts, settled, committedGive) → { counts, delta }` and `reverseSettlement(counts, swap) → Counts` are used identically in `closeSwap`/`rollbackSwap` (Task 3) as defined in Tasks 1–2. `settledDelta?: Record<string, number>` is consistent across types, store, and helpers. `rollbackSwap(id: string): void` matches between the interface (Task 3 Step 2) and implementation (Step 4) and the `SwapDetail` consumer (Task 4). ✓
