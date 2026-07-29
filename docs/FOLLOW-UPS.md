# Follow-ups

Known issues deliberately deferred, with enough context to pick up cold. Each entry says what
is wrong, how it bites, and the smallest safe fix. Delete an entry when it lands.

---

## 1. Combined swaps record the *intended* delta, not the delta actually applied

**Severity:** the one that makes every other settlement bug worse. Not urgent on its own — it needs
another fault to fire first — but it is what turns "recoverable" into "rollback corrupts further".

**Where:** [collectionStore.ts:594](../src/store/collectionStore.ts#L594) (`closeCombinedSwap`),
[collectionStore.ts:351](../src/store/collectionStore.ts#L351) (`applyAlbumDeltas`),
[collectionStore.ts:615](../src/store/collectionStore.ts#L615) (`rollbackCombinedSwap`).

**The problem.** `closeCombinedSwap` stores `settledByAlbum` — the delta it *meant* to apply — then
calls `applyAlbumDeltas`, which writes a `clampCount`-limited value and reports nothing back. The two
can differ. `rollbackCombinedSwap` negates the stored `settledByAlbum`, so whenever a clamp fired it
reverses more than was ever applied and **invents copies the user never had**.

**Concrete:** a delta of `-1` lands on an album whose count is already `0`. The clamp writes nothing;
`settledByAlbum` still records `-1`. Rolling back adds `+1` — a sticker appears from nowhere.

**The precedent to copy.** The *solo* path already does this correctly:
[`settleSwapCounts` in swap.ts:161](../src/utils/swap.ts#L161) records a delta only `if (after !== before)`,
so `settledDelta` is always what really happened.

**Minimal fix.** Have `applyAlbumDeltas` return the deltas it actually wrote after clamping, and store
*those* as `settledByAlbum`. Note it is shared with `applyInternalMove`
([collectionStore.ts:545](../src/store/collectionStore.ts#L545)), so both call sites need checking —
that shared-helper blast radius is why this was deferred rather than done inline.

---

## 2. `applyInternalMove` has no give floor and no writability check

**Where:** [collectionStore.ts:544](../src/store/collectionStore.ts#L544).

Writes a raw `-1` / `+1` and trusts the caller to have passed a valid `computeGroupPool.internalMoves`
entry. Unlike the give path it does not honour the `1 + committed` floor from `quantityAfterGive`, and
it does not check the target is writable. Double-tapping **Apply** in `InternalMovesPanel` before the
pool memo recomputes can take a source album to `0`, and a read-only member is a legal target as far as
this function is concerned.

**Minimal fix:** guard on the same floor the give path uses, and skip non-writable targets.

---

## 3. Concluding a combined swap does not count as a collecting day

**Where:** [collectionStore.ts:594](../src/store/collectionStore.ts#L594) vs
[collectionStore.ts:717](../src/store/collectionStore.ts#L717).

Solo `closeSwap` calls `withActivity` when it receives stickers
([collectionStore.ts:743](../src/store/collectionStore.ts#L743)); `closeCombinedSwap` never does. So
settling a combined swap does not extend the activity streak and does not trigger achievement
evaluation. Cosmetic/gamification only — no count is wrong.

---

## 4. Only the first view-only member gets a hand-off reminder

**Where:** [groupSwap.ts](../src/utils/groupSwap.ts), in `routeReceived` — `handedOff = Math.min(viewNeeders.length, remaining)`.

When two or more view-only members need the same sticker but fewer copies are coming, only the first in
group order is listed. There is no "several people are waiting for this" marker, the way `ambiguousAmong`
exists for writable needers. Arguably correct (you cannot hand over copies you do not have) and
hand-offs are never written, so no count is affected — but the UI is silently incomplete.

---

## 5. `contrast.ts` returns `NaN` for 3-digit hex

**Where:** [contrast.ts](../src/utils/contrast.ts), the hex parser.

`#fff` yields `NaN` rather than expanding or throwing. No current caller passes shorthand — the tint
values are parsed straight out of `styles.css` as 6-digit — and `NaN >= 4.5` is `false`, so a
regression fails loudly rather than passing silently. Worth hardening only if this util gains a caller
that handles user-authored colour.

---

## 6. Combined-swap settlement has no automated test

**Where:** [SwapClose.tsx](../src/components/SwapClose.tsx) `confirm()`.

The function that writes counts into albums has no test at any level. The *pure* pieces it composes
(`routeReceived`, `routeGiven`, `applyRouteOverride`, `overrideIsLive`) are well covered, but the wiring
between them is not. This is a consequence of the repo's deliberate node-only Vitest setup
(`environment: 'node'`, no jsdom, no React Testing Library — see `vitest.config.ts`).

Two ways forward, in increasing cost: extract the `settledByAlbum` assembly out of `confirm()` into a
pure function and unit-test it in node (cheap, and would have caught the stale-override bug); or add
jsdom + React Testing Library and test the component (larger, and a change to the repo's testing
posture that should be a deliberate decision).
