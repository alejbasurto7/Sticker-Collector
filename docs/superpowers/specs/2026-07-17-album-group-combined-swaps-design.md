# Album Groups & Combined Swaps — Design

**Date:** 2026-07-17 (revised 2026-07-24 for the per-album sync/sharing + Settings/Library reorg landings, and view-only membership for read-only shares)
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

## Context: what changed under this spec

This spec was first written before two features landed in `main`. It has been revised to fit
them:

- **Per-album sync & sharing** ([spec](2026-07-17-per-album-sync-sharing-design.md)). Sync is
  no longer whole-document last-write-wins. Each album is **Local** (device only), **Cloud**
  (your own devices, one shared row), or **Shared** (its own row/code, owner + joiners).
  Merging is a client-side, field-level **3-way merge** ([merge.ts](../../../src/sync/merge.ts),
  [engine.ts](../../../src/sync/engine.ts)); mode is **derived** from
  [syncStore.ts](../../../src/store/syncStore.ts) metadata, not stored on the album.
- **Settings/Library reorg** ([spec](2026-07-19-settings-library-reorg-design.md)). The old
  `EditionDialog` is gone; albums now live behind a header **album switcher** →
  **Library sheet** ([LibrarySheet.tsx](../../../src/components/LibrarySheet.tsx),
  [AlbumSwitcher.tsx](../../../src/components/AlbumSwitcher.tsx)), with per-album config on an
  [AlbumDetailView](../../../src/components/AlbumDetailView.tsx). That reorg **explicitly
  reserved a `👥 Groups` entry in the Library sheet for this feature**, and added
  `computeStatsFor(counts, edition, trackCC)` — per-album layout stats without touching the
  global `album` singleton.

The **core pool logic (§B–§D) is unaffected** by these — it is pure `counts` math. What the
landings change is the group entity's **storage/sync (§A)**, **membership eligibility (§A)**,
and **UI placement (§E)**.

## Key decisions

1. **Persistent album group.** The user links albums once into a named group. The combined
   pool and the combined swaps live at the group level and persist across sessions.
2. **Net the pool.** Per sticker, the family target is one copy *per participating album*.
   Internal surplus cancels internal need, so a sticker is never both an external give and
   an external get. Only true surplus is offered out; only true gaps are chased.
3. **Auto-route with override at close.** Settlement auto-assigns every copy it can resolve
   unambiguously; a genuinely ambiguous *received* copy is auto-assigned but overridable on
   the close screen. The *give* side is fully automatic (fungible surplus — see §D).
4. **Groups sync across your own Cloud devices.** Groups ride the Cloud channel's collection
   payload and 3-way-merge like the rest of it (§A). Members you own that aren't Cloud simply
   don't appear on your other devices; the group operates on whatever members are present.
5. **Members are writable albums; read-only shares join as view-only.** Full members are any
   album you can write — your own (Local/Cloud/owner-Shared) **and collaborative joined
   shares** (co-editing propagates the settled swap to the co-owner, which is the point). A
   **read-only joined share** can't be written, so it joins as a **view-only member**: its
   needs show in the combined view (acquire-and-hand-off), but it never gives, never receives a
   settled copy, and isn't an internal-move target (§B/§D).

## A. Data model, storage & sync

### The group entity

```ts
interface AlbumGroup {
  id: string;
  name: string;          // e.g. "Kids' World Cup"
  memberIds: string[];   // AlbumSnapshot ids the user owns, ≥2
  swaps: Swap[];         // the group's combined swaps (separate from each album's own swaps)
}

// CollectionState gains:
groups: AlbumGroup[];
```

- **Combined swaps live on the group**, not inside any single `AlbumSnapshot`. Each album
  keeps its own `swaps` for solo trades; the group holds the combined ones.
- An album belongs to **at most one** group.
- **Membership = writable members + view-only read-only shares.** A **writable** member is any
  album where `!forcedReadOnly(link)` ([albumMode.ts](../../../src/sync/albumMode.ts)) — your
  own Local/Cloud/owner-Shared albums and **collaborative joined shares** (a collaborative
  joiner can write counts; structural edits like edition/CC stay locked, but combined swaps
  only touch counts). A **read-only joined share** (`forcedReadOnly`) can't be written, so it is
  admitted only as a **view-only member** (§B/§D). Writing a writable member's counts may
  propagate to a co-owner — for a collaborative share that is the intended effect (the swap
  really happened). A joined share's local id may be device-remapped, so it can resolve-out on
  another device (handled by per-device resolution below).
- **No shared-edition / shared-trackCC constraint.** Members may differ in `edition` and
  `trackCC`; §B nets per sticker over *participating* members, so differing layouts are fine.

### `Swap` gains two optional fields

The same `Swap` type, `NewSwapDialog`, and `SwapClose` are reused for combined swaps. Two
optional fields carry the group-specific data (the `Swap` type already gained `notes?`
independently — unrelated):

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

### Sync — groups ride the Cloud channel

Groups are added to the Cloud channel so they sync across the user's own devices. **Only the
Cloud channel** carries them; Shared album rows (`AlbumPayload`) do **not** — a group is never
visible to a share's other participant.

```ts
interface CollectionPayload {
  kind: 'collection';
  v: 1;
  albums: AlbumSnapshot[];
  deletedAlbumIds?: Record<string, number>;
  groups?: AlbumGroup[];   // NEW — Cloud-synced, 3-way merged
}
```

A new pure `mergeGroups(base, local, remote)` slots into
[mergeCollection](../../../src/sync/merge.ts), following the engine's existing lossless-biased
rules:

| Part | Rule | Same-id collision tie-break |
|---|---|---|
| group set (by id) | 3-way vs. base set: add on one side kept; edit kept; delete honored (base distinguishes add-vs-delete — **no tombstones**, exactly like `mergeSwaps`) | edit vs. delete → keep |
| `name` | `scalar3` (side differing from base wins) | both changed → fixed lexical comparator (matches the `albumName` rule) |
| `memberIds` | 3-way per member id vs. base set | both changed → **union** (never silently drop a member) |
| `swaps` | reuse `mergeSwaps` on the group's swap array | as in `mergeSwaps` |

`serialize.ts` (`sliceCloudPayload` / `reconstructActive`) and
`applyMergedCollection` ([collectionStore.ts](../../../src/store/collectionStore.ts)) are
extended to carry and rebuild `groups`. Because `base` (in `syncStore.bases.collection`)
already stores the whole merged payload, no extra base plumbing is needed beyond including
`groups`. **Back-compat:** rows written before this feature have no `groups` key → treated as
`[]`; the key is added on the next push (same pattern as `deletedAlbumIds`).

### Per-device member resolution

Member ids resolve only on a device that has the album:

- **Cloud** members carry the same id across all your devices (they travel in the collection
  payload) → resolve everywhere.
- **Local** members exist on one device only; an **owner-Shared** member exists only where
  that share is linked → do not travel.

So every consumer resolves a group's members against the **local** `albums` and operates on
the present subset. A group with **fewer than 2 resolvable members** on a device is shown but
**inert** there (no combined pool, no combined-swap creation). This is consistent with the
engine's "absence never deletes" philosophy and means cross-device groups are useful exactly
when their members are Cloud.

### Active/parked mirroring & cross-album writes

The store mirrors the **active** album's fields at the top level and parks the others in
`albums`. Combined operations (`closeSwap`/`rollbackSwap` for a combined swap, and
`applyInternalMove`) write to **multiple members at once** — some parked, possibly the active
one. There is already a precedent to reuse: **`applyMergedAlbum(albumId, snapshot)`**
([collectionStore.ts](../../../src/store/collectionStore.ts)) patches an album's fields whether
it is active or parked. Combined writes go through the same active-or-parked helper.

Because writing a member's counts is an ordinary store edit, the sync engine will push the
touched channels: a **Cloud** member fans out on the Cloud row (to your other devices), an
**owner-Shared** member on its own row, a **Local** member not at all. There is no atomic
multi-album transaction, so partial propagation (one member offline) is possible but
self-heals on the next sync.

> **Merge caveat (pre-existing, not introduced here).** `mergeCounts` breaks a same-sticker
> collision with `Math.max(local, remote)`. On an **owner-Shared collaborative** member, a
> settled **give (−1)** can be resurrected if a co-editor also changed that sticker before the
> merge. This already affects *solo* swaps on collaborative albums; combined swaps inherit it,
> no worse. It is one more reason the common, safe case is grouping albums you don't co-edit.

## B. Combined pool math

The pool nets the whole family against a **per-sticker** target. For a sticker `X`:

- **participating members** = *resolvable* group members whose album *layout includes* `X`.
  Each member's layout is built with `buildAlbumFromType(activeType, { variant: edition,
  enabledOptional })` (as `applyEdition`/`computeStatsFor` do), so no global singleton is
  mutated and a parked member with a different edition/trackCC is handled correctly.
- **target(X)** = number of **writable** participating members.
- **held(X)** = sum of `counts[X]` over the writable participating members only.
- **deficit** = number of writable participating members with `count == 0`.
- **surplus** = Σ `max(0, count − 1)` over writable participating members.

  (View-only participating members do not enter these — they are handled below.)

From these:

- **internal moves** = `min(deficit, surplus)` — copies to physically shuffle *between the
  dad's own albums*. Flagged, never traded externally.
- **external get** when `held < target`: want `target − held` copies from outsiders.
- **external give** when `held > target`: `held − target` true spares to offer outsiders.

Among **writable** members a sticker is an external **give** or an external **get** or
**neither** — never both; internal moves can accompany either.

**View-only (read-only joined) members.** A read-only share can't be written and its spares
aren't yours, so it participates as an *informational needer only*: each sticker it is missing
is added to the combined **get** list (so you can acquire a copy to hand to the owner) and
tagged with a "hand off to owner" note, but it never contributes to **surplus/gives**, is
never a settlement target, and is excluded from **internal moves** and the writable netting
above. So the "never both give and get" invariant is a property of the writable members; a
writable surplus that happens to match a view-only need is surfaced as a *suggested hand-off*,
not an automatic move.

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
- **View-only members** add their missing stickers to `youGet` (acquire-and-hand-off) but never
  to `youGive`; `giveQty` is computed from **writable** surplus only.

## D. Settlement routing at close

`SwapClose` in group mode confirms what was actually exchanged (as today), then routes each
copy to an album before applying counts via the active-or-parked helper (§A).

**Received copy** → the participating albums missing it are the targets:

- *Unambiguous* (one needing album, or copies == needing albums): auto one-each, no prompt.
- *Ambiguous* (fewer copies than needing albums): auto-assign to the **first needing member
  in group `memberIds` order** (predictable, not clever — the dad overrides when it matters),
  and show a `→ Kai's album [change ▾]` control so he can flip it to match physical reality.
- *View-only needer:* a received copy for a read-only member is **never written** — it shows a
  `🤝 give to <owner> — not recorded` reminder instead. Auto-routing fills **writable** needers
  first; a view-only need never consumes a writable album's target.

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

If a view-only member (say Grandpa's read-only album) also needed Neymar, the close screen
would show `Neymar #9   🤝 give to Grandpa — not recorded` instead of writing a count.

## E. UI surfaces & scope

The Settings/Library reorg already reserved the surfaces this feature needs; there is **no
Trade tab** (the bottom bar is `Album · Swaps · Stats · ⚙️ Settings` —
[TabBar.tsx](../../../src/components/TabBar.tsx)), so the combined pool is a **lens**, not a
new tab.

**Group management → Library sheet.** The reserved `👥 Groups` entry in
[LibrarySheet.tsx](../../../src/components/LibrarySheet.tsx) opens a **Groups** screen: create
a group, name it, pick ≥2 members, disband it. The picker offers **writable** albums as full
members and **read-only shares as view-only** members (badged `view-only`); a group needs ≥2
*writable* members to run a combined swap. Album cards reuse the existing
monogram/mode-badge/progress treatment (progress via `computeStatsFor`).

**Combined pool → a lens on the Swaps tab.** When the active album is a *resolvable* member of
a group, `SwapsView` shows a segmented toggle:

```
[ Leo's album  |  Kids' World Cup (both) ]
```

- **Combined lens → Swaps tab:** the group's combined swaps, a "New combined swap" button
  (§C), settlement via the §D close screen, a **"Share combined list"** action that exports/QRs
  the combined pool (replacing the old spec's "Trade tab" idea), and a small
  **"Internal moves (N)"** panel listing the netted A↔B shuffles, each with a one-tap
  **Apply** (`applyInternalMove(stickerId, fromId, toId)` — decrement source, increment
  target, via the active-or-parked helper).
- **Album lens** = today's per-album swaps, unchanged.
- **Album tab and Stats tab stay per-album, always.**
- The combined lens is reached from a **writable** member's Swaps tab. A read-only member's own
  Swaps tab stays view-only (the sharing spec's gating), so you drive the group's combined swaps
  from one of its writable members — never from the read-only one.

**Explicitly out of scope (YAGNI):**

- A merged album-*browsing* grid or combined stats / achievements — both stay per-album.
- Groups spanning different album *types*, nested / overlapping groups, or an album in two
  groups.
- **Recording into a read-only share** — view-only members are never written; the app only
  reminds you to hand the sticker to its owner.
- The math supports any N ≥ 2 members; the UI just needs to be sane for a small family.

## F. Testing & edge cases

New logic is pure functions (pool math, group candidates, settlement routing, `mergeGroups`),
unit-tested with **vitest** alongside [swap.test.ts](../../../src/utils/swap.test.ts) and
[merge.test.ts](../../../src/sync/merge.test.ts), plus a few assertions in
`scripts/test-logic.ts`.

| Case | Expected |
|---|---|
| `A=2, B=0` | internal move, not offered externally |
| both missing | external **get ×2** |
| `A=3, B=0` | external **give ×1** + internal move |
| mixed trackCC (`CC-5` in A only) | target 1; B never receives/needs it |
| spare promised in a member's **solo** swap | not offered again in a combined swap (reservation roll-up) |
| ambiguous receive (both need, 1 copy) | auto-assign first member, override available |
| combined give | can't strip a member's solo-reserved spare (give floor holds per album) |
| rollback / undo combined swap | reverses `settledByAlbum` per album |
| member album deleted while in a group | pruned from `memberIds`; group auto-disbands if it drops below 2 |
| member not present on this device | resolved-out; group inert if < 2 resolvable members |
| collaborative joined share | offerable as a full (writable) member; settling propagates to the co-owner |
| read-only joined share | offerable only as a **view-only** member: contributes needs, no gives, no settled write |
| view-only member needs a received sticker | shows in the get list; at close shows `🤝 give to owner`, writes nothing |
| **`mergeGroups`** | independent group add on each device → union; same-group member add on each → member union; group delete vs. base honored; `name` scalar convergence; group `swaps` via `mergeSwaps` |
| Cloud row without `groups` key | treated as `[]` (back-compat) |

## G. Manual smoke test (post-implementation)

> The feature is **not implemented yet**; this is the acceptance script to run once it is.

**Run the app from the implementation worktree:**

```bash
cd <worktree>          # this session: .claude/worktrees/album-group-combined-swaps
npm install            # first time only (already done in this worktree)
npm run dev            # Vite dev server, base '/'; open the printed URL (default http://localhost:5173)
```

State is local (`localStorage` key `figuritas-collection-v1`); to reset, clear site data. The
sync/multi-device rows (10, 13) need two browser profiles sharing a Cloud/Shared code.

**Precondition — two albums + a group:**

1. Album switcher → Library sheet → **＋ New album**, twice. Name them **Leo** and **Kai**.
2. Library sheet → **👥 Groups → New group** → name **Kids** → select Leo + Kai → **Save**.
   - ✓ Group appears; opening Leo's or Kai's **Swaps** tab shows a `[ Leo | Kids (both) ]` toggle.

**Scenarios** (each independent; set counts by tapping cells on each album):

| # | Set up | Do | Expect |
|---|--------|----|--------|
| 1 Internal move | Leo `MEX-7`×2, Kai ×0 | open **Kids** lens | `MEX-7` in neither give nor get; listed under **Internal moves** Leo→Kai; **Apply** → Leo ×1, Kai ×1 |
| 2 Get ×2 | Leo & Kai `MEX-3`×0 | Kids → New combined swap; paste `MEX 🇲🇽: 3 (×2)`; Find matches | **You can get** shows `MEX-3` **×2** |
| 3 Surplus + internal | Leo `MEX-9`×3, Kai ×0 | open Kids lens | `MEX-9` under Internal moves (Leo→Kai) **and** offered as **give ×1** |
| 4 Mixed CC | Leo trackCC on, `CC-5`×0; Kai trackCC off | Kids swap vs a list offering `CC-5` | `CC-5` offered as get (target 1, Leo only); Kai never involved |
| 5 Both-need, 1 copy | Leo & Kai `MEX-7`×0; combined swap receiving **1× MEX-7** | Mark as swapped | auto → **Leo** (first member) with `→ Kai [change ▾]`; confirm → chosen ×1, other still 0 |
| 6 Two copies | Leo & Kai `MEX-3`×0; receiving **2× MEX-3** | Mark as swapped | +1 to **each**, no prompt |
| 7 Give auto | Leo `MEX-9`×2, Kai ×1; combined swap giving 1× `MEX-9` | Mark as swapped | decrements **Leo** (the holder), "from Leo" label, **no** override control |
| 8 Reservation | promise Leo's `MEX-9` spare in a **solo** Leo swap (leave open); then Kids → New combined swap vs a list needing `MEX-9` | — | `MEX-9` not auto-offered / ⚠️ flagged |
| 9 Rollback | close a combined swap (scenario 5) | swap detail → rollback / undo | per-album counts revert **exactly** to pre-swap |
| 10 Collaborative member | on profile B create an album, share **collaborative**; on profile A join it and add to a group | settle a combined swap adding a sticker to it | count updates on A **and** propagates to B on next sync |
| 11 View-only member | join a **read-only** share; add it to a group as **view-only** | Kids lens, then a swap receiving a sticker it needs | its needs appear in **get**; at close shows `🤝 give to <owner> — not recorded`; **no** count written; it never appears in the give list |
| 12 Member delete | delete **Kai** | — | Kai pruned from Kids; group **auto-disbands** (< 2 members) |
| 13 Cross-device group | make Leo & Kai **Cloud**; set up Cloud sync on profile B (same code); create the group on A | open B | group **Kids** appears with both members; combined lens works |

**Regression:** an album in **no** group shows **no** lens toggle on its Swaps tab and behaves
exactly as today.

## Files touched (anticipated)

- `src/types.ts` — `AlbumGroup`; `Swap.receivingQty`, `Swap.settledByAlbum`.
- `src/store/collectionStore.ts` — `groups` state; group CRUD (create / rename / add-member /
  remove-member / disband, owned-only); combined-swap CRUD; combined `closeSwap` /
  `rollbackSwap` writing `settledByAlbum` through the active-or-parked helper; `applyInternalMove`;
  member-delete pruning + auto-disband; `applyMergedCollection` rebuild of `groups`.
- `src/utils/swap.ts` (or a new `src/utils/groupSwap.ts`) — pool math (`computeGroupPool`),
  `computeGroupCandidates`, group reservation roll-up, settlement routing helper.
- `src/utils/stats.ts` — reuse `computeStatsFor` / member-layout build for the pool + group cards.
- `src/utils/listExport.ts` / export path — build the combined export from the pool.
- `src/sync/payload.ts` — `CollectionPayload.groups?`.
- `src/sync/serialize.ts` — carry `groups` in the Cloud slice + reconstruct.
- `src/sync/merge.ts` — `mergeGroups`, wired into `mergeCollection`.
- `src/components/NewSwapDialog.tsx` — group mode (candidates + two-sided quantities).
- `src/components/SwapClose.tsx` — per-received-copy album routing UI.
- `src/components/SwapsView.tsx` — album ↔ combined segmented lens + internal-moves panel + share.
- `src/components/LibrarySheet.tsx` — `👥 Groups` entry → Groups screen (new component).
- New: Groups management screen/component, Internal-moves panel component.
- Tests: `src/utils/*.test.ts`, `src/sync/merge.test.ts`, `scripts/test-logic.ts`.
