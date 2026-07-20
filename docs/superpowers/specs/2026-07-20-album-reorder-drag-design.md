# Album Reorder (Drag Handle) Design

**Goal:** Give every album in the **"Your albums"** list a **drag-handle grip** so the
user can reorder albums by dragging (touch or mouse) or with the keyboard. The chosen
order drives the album's position number in the header **album selector** — the `x/n`
count in [AlbumSwitcher.tsx](../../../src/components/AlbumSwitcher.tsx).

**Context:** The "Your albums" list is [LibrarySheet.tsx](../../../src/components/LibrarySheet.tsx),
which maps `albums` → [AlbumCard.tsx](../../../src/components/AlbumCard.tsx). Album order
is currently **implicit**: the raw `albums[]` array order in the store. Two — and only
two — surfaces make that order user-visible:

- **AlbumSwitcher** — `index = albums.findIndex(a => a.id === activeAlbumId)` renders
  `{index + 1}/{total}` ([AlbumSwitcher.tsx:22](../../../src/components/AlbumSwitcher.tsx#L22)).
- **LibrarySheet** — `albums.map(...)` ([LibrarySheet.tsx:57](../../../src/components/LibrarySheet.tsx#L57)).

Everything else (sync serialize/merge, engine, stats) keys albums by `id` and does not
depend on array order for display.

**Critical constraint — sync re-sorts by id.** `mergeCollection` sorts the merged album
list by `id` ([merge.ts:201](../../../src/sync/merge.ts#L201)) for payload determinism,
and `applyMergedCollection` rebuilds `albums` as `[...kept, ...cloudAlbums]`
([collectionStore.ts:551](../../../src/store/collectionStore.ts#L551)). So the raw
`albums[]` order is **destroyed by any Cloud/Shared sync round-trip**. Reordering that
array directly would therefore not survive sync. This user uses both Cloud and Shared
albums, so order must be stored **independently of the synced array**.

**Decision (approved):**
1. **Order is a local device preference**, stored as a separate `albumOrder: string[]`
   that is **never** part of any sync payload. Each device keeps its own arrangement
   (like arranging apps on your own phone). No changes to the sync merge logic.
2. **Drag-and-drop is hand-rolled with Pointer Events** — no new dependency — matching
   the codebase's build-it-in-house ethos. Touch + mouse + keyboard.

**Tech stack:** React 18, Zustand 4 (`persist` middleware), TypeScript 5 (strict,
`noUnusedLocals`), Vite 5, Vitest 4.

---

## Global Constraints

- **`albumOrder` is local-only.** It is added to the persisted store state but MUST NOT
  be added to the sync payload ([payload.ts](../../../src/sync/payload.ts)),
  `serialize.ts`, or any merge function. A sync round-trip must leave `albumOrder`
  untouched.
- **Do not change the sync merge/apply logic.** `mergeCollection`'s id-sort is load-
  bearing for payload determinism; leave it. Reordering is applied purely as a *display*
  transform over `albums`, never by mutating the array's persisted order for sync.
- **Reuse existing conventions:** className strings + CSS custom properties
  (`var(--bg-elev)`, `var(--border)`, `var(--text)`, `var(--text-dim)`,
  `var(--green)`, `var(--green-bright)`), `useCollection` selectors, and the existing
  `.album-card*` class family.
- **Testing pattern:** the repo unit-tests **pure logic only** with Vitest; there is
  **no component-test harness — do not add React Testing Library.** The pointer-drag
  interaction is verified by driving the running app.
- **Backward compatible.** Legacy persisted state has no `albumOrder`; that (and an
  empty array) must resolve to today's natural `albums` order.

---

## 1. Store: `albumOrder` + `orderAlbums` + `reorderAlbums`

**File:** [src/store/collectionStore.ts](../../../src/store/collectionStore.ts)

### State

Add one optional field to `CollectionState`:

```ts
/**
 * The user's manual album arrangement as an ordered list of album ids. LOCAL-ONLY:
 * never serialized to the sync payload, so each device keeps its own order and a
 * Cloud/Shared sync round-trip (which re-sorts `albums` by id) cannot clobber it.
 * Missing/empty (legacy) means "no manual order" → natural `albums` order.
 */
albumOrder?: string[];
```

Initial value: omit (undefined) in the store's initial object — the reconciler treats
that as natural order. No change to `onRehydrateStorage` is required.

### Pure reconciler (exported for reuse + tests)

```ts
/**
 * Apply the local manual order to the album list. Self-healing:
 *  - albums whose id appears in `order` come first, in `order` sequence;
 *  - albums not listed (newly created / joined / added by a sync merge) are appended
 *    in their natural `albums` position;
 *  - ids in `order` with no matching album are ignored.
 * Undefined/empty `order` returns `albums` unchanged. Pure; never mutates inputs.
 */
export function orderAlbums(albums: AlbumSnapshot[], order?: string[]): AlbumSnapshot[] {
  if (!order || order.length === 0) return albums;
  const rank = new Map(order.map((id, i) => [id, i]));
  const listed = albums.filter((a) => rank.has(a.id))
    .sort((x, y) => rank.get(x.id)! - rank.get(y.id)!);
  const rest = albums.filter((a) => !rank.has(a.id)); // preserves natural order
  return [...listed, ...rest];
}
```

Because it is self-healing, **`createAlbum`, `deleteAlbum`, `switchAlbum`, join, and all
sync-apply actions are left unchanged** — new albums simply append, deleted ids drop out.

### Action

```ts
/** Record the user's manual album order (local-only display preference). */
reorderAlbums: (orderedIds: string[]) => void;
```

Implementation: `reorderAlbums: (orderedIds) => set({ albumOrder: orderedIds })`.

The caller (LibrarySheet) passes the **full** id list in its new order. Keeping the store
"dumb" (no index math) keeps the reorder mechanics entirely in the component.

---

## 2. Applying the order at the two display surfaces

### AlbumSwitcher — the `x/n` number

**File:** [src/components/AlbumSwitcher.tsx](../../../src/components/AlbumSwitcher.tsx)

Select `albumOrder` alongside `albums` and compute the index over the ordered view:

```ts
const albums = useCollection((s) => s.albums);
const albumOrder = useCollection((s) => s.albumOrder);
const ordered = useMemo(() => orderAlbums(albums, albumOrder), [albums, albumOrder]);
const total = ordered.length;
const index = ordered.findIndex((a) => a.id === activeAlbumId);
```

`{index + 1}/{total}` now reflects the manual order. (Selecting the two fields
separately avoids returning a fresh array from the selector, which would defeat Zustand's
change check; `useMemo` derives the ordered array.)

### LibrarySheet — the list

**File:** [src/components/LibrarySheet.tsx](../../../src/components/LibrarySheet.tsx)

Same derivation; render `ordered` instead of `albums`. LibrarySheet also owns the drag
state and passes drag props into each `AlbumCard` (§3).

---

## 3. Drag interaction (Pointer Events, in LibrarySheet)

The list owner holds the drag state because reordering needs sibling geometry and a
single source of truth for the live order.

### Local state

```ts
const [dragId, setDragId] = useState<string | null>(null); // album being dragged (null = idle)
const [liveIds, setLiveIds] = useState<string[] | null>(null); // provisional order while dragging
```

Render order while dragging = `liveIds` mapped back to album snapshots; otherwise the
`ordered` list from §2.

### Pointer (touch + mouse) flow

Handlers live on the list container / handle:

1. **`onPointerDown` on a card's grip** →
   - `setDragId(id)`, seed `liveIds` from the current ordered id list.
   - `e.currentTarget.setPointerCapture(e.pointerId)` so we keep receiving moves even if
     the finger leaves the handle.
   - Record the pointer's start Y and the dragged card's start Y.
2. **`onPointerMove`** (only when `dragId` set) →
   - Compute the pointer's Y relative to the list.
   - Determine the hovered slot by comparing pointer Y against each rendered card's
     vertical midpoint (`getBoundingClientRect` on the list's card children).
   - If the dragged id should occupy a different slot than it currently does in
     `liveIds`, splice it to the new index → `setLiveIds(next)`. React re-renders the
     list in the new order (live "reorder-on-cross").
   - Keep the dragged card visually under the finger via a `transform: translateY(...)`
     offset (its follow delta), applied through a `.album-card.dragging` style.
3. **`onPointerUp` / `onPointerCancel`** →
   - If `liveIds` differs from the committed order, call `reorderAlbums(liveIds)`.
   - Clear `dragId` / `liveIds`, release pointer capture, reset transforms.

Notes:
- **`touch-action: none`** on the grip (CSS) so a vertical drag does not scroll the page
  / modal.
- The list is short (typically 2–6 cards) and lives inside the `.modal`; **auto-scroll
  while dragging is out of scope (YAGNI)** — the list fits without scrolling at those
  sizes.
- Only the **grip** starts a drag. The card's main button (switch album) and the ⚙️
  manage button keep their existing tap behavior.

### Keyboard flow (accessibility)

On the focused grip (it is a real `<button>`):

- **ArrowUp / ArrowDown** → move this album one slot up/down: compute the new id list and
  call `reorderAlbums(next)` immediately (no "pick-up" mode). `preventDefault()` so the
  modal doesn't scroll. Clamp at the ends.
- After each move, update a visually-hidden **`aria-live="polite"`** region in
  LibrarySheet, e.g. `"Moved Rodgers to position 2 of 3."` Keep focus on the moved
  album's grip so repeated presses chain.

---

## 4. AlbumCard: the grip

**File:** [src/components/AlbumCard.tsx](../../../src/components/AlbumCard.tsx)

- Add a **left-side** grip element mirroring the right-side `.album-card-manage`. Render
  it as the first child of `.album-card` (before `.album-card-main`).
- Glyph: `⠿` (grip dots). `aria-label={`Reorder ${name}`}`.
- **Hidden when there is only one album** — pass a `canReorder` (or `sortable`) boolean
  prop from LibrarySheet (`ordered.length > 1`); when false, the grip is not rendered
  (nothing to sort), matching how `x/n` only appears when `multi`.
- New props passed from LibrarySheet: `sortable`, plus drag/keyboard handlers
  (`onGripPointerDown`, `onGripKeyDown`) and an `isDragging` flag used to add the
  `dragging` class on the card. Existing `onOpen` / `onManage` are unchanged.

The card keeps `overflow: hidden` and `align-items: stretch`; the grip is a full-height
column like the manage button.

---

## 5. CSS

**File:** [src/styles.css](../../../src/styles.css) (add next to `.album-card-manage`)

- `.album-card-grip` — mirror of `.album-card-manage` but on the left:
  `border-right: 1px solid var(--border)` (instead of `border-left`),
  `flex: none`, matching padding, `color: var(--text-dim)`, `background: none`,
  `cursor: grab`, and **`touch-action: none`**.
- `.album-card-grip:active { cursor: grabbing; }` and `:hover` mirrors the manage hover.
- `.album-card.dragging` — lift affordance: `box-shadow`, raised `z-index`,
  `position: relative`; the dragged card's `transform` is set inline while following the
  pointer.
- Wrap non-essential transitions in `@media (prefers-reduced-motion: no-preference)` (or
  guard the drag-follow transition) so reduced-motion users get instant, non-animated
  reordering.
- The active-album green border (`.album-card.active`) and `· Current` remain intact.

---

## 6. Edge cases

- **Single album:** grip hidden (`sortable === false`); no drag path reachable.
- **New / joined / sync-added album:** appended by `orderAlbums` reconciler; no store
  changes needed at those call sites.
- **Deleting an album (active or parked):** its id is simply ignored by the reconciler;
  `albumOrder` may keep a stale id harmlessly (self-healing). Optional tidy-up is not
  required.
- **Legacy users (no `albumOrder`):** natural order preserved.
- **Sync round-trip:** `albums` gets re-sorted by id inside the store, but the displayed
  order is re-derived from the untouched `albumOrder`, so the user's arrangement holds.

---

## 7. Testing

**Unit (Vitest, pure logic) — `collectionStore.test.ts` (or a new `albumOrder.test.ts`):**

- `orderAlbums`:
  - `undefined` / `[]` order → returns `albums` unchanged (same reference order).
  - Full order `[C,A,B]` → returns albums in that sequence.
  - Partial order `[C]` with albums `[A,B,C]` → `[C,A,B]` (listed first, rest natural).
  - Stale id in order (`[Z,A]`, no `Z`) → ignored.
- `reorderAlbums(ids)` sets `albumOrder` to exactly `ids`.
- **Sync-survival:** set an `albumOrder`, run `applyMergedCollection` with a payload that
  re-sorts `albums` by id, and assert `albumOrder` is unchanged and `orderAlbums` still
  yields the manual order.

**Manual (running app):** drag a card by its grip on desktop (mouse) and confirm the
list reorders and the header `x/n` updates; keyboard ArrowUp/Down on a focused grip;
single-album case hides the grip; verify order persists across reload and survives a
sync.

---

## Out of scope (YAGNI)

- Auto-scroll of the album list during drag (list is short; fits without scroll).
- Syncing order across devices (explicitly chosen against — local preference only).
- Reordering anything other than albums (pages, swaps, etc.).
- Drag animations beyond a simple lift/follow; no FLIP choreography.
