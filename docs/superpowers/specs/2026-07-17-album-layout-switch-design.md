# Album Layout Switch (Compact / Pages) — Design

**Date:** 2026-07-17
**Status:** Approved (pending spec review)

## Problem

In the Album tab, the **All** filter always renders the printed-album layout ("Pages"):
templated sections are drawn as two-up spreads with absolutely-positioned slots. This is
the immersive, book-like view. The **Missing** and **Dupes** filters instead render a
simple responsive flow grid of sticker cells — a "Compact" view that is faster to scan.

Some users prefer the compact grid for the All filter too, but there is currently no way
to choose. The layout is hard-wired in `PageSection`: `useSpread` is true whenever a
page has a matching template and the filter is `all`.

## Goal

Add a per-album **Layout** switch to the Settings dialog that lets the user pick between:

- **Compact** — the flow grid (same view Missing/Dupes use), applied to the All filter.
- **Pages** — the current printed-album spread layout.

Requirements:

1. The preference is **per-album** (each album remembers its own), stored like `locked`
   and `edition`.
2. Default is **Compact**.
3. The switch only affects the **All** filter. Missing/Dupes are already compact and are
   unchanged.
4. The switch is **disabled** when the active album does not support the Pages layout
   (no page has a matching template), because Pages would render identically to Compact.

Non-goals (YAGNI): no global layout preference, no new album-type metadata, no change to
Missing/Dupes, no data migration beyond a default-value fallback.

## Approach

### 1. Preference storage — per-album (chosen)

`theme` is a global preference; `edition`, `trackCC`, and `locked` are per-album, held in
each `AlbumSnapshot` and mirrored onto the live top-level fields of the store. The layout
choice is a per-album viewing preference, so it follows the `locked` pattern exactly.

- **Rejected — global (like `theme`):** simplest change, but the user wants each album to
  remember its own layout.
- **Chosen — per-album (like `locked`):** touches the snapshot lifecycle (snapshot / load
  / create / delete) and the sync whitelist, but matches the requested behavior.

Concretely, in [`src/store/collectionStore.ts`](../../../src/store/collectionStore.ts):

- New exported type `AlbumLayout = 'compact' | 'pages'`.
- Add `albumLayout: AlbumLayout` to the `AlbumSnapshot` interface and to `CollectionState`
  (the mirrored top-level field).
- Default `'compact'` in every place a snapshot is constructed: the initial store state,
  the initial default album, `createAlbum`'s fresh snapshot, and `deleteAlbum`'s rebuilt
  last-resort default.
- `snapshotActive` includes `albumLayout`.
- `loadSnapshot` reads `a.albumLayout ?? 'compact'`, so albums saved before this field
  existed load as Compact.
- New action `setAlbumLayout(layout: AlbumLayout)` that sets the top-level field **and**
  mirrors it into the parked snapshot in `albums` — identical in shape to `toggleLocked`,
  so the choice survives album switches.

Rehydration needs no new code: zustand's persist merge keeps the initial `'compact'` for
the top-level field when older saves lack it, and `loadSnapshot`'s `?? 'compact'` covers
parked snapshots when the user switches into them.

### 2. Sync

`albumLayout` is added to the sync whitelist so it travels between devices, consistent
with how `locked` and `theme` are handled.

- Add `albumLayout: AlbumLayout` to `SyncPayload` and to `pickSyncState` in
  [`src/sync/serialize.ts`](../../../src/sync/serialize.ts) (top-level field, like
  `locked`).
- `applyRemoteState` needs no change: it spreads the incoming payload; a payload from an
  older client simply omits the field and leaves the current value untouched.

### 3. Rendering

The only behavioral change is one condition in
[`src/components/PageSection.tsx`](../../../src/components/PageSection.tsx):

```ts
const albumLayout = useCollection((s) => s.albumLayout);
// was: Boolean(template) && filter === 'all'
const useSpread = Boolean(template) && filter === 'all' && albumLayout === 'pages';
```

When `albumLayout === 'compact'`, the All filter falls through to the existing
`sticker-grid` branch — the exact same rendering path Missing/Dupes already use
(`visibleIds` under the All filter is every sticker in page order). No other logic in the
component changes; the grid path already handles cell rendering, number prefixes, and
add/remove.

### 4. The control — segmented pill in the Appearance section

In [`src/components/EditionDialog.tsx`](../../../src/components/EditionDialog.tsx), the
Appearance section (which already holds the theme toggle) gains a new `settings-field`:

- A label **Layout** above a two-segment pill control `[ Compact | Pages ]`.
- The active segment is highlighted green; clicking a segment calls
  `setAlbumLayout('compact' | 'pages')`.
- Styling reuses the filter-bar pill idiom via a new `.settings-segment` rule in
  [`src/styles.css`](../../../src/styles.css) that mirrors `.filterbar` /
  `.filterbar button` / `.filterbar button.active`.

**Disabled state.** Compute `supportsPages` in the dialog, memoized on `[edition, trackCC]`:

```ts
const supportsPages = useMemo(
  () => album.pages.some((p) => templateFor(p) != null),
  [edition, trackCC],
);
```

`templateFor` already reflects the active edition/CC tracking (e.g. NA's 12-sticker
Coca-Cola page has no matching template and falls back to the flow grid). When
`supportsPages` is false:

- Both segments are non-interactive and visually dimmed (`disabled` + a `.disabled` style).
- The stored `albumLayout` value is still shown as active — the dialog does **not** mutate
  state on open. (Rendering already falls back to Compact for template-less albums, so the
  displayed view is correct regardless.)
- A caption below the control reads: *"Pages view isn't available for this album."*

## Components & data flow

- `EditionDialog` reads `albumLayout` + `setAlbumLayout` from the store and computes
  `supportsPages` from the live `album` + `templateFor`.
- `setAlbumLayout` writes the top-level field and the parked snapshot.
- `PageSection` reads `albumLayout` and gates `useSpread` on it. App already remounts the
  content region on `activeAlbumId`/`edition`/`trackCC` changes, so switching albums or
  editions re-derives templates and layout cleanly.

## Testing

- **`src/sync/serialize.test.ts`** — add `albumLayout` to the `samplePayload()` fixture and
  to its embedded album snapshot(s); add it to the `emptyState()` album snapshot if the
  test asserts on that shape. Confirm `pickSyncState` round-trips the field.
- **Store test** (new or alongside existing lock tests) — `setAlbumLayout` updates the
  top-level field and the matching parked snapshot; the value survives a `switchAlbum`
  round-trip; a freshly `createAlbum`'d album defaults to `'compact'`.

## Risks / edge cases

- **Old saves:** covered by the `?? 'compact'` default in `loadSnapshot` and the persist
  merge for the top-level field.
- **Cross-client sync from an older app version:** omitted field leaves the local value
  unchanged (no wipe), same as any other additive field.
- **Album with no templates while stored value is `'pages'`:** rendering already falls back
  to the grid, and the switch is disabled with an explanatory caption, so there is no
  broken/confusing state.
