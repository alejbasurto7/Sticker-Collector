# Swap Rollback — Design

**Date:** 2026-06-17
**Status:** Approved (pending spec review)

## Problem

Once a swap is concluded ("Mark as swapped"), the change is permanent. `closeSwap`
updates collection counts (removes given duplicates, adds received stickers) and flips
the swap to `closed`. If the user concludes a swap by mistake, or the trade falls
through, there is no way to undo it from the UI. The closed-swap detail modal offers
only **Delete** and **Close**.

There is an unused `undoLastTrade` store action that reverses *only the most recently
closed* swap and then **deletes** it — it is not wired to any UI and is not what we want
here.

## Goal

Add a **Rollback** action to a concluded swap that:

1. Restores the collection counts to exactly their pre-conclude values.
2. Reopens the swap (`status: 'open'`) so it returns to the active swaps list, ready to
   edit or re-conclude. The swap is preserved, not deleted.

## Approach

### Count reversal: recorded delta (chosen)

`closeSwap` does not always apply a plain `-1` to given stickers. `quantityAfterGive`
enforces a floor: when a given sticker is also promised in another **open** swap, the
settlement may leave its count unchanged so the spare is preserved for that other swap.
Received stickers are always `+1` (clamped).

A naive "+1 per given, −1 per received" rollback (what `undoLastTrade` does) therefore
**invents a copy** in the conflict scenario the app already warns about: if concluding a
swap did not actually decrement a sticker (floor held), adding it back on rollback
over-counts.

To make rollback exact, `closeSwap` records the **net per-sticker count change** it
applied onto the swap, and `rollbackSwap` applies the exact inverse.

- **Rejected — Option A (naive reversal):** zero data-model change, but incorrect in the
  multi-swap conflict/floor case.
- **Chosen — Option B (recorded delta):** one optional field on `Swap`; rollback is exact
  regardless of conflicts or counts changed in between.

### Legacy fallback

Closed swaps already persisted in `localStorage` (saved before this field exists) will
have no recorded delta. For those, `rollbackSwap` falls back to the naive reversal
(`+1` per `giving` id, `−1` per `receiving` id, clamped). New conclusions get the exact
delta-based reversal.

## Changes

### Data model — `src/types.ts`

Add an optional field to `Swap`:

```ts
/**
 * Net count change closeSwap applied at settlement, per sticker id
 * (e.g. given -1, received +1). Used by rollbackSwap to reverse the
 * close exactly. Absent on swaps closed before this field existed.
 */
settledDelta?: Record<string, number>;
```

### Store — `src/store/collectionStore.ts`

1. **`closeSwap`** — while computing the new counts, also build `settledDelta` as the
   net change per touched sticker (`newCount - oldCount`), skipping zero entries. Store
   it on the closed swap alongside the existing `closedAt` / list rewrites.

2. **New action `rollbackSwap(id: string)`** (add to the `CollectionState` interface and
   the implementation):
   - Find the swap; no-op if missing or not `closed`.
   - Reverse counts:
     - If `settledDelta` present: for each `[sid, d]`, `counts[sid] = clampCount((counts[sid] ?? 0) - d)`.
     - Else (legacy): `+1` for each `giving` id, `−1` for each `receiving` id, clamped.
   - Update the swap: `status: 'open'`, `closedAt: undefined`, `settledDelta: undefined`.
   - Leave `undoLastTrade` untouched.

### UI — `src/components/SwapDetail.tsx`

In the closed-swap branch (`!isOpen`), add a **↩ Rollback** button in the existing
`btn-row` (next to **Delete**). On click:

```ts
if (confirm(`Roll back “${swap.name}”? Your collection counts will be restored and the swap reopened.`)) {
  rollbackSwap(swap.id);
  onClose();
}
```

Wire `rollbackSwap` via `useCollection((s) => s.rollbackSwap)`. The reopened swap
reappears under active swaps automatically (existing `SwapsView` filtering).

## Known limitation

Stickers the user **unchecked** at conclude time were dropped from the swap's lists by
`closeSwap` (which rewrites `giving`/`receiving` to exactly what was settled). Reopening
restores what was actually traded, not the original fuller list. This is acceptable for a
"give me my stickers back and let me redo it" rollback and keeps the implementation
simple; full pre-conclude fidelity is out of scope.

`rollbackSwap` restores the collection **counts** and the swap status, but does **not**
revert the activity/completion side effects that `closeSwap` triggers via `withActivity`
when stickers were received — `activityDays`, `firstStickerAt`, and a frozen `completedOn`
stay as they were. This is intentional and consistent with the rest of the app: those
fields are sticky everywhere (e.g. giving a sticker away with `removeOne` after reaching
100% also leaves `completedOn` frozen), so a calendar day on which you collected stays
counted, and the date you first completed the album stays recorded, even if a later
rollback drops you back below 100%.

## Testing

Unit tests for `rollbackSwap` in the store:

1. **Normal case** — conclude a swap (give a spare, receive a missing sticker), roll back,
   assert counts return to pre-conclude values and the swap is `open` with `closedAt`
   and `settledDelta` cleared.
2. **Conflict/floor case** — the scenario Option B fixes: a given sticker also promised in
   another open swap so its count did not drop at conclude; assert rollback does **not**
   invent a copy.
3. **Legacy fallback** — a closed swap with no `settledDelta`; assert naive reversal runs
   and the swap reopens.

## Out of scope

- Wiring or changing `undoLastTrade`.
- A global "undo last" affordance.
- Restoring the exact pre-conclude selection (see Known limitation).
- Confirmation/undo toast UX beyond the single `confirm()` dialog.
