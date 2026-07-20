# Album Reorder (Drag Handle) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a drag-handle grip to every album in the "Your albums" list so the user can reorder albums (touch, mouse, or keyboard); the chosen order drives the header album-selector `x/n` number.

**Architecture:** Album order becomes a **local-only** `albumOrder: string[]` in the Zustand store (never synced). A pure `orderAlbums(albums, order)` reconciler derives the display order and is applied at the only two surfaces that show order — `AlbumSwitcher` (the `x/n` index) and `LibrarySheet` (the list). Drag is hand-rolled with Pointer Events in `LibrarySheet` (reorder-on-cross), with ArrowUp/Down keyboard reordering on each grip.

**Tech Stack:** React 18, Zustand 4 (`persist`), TypeScript 5 (strict, `noUnusedLocals`), Vite 5, Vitest 4.

## Global Constraints

- **`albumOrder` is local-only.** Never add it to `sync/payload.ts`, `sync/serialize.ts`, or any merge function. A sync round-trip must leave it untouched.
- **Do not modify sync merge/apply logic.** `mergeCollection`'s id-sort is load-bearing; ordering is a display transform only.
- **No new dependencies.** Drag is hand-rolled Pointer Events.
- **Reuse existing conventions:** className strings + CSS custom properties (`var(--bg-elev)`, `var(--border)`, `var(--text)`, `var(--text-dim)`, `var(--green)`), `useCollection` selectors, the `.album-card*` class family, and the `.sr-only` + `aria-live="polite"` pattern.
- **Testing pattern:** unit-test **pure logic only** with Vitest. **No React Testing Library.** Component behavior is verified by driving the running app.
- **Backward compatible:** missing/empty `albumOrder` (legacy) resolves to today's natural `albums` order.
- **TypeScript is strict with `noUnusedLocals`** — every import/prop must be used.

---

### Task 1: Store — `albumOrder`, `orderAlbums`, `reorderAlbums`

**Files:**
- Modify: `src/store/collectionStore.ts`
- Test: `src/store/collectionStore.test.ts`

**Interfaces:**
- Consumes: existing `AlbumSnapshot`, `useCollection`, `applyMergedCollection`, and the test helper `snap(id, over)` (already defined at the top of `collectionStore.test.ts`).
- Produces:
  - `export function orderAlbums(albums: AlbumSnapshot[], order?: string[]): AlbumSnapshot[]`
  - store field `albumOrder?: string[]`
  - store action `reorderAlbums: (orderedIds: string[]) => void`

- [ ] **Step 1: Write the failing tests**

Append to `src/store/collectionStore.test.ts`. Also update the existing import line at the top of the file from `import { useCollection } from './collectionStore';` to:

```ts
import { useCollection, orderAlbums } from './collectionStore';
```

Then append these two describe blocks at the end of the file:

```ts
describe('orderAlbums (pure)', () => {
  const A = snap('A');
  const B = snap('B');
  const C = snap('C');

  it('returns albums unchanged when order is undefined', () => {
    expect(orderAlbums([A, B, C], undefined).map((a) => a.id)).toEqual(['A', 'B', 'C']);
  });
  it('returns albums unchanged when order is empty', () => {
    expect(orderAlbums([A, B, C], []).map((a) => a.id)).toEqual(['A', 'B', 'C']);
  });
  it('applies a full manual order', () => {
    expect(orderAlbums([A, B, C], ['C', 'A', 'B']).map((a) => a.id)).toEqual(['C', 'A', 'B']);
  });
  it('lists ordered ids first, then unlisted albums in natural order', () => {
    expect(orderAlbums([A, B, C], ['C']).map((a) => a.id)).toEqual(['C', 'A', 'B']);
  });
  it('ignores ids in the order that no longer exist', () => {
    expect(orderAlbums([A, B], ['Z', 'B', 'A']).map((a) => a.id)).toEqual(['B', 'A']);
  });
});

describe('reorderAlbums', () => {
  it('records the manual order in albumOrder', () => {
    useCollection.getState().reorderAlbums(['S', 'A']);
    expect(useCollection.getState().albumOrder).toEqual(['S', 'A']);
  });
  it('keeps the manual order across a sync merge that re-sorts albums by id', () => {
    useCollection.getState().reorderAlbums(['S', 'A']);
    // A cloud merge rebuilds `albums` id-sorted; albumOrder must be untouched.
    const payload = {
      kind: 'collection' as const,
      v: 1,
      albums: [snap('A'), snap('S', { albumName: 'Shared' })],
    };
    useCollection.getState().applyMergedCollection(payload, new Set());
    const st = useCollection.getState();
    expect(st.albumOrder).toEqual(['S', 'A']); // preserved through sync
    expect(orderAlbums(st.albums, st.albumOrder).map((a) => a.id)).toEqual(['S', 'A']);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/store/collectionStore.test.ts`
Expected: FAIL — `orderAlbums` is not exported (import error) and `reorderAlbums` is not a function.

- [ ] **Step 3: Add the `albumOrder` field to the state interface**

In `src/store/collectionStore.ts`, in `interface CollectionState`, add this field right after the `albums: AlbumSnapshot[];` / `activeAlbumId: string;` block (near line 86):

```ts
  /**
   * The user's manual album arrangement as an ordered list of album ids. LOCAL-ONLY:
   * never serialized to the sync payload, so each device keeps its own order and a
   * Cloud/Shared sync round-trip (which re-sorts `albums` by id) cannot clobber it.
   * Missing/empty (legacy) means "no manual order" → natural `albums` order.
   */
  albumOrder?: string[];
```

- [ ] **Step 4: Declare the `reorderAlbums` action in the interface**

In the same `interface CollectionState`, add to the "Album management" group (right after `deleteAlbum: (id: string) => void;`, near line 103):

```ts
  /** Record the user's manual album order (local-only display preference). */
  reorderAlbums: (orderedIds: string[]) => void;
```

- [ ] **Step 5: Add the pure `orderAlbums` reconciler**

In `src/store/collectionStore.ts`, add this exported function immediately after the `loadSnapshot` function (near line 195):

```ts
/**
 * Apply the local manual order to the album list. Self-healing:
 *  - albums whose id appears in `order` come first, in `order` sequence;
 *  - albums not listed (newly created / joined / added by a sync merge) are appended
 *    in their natural `albums` position;
 *  - ids in `order` with no matching album are ignored.
 * Undefined/empty `order` returns the input order unchanged. Pure; never mutates inputs.
 */
export function orderAlbums(albums: AlbumSnapshot[], order?: string[]): AlbumSnapshot[] {
  if (!order || order.length === 0) return albums;
  const rank = new Map(order.map((id, i) => [id, i] as const));
  const listed = albums
    .filter((a) => rank.has(a.id))
    .sort((x, y) => rank.get(x.id)! - rank.get(y.id)!);
  const rest = albums.filter((a) => !rank.has(a.id)); // preserves natural order
  return [...listed, ...rest];
}
```

- [ ] **Step 6: Implement the `reorderAlbums` action**

In the store creator object, add the action right after the `setAlbumLayout` action (near line 389):

```ts
      reorderAlbums: (orderedIds) => set({ albumOrder: orderedIds }),
```

- [ ] **Step 7: Run tests to verify they pass**

Run: `npx vitest run src/store/collectionStore.test.ts`
Expected: PASS (all existing + 7 new tests).

- [ ] **Step 8: Full test + typecheck sweep**

Run: `npx vitest run && npx tsc -b`
Expected: all tests PASS, tsc exits 0 (no errors).

- [ ] **Step 9: Commit**

```bash
git add src/store/collectionStore.ts src/store/collectionStore.test.ts
git commit -m "feat(albums): local albumOrder + orderAlbums reconciler + reorderAlbums action"
```

---

### Task 2: AlbumSwitcher — `x/n` reflects manual order

**Files:**
- Modify: `src/components/AlbumSwitcher.tsx`

**Interfaces:**
- Consumes: `orderAlbums` and `albumOrder` from Task 1.
- Produces: nothing new (behavioral change only).

- [ ] **Step 1: Rewrite AlbumSwitcher to order the list before indexing**

Replace the entire contents of `src/components/AlbumSwitcher.tsx` with:

```tsx
import { useMemo } from 'react';
import { useCollection, orderAlbums } from '../store/collectionStore';
import { useAlbumMode, useResolvedAlbumName } from '../sync/useAlbumMode';
import { MODE_BADGE } from '../sync/albumMode';
import { monogram, coverTint } from '../utils/albumCover';
import { ALBUM_TYPE } from '../config';

interface Props {
  onOpen: () => void;
}

/** Header control: the active album (monogram · name + count + mode pill · album type · chevron).
 *  Tapping opens the Library sheet to switch, manage, or add albums. */
export default function AlbumSwitcher({ onOpen }: Props) {
  const activeAlbumId = useCollection((s) => s.activeAlbumId);
  const albumName = useCollection((s) => s.albumName);
  const albums = useCollection((s) => s.albums);
  const albumOrder = useCollection((s) => s.albumOrder);
  const name = useResolvedAlbumName(activeAlbumId, albumName);
  const mode = useAlbumMode(activeAlbumId);
  const badge = MODE_BADGE[mode];

  // The x/n position follows the user's manual arrangement (local albumOrder).
  const ordered = useMemo(() => orderAlbums(albums, albumOrder), [albums, albumOrder]);
  const total = ordered.length;
  const index = ordered.findIndex((a) => a.id === activeAlbumId);
  const multi = total > 1;

  return (
    <button
      type="button"
      className="album-switcher"
      onClick={onOpen}
      aria-haspopup="dialog"
      aria-label={
        multi
          ? `${name}, album ${index + 1} of ${total}. ${badge.label}. Switch or add albums`
          : `${name}. ${badge.label}. Switch or add albums`
      }
    >
      <span className={`album-cover tint-${coverTint(activeAlbumId)}`} aria-hidden="true">
        {monogram(name)}
      </span>
      <span className="album-switcher-text">
        <span className="album-switcher-line1">
          <span className="album-switcher-name">{name}</span>
          {multi && <span className="album-switcher-count">{index + 1}/{total}</span>}
          <span className={`album-switcher-mode mode-pill mode-${mode}`}>{badge.icon} {badge.label}</span>
        </span>
        <span className="album-switcher-type">{ALBUM_TYPE}</span>
      </span>
      <span className="album-switcher-caret" aria-hidden="true">▾</span>
    </button>
  );
}
```

- [ ] **Step 2: Typecheck**

Run: `npx tsc -b`
Expected: exits 0 (no errors).

- [ ] **Step 3: Commit**

```bash
git add src/components/AlbumSwitcher.tsx
git commit -m "feat(albums): header x/n reflects manual album order"
```

---

### Task 3: AlbumCard — grip handle + drag props + CSS

**Files:**
- Modify: `src/components/AlbumCard.tsx`
- Modify: `src/styles.css`

**Interfaces:**
- Consumes: nothing new.
- Produces: the extended `AlbumCard` props that Task 4 supplies:
  - `sortable: boolean`
  - `isDragging: boolean`
  - `onGripPointerDown: PointerEventHandler<HTMLButtonElement>`
  - `onGripPointerMove: PointerEventHandler<HTMLButtonElement>`
  - `onGripPointerUp: PointerEventHandler<HTMLButtonElement>`
  - `onGripKeyDown: KeyboardEventHandler<HTMLButtonElement>`

- [ ] **Step 1: Rewrite AlbumCard to render the grip and accept drag props**

Replace the entire contents of `src/components/AlbumCard.tsx` with:

```tsx
import { useMemo } from 'react';
import type { PointerEventHandler, KeyboardEventHandler } from 'react';
import type { AlbumSnapshot } from '../store/collectionStore';
import { useAlbumMode, useResolvedAlbumName } from '../sync/useAlbumMode';
import { MODE_BADGE } from '../sync/albumMode';
import { computeStatsFor, displayPct } from '../utils/stats';
import { monogram, coverTint } from '../utils/albumCover';

interface Props {
  album: AlbumSnapshot;
  isActive: boolean;
  /** Show the drag grip? False when there is only one album (nothing to sort). */
  sortable: boolean;
  /** True while this card is the one being dragged (adds a lift style). */
  isDragging: boolean;
  onOpen: () => void;   // switch to this album + close the sheet
  onManage: () => void; // switch + open this album's detail
  onGripPointerDown: PointerEventHandler<HTMLButtonElement>;
  onGripPointerMove: PointerEventHandler<HTMLButtonElement>;
  onGripPointerUp: PointerEventHandler<HTMLButtonElement>;
  onGripKeyDown: KeyboardEventHandler<HTMLButtonElement>;
}

export default function AlbumCard({
  album,
  isActive,
  sortable,
  isDragging,
  onOpen,
  onManage,
  onGripPointerDown,
  onGripPointerMove,
  onGripPointerUp,
  onGripKeyDown,
}: Props) {
  const name = useResolvedAlbumName(album.id, album.albumName);
  const mode = useAlbumMode(album.id);
  const stats = useMemo(
    () => computeStatsFor(album.counts, album.edition, album.trackCC),
    [album.counts, album.edition, album.trackCC],
  );
  const badge = MODE_BADGE[mode];
  const pct = displayPct(stats.completionPct);

  return (
    <div className={`album-card${isActive ? ' active' : ''}${isDragging ? ' dragging' : ''}`}>
      {sortable && (
        <button
          type="button"
          className="album-card-grip"
          aria-label={`Reorder ${name}. Use arrow up and down to move.`}
          onPointerDown={onGripPointerDown}
          onPointerMove={onGripPointerMove}
          onPointerUp={onGripPointerUp}
          onPointerCancel={onGripPointerUp}
          onKeyDown={onGripKeyDown}
        >
          ⠿
        </button>
      )}
      <button type="button" className="album-card-main" onClick={onOpen}>
        <span className={`album-cover tint-${coverTint(album.id)}`} aria-hidden="true">
          {monogram(name)}
        </span>
        <span className="album-card-body">
          <span className="album-card-top">
            <span className="album-card-name">{name}</span>
            <span className={`album-card-badge mode-pill mode-${mode}`}>{badge.icon} {badge.label}</span>
          </span>
          <span className="album-card-bar"><span style={{ width: `${pct}%` }} /></span>
          <span className="album-card-meta">
            {stats.ownedUnique}/{stats.totalStickers} · {pct}%
            {isActive && <span className="album-card-current"> · Current</span>}
          </span>
        </span>
      </button>
      <button type="button" className="album-card-manage" onClick={onManage} aria-label={`Manage ${name}`}>
        ⚙️
      </button>
    </div>
  );
}
```

- [ ] **Step 2: Add grip + dragging CSS**

In `src/styles.css`, immediately after the `.album-card-manage:hover { ... }` rule (ends near line 1962), add:

```css
.album-card-grip {
  flex: none;
  padding: 0 12px;
  border: none;
  border-right: 1px solid var(--border);
  background: none;
  color: var(--text-dim);
  font-size: 15px;
  cursor: grab;
  /* Prevent touch-drag from scrolling the page/modal while reordering. */
  touch-action: none;
}
.album-card-grip:hover {
  background: var(--bg-elev);
  color: var(--text);
}
.album-card-grip:active {
  cursor: grabbing;
}
.album-card.dragging {
  position: relative;
  z-index: 1;
  border-color: var(--green);
  box-shadow: 0 6px 20px rgba(0, 0, 0, 0.35);
}
```

(No transitions are added, so reduced-motion users get the same instant, state-driven reordering — nothing to guard.)

- [ ] **Step 3: Typecheck**

Run: `npx tsc -b`
Expected: FAIL — `LibrarySheet.tsx` does not yet pass the new required props (`sortable`, `isDragging`, `onGrip*`). This is expected; Task 4 supplies them.

> Note: Task 3 and Task 4 form one compiling unit (AlbumCard's new required props are only satisfied by LibrarySheet). Commit Task 3 without a standalone green typecheck; the green gate is at the end of Task 4.

- [ ] **Step 4: Commit**

```bash
git add src/components/AlbumCard.tsx src/styles.css
git commit -m "feat(albums): AlbumCard drag grip handle + dragging styles"
```

---

### Task 4: LibrarySheet — pointer/keyboard drag + ordered render

**Files:**
- Modify: `src/components/LibrarySheet.tsx`

**Interfaces:**
- Consumes: `orderAlbums`, `reorderAlbums`, `albumOrder` from Task 1; the extended `AlbumCard` props from Task 3.
- Produces: nothing new.

- [ ] **Step 1: Rewrite LibrarySheet with ordering + drag state + handlers**

Replace the entire contents of `src/components/LibrarySheet.tsx` with:

```tsx
import { useState, useMemo, useRef } from 'react';
import type { PointerEvent as ReactPointerEvent, KeyboardEvent as ReactKeyboardEvent } from 'react';
import { useCollection, orderAlbums } from '../store/collectionStore';
import { useSyncMeta } from '../store/syncStore';
import AlbumCard from './AlbumCard';
import { isSyncConfigured } from '../lib/supabase';
import JoinAlbumDialog from './JoinAlbumDialog';

interface Props {
  onClose: () => void;
  onManageAlbum: (id: string) => void; // App switches + opens the album detail
  onOpenCloudSync: () => void;         // manage the whole-collection Cloud link (only if one exists)
}

export default function LibrarySheet({ onClose, onManageAlbum, onOpenCloudSync }: Props) {
  const albums = useCollection((s) => s.albums);
  const albumOrder = useCollection((s) => s.albumOrder);
  const activeAlbumId = useCollection((s) => s.activeAlbumId);
  const switchAlbum = useCollection((s) => s.switchAlbum);
  const createAlbum = useCollection((s) => s.createAlbum);
  const setAlbumName = useCollection((s) => s.setAlbumName);
  const reorderAlbums = useCollection((s) => s.reorderAlbums);
  // A whole-collection Cloud link only exists once the user has set up Cloud sync
  // (via a per-album Sharing → Cloud). Until then there's nothing to manage here.
  const hasCloudLink = useSyncMeta((s) => s.collection !== null);

  // New-album naming step, and a short confirmation after it lands in the list.
  const [naming, setNaming] = useState(false);
  const [draft, setDraft] = useState('');
  const [justCreated, setJustCreated] = useState<string | null>(null);
  const [joining, setJoining] = useState(false);

  // Drag-to-reorder state. `dragId` is the album being dragged (null = idle);
  // `liveIds` is the provisional order shown while dragging (committed on release).
  const [dragId, setDragId] = useState<string | null>(null);
  const [liveIds, setLiveIds] = useState<string[] | null>(null);
  const [announce, setAnnounce] = useState('');
  const listRef = useRef<HTMLDivElement>(null);

  const ordered = useMemo(() => orderAlbums(albums, albumOrder), [albums, albumOrder]);
  const byId = useMemo(() => new Map(albums.map((a) => [a.id, a])), [albums]);
  // While dragging, render the provisional order; otherwise the stored order.
  const renderAlbums = (liveIds ?? ordered.map((a) => a.id))
    .map((id) => byId.get(id))
    .filter((a): a is NonNullable<typeof a> => a != null);
  const sortable = renderAlbums.length > 1;

  function open(id: string) {
    switchAlbum(id);
    onClose();
  }

  function confirmCreate() {
    createAlbum(); // creates AND makes the new album active
    const trimmed = draft.trim();
    if (trimmed) setAlbumName(trimmed); // override the auto-generated default
    setNaming(false);
    // Stay in the sheet so the new album is visibly added to the list (marked
    // "Current"); confirm it by name so the user knows it was created.
    setJustCreated(trimmed || 'New album');
  }

  // --- Pointer drag (touch + mouse), reorder-on-cross ---
  function handleGripPointerDown(e: ReactPointerEvent<HTMLButtonElement>, id: string) {
    e.currentTarget.setPointerCapture(e.pointerId); // keep receiving moves off the handle
    setDragId(id);
    setLiveIds(ordered.map((a) => a.id));
  }

  function handleGripPointerMove(e: ReactPointerEvent<HTMLButtonElement>) {
    if (!dragId || !listRef.current) return;
    const cards = Array.from(listRef.current.querySelectorAll<HTMLElement>('.album-card'));
    const y = e.clientY;
    // Insert-before slot = first card whose vertical midpoint is below the pointer;
    // cards.length means "below every card" → append at the end.
    let target = cards.length;
    for (let i = 0; i < cards.length; i++) {
      const r = cards[i].getBoundingClientRect();
      if (y < r.top + r.height / 2) { target = i; break; }
    }
    setLiveIds((prev) => {
      if (!prev) return prev;
      const from = prev.indexOf(dragId);
      if (from === -1) return prev;
      // `target` indexes the list WITH the dragged card still in it. Removing that
      // card shifts every later slot down one, so when inserting past the original
      // position the index drops by one.
      const insertAt = target > from ? target - 1 : target;
      if (insertAt === from) return prev;
      const next = [...prev];
      next.splice(from, 1);
      next.splice(insertAt, 0, dragId);
      return next;
    });
  }

  function handleGripPointerUp(e: ReactPointerEvent<HTMLButtonElement>) {
    if (!dragId) return;
    e.currentTarget.releasePointerCapture?.(e.pointerId);
    if (liveIds) reorderAlbums(liveIds); // commit the provisional order
    setDragId(null);
    setLiveIds(null);
  }

  // --- Keyboard reorder: ArrowUp/Down moves the focused album one slot ---
  function handleGripKeyDown(e: ReactKeyboardEvent<HTMLButtonElement>, id: string) {
    if (e.key !== 'ArrowUp' && e.key !== 'ArrowDown') return;
    e.preventDefault(); // don't scroll the modal
    const ids = ordered.map((a) => a.id);
    const from = ids.indexOf(id);
    const to = e.key === 'ArrowUp' ? from - 1 : from + 1;
    if (from === -1 || to < 0 || to >= ids.length) return;
    const next = [...ids];
    next.splice(from, 1);
    next.splice(to, 0, id);
    reorderAlbums(next);
    const label = byId.get(id)?.albumName ?? 'Album';
    setAnnounce(`Moved ${label} to position ${to + 1} of ${ids.length}.`);
    // React keeps this grip's DOM node (key = album id), so focus stays put.
  }

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <h2>Your albums</h2>

        {justCreated && (
          <p className="library-created" role="status">
            ✓ “{justCreated}” created — it’s in your list below.
          </p>
        )}

        <div className="album-list" ref={listRef}>
          {renderAlbums.map((a) => (
            <AlbumCard
              key={a.id}
              album={a}
              isActive={a.id === activeAlbumId}
              sortable={sortable}
              isDragging={dragId === a.id}
              onOpen={() => open(a.id)}
              onManage={() => onManageAlbum(a.id)}
              onGripPointerDown={(e) => handleGripPointerDown(e, a.id)}
              onGripPointerMove={handleGripPointerMove}
              onGripPointerUp={handleGripPointerUp}
              onGripKeyDown={(e) => handleGripKeyDown(e, a.id)}
            />
          ))}
        </div>
        <div className="sr-only" aria-live="polite">{announce}</div>

        <div className="btn-row" style={{ marginTop: 12 }}>
          <button
            type="button"
            className="btn primary full"
            onClick={() => { setDraft(''); setJustCreated(null); setNaming(true); }}
          >
            ➕ New album
          </button>
          {isSyncConfigured && (
            <button
              type="button"
              className="btn full"
              onClick={() => { setJustCreated(null); setJoining(true); }}
            >
              📥 Join a shared album
            </button>
          )}
        </div>
        {hasCloudLink && (
          <button type="button" className="btn full" style={{ marginTop: 8 }} onClick={onOpenCloudSync}>
            ☁️ Cloud sync
          </button>
        )}
        <div className="btn-row" style={{ marginTop: 8 }}>
          <button className="btn full" onClick={onClose}>Close</button>
        </div>
      </div>

      {naming && (
        <div className="modal-backdrop" onClick={() => setNaming(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <h2>New album</h2>
            <p className="modal-sub">Give your new album a name. You can change it later from its settings.</p>
            <div className="settings-field">
              <label htmlFor="new-album-name" className="settings-field-label">Album name</label>
              <input
                id="new-album-name"
                type="text"
                className="settings-input"
                placeholder="e.g. Leo’s album"
                value={draft}
                autoFocus
                onChange={(e) => setDraft(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') confirmCreate(); }}
              />
            </div>
            <div className="btn-row">
              <button type="button" className="btn full" onClick={() => setNaming(false)}>Cancel</button>
              <button type="button" className="btn primary full" onClick={confirmCreate}>Create album</button>
            </div>
          </div>
        </div>
      )}

      {joining && (
        <JoinAlbumDialog
          onClose={() => setJoining(false)}
          onJoined={() => { setJoining(false); onClose(); }}
        />
      )}
    </div>
  );
}
```

- [ ] **Step 2: Typecheck (now green — Tasks 3 + 4 complete the unit)**

Run: `npx tsc -b`
Expected: exits 0 (no errors). AlbumCard's required grip props are now all supplied.

- [ ] **Step 3: Full test sweep**

Run: `npx vitest run`
Expected: all tests PASS (no regressions).

- [ ] **Step 4: Manual verification in the running app**

Run: `npm run dev`, open the app, and open the "Your albums" sheet (tap the header album selector). Verify:
- Each album shows a `⠿` grip on the **left** (mirroring the ⚙️ on the right) — **but only when there are 2+ albums**. With a single album, no grip appears.
- **Mouse:** drag a card by its grip; the list reorders live and drops in place on release.
- **Header `x/n`:** after reordering, reopen/observe the header selector — the active album's position number matches its new place in the list.
- **Keyboard:** Tab to a grip, press ArrowUp/ArrowDown — the album moves one slot per press; a screen reader announces "Moved <name> to position N of M".
- **Touch (if available / devtools device mode):** dragging the grip reorders without scrolling the sheet.
- **Persistence:** reorder, reload the page — the order is retained.
- **Sync survival (if you use Cloud/Shared):** reorder, trigger a sync, confirm the order is not reset.
- The active album keeps its green border and "· Current" label after reordering.

- [ ] **Step 5: Commit**

```bash
git add src/components/LibrarySheet.tsx
git commit -m "feat(albums): drag + keyboard reorder in the Your albums list"
```

---

## Self-Review

**Spec coverage:**
- Local-only `albumOrder`, never synced → Task 1 (field + Global Constraints) ✓
- Self-healing `orderAlbums` reconciler → Task 1 Step 5 ✓
- `reorderAlbums` action → Task 1 Step 6 ✓
- AlbumSwitcher `x/n` uses ordered index → Task 2 ✓
- LibrarySheet renders ordered list → Task 4 ✓
- Grip on left mirroring ⚙️, hidden for single album → Task 3 (render) + Task 4 (`sortable`) ✓
- Pointer (touch + mouse) drag with pointer capture + `touch-action: none` → Task 3 CSS + Task 4 handlers ✓
- Keyboard ArrowUp/Down + `aria-live` announcement → Task 4 ✓
- `.dragging` lift style; active border/Current preserved → Task 3 ✓
- Order survives sync round-trip → Task 1 Step 1 test ✓
- No sync-code changes; no new deps; no RTL → Global Constraints, honored throughout ✓
- Backward compatible (missing/empty order) → Task 1 tests + reconciler ✓

**Placeholder scan:** none — every code step contains full content.

**Type consistency:** `orderAlbums(albums, order?)` signature identical in Task 1 (def), Task 2, Task 4. `reorderAlbums(orderedIds: string[])` identical in Task 1 def/impl and Task 4 call. AlbumCard's new props (`sortable`, `isDragging`, `onGripPointerDown/Move/Up`, `onGripKeyDown`) declared in Task 3 and supplied 1:1 in Task 4. Handler event types (`ReactPointerEvent<HTMLButtonElement>`, `ReactKeyboardEvent<HTMLButtonElement>`) in LibrarySheet match `PointerEventHandler<HTMLButtonElement>` / `KeyboardEventHandler<HTMLButtonElement>` prop types in AlbumCard.
