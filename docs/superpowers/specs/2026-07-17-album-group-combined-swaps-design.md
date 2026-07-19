# Album Groups & Combined Swaps — Design

**Date:** 2026-07-17
**Status:** Approved (pending spec review)

## Problem

A user can already hold several separate albums of the same type (e.g. a dad keeping
one World Cup album per son). Today those albums are fully isolated: separate `counts`,
separate `swaps`. A dad completing **both** albums has to run every trade twice and can't
see the whole picture — what both albums are missing, and what spares he has across both.

We want to let him work two (or more) albums **as one pool for swapping**:

- The swap view considers **all missing stickers** across the grouped albums as one need
  list, and **all true spares** across them as one give list.
- Marking a swap as completed routes each sticker to the album that actually needs it (or
  to both, when two copies of the same sticker come in).
- When one sticker is needed by two albums but only one copy arrives, the dad can let the
  app auto-assign it or pick which album gets it.

Scope is **swapping only** — browsing/editing and stats stay per-album.

## Key decisions

1. **Persistent album group.** The user links albums once into a named group. The combined
   pool and the combined swaps live at the group level and persist across sessions.
2. **Net the pool.** Per sticker, the family target is one copy *per participating album*.
   Internal surplus cancels internal need, so a sticker is never both an external give and
   an external get. Only true surplus is offered out; only true gaps are chased.
3. **Auto-route with override at close.** Settlement auto-assigns every copy it can resolve
   unambiguously; a genuinely ambiguous *received* copy is auto-assigned but overridable on
   the close screen. The *give* side is fully automatic (fungible surplus — see §D).

## A. Data model & storage

A new top-level concept in the collection store, alongside `albums`:

```ts
interface AlbumGroup {
  id: string;
  name: string;          // e.g. "Kids' World Cup"
  memberIds: string[];   // AlbumSnapshot ids, ≥2
  swaps: Swap[];         // the group's combined swaps (separate from each album's own swaps)
}

// CollectionState gains:
groups: AlbumGroup[];
```

- **Combined swaps live on the group**, not inside any single `AlbumSnapshot`. Each album
  keeps its own `swaps` for solo trades; the group holds the combined ones.
- An album belongs to **at most one** group.
- **No shared-edition / shared-trackCC constraint.** Members may differ in `edition` and
  `trackCC`; the only requirement is the same album *type* (globally fixed today, so
  effectively no constraint). See §B for how differing layouts are handled per sticker.

### `Swap` gains two optional fields

The same `Swap` type, `NewSwapDialog`, and `SwapClose` are reused for combined swaps. Two
optional fields carry the group-specific data:

```ts
interface Swap {
  // ...existing fields...

  /**
   * Combined swaps only. Copies to RECEIVE per sticker id. A combined swap can be
   * missing the same sticker in more than one album, so it can pull multiple copies of
   * one id. Absent / ≤1 means a single copy (matches today's one-copy-per-id receiving).
   */
  receivingQty?: Record<string, number>;

  /**
   * Combined swaps only. The per-album net count change settlement applied
   * (albumId -> stickerId -> delta). Replaces the flat `settledDelta` for group swaps
   * and is what rollbackSwap / undoLastTrade reverse, per album.
   */
  settledByAlbum?: Record<string /*albumId*/, Record<string /*stickerId*/, number>>;
}
```

Solo (per-album) swaps are unchanged and keep using `settledDelta`.

### Active/parked mirroring hazard

The store mirrors the **active** album's fields (`counts`, `swaps`, …) at the top level and
parks the other albums as `AlbumSnapshot`s in `albums`. Combined operations write to
**multiple albums at once** — some parked, possibly the active one. Every cross-album write
(`closeSwap`/`rollbackSwap` for a combined swap, and `applyInternalMove`) must update the
parked snapshot **and**, when a touched album is the active one, the mirrored top-level
`counts`. The plan must handle this consistently (e.g. a helper that patches an album's
counts whether it is active or parked). This is the main implementation hazard.

### Sync

`groups` joins the serialized sync payload. Conflict resolution is unchanged:
whole-document last-write-wins.

## B. Combined pool math

The pool nets the whole family against a **per-sticker** target. For a sticker `X`:

- **participating members** = group members whose album *layout includes* `X`
  (built from each member's `edition` + `trackCC`).
- **target(X)** = number of participating members.
- **held(X)** = sum of `counts[X]` over the participating members only.
- **deficit** = number of participating members with `count == 0`.
- **surplus** = Σ `max(0, count − 1)` over participating members.

From these:

- **internal moves** = `min(deficit, surplus)` — copies to physically shuffle *between the
  dad's own albums*. Flagged, never traded externally.
- **external get** when `held < target`: want `target − held` copies from outsiders.
- **external give** when `held > target`: `held − target` true spares to offer outsiders.

A sticker is an external **give** or an external **get** or **neither** — never both.
Internal moves can accompany either.

Restricting `held` and `target` to *participating* members makes differing `edition` /
`trackCC` fall out naturally, and means stale counts for an untracked section (counts
persist when a section is untracked) are ignored automatically.

| Example (2 albums, both track sticker) | held / target | Result |
|---|---|---|
| A=2, B=0 | 2 / 2 | internal move A→B; nothing external |
| A=0, B=0 | 0 / 2 | external **get ×2** |
| A=3, B=0 | 3 / 2 | internal move A→B **and** external **give ×1** |
| A=2, B=1 | 3 / 2 | external **give ×1** |
| `CC-5`, A tracks CC, B does not | (A only) 1 or 2 / 1 | target 1; B never needs/receives it |

This one pool feeds **both directions**:

- the candidate matching in the New Swap dialog (against another collector's parsed list),
  and
- the dad's **outgoing** export / QR list, so other collectors see the whole family's needs
  and spares — not one son's.

## C. Creating a combined swap

`NewSwapDialog` is reused in a "group mode" that runs against the pool instead of one
album's `counts`. A new pure function replaces `computeCandidates`:

```ts
computeGroupCandidates(members, parsedOtherList, reservations) -> {
  youGive, giveQty,   // their needs where group surplus ≥ 1; qty = min(theirNeedQty, surplus)
  youGet,  getQty,    // their spares where group has a deficit; qty = min(target - held, theirSpareQty)
  giveReserved, getReserved,
}
```

- **`getQty` is the new capability** — a combined swap can pull **two copies** of one
  sticker when both sons are missing it (persisted in `Swap.receivingQty`).
- **Reservations roll up across the whole family**: a spare already promised in another
  open combined swap *or* in a member album's own solo swap is not offered again (and is
  ⚠️-flagged if the dad double-books it on purpose). This keeps netting honest whether he
  trades solo or combined.
- The give/get chip lists show quantities on **both** sides.

## D. Settlement routing at close

`SwapClose` in group mode confirms what was actually exchanged (as today), then routes each
copy to an album before applying counts.

**Received copy** → the participating albums missing it are the targets:

- *Unambiguous* (one needing album, or copies == needing albums): auto one-each, no prompt.
- *Ambiguous* (fewer copies than needing albums): auto-assign to the **first needing member
  in group `memberIds` order** (predictable, not clever — the dad overrides when it matters),
  and show a `→ Kai's album [change ▾]` control so he can flip it to match physical reality.

**Given copy** → fully automatic, **no override**. The surplus is fungible: after handing
over a spare (`held > target`), every album still keeps its needed copy regardless of which
album is decremented, and the per-album attribution never feeds back into later swap math
(which reads only the pooled surplus). The app auto-decrements from a member whose surplus
copy isn't already reserved by its own solo swap (respecting the existing per-album give
floor), preferring the album with the most spares. A quiet "from Leo / from Kai" label is
still shown so the close screen reconciles with what physically left the pile.

On confirm, `closeSwap` writes `Swap.settledByAlbum` (per-album deltas) and applies them to
each member's `counts`, honouring `quantityAfterGive` per album. `rollbackSwap` and
`undoLastTrade` reverse those exact per-album deltas.

```
Mark "Carlos" as swapped

You gave (2)
  Vini #3   (from Leo — auto)
  CC-5      (from Kai — auto)

You received (3)
  Messi #7  → Kai's album [change ▾]   (both need, 1 copy — you pick)
  Messi #7  → Leo's album [change ▾]   (2nd copy, auto one-each)
  Neymar #9 → Leo's album              (only Leo needs — auto)

[ 🤝 Mark as swapped ]
```

## E. UI surfaces & scope

**Group management** lives in the Settings dialog ([EditionDialog.tsx](../../../src/components/EditionDialog.tsx)),
next to the album controls: a small **"Groups"** section to create a group, name it, pick
≥2 member albums, and disband it.

**The combined pool is a lens on the Swaps + Trade tabs** — not a new "active context" that
hijacks the whole app. When the active album is a group member, those two tabs show a
segmented toggle:

```
[ Leo's album  |  Kids' World Cup (both) ]
```

- **Combined lens → Swaps tab:** the group's combined swaps, a "New combined swap" button
  (§C), and settlement via the §D close screen. Plus a small **"Internal moves (N)"** panel
  listing the netted A↔B shuffles, each with a one-tap **Apply** (decrements the source
  album, increments the target) so counts stay truthful after the dad physically moves a
  sticker. Apply calls a new store action `applyInternalMove(stickerId, fromId, toId)`.
- **Combined lens → Trade tab:** the export / QR is built from the **combined** pool.
- **Album tab and Stats tab stay per-album, always.**

The combined lens for an album is derived from membership
(`groups.find(g => g.memberIds.includes(activeAlbumId))`); no separate "active group" state
is needed.

**Explicitly out of scope (YAGNI):**

- A merged album-*browsing* grid or combined stats / achievements — both stay per-album.
- Groups spanning different album *types*, nested / overlapping groups, or an album in two
  groups.
- The math supports any N ≥ 2 members; the UI just needs to be sane for a small family, not
  capped or specially built for large N.

## F. Testing & edge cases

New logic is pure functions (pool math, group candidates, settlement routing), unit-tested
with **vitest** alongside [swap.test.ts](../../../src/utils/swap.test.ts), plus a few
assertions added to `scripts/test-logic.ts`.

| Case | Expected |
|---|---|
| `A=2, B=0` | internal move, not offered externally |
| both missing | external **get ×2** |
| `A=3, B=0` | external **give ×1** + internal move |
| mixed trackCC (`CC-5` in A only) | target 1; B never receives/needs it |
| spare promised in a member's **solo** swap | not offered again in a combined swap (reservation roll-up) |
| ambiguous receive (both need, 1 copy) | auto-assign one, override available |
| combined give | can't strip a member's solo-reserved spare (give floor holds per album) |
| rollback / undo combined swap | reverses `settledByAlbum` per album |
| member album deleted while in a group | pruned from `memberIds`; group auto-disbands if it drops below 2 |
| sync of two devices editing a group | whole-document last-write-wins (unchanged) |

## Files touched (anticipated)

- `src/types.ts` — `AlbumGroup`; `Swap.receivingQty`, `Swap.settledByAlbum`.
- `src/store/collectionStore.ts` — `groups` state; group CRUD (create / rename / add-member /
  remove-member / disband); combined-swap CRUD; combined `closeSwap` / `rollbackSwap` writing
  `settledByAlbum`; `applyInternalMove`; member-delete pruning; rehydrate + `applyRemoteState`
  reconciliation for `groups`.
- `src/utils/swap.ts` (or a new `src/utils/groupSwap.ts`) — pool math (`computeGroupPool`),
  `computeGroupCandidates`, group reservation roll-up, settlement routing helper.
- `src/utils/listExport.ts` / export path — build the combined export from the pool.
- `src/components/NewSwapDialog.tsx` — group mode (candidates + two-sided quantities).
- `src/components/SwapClose.tsx` — per-received-copy album routing UI.
- `src/components/SwapsView.tsx` / `TradeView` — the album ↔ combined segmented lens.
- `src/components/EditionDialog.tsx` — Groups management section.
- New "Internal moves" panel component.
- `src/sync/serialize.ts` — include `groups` in the payload.
- Tests: `src/utils/*.test.ts`, `scripts/test-logic.ts`.
