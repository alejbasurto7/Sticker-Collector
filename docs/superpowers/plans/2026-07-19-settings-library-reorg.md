# Settings & Library Reorg Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the ⚙️ Settings junk-drawer with a header album-switcher that opens a Library sheet (switch/manage/new albums), an album detail screen for per-album config, and a slim app-only Settings dialog.

**Architecture:** Mostly a component reshuffle of [EditionDialog.tsx](../../../src/components/EditionDialog.tsx) into three focused surfaces, plus one new pure helper (`computeStatsFor`) so the Library sheet can show correct progress for parked albums. No data-model or sync changes. The app's existing `.modal` is already bottom-anchored, so the sheet and detail reuse it. The three active-album tabs (Album/Swaps/Stats) and `TabBar` are untouched.

**Tech Stack:** React 18, Zustand 4, TypeScript 5 (strict), Vite 5, Vitest 4.

## Global Constraints

- **No new persisted state.** Do not add fields to `AlbumSnapshot`/`CollectionState` or to the sync payload ([serialize.ts](../../../src/sync/serialize.ts)). `theme` is already global; every per-album field already exists.
- **No Library tab.** [TabBar.tsx](../../../src/components/TabBar.tsx) stays `album | swaps | stats`. Do not add a `library` tab.
- **Sheets reuse the existing modal.** Use `.modal-backdrop` + `.modal` (already `align-items: flex-end`, bottom-anchored) for the Library sheet, album detail, and Settings. Do not build a new sheet primitive.
- **Opening an album's detail switches to it first** (`switchAlbum(id)`), so per-album controls edit the mirrored active-album state and never write a parked snapshot.
- **Cover art is a derived monogram** (name's first character in a tinted tile). No new stored cover data; using the album-type emoji is out of scope.
- **Groups and the Trade tab are placeholders only** — reserve surfaces, write no group/trade logic. Multi-type UI and a per-album `typeId` are out of scope.
- **Testing pattern:** the repo unit-tests **pure logic only** with Vitest (`npm test`). There is **no component-test harness — do not add React Testing Library.** Pure tasks are TDD'd; UI tasks are gated by `npm run build` (which runs `tsc -b`) plus the manual checklist in the task.
- **Follow existing conventions:** className strings + CSS custom properties (`var(--bg-elev)`, `var(--border)`, `var(--green)`, `var(--green-bright)`, `var(--text)`, `var(--text-dim)`), `useCollection`/`useSyncMeta` selectors, `type`-only imports where the module is node-safe.

---

## File Structure

**New files**
- `src/utils/albumCover.ts` — pure `monogram(name)` + `coverTint(id)` for the switcher and cards.
- `src/utils/computeStatsFor.test.ts` — tests for the new per-album stats helper.
- `src/utils/albumCover.test.ts` — tests for the cover helpers.
- `src/components/AlbumSwitcher.tsx` — header control (monogram · name · "N of M albums" · chevron) that opens the sheet.
- `src/components/AlbumCard.tsx` — one album row inside the sheet.
- `src/components/LibrarySheet.tsx` — the album list + New/Groups/App-settings actions.
- `src/components/AlbumDetailView.tsx` — per-album settings hub (rename · CC/edition · layout · sharing · import/export · delete).
- `src/components/SettingsDialog.tsx` — slim app-only settings (theme · cloud · version).

**Modified files**
- `src/data/sampleAlbum.ts` — add `buildAlbumFor(edition, trackCC)`; use it in `applyEdition`.
- `src/utils/stats.ts` — extract `statsForAlbum(album, counts, history?)`; add `computeStatsFor`.
- `src/App.tsx` — swap `<h1>` for `<AlbumSwitcher>`; own sheet/detail/settings state; drop the header ⚙️ (final task).
- `src/styles.css` — switcher + album-card styles.

**Deleted files**
- `src/components/EditionDialog.tsx` — replaced by AlbumDetailView (album parts) + SettingsDialog (app parts).

---

## Task 1: Per-album stats helper (`computeStatsFor`)

**Files:**
- Modify: `src/data/sampleAlbum.ts` (add `buildAlbumFor`, line ~44 `applyEdition`)
- Modify: `src/utils/stats.ts` (extract `statsForAlbum`, add `computeStatsFor`, line ~106 `computeStats`)
- Test: `src/utils/computeStatsFor.test.ts`

**Interfaces:**
- Consumes: `buildAlbumFromType`, `activeType` (already in sampleAlbum); `album`, `Album`, `Counts`, `Edition` types.
- Produces:
  - `buildAlbumFor(edition: Edition, trackCC: boolean): Album` (from `src/data/sampleAlbum.ts`)
  - `computeStatsFor(counts: Counts, edition: Edition, trackCC: boolean, history?: CollectionHistory): Stats` (from `src/utils/stats.ts`)
  - `computeStats` keeps its existing signature `(counts, history?) => Stats`.

- [ ] **Step 1: Write the failing test**

Create `src/utils/computeStatsFor.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { computeStats, computeStatsFor } from './stats';
import { buildAlbumFor, DEFAULT_EDITION, DEFAULT_TRACK_CC } from '../data/sampleAlbum';

describe('computeStatsFor', () => {
  it('uses the requested layout, not the active singleton', () => {
    const withCC = computeStatsFor({}, DEFAULT_EDITION, true);
    const withoutCC = computeStatsFor({}, DEFAULT_EDITION, false);
    // Tracking Coca-Cola turns on its optional section, so total slots grow.
    expect(withCC.totalStickers).toBeGreaterThan(withoutCC.totalStickers);
  });

  it('counts owned uniques and duplicates against that layout', () => {
    const layout = buildAlbumFor(DEFAULT_EDITION, false);
    const firstId = layout.stickers[0].id;
    const stats = computeStatsFor({ [firstId]: 2 }, DEFAULT_EDITION, false);
    expect(stats.ownedUnique).toBe(1);
    expect(stats.dupesTotal).toBe(1);
  });

  it('matches computeStats for the default (active) layout', () => {
    expect(computeStatsFor({}, DEFAULT_EDITION, DEFAULT_TRACK_CC).totalStickers).toBe(
      computeStats({}).totalStickers,
    );
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/utils/computeStatsFor.test.ts`
Expected: FAIL — `computeStatsFor` / `buildAlbumFor` are not exported.

- [ ] **Step 3: Add `buildAlbumFor` to `sampleAlbum.ts`**

In `src/data/sampleAlbum.ts`, add this exported function directly below `applyEdition` (after line ~48), and rewrite `applyEdition`'s first line to reuse it:

```ts
/**
 * Rebuild the album for the given edition (variant) and Coca-Cola tracking.
 * Existing count data is unaffected.
 */
export function applyEdition(edition: Edition, trackCC: boolean): void {
  album = buildAlbumFor(edition, trackCC);
  stickerById = indexStickers(album);
  pageById = indexPages(album);
}

/** Build an album layout for an arbitrary edition + CC tracking, without mutating
 *  the live `album` singleton. Used by per-album stats for parked albums. */
export function buildAlbumFor(edition: Edition, trackCC: boolean): Album {
  return buildAlbumFromType(activeType, {
    variant: edition,
    enabledOptional: enabledOptional(trackCC),
  });
}
```

- [ ] **Step 4: Extract `statsForAlbum` and add `computeStatsFor` in `stats.ts`**

In `src/utils/stats.ts`, update the imports at the top:

```ts
import { album, buildAlbumFor } from '../data/sampleAlbum';
import type { Album, Counts, Edition } from '../types';
```

Then replace the whole `export function computeStats(counts, history?)` (line ~106–185) with a thin wrapper plus a shared core and the new helper. Rename the existing function body to `statsForAlbum` and change every reference from `album` to the `a` parameter:

```ts
export function computeStats(counts: Counts, history?: CollectionHistory): Stats {
  return statsForAlbum(album, counts, history);
}

/** Stats for a specific album layout — pure, no dependence on the live singleton. */
export function computeStatsFor(
  counts: Counts,
  edition: Edition,
  trackCC: boolean,
  history?: CollectionHistory,
): Stats {
  return statsForAlbum(buildAlbumFor(edition, trackCC), counts, history);
}

function statsForAlbum(a: Album, counts: Counts, history?: CollectionHistory): Stats {
  const total = a.stickers.length;
  let ownedUnique = 0;
  let dupesTotal = 0;
  let totalCollected = 0;

  for (const s of a.stickers) {
    const c = counts[s.id] ?? 0;
    if (c >= 1) ownedUnique++;
    if (c > 1) dupesTotal += c - 1;
    totalCollected += c;
  }

  const pages: PageProgress[] = a.pages.map((p) => {
    const owned = p.stickerIds.reduce((acc, id) => acc + ((counts[id] ?? 0) >= 1 ? 1 : 0), 0);
    const totalP = p.stickerIds.length;
    return {
      pageId: p.id,
      code: p.code,
      emoji: p.emoji,
      title: p.title,
      total: totalP,
      owned,
      pct: totalP ? owned / totalP : 0,
      complete: owned === totalP,
    };
  });

  const pageTypeById = Object.fromEntries(a.pages.map((p) => [p.id, p.type]));
  const typeOrder: { type: StickerType; label: string; emoji: string }[] = [
    { type: 'hologram', label: 'Holograms', emoji: '✨' },
    { type: 'regular', label: 'Regular', emoji: '🟦' },
    { type: 'team', label: 'Team', emoji: '👕' },
  ];
  const typeAcc: Record<StickerType, { owned: number; total: number }> = {
    hologram: { owned: 0, total: 0 },
    regular: { owned: 0, total: 0 },
    team: { owned: 0, total: 0 },
  };
  for (const s of a.stickers) {
    const t = stickerType(s, pageTypeById[s.pageId] ?? '');
    typeAcc[t].total++;
    if ((counts[s.id] ?? 0) >= 1) typeAcc[t].owned++;
  }
  const byType: TypeProgress[] = typeOrder.map(({ type, label, emoji }) => {
    const { owned, total } = typeAcc[type];
    return { type, label, emoji, total, owned, pct: total ? owned / total : 0 };
  });

  let mostDuplicated: Stats['mostDuplicated'] = null;
  for (const s of a.stickers) {
    const extra = (counts[s.id] ?? 0) - 1;
    if (extra > 0 && (!mostDuplicated || extra > mostDuplicated.extra)) {
      const page = a.pages.find((p) => p.id === s.pageId)!;
      mostDuplicated = { id: s.id, number: s.number, code: page.code, emoji: page.emoji, extra };
    }
  }

  const activityDays = history?.activityDays ?? [];
  const endKey = history?.completedOn ?? dateKey(Date.now());

  return {
    totalStickers: total,
    ownedUnique,
    missing: total - ownedUnique,
    dupesTotal,
    totalCollected,
    completionPct: total ? ownedUnique / total : 0,
    pagesCompleted: pages.filter((p) => p.complete).length,
    pagesTotal: pages.length,
    pages,
    byType,
    mostDuplicated,
    currentStreak: longestStreak(activityDays),
    daysCollecting: daysCollecting(activityDays[0] ?? null, endKey),
  };
}
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `npx vitest run src/utils/computeStatsFor.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 6: Run the full suite + typecheck to confirm no regressions**

Run: `npm test`
Expected: all existing tests still PASS (the `computeStats` refactor is behavior-preserving).
Run: `npm run build`
Expected: compiles, no type errors.

- [ ] **Step 7: Commit**

```bash
git add src/data/sampleAlbum.ts src/utils/stats.ts src/utils/computeStatsFor.test.ts
git commit -m "feat(stats): add computeStatsFor for per-album progress"
```

---

## Task 2: Album cover helpers (monogram + tint)

**Files:**
- Create: `src/utils/albumCover.ts`
- Test: `src/utils/albumCover.test.ts`

**Interfaces:**
- Produces:
  - `monogram(name: string): string` — first character, uppercased (`'?'` for empty).
  - `coverTint(id: string, count?: number): number` — deterministic index in `[0, count)`, default `count = 6`.

- [ ] **Step 1: Write the failing test**

Create `src/utils/albumCover.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { monogram, coverTint } from './albumCover';

describe('monogram', () => {
  it('uppercases the first character', () => {
    expect(monogram('leo')).toBe('L');
  });
  it('skips leading whitespace and falls back for empty names', () => {
    expect(monogram('  kai')).toBe('K');
    expect(monogram('')).toBe('?');
  });
});

describe('coverTint', () => {
  it('is deterministic and within range', () => {
    expect(coverTint('abc')).toBe(coverTint('abc'));
    expect(coverTint('abc')).toBeGreaterThanOrEqual(0);
    expect(coverTint('abc')).toBeLessThan(6);
  });
  it('spreads across more than one bucket', () => {
    const tints = new Set(['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'].map((x) => coverTint(x)));
    expect(tints.size).toBeGreaterThan(1);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/utils/albumCover.test.ts`
Expected: FAIL — module `./albumCover` not found.

- [ ] **Step 3: Write the implementation**

Create `src/utils/albumCover.ts`:

```ts
/** First visible character of a name, uppercased, for the album monogram tile. */
export function monogram(name: string): string {
  const first = [...name.trim()][0]; // first code point → one glyph for letters or emoji
  return first ? first.toUpperCase() : '?';
}

/** Deterministic tint bucket from an album id, so a card/switcher colour is stable. */
export function coverTint(id: string, count = 6): number {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) >>> 0;
  return h % count;
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run src/utils/albumCover.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add src/utils/albumCover.ts src/utils/albumCover.test.ts
git commit -m "feat(library): add album monogram + tint helpers"
```

---

## Task 3: Header switcher + Library sheet

Introduces the switcher, the sheet, and the album card, wired into `App`. Album managing and App settings temporarily open the existing `EditionDialog` (which still holds everything), so the app stays fully working. The header ⚙️ button stays for now.

**Files:**
- Create: `src/components/AlbumSwitcher.tsx`
- Create: `src/components/AlbumCard.tsx`
- Create: `src/components/LibrarySheet.tsx`
- Modify: `src/App.tsx`
- Modify: `src/styles.css`

**Interfaces:**
- Consumes: `monogram`, `coverTint` (Task 2); `computeStatsFor`, `displayPct` (Task 1 / stats); `useResolvedAlbumName`, `useAlbumMode` (sync/useAlbumMode); `AlbumSnapshot` (store); store actions `switchAlbum`, `createAlbum`.
- Produces:
  - `AlbumSwitcher` — props `{ onOpen: () => void }`.
  - `AlbumCard` — props `{ album: AlbumSnapshot; isActive: boolean; onOpen: () => void; onManage: () => void }`.
  - `LibrarySheet` — props `{ onClose: () => void; onManageAlbum: (id: string) => void; onOpenSettings: () => void }`.

- [ ] **Step 1: Create `AlbumSwitcher.tsx`**

```tsx
import { useCollection } from '../store/collectionStore';
import { useResolvedAlbumName } from '../sync/useAlbumMode';
import { monogram, coverTint } from '../utils/albumCover';

interface Props {
  onOpen: () => void;
}

/** Header control: the active album (monogram · name · "N of M albums" · chevron).
 *  Tapping opens the Library sheet. Collapses to just the name when there is one album. */
export default function AlbumSwitcher({ onOpen }: Props) {
  const activeAlbumId = useCollection((s) => s.activeAlbumId);
  const albumName = useCollection((s) => s.albumName);
  const albums = useCollection((s) => s.albums);
  const name = useResolvedAlbumName(activeAlbumId, albumName);

  const total = albums.length;
  const index = albums.findIndex((a) => a.id === activeAlbumId);
  const multi = total > 1;

  return (
    <button
      type="button"
      className="album-switcher"
      onClick={onOpen}
      aria-haspopup="dialog"
      aria-label={multi ? `${name}, album ${index + 1} of ${total}. Switch album` : `${name}. Manage albums`}
    >
      <span className={`album-cover tint-${coverTint(activeAlbumId)}`} aria-hidden="true">
        {monogram(name)}
      </span>
      <span className="album-switcher-text">
        <span className="album-switcher-name">{name}</span>
        {multi && <span className="album-switcher-count">{index + 1} of {total} albums</span>}
      </span>
      {multi && <span className="album-switcher-caret" aria-hidden="true">▾</span>}
    </button>
  );
}
```

- [ ] **Step 2: Create `AlbumCard.tsx`**

```tsx
import type { AlbumSnapshot } from '../store/collectionStore';
import { useAlbumMode, useResolvedAlbumName } from '../sync/useAlbumMode';
import { computeStatsFor, displayPct } from '../utils/stats';
import { monogram, coverTint } from '../utils/albumCover';

const MODE_BADGE = {
  local: { icon: '📱', label: 'Local' },
  cloud: { icon: '☁️', label: 'Cloud' },
  shared: { icon: '👥', label: 'Shared' },
} as const;

interface Props {
  album: AlbumSnapshot;
  isActive: boolean;
  onOpen: () => void;   // switch to this album + close the sheet
  onManage: () => void; // switch + open this album's detail
}

export default function AlbumCard({ album, isActive, onOpen, onManage }: Props) {
  const name = useResolvedAlbumName(album.id, album.albumName);
  const mode = useAlbumMode(album.id);
  const stats = computeStatsFor(album.counts, album.edition, album.trackCC);
  const badge = MODE_BADGE[mode];
  const pct = displayPct(stats.completionPct);

  return (
    <div className={`album-card${isActive ? ' active' : ''}`}>
      <button type="button" className="album-card-main" onClick={onOpen}>
        <span className={`album-cover tint-${coverTint(album.id)}`} aria-hidden="true">
          {monogram(name)}
        </span>
        <span className="album-card-body">
          <span className="album-card-top">
            <span className="album-card-name">{name}</span>
            <span className="album-card-badge">{badge.icon} {badge.label}</span>
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

- [ ] **Step 3: Create `LibrarySheet.tsx`**

```tsx
import { useCollection } from '../store/collectionStore';
import AlbumCard from './AlbumCard';

interface Props {
  onClose: () => void;
  onManageAlbum: (id: string) => void; // App switches + opens the album detail
  onOpenSettings: () => void;
}

export default function LibrarySheet({ onClose, onManageAlbum, onOpenSettings }: Props) {
  const albums = useCollection((s) => s.albums);
  const activeAlbumId = useCollection((s) => s.activeAlbumId);
  const switchAlbum = useCollection((s) => s.switchAlbum);
  const createAlbum = useCollection((s) => s.createAlbum);

  function open(id: string) {
    switchAlbum(id);
    onClose();
  }
  function newAlbum() {
    createAlbum(); // creates AND makes the new album active
    onClose();
  }

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <h2>Your albums</h2>
        <div className="album-list">
          {albums.map((a) => (
            <AlbumCard
              key={a.id}
              album={a}
              isActive={a.id === activeAlbumId}
              onOpen={() => open(a.id)}
              onManage={() => onManageAlbum(a.id)}
            />
          ))}
        </div>
        <div className="btn-row" style={{ marginTop: 12 }}>
          <button type="button" className="btn primary full" onClick={newAlbum}>➕ New album</button>
          <button type="button" className="btn full" disabled title="Coming soon">👥 Groups</button>
        </div>
        <button type="button" className="btn full" style={{ marginTop: 8 }} onClick={onOpenSettings}>
          ⚙️ App settings
        </button>
        <div className="btn-row" style={{ marginTop: 8 }}>
          <button className="btn full" onClick={onClose}>Close</button>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Wire into `App.tsx`**

In `src/App.tsx`, add the imports:

```tsx
import AlbumSwitcher from './components/AlbumSwitcher';
import LibrarySheet from './components/LibrarySheet';
```

Add state and the `switchAlbum` action near the other `useState`/selectors (around line 20–33):

```tsx
  const [libraryOpen, setLibraryOpen] = useState(false);
  const switchAlbum = useCollection((s) => s.switchAlbum);
```

Replace the header title (line ~66) `<h1>{displayName}</h1>` with:

```tsx
          <AlbumSwitcher onOpen={() => setLibraryOpen(true)} />
```

At the bottom, next to the other dialogs (line ~136–138), add the sheet. Manage and App-settings both route through the still-present `EditionDialog`; Manage switches to the album first so `EditionDialog` shows the right one:

```tsx
      {libraryOpen && (
        <LibrarySheet
          onClose={() => setLibraryOpen(false)}
          onManageAlbum={(id) => {
            switchAlbum(id);
            setLibraryOpen(false);
            setEditionOpen(true);
          }}
          onOpenSettings={() => {
            setLibraryOpen(false);
            setEditionOpen(true);
          }}
        />
      )}
```

Leave the existing header ⚙️ button and `editionOpen`/`EditionDialog` exactly as they are.

- [ ] **Step 5: Add styles to `styles.css`**

Append to `src/styles.css`:

```css
/* ---------- Album switcher (header) ---------- */
.album-switcher {
  display: flex;
  align-items: center;
  gap: 10px;
  min-width: 0;
  margin: -4px;
  padding: 4px 6px 4px 4px;
  border: none;
  border-radius: 12px;
  background: none;
  color: var(--text);
  text-align: left;
  cursor: pointer;
}
.album-switcher:hover {
  background: rgba(255, 255, 255, 0.05);
}
.album-cover {
  flex: none;
  width: 34px;
  height: 34px;
  border-radius: 9px;
  display: grid;
  place-items: center;
  font-size: 15px;
  font-weight: 800;
  color: #06210f;
  background: var(--green-bright);
}
.tint-0 { background: #18b563; }
.tint-1 { background: #3b82f6; }
.tint-2 { background: #f59e0b; }
.tint-3 { background: #ef4444; }
.tint-4 { background: #a855f7; }
.tint-5 { background: #14b8a6; }
.album-switcher-text {
  display: flex;
  flex-direction: column;
  min-width: 0;
}
.album-switcher-name {
  font-size: 17px;
  font-weight: 800;
  letter-spacing: 0.2px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.album-switcher-count {
  font-size: 11px;
  font-weight: 600;
  color: var(--green-bright);
}
.album-switcher-caret {
  flex: none;
  font-size: 12px;
  color: var(--green-bright);
}

/* ---------- Library sheet album cards ---------- */
.album-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
  margin-top: 8px;
}
.album-card {
  display: flex;
  align-items: stretch;
  background: var(--bg-elev-2);
  border: 1px solid var(--border);
  border-radius: 12px;
  overflow: hidden;
}
.album-card.active {
  border-color: var(--green);
}
.album-card-main {
  flex: 1;
  min-width: 0;
  display: flex;
  align-items: center;
  gap: 11px;
  padding: 10px 12px;
  border: none;
  background: none;
  color: var(--text);
  text-align: left;
  cursor: pointer;
}
.album-card-body {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 6px;
}
.album-card-top {
  display: flex;
  align-items: center;
  gap: 8px;
}
.album-card-name {
  font-size: 14px;
  font-weight: 700;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.album-card-badge {
  margin-left: auto;
  flex: none;
  font-size: 11px;
  color: var(--text-dim);
  border: 1px solid var(--border);
  border-radius: 999px;
  padding: 1px 8px;
}
.album-card-bar {
  height: 6px;
  border-radius: 999px;
  background: var(--bg-elev);
  overflow: hidden;
}
.album-card-bar > span {
  display: block;
  height: 100%;
  background: linear-gradient(90deg, var(--green), var(--green-bright));
}
.album-card-meta {
  font-size: 11px;
  color: var(--text-dim);
}
.album-card-current {
  font-weight: 600;
  color: var(--green-bright);
}
.album-card-manage {
  flex: none;
  padding: 0 14px;
  border: none;
  border-left: 1px solid var(--border);
  background: none;
  color: var(--text-dim);
  font-size: 15px;
  cursor: pointer;
}
.album-card-manage:hover {
  background: var(--bg-elev);
  color: var(--text);
}
```

- [ ] **Step 6: Typecheck + build**

Run: `npm run build`
Expected: compiles, no type errors.

- [ ] **Step 7: Manual verification**

Run: `npm run dev` and open the served URL. Confirm:
- The header now shows the album monogram + name; with one album there is no count/chevron.
- Tapping the header opens the Library sheet listing the album(s) with progress bars and a mode badge; the active one shows "· Current".
- `➕ New album` creates one, closes the sheet, and the header updates to the new album; reopening the sheet now shows the count "2 of 2 albums" style header and both cards.
- Tapping a non-active card switches the active album (header updates) and closes the sheet.
- The card ⚙️ and `⚙️ App settings` both open the existing Settings dialog (Manage opens it on the tapped album).

- [ ] **Step 8: Commit**

```bash
git add src/components/AlbumSwitcher.tsx src/components/AlbumCard.tsx src/components/LibrarySheet.tsx src/App.tsx src/styles.css
git commit -m "feat(library): header album switcher + Library sheet"
```

---

## Task 4: Album detail view

Extracts per-album config into its own screen and points the sheet's Manage action at it. `EditionDialog` is left intact (still opened by the header ⚙️ and App-settings) and is slimmed in Task 5.

**Files:**
- Create: `src/components/AlbumDetailView.tsx`
- Modify: `src/App.tsx`

**Interfaces:**
- Consumes: store selectors/actions (`edition`/`setEdition`, `trackCC`/`setTrackCC`, `albumLayout`/`setAlbumLayout`, `albumName`/`setAlbumName`, `activeAlbumId`, `counts`); `useSyncMeta` `localAlbumNames`; `resolveAlbumName`; `useForcedReadOnly`; `album`, `CC_EMOJI`, `EDITION_INFO`; `ALBUM_TYPE`; `buildListExport`; `copyToClipboard`; `deleteAlbumEverywhere`; `AlbumSharing`; `ImportDialog`; `pagesSupportPages`.
- Produces: `AlbumDetailView` — props `{ onClose: () => void }`. Operates on the **active** album (App switches to it before opening).

- [ ] **Step 1: Create `AlbumDetailView.tsx`**

```tsx
import { useEffect, useMemo, useState } from 'react';
import { useCollection } from '../store/collectionStore';
import { useSyncMeta } from '../store/syncStore';
import { resolveAlbumName } from '../sync/albumMode';
import { useForcedReadOnly } from '../sync/useAlbumMode';
import { album, CC_EMOJI, EDITION_INFO } from '../data/sampleAlbum';
import { ALBUM_TYPE } from '../config';
import type { Edition } from '../types';
import { buildListExport } from '../utils/listExport';
import { copyToClipboard } from '../utils/share';
import { deleteAlbumEverywhere } from '../sync/engine';
import AlbumSharing from './AlbumSharing';
import ImportDialog from './ImportDialog';
import { pagesSupportPages } from '../data/layouts';

interface Props {
  onClose: () => void;
}

const ORDER: Edition[] = ['latam', 'na'];

/** Per-album settings hub. App switches to this album before opening, so every
 *  control edits the mirrored active-album state — never a parked snapshot. */
export default function AlbumDetailView({ onClose }: Props) {
  const edition = useCollection((s) => s.edition);
  const setEdition = useCollection((s) => s.setEdition);
  const trackCC = useCollection((s) => s.trackCC);
  const setTrackCC = useCollection((s) => s.setTrackCC);
  const albumLayout = useCollection((s) => s.albumLayout);
  const setAlbumLayout = useCollection((s) => s.setAlbumLayout);
  const albumName = useCollection((s) => s.albumName);
  const setAlbumName = useCollection((s) => s.setAlbumName);
  const activeAlbumId = useCollection((s) => s.activeAlbumId);
  const counts = useCollection((s) => s.counts);
  const localAlbumNames = useSyncMeta((s) => s.localAlbumNames);
  const forcedReadOnly = useForcedReadOnly();

  const [draft, setDraft] = useState(albumName);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [exported, setExported] = useState(false);

  const supportsPages = useMemo(() => pagesSupportPages(album.pages), [edition, trackCC]);

  useEffect(() => {
    setDraft(albumName);
  }, [albumName]);

  function handleNameBlur() {
    setAlbumName(draft);
  }
  function handleNameKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Enter') {
      setAlbumName(draft);
      e.currentTarget.blur();
    }
  }
  async function handleConfirmDelete() {
    await deleteAlbumEverywhere(activeAlbumId);
    setConfirmingDelete(false);
    onClose();
  }
  async function handleExport() {
    const text = buildListExport(counts, albumName, 'both', true);
    if (await copyToClipboard(text)) {
      setExported(true);
      window.setTimeout(() => setExported(false), 1800);
    }
  }

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <h2>{resolveAlbumName(activeAlbumId, albumName, localAlbumNames)}</h2>
        <p className="modal-sub">{ALBUM_TYPE}</p>

        {/* ---------- Name / transfer / sharing ---------- */}
        <section className="settings-section">
          <div className="settings-field">
            <label htmlFor="album-name-input" className="settings-field-label">Album name</label>
            <input
              id="album-name-input"
              type="text"
              className="settings-input"
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onBlur={handleNameBlur}
              onKeyDown={handleNameKeyDown}
              disabled={forcedReadOnly}
            />
          </div>
          <div className="settings-actions">
            <button type="button" className="btn full" onClick={() => setImportOpen(true)} disabled={forcedReadOnly}>
              ⬇ Import…
            </button>
            <button type="button" className="btn full" onClick={handleExport} aria-live="polite">
              {exported ? '✓ Copied' : '⬆ Export'}
            </button>
          </div>
          <AlbumSharing key={activeAlbumId} />
        </section>

        {/* ---------- Layout ---------- */}
        <section className="settings-section">
          <h3 className="settings-heading">Layout</h3>
          <div className="settings-card">
            <div className="setting-row">
              <span className="setting-row-text">
                <span className="setting-row-title" id="layout-label">Layout</span>
                <span className="setting-row-sub">
                  {supportsPages ? 'The All view' : "Pages view isn't available for this album."}
                </span>
              </span>
              <span className="mini-seg" role="group" aria-labelledby="layout-label">
                {(['compact', 'pages'] as const).map((opt) => (
                  <button
                    key={opt}
                    type="button"
                    className={albumLayout === opt ? 'on' : ''}
                    aria-pressed={albumLayout === opt}
                    disabled={!supportsPages}
                    onClick={() => setAlbumLayout(opt)}
                  >
                    {opt === 'compact' ? 'Compact' : 'Pages'}
                  </button>
                ))}
              </span>
            </div>
          </div>
        </section>

        {/* ---------- Coca-Cola tracking ---------- */}
        <section className="settings-section">
          <h3 className="settings-heading">Coca-Cola tracking</h3>
          <button
            type="button"
            className="setting-toggle"
            role="switch"
            aria-checked={trackCC}
            onClick={() => setTrackCC(!trackCC)}
            disabled={forcedReadOnly}
          >
            <span className="setting-label">
              {CC_EMOJI} {trackCC ? 'Untrack' : 'Track'} Coca-Cola stickers
            </span>
            <span className={`switch${trackCC ? ' on' : ''}`} aria-hidden="true">
              <span className="knob" />
            </span>
          </button>

          <p className="modal-sub" style={{ margin: '12px 0 0' }}>
            {trackCC
              ? 'The editions differ only in the Coca-Cola page size. Switching keeps all your existing stickers — it just shows or hides the extra slots.'
              : 'Turn on Coca-Cola tracking above to choose between the NORAM and LATAM editions.'}
          </p>

          {trackCC && (
            <div className="edition-grid">
              {ORDER.map((key) => {
                const info = EDITION_INFO[key];
                const selected = edition === key;
                return (
                  <button
                    key={key}
                    className="swap-card edition-card"
                    style={{ borderColor: selected ? 'var(--green)' : undefined }}
                    onClick={() => setEdition(key)}
                    disabled={forcedReadOnly}
                  >
                    <div className="swap-top">
                      <span className="swap-name">{info.label}</span>
                      {selected && <span className="pill open">current</span>}
                    </div>
                    <div className="swap-summary edition-summary">
                      <span>{info.region}</span>
                      <span>Coca-Cola: {info.ccCount} stickers</span>
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </section>

        {/* ---------- Danger zone ---------- */}
        <section className="settings-section">
          <h3 className="settings-heading danger-heading">Danger zone</h3>
          <button type="button" className="btn danger full" onClick={() => setConfirmingDelete(true)}>
            🗑️ Delete album
          </button>
        </section>

        <div className="btn-row">
          <button className="btn full" onClick={onClose}>Close</button>
        </div>
      </div>

      {confirmingDelete && (
        <div className="modal-backdrop" onClick={() => setConfirmingDelete(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <h2>Delete album?</h2>
            <p className="modal-sub">
              This will permanently delete the album below, along with its stickers and swaps. This action
              cannot be undone.
            </p>
            <div
              style={{
                border: '1.5px solid var(--border)',
                borderRadius: '8px',
                padding: '0.75rem',
                marginBottom: '0.5rem',
              }}
            >
              <div style={{ fontWeight: 700, fontSize: '1rem' }}>
                {resolveAlbumName(activeAlbumId, albumName, localAlbumNames)}
              </div>
              <div style={{ color: 'var(--text-dim)', fontSize: '0.85rem' }}>{ALBUM_TYPE}</div>
            </div>
            <div className="btn-row">
              <button className="btn full" onClick={() => setConfirmingDelete(false)}>Cancel</button>
              <button className="btn danger full" onClick={handleConfirmDelete}>Delete</button>
            </div>
          </div>
        </div>
      )}

      {importOpen && <ImportDialog onClose={() => setImportOpen(false)} />}
    </div>
  );
}
```

> Note: unlike the old EditionDialog, picking a Coca-Cola edition here does **not** auto-close the screen (it stays open so the change is visible). This is intentional.

- [ ] **Step 2: Point the sheet's Manage action at the detail in `App.tsx`**

In `src/App.tsx`, add the import:

```tsx
import AlbumDetailView from './components/AlbumDetailView';
```

Add state near the others:

```tsx
  const [detailOpen, setDetailOpen] = useState(false);
```

Change the `LibrarySheet`'s `onManageAlbum` to open the detail instead of `EditionDialog` (leave `onOpenSettings` pointing at `EditionDialog` for now):

```tsx
          onManageAlbum={(id) => {
            switchAlbum(id);
            setLibraryOpen(false);
            setDetailOpen(true);
          }}
```

Render the detail alongside the other dialogs:

```tsx
      {detailOpen && <AlbumDetailView onClose={() => setDetailOpen(false)} />}
```

- [ ] **Step 3: Typecheck + build**

Run: `npm run build`
Expected: compiles, no type errors.

- [ ] **Step 4: Manual verification**

Run: `npm run dev`. Confirm:
- Open the sheet → tap a card's ⚙️ → the Album detail opens, titled with that album's name; it became the active album.
- Rename, toggle Coca-Cola tracking (and pick an edition), flip layout, and the sharing panel all work and persist.
- Delete album → confirmation → the album is removed and the detail closes.
- The header ⚙️ and `⚙️ App settings` still open the old Settings dialog (unchanged this task).

- [ ] **Step 5: Commit**

```bash
git add src/components/AlbumDetailView.tsx src/App.tsx
git commit -m "feat(library): per-album detail view"
```

---

## Task 5: Slim app Settings + retire EditionDialog

Splits out the app-only Settings, removes the header ⚙️ (settings now live behind the switcher), and deletes the old dialog.

**Files:**
- Create: `src/components/SettingsDialog.tsx`
- Modify: `src/App.tsx`
- Delete: `src/components/EditionDialog.tsx`

**Interfaces:**
- Consumes: `theme`/`setTheme` (store); `useSyncMeta` `collection`; `VERSION_LABEL`; `SyncSection`.
- Produces: `SettingsDialog` — props `{ onClose: () => void }`.

- [ ] **Step 1: Confirm EditionDialog has no other importers**

Run: `git grep -n "EditionDialog"`
Expected: matches only in `src/App.tsx` (and the file itself). If anything else imports it, update those call sites in this task too.

- [ ] **Step 2: Create `SettingsDialog.tsx`**

```tsx
import { useCollection } from '../store/collectionStore';
import { useSyncMeta } from '../store/syncStore';
import { VERSION_LABEL } from '../version';
import SyncSection from './SyncSection';

interface Props {
  onClose: () => void;
}

/** App-wide settings only: appearance + the whole-collection Cloud link. Per-album
 *  settings live in AlbumDetailView; album switching lives in the Library sheet. */
export default function SettingsDialog({ onClose }: Props) {
  const theme = useCollection((s) => s.theme);
  const setTheme = useCollection((s) => s.setTheme);
  // Only manages an existing Cloud link; setup happens on a per-album Sharing → Cloud button.
  const hasCloudLink = useSyncMeta((s) => s.collection !== null);

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <h2>Settings</h2>

        <section className="settings-section">
          <h3 className="settings-heading">Appearance</h3>
          <div className="settings-card">
            <div className="setting-row">
              <span className="setting-row-ico" aria-hidden="true">{theme === 'light' ? '☀️' : '🌙'}</span>
              <span className="setting-row-text">
                <span className="setting-row-title" id="theme-label">Theme</span>
              </span>
              <span className="mini-seg" role="group" aria-labelledby="theme-label">
                {(['light', 'dark'] as const).map((opt) => (
                  <button
                    key={opt}
                    type="button"
                    className={theme === opt ? 'on' : ''}
                    aria-pressed={theme === opt}
                    onClick={() => setTheme(opt)}
                  >
                    {opt === 'light' ? 'Light' : 'Dark'}
                  </button>
                ))}
              </span>
            </div>
          </div>
        </section>

        {hasCloudLink && <SyncSection />}

        <div className="btn-row">
          <button className="btn full" onClick={onClose}>Close</button>
        </div>
        <p className="settings-version">{VERSION_LABEL}</p>
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Update `App.tsx` — swap the dialog, drop the header ⚙️**

In `src/App.tsx`:

1. Replace the import `import EditionDialog from './components/EditionDialog';` with:

```tsx
import SettingsDialog from './components/SettingsDialog';
```

2. Rename the state `editionOpen`/`setEditionOpen` to `settingsOpen`/`setSettingsOpen`:

```tsx
  const [settingsOpen, setSettingsOpen] = useState(false);
```

3. **Delete** the header settings button (the `⚙️` `icon-btn` with `aria-label="Settings"`, App.tsx lines ~102–104) entirely. Keep the lock, share, and help buttons.

4. Point the sheet's `onOpenSettings` at the new dialog:

```tsx
          onOpenSettings={() => {
            setLibraryOpen(false);
            setSettingsOpen(true);
          }}
```

5. Replace the `{editionOpen && <EditionDialog ... />}` render with:

```tsx
      {settingsOpen && <SettingsDialog onClose={() => setSettingsOpen(false)} />}
```

- [ ] **Step 4: Delete `EditionDialog.tsx`**

```bash
git rm src/components/EditionDialog.tsx
```

- [ ] **Step 5: Typecheck + build + full test run**

Run: `npm run build`
Expected: compiles, no type errors, no unresolved `EditionDialog` import.
Run: `npm test`
Expected: all tests PASS.

- [ ] **Step 6: Manual verification (full pass)**

Run: `npm run dev`. Confirm:
- The header has **no ⚙️**; it shows the switcher + 🔒 lock, ↗ share, ? help.
- App settings are reachable only via the switcher → sheet → `⚙️ App settings`; the dialog shows only Theme (+ Cloud link if configured) + version. Theme toggle works app-wide.
- Album switching (sheet card tap), New album, and per-album Manage (detail: rename/CC/edition/layout/sharing/import/export/delete) all still work.
- A read-only shared album still force-locks its editing controls in the detail view.

- [ ] **Step 7: Commit**

```bash
git add src/components/SettingsDialog.tsx src/App.tsx
git commit -m "feat(settings): slim app-only Settings; retire EditionDialog"
```

---

## Self-Review

**Spec coverage (against `2026-07-19-settings-library-reorg-design.md`):**
- §A IA (switcher → sheet; detail + settings layered) → Tasks 3–5.
- §B AlbumSwitcher (treatment B, adaptive single-album, monogram cover, resolved name) → Tasks 2, 3.
- §C Library sheet (cards, tap=switch+dismiss, ⚙️=manage, New album, Groups placeholder, App settings, adaptive type layer hidden at 1 type) → Task 3. *(The `Type ▾` selector is intentionally not built — one type today; §I out of scope.)*
- §D Album detail (all per-album config; activates album on open) → Task 4.
- §E Slim app Settings (theme, cloud, version) → Task 5. *(Help stays as the header `?` button rather than moving into Settings — a deliberate, minor simplification; the header already carries it.)*
- §F data model unchanged; `computeStatsFor`; file moves; `TabBar` unchanged → Tasks 1, 3–5.
- §G Groups/Trade reserved only (disabled Groups button; no Trade tab) → Task 3.
- §H Testing (`computeStatsFor` unit tests; component behaviour via manual checklist) → Tasks 1–5.

**Placeholder scan:** No TBD/TODO. Every code step contains complete code. The disabled `👥 Groups` button is an intentional reserved surface (§G), not a placeholder for missing work in this plan.

**Type consistency:** `AlbumSwitcher{onOpen}`, `AlbumCard{album,isActive,onOpen,onManage}`, `LibrarySheet{onClose,onManageAlbum,onOpenSettings}`, `AlbumDetailView{onClose}`, `SettingsDialog{onClose}` are used consistently between their definition and their `App.tsx` call sites. `computeStatsFor(counts, edition, trackCC, history?)` and `buildAlbumFor(edition, trackCC)` match between Task 1's definitions and Task 3's consumption. `monogram`/`coverTint` match between Task 2 and Task 3.
