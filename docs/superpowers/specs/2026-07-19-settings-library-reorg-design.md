# Settings & Library Reorg — Design

**Date:** 2026-07-19
**Status:** Approved (pending spec review)

## Problem

The ⚙️ Settings dialog ([EditionDialog.tsx](../../../src/components/EditionDialog.tsx)) has
become a junk drawer. One scroll mixes three unrelated *scopes*:

| Scope | Items today |
|---|---|
| **App-wide** (truly global) | Theme · whole-collection Cloud link · version |
| **The active album** | name · Coca-Cola tracking + edition · layout · sharing · delete |
| **Across albums** (management) | current-album `<select>` · New Album · Import · Export |

Switching albums is buried in a `<select>` inside that same modal, so the app has no real
"home" for *your albums* — even though a user can hold several (a dad keeping one World Cup
album per child). Album *types* only exist in the dev-only `/admin` builder; there is exactly
one today (`2026-fwc`) but the registry ([albumTypesData.ts](../../../src/data/albumTypesData.ts))
can hold more.

We want to untangle the scopes, give albums a first-class home, and do it in a way that the
upcoming [Album Groups spec](2026-07-17-album-group-combined-swaps-design.md) can build on —
that spec currently assumes group management lives *inside* the Settings modal and references
a **Trade** tab that does not exist yet.

## Key decisions

1. **No "Library" tab.** Album/Swaps/Stats are things you do *with the active album*; album
   *selection* sits a level above them and is infrequent, so it does not earn a bottom-tab
   slot. Keeping the bar at three (Album · Swaps · Stats) also leaves a slot free for the
   groups spec's future **Trade** tab.
2. **A header album-switcher opens a Library sheet.** The static header title becomes a
   tappable switcher (cover · name · "N of M albums" · chevron). It opens a bottom sheet that
   is the app's *home/menu* for everything outside the active-album workflow: your albums,
   New album, per-album Manage, Groups, and App settings.
3. **The Settings modal shrinks to app-only.** Theme, the whole-collection Cloud link,
   version, and Help — nothing album-specific.
4. **Per-album config moves to an album detail screen.** Opening a detail screen makes that
   album *active first*, so it edits the store's mirrored top-level state with no refactor
   (this sidesteps the parked-vs-active mirroring hazard the groups spec calls out).
5. **Adaptive to what exists.** The switcher collapses to name + chevron with a single album;
   a `Type ▾` selector only appears once a second album *type* exists.

## A. Information architecture

```
 HEADER: [ 🦁  Leo's album        🔒  ↗  ?   ]   ← album switcher (B) + per-album quick actions
         [    1 of 3 albums  ▾                ]
         ────────────── active album ──────────────
                    (Album grid)
         ───────────────────────────────────────────
              📖 Album     🔄 Swaps     📊 Stats        ← unchanged; +🤝 Trade later
```

Tapping the switcher slides up the **Library sheet**:

```
 ┌─ Your albums ───────────────────────┐
 │ 🦁 Leo's album   72% · 📱   ● CURRENT│
 │ 🐨 Kai's album   40% · ☁️        ⚙️ │
 │ 🐢 Mia's album   91% · 👥        ⚙️ │
 │ [ ＋ New album ]   [ 👥 Groups ]     │
 │ ⚙️ App settings                      │
 └──────────────────────────────────────┘
```

Two navigational surfaces layer on top of the sheet as needed: an album's **detail** screen
(per-album settings) and the slim **App settings** modal.

## B. The album switcher (header control)

A new `AlbumSwitcher` component replaces the `<h1>{displayName}</h1>` in the header
([App.tsx](../../../src/App.tsx)).

- **Look (treatment B):** a framed, clearly-tappable row — a cover glyph tile, the resolved
  album name, a green "**N of M albums**" line, and a chevron. The "N of M" is the key
  discoverability cue: a bare chevron cannot tell you other albums exist.
- **Adaptive:** with a single album, the count line and chevron are dropped — it renders as a
  plain (still-tappable) title, so it never reads "1 of 1". The sheet is still reachable to
  create the second album (see §C).
- **Cover glyph:** derived, not stored — a **monogram** (the resolved name's first character)
  in a tile whose tint is keyed off the album id, so albums read as visually distinct without
  any new data. Per-album custom cover art (and using the album-type emoji) is **out of scope**.
- The resolved name honours the existing shared-album alias logic
  (`useResolvedAlbumName` / `resolveAlbumName`).

The header keeps its **per-active-album quick actions** unchanged: 🔒 lock, ↗ share list,
? help. The ⚙️ Settings icon **leaves the header** — App settings is now reached from the
Library sheet (§E), which keeps the header uncluttered next to the richer switcher.

## C. The Library sheet

A new `LibrarySheet` component — a dismissible **bottom-anchored** sheet. It reuses the
existing backdrop dismissal and iOS touch handling from the app's modals
(`.modal-backdrop`, the `.content, .modal` drag exemption in [App.tsx](../../../src/App.tsx)),
styled to slide up from the bottom rather than center. It is the hub for everything that is
not the active-album workflow.

**Album cards** — one per album in `albums`, built from each `AlbumSnapshot`:

- cover glyph · resolved name · progress (`owned/total · %`) · mode badge
  (📱 Local / ☁️ Cloud / 👥 Shared, from `useAlbumMode`) · a **current** marker on the active
  album.
- **Tap the card body** → `switchAlbum(id)` and dismiss the sheet. The user lands on that
  album's Album grid. (Tapping the already-active album just dismisses.)
- **Tap the card's ⚙️** → open that album's **detail** screen (§D).

**Actions:** `＋ New album` (calls `createAlbum()`), `👥 Groups` (reserved home for the groups
spec — see §G), and `⚙️ App settings` (opens the slim modal, §E).

**Adaptive type layer:** hidden while only one album type exists. Once the registry holds ≥2
types, a `Type ▾` selector appears above the list and `＋ New album` first asks which type.
Surfacing types requires a per-album `typeId` (today every album is implicitly `activeType`)
— that data-model change and its UI are **out of scope** here; the sheet is simply built so
the selector can slot in without reshaping the card list.

## D. Album detail (the per-album hub)

A new `AlbumDetailView`, opened from a card's ⚙️. It gathers everything currently scattered
through the album-scoped parts of `EditionDialog`:

- rename · Coca-Cola tracking + edition · layout (compact/pages) · sharing panel
  (`AlbumSharing`) · Import / Export (this album) · delete (danger zone).

**Opening the detail makes that album active** (`switchAlbum(id)`) before rendering. This is
deliberate: `AlbumSharing`, `Export`, and the edition/CC/layout controls all read and write
the store's mirrored *active-album* fields today. Activating on open means every one of them
keeps working unchanged, and we never write per-album settings into a *parked* snapshot — the
exact hazard the groups spec flags. It also matches the mental model: you opened this album to
work on it.

`forcedReadOnly` gating (shared read-only albums) carries over exactly as in `EditionDialog`.

## E. App settings (slim)

`EditionDialog` is renamed/rebuilt as `SettingsDialog`, stripped to app-wide items only:

- **Theme** (light/dark) · **whole-collection Cloud link** (`SyncSection`, self-hides when
  Supabase isn't configured) · **version** · **Help** entry.

`theme` is already a global store field, so no data migration is needed. Reached from the
Library sheet's `⚙️ App settings` row.

## F. Component & data-model changes

**Data model: essentially unchanged.** `theme` is already global; every per-album field
already lives on `AlbumSnapshot`. No new *persisted* state is introduced for this reorg, so
**sync is untouched** (the serialized payload is unchanged).

**The one real new logic** — per-album progress in the sheet. `computeStats(counts)`
([stats.ts](../../../src/utils/stats.ts)) reads the live module singleton `album`
([sampleAlbum.ts](../../../src/data/sampleAlbum.ts)), which reflects only the *active* album's
edition/CC layout. To show a correct % for a *parked* album (whose `edition`/`trackCC` may
differ), add a pure helper that computes totals for a given layout without touching the
singleton:

```ts
// utils/stats.ts — totals for an arbitrary album layout, no global mutation.
computeStatsFor(counts: Counts, edition: Edition, trackCC: boolean): Stats
```

It builds the album via `buildAlbumFromType(activeType, { variant: edition, enabledOptional })`
locally (mirroring `applyEdition`'s logic) and computes against that. `computeStatsFor` is the
general form; `computeStats` stays the active-layout binding (and may delegate to it), so no
existing caller changes.

### What moves where (dismantling `EditionDialog`)

| Today (in the ⚙️ modal) | New home |
|---|---|
| Current-album `<select>` | **Library sheet** — album cards / switcher |
| New Album | **Library sheet** — `＋ New album` |
| Album name (rename) | **Album detail** |
| Coca-Cola tracking + edition | **Album detail** |
| Layout (compact/pages) | **Album detail** |
| Sharing (`AlbumSharing`) | **Album detail** |
| Import / Export | **Album detail** (this album) |
| Delete album | **Album detail** (danger zone) |
| Theme | **App settings** modal |
| Whole-collection Cloud link (`SyncSection`) | **App settings** modal |
| Version | **App settings** modal |

### Files touched (anticipated)

- **New** `src/components/AlbumSwitcher.tsx` — the header control (§B).
- **New** `src/components/LibrarySheet.tsx` — album list + actions (§C).
- **New** `src/components/AlbumDetailView.tsx` — per-album hub (§D); activates the album on open.
- [EditionDialog.tsx](../../../src/components/EditionDialog.tsx) → **`SettingsDialog.tsx`** —
  stripped to app-only (§E). Album-scoped JSX is relocated to `AlbumDetailView`.
- [App.tsx](../../../src/App.tsx) — swap the `<h1>` for `AlbumSwitcher`; drop the header ⚙️;
  own the sheet / detail / settings open state; wire switch-and-dismiss.
- [stats.ts](../../../src/utils/stats.ts) — `computeStatsFor` (per-album totals).
- [TabBar.tsx](../../../src/components/TabBar.tsx) — unchanged (stays Album/Swaps/Stats); no
  `library` tab is added.
- `styles.css` — switcher, sheet, and album-card styles.
- Reused as-is: [AlbumSharing.tsx](../../../src/components/AlbumSharing.tsx),
  [ImportDialog.tsx](../../../src/components/ImportDialog.tsx),
  [SyncSection.tsx](../../../src/components/SyncSection.tsx).

## G. Fit with the Album Groups spec

The [groups spec](2026-07-17-album-group-combined-swaps-design.md) currently routes group
management into `EditionDialog` and assumes a **Trade** tab. This reorg changes both
assumptions in its favour, so that spec should be retargeted (as a follow-up, not in this
effort):

- **Group management** gets a natural home behind the Library sheet's `👥 Groups` entry,
  instead of a cramped section in the (now app-only) Settings modal.
- **The Trade tab slot stays free** — the bottom bar is deliberately left at three so
  `Album · Swaps · Stats · 🤝 Trade` fits without hitting the mobile ceiling.

No group code is written here; this design only reserves the surfaces.

## H. Testing

- `computeStatsFor` is a pure function — unit-test alongside
  [stats.ts](../../../src/utils/stats.ts): a parked album with a *different* edition/trackCC
  than the active one reports its own correct totals, and the active album's `computeStats`
  result is unchanged.
- Component behaviour to verify: switching from a card activates that album and dismisses the
  sheet; opening an album's detail activates it before rendering; the switcher collapses to a
  plain title with a single album and shows "N of M" with several; `forcedReadOnly` still
  disables editing controls in album detail.

## I. Out of scope (YAGNI)

- Multi-type UI and the per-album `typeId` it needs (the `Type ▾` selector is designed-for,
  not built).
- The Trade tab itself (owned by the groups spec).
- Per-album custom cover art (glyphs are derived).
- Combined/merged stats across albums.
