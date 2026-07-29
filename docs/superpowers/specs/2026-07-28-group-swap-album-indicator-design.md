# Group Swap — Per-Album Routing Indicator — Design

**Date:** 2026-07-28
**Status:** Approved (pending spec review)
**Builds on:** [Album Groups & Combined Swaps](2026-07-17-album-group-combined-swaps-design.md)
**Mockups:** [2026-07-28-group-swap-album-indicator.html](mockups/2026-07-28-group-swap-album-indicator.html)

## Problem

Combined swaps already route every copy to the right album — the math in
[groupSwap.ts](../../../src/utils/groupSwap.ts) has been correct since Stage 1. What's missing is
that the user can't *see* it.

- [NewSwapDialog](../../../src/components/NewSwapDialog.tsx) in group mode shows matched stickers
  with a `×N` badge and no album attribution at all. You save a swap without knowing who it's for.
- [SwapDetail](../../../src/components/SwapDetail.tsx) on an open combined swap shows the same
  unattributed chips. The whole point of the group lens — *Leo needs this one, Kai needs that one* —
  is invisible until settlement.
- [SwapClose](../../../src/components/SwapClose.tsx) is the only screen that says anything, as a
  block of dim grey text below the chips (`MEX-7 → Kai`, `MEX-9 — from Leo`). It's the last screen
  before counts are written, and it's the first time you learn where anything is going.

So the user's question — **"which album does this sticker come out of, and which one does it go
into?"** — is answered late, in plain text, on one screen out of three.

## Decision

Adopt **badges on the chip**: each sticker chip keeps its position in the existing page-grouped grid
and gains a row of small tinted monogram marks beneath its number — the albums this sticker lands in
(get side) or leaves from (give side).

Four options were mocked up and compared (see the mockups link above): badges on the chip, lanes
grouped by album, directional flow rows, and a per-album ledger matrix. Badges won for three reasons:

1. **It is the only option that preserves the chip grid and its page grouping.** The grid is
   grouped by album page (`MEX 🇲🇽`, `BRA 🇧🇷`) via `groupByPage`. Lanes would nest a second grouping
   inside the first; flow rows and the matrix discard the chip vocabulary entirely.
2. **A sticker going to two albums stays one chip** with two marks. Every alternative duplicates it —
   the exact netting the pool math works to avoid.
3. **It is the lightest weight that answers the question**, which matches the decision that detail-screen
   routing is preview-only. A passive mark is right for information; a row with a control is not.

Applied to **all three** surfaces (new swap, detail, close), so the vocabulary is learned once.

## A. The `AlbumMark` primitive

A new presentational component, `src/components/AlbumMark.tsx`. It takes the fields it needs rather
than a whole store type, so it stays trivially renderable in isolation:

```tsx
interface Props {
  id: string;        // → coverTint(id), the album's stable colour
  name: string;      // → monogram(name) + title
  viewOnly?: boolean; // read-only joined member: never actually written
}

<span className={`amark tint-${coverTint(id)}${viewOnly ? ' viewonly' : ''}`} title={name}>
  {monogram(name)}
</span>
```

It reuses [`coverTint` and `monogram`](../../../src/utils/albumCover.ts) and the existing
`tint-0..5` background classes ([styles.css](../../../src/styles.css)) **unchanged**, so an album's
colour and letter are identical here, on the `AlbumCard` in the Library sheet, and in the album
switcher. The only new CSS is `.amark` itself — the small-size box — mirroring `.album-cover`'s
grid-centred, weight-800 treatment at chip scale.

Ink follows the existing convention: `.album-cover` uses one dark ink (`#06210f`) across all six
tints. `.amark` inherits it, **subject to the contrast criterion in §D** — the mark is far smaller
than the 34px tile, so contrast is verified rather than assumed.

A view-only member's mark is visually distinguished (reduced opacity plus an inset ring) because a
sticker "going to" a view-only album is never actually written.

## B. The data seam: `routeForDisplay`

One new pure function in [groupSwap.ts](../../../src/utils/groupSwap.ts), consumed by all three
components, so no two screens can disagree about where a sticker is going:

```ts
export interface ChipRouting {
  /** Distinct member ids this sticker lands in (get) or leaves from (give), in memberIds order. */
  memberIds: string[];
  /** Present when more writable albums need it than copies are coming — user picks at close. */
  ambiguousAmong?: string[];
  /** View-only members missing it: a physical hand-off, never written to counts. */
  handoffIds?: string[];
}

export function routeForDisplay(
  members: GroupMember[],
  giving: Record<string, number>,
  receiving: Record<string, number>,
  reservedSpares?: Record<string, Record<string, number>>,
): { give: Record<string, ChipRouting>; get: Record<string, ChipRouting> };
```

It is a thin flattening of the **existing** `routeGiven` / `routeReceived` — no new routing logic,
no second source of truth:

| Field | Derived from |
|---|---|
| `give[id].memberIds` | `routeGiven(...).writes` — album ids with a negative entry for `id` |
| `get[id].memberIds` | `routeReceived(...).writes` — album ids with a positive entry for `id` |
| `get[id].ambiguousAmong` | `routeReceived(...).ambiguous.find(a => a.id === id)?.options.map(o => o.id)` |
| `get[id].handoffIds` | `routeReceived(...).handoffs.filter(h => h.id === id).map(h => h.memberId)` |

**One mark per distinct member.** Quantity is already carried by the existing `×N` chip badge, so if
a single album supplies or receives both copies it gets one mark, not two. When the mark count and
`×N` disagree, `×N` is authoritative for quantity. Marks are ordered by the group's `memberIds`
order, matching the existing auto-assignment rule in spec §D, so the display is deterministic.

**Routing is per-sticker independent.** Both `routeGiven` and `routeReceived` loop per sticker id and
read only `m.counts[id]`; distinct ids never compete for the same source. Badges therefore do not
shift when the user toggles a *different* sticker — which matters most on the close screen, where
toggling is the main interaction.

### What each surface passes in

`reservedSpares` is built identically on all three surfaces — the same expression `SwapClose` already
uses, so each writable member keeps its own solo-reserved spares and the give floor holds per album:

```ts
Object.fromEntries(members.map((m) => [m.id, Object.fromEntries(computeReservations(m.swaps).committedGive)]))
```

| Surface | `giving` | `receiving` |
|---|---|---|
| New swap | `candidates.giveQty` | `candidates.getQty` (both from `computeGroupCandidates`) |
| Detail | promised copies per id via `giveQtyOf(swap, id)` over `swap.giving` | `swap.receivingQty` (defaulting to 1) over `swap.receiving` |
| Close | same as Detail — the **promised** set, not the checked set | same as Detail |

The close screen deliberately routes over the *promised* set rather than the currently-checked one.
Per-sticker independence makes the two equivalent for every chip that is checked, and using the
promised set means an unchecked chip keeps its marks instead of blanking out — so re-checking a
sticker never makes the badges jump.

## C. Per-surface behaviour

[`StickerChips`](../../../src/components/StickerChips.tsx) gains **one optional prop**:

```ts
badges?: Map<string, ChipRouting>;
```

When absent — every solo swap and every non-group screen — chips render exactly as they do today.
That absence is the backward-compatibility guarantee; no existing call site changes behaviour.

All three surfaces render a shared **`GroupLegend`** (`src/components/GroupLegend.tsx`) above the
give section: each member's mark plus full name, with a `view-only` pill where applicable.

| | New swap | Detail | Close |
|---|---|---|---|
| Legend row | ✓ | ✓ | ✓ |
| Marks on give chips (source album) | ✓ | ✓ | ✓ |
| Marks on get chips (destination album) | ✓ | ✓ | ✓ |
| Dashed `?` mark on ambiguous receives | ✓ preview | ✓ preview | ✓ + resolved below |
| "Needs your call" panel | — | — | ✓ |

- **New swap dialog** — `routeForDisplay` runs over the `computeGroupCandidates` output, so you see
  who each match is for before saving. Per-sticker independence means the marks are stable as the
  user toggles candidates on and off.
- **Swap detail** — routing is derived live from current member counts on every render. It is a
  **preview**: no control, nothing persisted. A dashed `?` mark plus a one-line note explains that a
  contested copy is decided at close.
- **Close screen** — the marks are the same, and today's `.close-routes` text block is **removed**,
  replaced by a **"Needs your call"** panel holding only the genuinely ambiguous receives (each with
  the `<select>` moved from `.close-route`) and the 🤝 view-only hand-off reminders. Everything
  unambiguous is fully expressed by its badge, so in the common case the close screen gets *shorter*.
  Override behaviour is unchanged: offered only when `ambiguous.chosenIds.length === 1`, and the
  chosen album's mark replaces the default one on the chip.

The **give side stays non-interactive on every surface**, per spec §D — surplus is fungible, so which
album a spare leaves from is never the user's decision.

## D. Accessibility

- **Colour is never the only signal.** The monogram letter carries identity, `title` carries the full
  album name, and each badged chip gets an `aria-label` spelling the routing out in words —
  e.g. `"MEX 7, 2 copies, to Leo and Kai"`, `"MEX 3, 1 copy, to Leo — Kai also needs it"`.
- **Contrast is an acceptance criterion.** The badge letter must reach **≥4.5:1** against its tint
  background. Measure all six; where `tint-1` (blue `#3b82f6`) or `tint-4` (purple `#a855f7`) miss with
  the inherited `#06210f` ink, darken the ink **for those tints only** — the tint backgrounds
  themselves never change, so the shared album-identity vocabulary is preserved.
- Marks are decorative-with-a-name, not controls: they are not focusable, and the chip button remains
  the single tab stop it is today.

## E. Edge cases

| Case | Behaviour |
|---|---|
| Sticker outside a member's layout (`CC-5`, one album has `trackCC` off) | That member never appears in `memberIds` — falls out of `memberStickerIds`, no special-casing |
| One album supplies both given copies | One mark; `×2` on the chip carries the quantity |
| Received copy only a **view-only** member needs | `memberIds` empty, `handoffIds` length 1; chip shows the view-only mark and, at close, the 🤝 reminder. Never written |
| Ambiguous receive after override | An explicit choice **resolves** the ambiguity: the chosen album's mark replaces the default and the `?` marker clears. Accepting the app's default records no override and correctly keeps the `?` — a default is a guess, not a decision. The "Needs your call" row itself is driven by `receiveRouting`, not the badge, so it remains until settlement. A stale override (counts changed under an open dialog) is ignored by both badge and settlement |
| `routeGiven.short` (pool can't source a promised copy) | `memberIds` empty → chip renders with no marks, no throw |
| Two members with the same initial (Leo / Lucas → "L") | Accepted. Tints differ (derived from album id), and the legend plus `title` disambiguate. A two-letter monogram would diverge from the Library sheet, so it is deliberately not introduced |
| Group drops below 2 resolvable members | No group lens at all (existing gating in `SwapsView`) — this feature is unreachable, nothing to handle |

## F. Scope

**Nothing is persisted.** Routing is derived on every render from current counts. There is no new
field on `Swap`, nothing added to `CollectionPayload`, and nothing for `mergeGroups` to reconcile.
This is precisely what the preview-only decision buys.

**Explicitly out of scope:**

- The **internal moves panel** ([InternalMovesPanel.tsx](../../../src/components/InternalMovesPanel.tsx))
  keeps its current `Leo → Kai` text treatment.
- **Solo (per-album) swaps** — no legend, no marks, no change of any kind.
- **Making the give side selectable.** Fungible surplus stays automatic.
- **Editing routing before close.** The detail screen is a preview; the close screen is where a
  decision commits.

## G. Testing

New pure logic is `routeForDisplay`, unit-tested with vitest alongside the existing cases in
[groupSwap.test.ts](../../../src/utils/groupSwap.test.ts):

| Case | Expected |
|---|---|
| Give routed to one member | `give[id].memberIds` = that member |
| Give of 2 copies from one member | one entry in `memberIds` (quantity lives on the chip) |
| Give of 2 copies from two members | two entries, in group `memberIds` order |
| Receive with two writable needers, 2 copies | `get[id].memberIds` has both; no `ambiguousAmong` |
| Receive with two writable needers, 1 copy | one entry in `memberIds`; `ambiguousAmong` has both |
| Receive with a view-only needer | `handoffIds` populated; that member absent from `memberIds` |
| Receive only a view-only member needs | `memberIds` empty, `handoffIds` length 1 |
| Sticker outside a member's layout (mixed `trackCC`) | that member never appears on either side |
| `routeGiven` short | `memberIds` empty, no throw |
| Per-sticker independence | removing one id from `giving` leaves every other id's routing byte-identical |
| Member ordering | `memberIds` follows group order, not `Object.keys` order |

Component-level: `StickerChips` with no `badges` prop renders markup identical to today (guards the
solo-swap path).

## H. Manual smoke test (post-implementation)

Precondition: the two-album group from the combined-swaps spec §G — albums **Leo** and **Kai**, group
**Kids**, plus a joined read-only share **Grandpa** added as a view-only member.

| # | Set up | Expect |
|---|--------|--------|
| 1 | Leo & Kai both missing `MEX-7`; combined swap receiving ×2 | chip `7 ×2` with **two** marks (L, K) on new-swap, detail **and** close |
| 2 | Leo & Kai both missing `MEX-3`; receiving ×1 | one concrete mark + dashed `?`; close shows one "Needs your call" row with the album `<select>` |
| 3 | change the `<select>` in scenario 2 | the chip's concrete mark switches to the chosen album |
| 4 | Leo `MEX-9`×2, Kai ×1; combined swap giving 1 | give chip carries a single **L** mark; no control anywhere on the give side |
| 5 | Leo tracks CC, Kai doesn't; receiving `CC-5` | chip shows **L** only; Kai never appears |
| 6 | only Grandpa (view-only) needs `ARG-2` | chip shows the view-only mark; close shows `🤝 hand to Grandpa — not recorded`; no count written |
| 7 | on the close screen, toggle one sticker off | every **other** chip's marks are unchanged |
| 8 | a 4-member group | four marks still fit a 64px chip without reflowing the grid |
| 9 | **Regression:** open a solo (non-group) swap | no legend, no marks — pixel-identical to today |

## Files touched (anticipated)

- **New:** `src/components/AlbumMark.tsx` — the tinted monogram mark.
- **New:** `src/components/GroupLegend.tsx` — member legend row.
- `src/utils/groupSwap.ts` — `ChipRouting`, `routeForDisplay`.
- `src/utils/groupSwap.test.ts` — the §G table.
- `src/components/StickerChips.tsx` — optional `badges` prop; render the mark row.
- `src/components/NewSwapDialog.tsx` — legend + badges in group mode.
- `src/components/SwapDetail.tsx` — legend + badges in group mode.
- `src/components/SwapClose.tsx` — legend + badges; replace `.close-routes` with the
  "Needs your call" panel (ambiguous receives + hand-offs only).
- `src/styles.css` — `.amark` (+ view-only variant), `.chip .badge-row`, `.chip.amb`, `.needs-call`,
  legend row; **remove** the now-unused `.close-route` / `.close-handoff` rules.
