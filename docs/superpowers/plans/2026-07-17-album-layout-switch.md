# Album Layout Switch (Compact/Pages) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a per-album Layout switch (Compact / Pages) to the Settings dialog that controls how the Album tab's **All** filter renders, defaulting to Compact.

**Architecture:** A new per-album `albumLayout` preference lives in the collection store (mirrored top-level like `locked`, stored per `AlbumSnapshot`). `PageSection` gates the printed-album spread on `albumLayout === 'pages'`; when Compact, the All filter falls through to the existing flow-grid path used by Missing/Dupes. A segmented control in the Settings "Appearance" section sets it, disabled when the active album has no templated pages.

**Tech Stack:** React 18, TypeScript, Zustand (with `persist`), Vitest (Node environment).

## Global Constraints

- **Test environment is Node only** (`vitest.config.ts` → `environment: 'node'`). No jsdom — do not write React-rendering tests. Store and pure-function tests only.
- **Default layout is `'compact'`** everywhere a snapshot is constructed and for any legacy/missing value.
- **The switch affects only the All filter.** Missing/Dupes already render the flow grid and must not change.
- **Disabled caption copy (verbatim):** `Pages view isn't available for this album.`
- **Control placement:** inside the existing **Appearance** section of the Settings dialog, below the theme toggle.
- Follow existing patterns: `locked` is the reference implementation for a per-album mirrored field; `.filterbar` is the reference for the segmented pill styling.
- End every commit message with the repo's `Co-Authored-By` trailer used by prior commits.

---

### Task 1: Store — `albumLayout` field, action, and per-album lifecycle

**Files:**
- Create: `src/store/collectionStore.test.ts`
- Modify: `src/store/collectionStore.ts`

**Interfaces:**
- Produces:
  - `type AlbumLayout = 'compact' | 'pages'` (exported from `collectionStore.ts`)
  - `CollectionState.albumLayout: AlbumLayout` (top-level, always concrete)
  - `AlbumSnapshot.albumLayout?: AlbumLayout` (optional — legacy snapshots may lack it)
  - `CollectionState.setAlbumLayout(layout: AlbumLayout): void`
- Consumes: nothing from earlier tasks.

- [ ] **Step 1: Write the failing test**

Create `src/store/collectionStore.test.ts`:

```ts
import { beforeEach, describe, it, expect } from 'vitest';
import { useCollection } from './collectionStore';

const DEFAULT_ALBUM_ID = 'usa-mex-can-26';

/** Force a clean single-album baseline (persist is a no-op in the Node test env). */
function resetToSingleAlbum() {
  useCollection.setState({
    activeAlbumId: DEFAULT_ALBUM_ID,
    albumName: 'My Album',
    counts: {},
    swaps: [],
    edition: 'latam',
    trackCC: false,
    locked: false,
    albumLayout: 'compact',
    activityDays: [],
    completedOn: null,
    unlockedAchievements: {},
    albums: [
      {
        id: DEFAULT_ALBUM_ID,
        albumName: 'My Album',
        counts: {},
        swaps: [],
        edition: 'latam',
        trackCC: false,
        locked: false,
        albumLayout: 'compact',
        activityDays: [],
        completedOn: null,
        unlockedAchievements: {},
      },
    ],
  });
}

beforeEach(resetToSingleAlbum);

describe('setAlbumLayout', () => {
  it('updates the top-level field and mirrors it into the active parked snapshot', () => {
    useCollection.getState().setAlbumLayout('pages');
    const s = useCollection.getState();
    expect(s.albumLayout).toBe('pages');
    expect(s.albums.find((a) => a.id === s.activeAlbumId)?.albumLayout).toBe('pages');
  });
});

describe('per-album layout', () => {
  it('is remembered per album and survives switching away and back', () => {
    useCollection.getState().setAlbumLayout('pages'); // album A -> pages
    useCollection.getState().createAlbum();           // new album B becomes active
    expect(useCollection.getState().albumLayout).toBe('compact'); // B defaults compact
    useCollection.getState().switchAlbum(DEFAULT_ALBUM_ID);       // back to A
    expect(useCollection.getState().albumLayout).toBe('pages');   // A preserved
  });

  it('loads a legacy snapshot without albumLayout as compact', () => {
    const legacy = {
      id: 'legacy',
      albumName: 'Legacy',
      counts: {},
      swaps: [],
      edition: 'latam' as const,
      trackCC: false,
      locked: false,
      activityDays: [],
      completedOn: null,
      unlockedAchievements: {},
    };
    useCollection.setState((s) => ({ albums: [...s.albums, legacy] }));
    useCollection.getState().switchAlbum('legacy');
    expect(useCollection.getState().albumLayout).toBe('compact');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- src/store/collectionStore.test.ts`
Expected: FAIL — `setAlbumLayout` is not a function / `albumLayout` is `undefined`.

- [ ] **Step 3: Write minimal implementation**

In `src/store/collectionStore.ts`:

3a. Add the type next to `Theme` (after line 9):

```ts
export type Theme = 'dark' | 'light';
export type AlbumLayout = 'compact' | 'pages';
```

3b. In the `AlbumSnapshot` interface, add the optional field (place it beside `locked`):

```ts
  /** When true the album is read-only: tapping sticker cells does nothing. */
  locked: boolean;
  /** Album-tab layout for the All filter. Optional so legacy snapshots default to compact. */
  albumLayout?: AlbumLayout;
```

3c. In `CollectionState`, add the top-level field (beside `locked`) and the action (beside `toggleLocked`):

```ts
  /** When true the active album is locked (read-only): sticker cells ignore taps. */
  locked: boolean;
  /** Album-tab layout for the All filter on the active album ('compact' | 'pages'). */
  albumLayout: AlbumLayout;
```

```ts
  /** Flip the active album between locked (read-only) and unlocked (editable). */
  toggleLocked: () => void;
  /** Set the active album's All-filter layout, mirroring into its parked snapshot. */
  setAlbumLayout: (layout: AlbumLayout) => void;
```

3d. In `snapshotActive`, capture it (beside `locked`):

```ts
    locked: s.locked,
    albumLayout: s.albumLayout,
```

3e. In `loadSnapshot`, default legacy snapshots (beside `locked`):

```ts
    locked: a.locked ?? false,
    albumLayout: a.albumLayout ?? 'compact',
```

3f. In the initial store state (the `create(...)` object), add the top-level default (beside `locked: false,` near line 224):

```ts
      locked: false,
      albumLayout: 'compact',
```

3g. In the initial default album snapshot inside `albums: [ { ... } ]` (near line 236), add:

```ts
          locked: false,
          albumLayout: 'compact',
```

3h. In `createAlbum`'s `fresh` snapshot (near line 254) add `albumLayout: 'compact',` beside `locked: false,`.

3i. In `deleteAlbum`'s rebuilt `fresh` snapshot (near line 290) add `albumLayout: 'compact',` beside `locked: false,`.

3j. Add the action implementation right after `toggleLocked` (after line 345):

```ts
      setAlbumLayout: (layout) =>
        set((s) => {
          // Mirror into the parked snapshot so the choice survives album switches.
          const albums = s.albums.map((a) =>
            a.id === s.activeAlbumId ? { ...a, albumLayout: layout } : a,
          );
          return { albumLayout: layout, albums };
        }),
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- src/store/collectionStore.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add src/store/collectionStore.ts src/store/collectionStore.test.ts
git commit -m "$(cat <<'EOF'
Add per-album albumLayout preference to the collection store

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 2: Sync — whitelist `albumLayout`

**Files:**
- Modify: `src/sync/serialize.ts`
- Modify: `src/sync/serialize.test.ts`

**Interfaces:**
- Consumes: `AlbumLayout` from `collectionStore.ts` (Task 1).
- Produces: `SyncPayload.albumLayout: AlbumLayout`; `pickSyncState` copies it.

- [ ] **Step 1: Strengthen the fixture so the round-trip test fails**

In `src/sync/serialize.test.ts`, in `samplePayload()`, add a top-level `albumLayout` beside `theme: 'dark',` (use a non-default value so the round-trip proves it is carried):

```ts
    theme: 'dark',
    albumLayout: 'pages',
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- src/sync/serialize.test.ts`
Expected: FAIL — `pickSyncState round-trips every syncable field deeply` fails because the returned object omits `albumLayout`.

- [ ] **Step 3: Write minimal implementation**

3a. In `src/sync/serialize.ts`, extend the type-only import:

```ts
import type { AlbumSnapshot, Theme, AlbumLayout } from '../store/collectionStore';
```

3b. Add the field to `SyncPayload` (beside `theme: Theme;`):

```ts
  theme: Theme;
  albumLayout: AlbumLayout;
```

3c. Add it to the `pickSyncState` return object (beside `theme: s.theme,`):

```ts
    theme: s.theme,
    albumLayout: s.albumLayout,
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- src/sync/serialize.test.ts`
Expected: PASS (all serialize tests).

- [ ] **Step 5: Commit**

```bash
git add src/sync/serialize.ts src/sync/serialize.test.ts
git commit -m "$(cat <<'EOF'
Sync the per-album albumLayout preference across devices

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 3: `pagesSupportPages` helper (drives the disabled state)

**Files:**
- Modify: `src/data/albumTypes.ts`
- Modify: `src/data/layouts.ts`
- Modify: `src/data/albumTypes.test.ts`

**Interfaces:**
- Consumes: existing `templateFor(page: Page)` and `Page`.
- Produces: `pagesSupportPages(pages: Page[]): boolean`, re-exported from `src/data/layouts.ts`.

- [ ] **Step 1: Write the failing test**

In `src/data/albumTypes.test.ts`, add the import of the real album at the top (beside the existing imports):

```ts
import { album } from './sampleAlbum';
```

and append this describe block at the end of the file:

```ts
describe('pagesSupportPages', () => {
  it('is true for the active album (it has templated pages)', () => {
    expect(pagesSupportPages(album.pages)).toBe(true);
  });

  it('is false when no page maps to a template', () => {
    const orphan = {
      id: 'no-such-section',
      code: 'N',
      emoji: '❓',
      title: 'Nope',
      type: 'team' as const,
      stickerIds: ['1'],
    };
    expect(pagesSupportPages([orphan])).toBe(false);
  });
});
```

Also add `pagesSupportPages` to the existing top import from `./albumTypes`:

```ts
import { buildAlbumFromType, editionInfoFor, type AlbumType, activeType, templateFor, pagesSupportPages } from './albumTypes';
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- src/data/albumTypes.test.ts`
Expected: FAIL — `pagesSupportPages is not a function` / not exported.

- [ ] **Step 3: Write minimal implementation**

3a. In `src/data/albumTypes.ts`, add right after `templateFor` (after line 108):

```ts
/** True when at least one of these pages maps to a matching printed-album template. */
export function pagesSupportPages(pages: Page[]): boolean {
  return pages.some((p) => templateFor(p) != null);
}
```

3b. In `src/data/layouts.ts`, extend the re-export:

```ts
export { templateFor, pagesSupportPages } from './albumTypes';
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- src/data/albumTypes.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/data/albumTypes.ts src/data/layouts.ts src/data/albumTypes.test.ts
git commit -m "$(cat <<'EOF'
Add pagesSupportPages helper to detect Pages-layout availability

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 4: Gate the Pages layout on `albumLayout` in `PageSection`

**Files:**
- Modify: `src/components/PageSection.tsx`

**Interfaces:**
- Consumes: `CollectionState.albumLayout` (Task 1).
- Produces: no new exports; changes rendering behavior of the All filter.

No unit test (React rendering requires jsdom, which this repo's Node test env lacks). Behavior is verified in Task 6.

- [ ] **Step 1: Read the current selectors and `useSpread` line**

Confirm `src/components/PageSection.tsx:39-42` reads `counts`/`addOne`/`removeOne`/`locked` from the store, and line 59 is:

```ts
const useSpread = Boolean(template) && filter === 'all';
```

- [ ] **Step 2: Add the store selector**

After the existing `const locked = useCollection((s) => s.locked);` (line 42), add:

```ts
  const albumLayout = useCollection((s) => s.albumLayout);
```

- [ ] **Step 3: Gate the spread on the layout preference**

Replace line 59:

```ts
  // The printed-album layout only applies under the "all" filter AND when the
  // album's layout preference is "pages"; otherwise fall to the flow grid.
  const useSpread = Boolean(template) && filter === 'all' && albumLayout === 'pages';
```

- [ ] **Step 4: Typecheck**

Run: `npx tsc -b`
Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add src/components/PageSection.tsx
git commit -m "$(cat <<'EOF'
Render the All filter as a flow grid when albumLayout is compact

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 5: Layout segmented control in the Settings "Appearance" section

**Files:**
- Modify: `src/components/EditionDialog.tsx`
- Modify: `src/styles.css`

**Interfaces:**
- Consumes: `albumLayout` + `setAlbumLayout` (Task 1), `pagesSupportPages` (Task 3), `album` singleton.
- Produces: no new exports.

No unit test (React rendering needs jsdom). Verified in Task 6.

- [ ] **Step 1: Add imports**

In `src/components/EditionDialog.tsx`:

- Change `import { useEffect, useState } from 'react';` to:

```ts
import { useEffect, useMemo, useState } from 'react';
```

- Change `import { CC_EMOJI, EDITION_INFO } from '../data/sampleAlbum';` to:

```ts
import { album, CC_EMOJI, EDITION_INFO } from '../data/sampleAlbum';
```

- Add after the `SyncSection` import:

```ts
import { pagesSupportPages } from '../data/layouts';
```

- [ ] **Step 2: Add store selectors + support memo**

After `const toggleTheme = useCollection((s) => s.toggleTheme);` (line 24), add:

```ts
  const albumLayout = useCollection((s) => s.albumLayout);
  const setAlbumLayout = useCollection((s) => s.setAlbumLayout);
```

After the `const [exported, setExported] = useState(false);` line (near line 37), add:

```ts
  // Pages layout only differs from Compact when some page has a matching template.
  // Recompute when the edition / CC tracking changes the album's sticker counts.
  const supportsPages = useMemo(() => pagesSupportPages(album.pages), [edition, trackCC]);
```

- [ ] **Step 3: Add the control to the Appearance section**

In the Appearance `<section>` (the block that starts `{/* ---------- Appearance ---------- */}`), insert this immediately AFTER the closing `</button>` of the theme toggle and BEFORE the section's closing `</section>`:

```tsx
          <div className="settings-field" style={{ marginTop: 12 }}>
            <label className="settings-field-label" id="layout-label">
              Layout
            </label>
            <div className="settings-segment" role="group" aria-labelledby="layout-label">
              {(['compact', 'pages'] as const).map((opt) => (
                <button
                  key={opt}
                  type="button"
                  className={albumLayout === opt ? 'active' : ''}
                  aria-pressed={albumLayout === opt}
                  disabled={!supportsPages}
                  onClick={() => setAlbumLayout(opt)}
                >
                  {opt === 'compact' ? 'Compact' : 'Pages'}
                </button>
              ))}
            </div>
            {!supportsPages && (
              <p className="modal-sub" style={{ margin: '8px 0 0' }}>
                Pages view isn't available for this album.
              </p>
            )}
          </div>
```

- [ ] **Step 4: Add the segmented-control CSS**

In `src/styles.css`, after the `.settings-field-label { ... }` rule (ends near line 1204), add:

```css
/* Two-option segmented control (Layout: Compact | Pages), mirrors .filterbar. */
.settings-segment {
  display: flex;
  gap: 6px;
  background: var(--bg-elev);
  border: 1px solid var(--border);
  border-radius: 999px;
  padding: 4px;
}
.settings-segment button {
  flex: 1;
  border: none;
  background: none;
  color: var(--text-dim);
  padding: 8px 6px;
  border-radius: 999px;
  font-weight: 700;
  font-size: 13px;
  cursor: pointer;
}
.settings-segment button.active {
  background: var(--green);
  color: #fff;
}
.settings-segment button:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}
```

- [ ] **Step 5: Typecheck**

Run: `npx tsc -b`
Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add src/components/EditionDialog.tsx src/styles.css
git commit -m "$(cat <<'EOF'
Add Layout (Compact/Pages) switch to Settings, disabled when unsupported

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 6: Full verification (test suite, build, manual app check)

**Files:** none (verification only).

- [ ] **Step 1: Run the full test suite**

Run: `npm test`
Expected: PASS — all suites, including the new `collectionStore`, `serialize`, and `albumTypes` tests.

- [ ] **Step 2: Production build / typecheck**

Run: `npm run build`
Expected: `tsc -b` passes and Vite build completes with no errors.

- [ ] **Step 3: Manual verification in the app**

Run: `npm run dev`, open the app, and confirm:

1. Open Settings (⚙️) → **Appearance** → a **Layout** control shows `[ Compact | Pages ]` with **Compact** active by default on a fresh album.
2. On the Album tab, the **All** filter shows the flow grid (compact) — matching Missing/Dupes.
3. Set Layout → **Pages**; the **All** filter now shows the printed-album spreads. Missing/Dupes are unchanged in both modes.
4. The choice persists across a reload (localStorage) and is remembered per album (create/switch a second album — each keeps its own).
5. If a state exists where the album has no templated pages, the control is dimmed/disabled and the caption reads "Pages view isn't available for this album." (For the shipped FWC album this path may not be reachable; it is covered by the Task 3 unit test.)

- [ ] **Step 4: If any manual check fails**

Return to the relevant task, fix, re-run `npm test` + `npm run build`, and re-verify. No commit if nothing changed.

---

## Notes for the implementer

- `locked` is the exact reference pattern for a per-album mirrored field — grep it in `collectionStore.ts` if any placement above is unclear.
- Line numbers are from the current `main`-branch state and may drift as you edit; anchor on the neighboring code shown, not the numbers.
- Do not touch `FilterBar.tsx`, `AlbumView.tsx`, Missing/Dupes logic, or add new album-type metadata — out of scope.
