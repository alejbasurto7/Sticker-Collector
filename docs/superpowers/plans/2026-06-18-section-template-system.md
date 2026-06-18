# Section Template System & Admin Editor — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the grid layout format with a unified free-position template system — format, aspect-locked renderer, and a dev-only drag-and-drop editor — so every album section preserves the country-spread height, sits at its real album position, and renders portrait or landscape correctly.

**Architecture:** A `SectionTemplate` is a list of printed pages, each a list of free-positioned slots (`x`/`y` as % of the page, an orientation, and an optional decorative flag). A section binds to a template by id and fills its non-decorative slots with `stickerIds` in order. Pure geometry helpers (`slotBox`, `bindTemplate`, `gridTemplate`, `clientToPagePercent`) carry the math and are unit-tested in node; `PageSection` renders slots as absolutely-positioned cells inside an aspect-locked page; a dev-only `TemplateEditor` (mounted via a hash route, stripped from production) edits templates visually and exports them back into `layouts.ts`.

**Tech Stack:** React 18, TypeScript, Zustand, Vite, Vitest (node environment, pure-function tests only — the codebase has no DOM testing library, so React UI is verified manually).

## Global Constraints

- **Test command:** `npm test` (alias for `vitest run`). Test files must match `src/**/*.test.ts` (the config does **not** include `.tsx`), run in the `node` environment, and therefore must import only pure modules (no JSX, no DOM).
- **Branch:** all work on `claude/section-template-system` (already created).
- **Build must stay green every task:** run `npm run build` (`tsc -b && vite build`) before each commit that changes TypeScript. Tasks are ordered so the app keeps compiling — the new format is added alongside the old, the renderer is switched, then the dead old format is deleted.
- **The editor is dev-only:** it must never appear in the production bundle. Gate it behind `import.meta.env.DEV` and a dynamic `import()` so Vite tree-shakes it from `vite build`.
- **Country spread must not visibly change:** it is the regression guard. Its template is generated from the same 4×3 grid arithmetic it uses today.
- **Standard layout constants (verbatim):** `FOIL_RATIO = 7 / 5`; `STANDARD_PAGE_ASPECT = 0.963`; `STANDARD_STICKER_WIDTH_PCT = 22.75`; grid-seed gaps `HGAP = 3`, `VGAP = 4` (all percentages of the page box). These are chosen so a portrait foil is exactly 5:7 and three rows of portrait foils tile a page vertically.
- **Seeded orientations (verbatim):** landscape for Specials `00, 1, 2, 3` (portrait `4`); History folios `10, 11, 12, 13, 14` and all History decorative photos (portrait `9, 15, 16, 17, 18, 19`); everything else (Ball & Countries `5–8`, Coca-Cola `1–14`) portrait.

---

## File Structure

- **Create** `src/data/layoutGeometry.ts` — pure layout math/transforms: constants, `slotBox`, `bindTemplate`, `gridTemplate`, `clientToPagePercent`, `clamp`. No React, node-safe.
- **Create** `src/data/layoutGeometry.test.ts` — unit tests for the geometry module.
- **Modify** `src/data/layouts.ts` — replace the grid format (`LayoutCell`/`LayoutPage`/`SectionLayout`) with the new `TemplateSlot`/`TemplatePage`/`SectionTemplate` types, the `TEMPLATES` registry (built via `gridTemplate`), and `templateFor(page)`.
- **Modify** `src/components/PageSection.tsx` — render slots as absolutely-positioned cells via `slotBox`/`bindTemplate`; add the unplaced-sticker fallback grid.
- **Modify** `src/styles.css` — aspect-locked `.album-page` with absolutely-positioned slots; drop the grid plumbing.
- **Create** `src/admin/serializeTemplates.ts` — `templatesToJSON` + `templatesToSource` (pure, dev-only consumer).
- **Create** `src/admin/serializeTemplates.test.ts` — serialize round-trip test.
- **Create** `src/admin/TemplateEditor.tsx` — the dev-only editor.
- **Modify** `src/main.tsx` — dev-only hash-routed mount of the editor.

---

## Task 1: Pure layout geometry & binding

**Files:**
- Create: `src/data/layoutGeometry.ts`
- Test: `src/data/layoutGeometry.test.ts`

**Interfaces:**
- Produces (consumed by Tasks 2, 3, 6, 7):
  - `interface TemplateSlot { x: number; y: number; orientation: 'portrait' | 'landscape'; decorative?: boolean }`
  - `interface TemplatePage { slots: TemplateSlot[] }`
  - `interface SectionTemplate { id: string; pageAspect: number; stickerWidthPct: number; pages: TemplatePage[] }`
  - `slotBox(slot: TemplateSlot, t: SectionTemplate): { leftPct: number; topPct: number; widthPct: number; heightPct: number }`
  - `interface Placement { slot: TemplateSlot; stickerId?: string }`
  - `interface BoundTemplate { pages: { placements: Placement[] }[]; unplaced: string[] }`
  - `bindTemplate(t: SectionTemplate, stickerIds: string[]): BoundTemplate`
  - `interface GridCell { col: number; row: number; colSpan?: number; landscape?: boolean; decorative?: boolean }`
  - `gridTemplate(id: string, pages: { cols: number; cells: GridCell[] }[]): SectionTemplate`
  - `clientToPagePercent(clientX: number, clientY: number, rect: { left: number; top: number; width: number; height: number }): { x: number; y: number }`
  - constants `FOIL_RATIO`, `STANDARD_PAGE_ASPECT`, `STANDARD_STICKER_WIDTH_PCT`, `HGAP`, `VGAP`

- [ ] **Step 1: Write the failing test**

Create `src/data/layoutGeometry.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import {
  slotBox,
  bindTemplate,
  gridTemplate,
  clientToPagePercent,
  STANDARD_PAGE_ASPECT,
  STANDARD_STICKER_WIDTH_PCT,
  type SectionTemplate,
} from './layoutGeometry';

const t = (over: Partial<SectionTemplate> = {}): SectionTemplate => ({
  id: 't',
  pageAspect: STANDARD_PAGE_ASPECT,
  stickerWidthPct: STANDARD_STICKER_WIDTH_PCT,
  pages: [],
  ...over,
});

describe('slotBox', () => {
  it('sizes a portrait foil 5:7 (width = base, height = base * aspect * 7/5)', () => {
    const b = slotBox({ x: 50, y: 50, orientation: 'portrait' }, t());
    expect(b.leftPct).toBe(50);
    expect(b.topPct).toBe(50);
    expect(b.widthPct).toBeCloseTo(22.75, 3);
    expect(b.heightPct).toBeCloseTo(22.75 * 0.963 * (7 / 5), 3); // ≈ 30.67
  });

  it('sizes a landscape foil 7:5 (the same foil rotated)', () => {
    const b = slotBox({ x: 10, y: 20, orientation: 'landscape' }, t());
    expect(b.widthPct).toBeCloseTo(22.75 * (7 / 5), 3); // ≈ 31.85
    expect(b.heightPct).toBeCloseTo(22.75 * 0.963, 3); // ≈ 21.91
  });
});

describe('bindTemplate', () => {
  const tmpl = t({
    pages: [
      {
        slots: [
          { x: 0, y: 0, orientation: 'portrait' },
          { x: 0, y: 0, orientation: 'landscape', decorative: true },
          { x: 0, y: 0, orientation: 'portrait' },
        ],
      },
    ],
  });

  it('fills non-decorative slots in order and skips decorative slots', () => {
    const bound = bindTemplate(tmpl, ['A', 'B']);
    const p = bound.pages[0].placements;
    expect(p[0].stickerId).toBe('A');
    expect(p[1].stickerId).toBeUndefined(); // decorative
    expect(p[2].stickerId).toBe('B');
    expect(bound.unplaced).toEqual([]);
  });

  it('returns leftover stickers as unplaced when there are more stickers than slots', () => {
    const bound = bindTemplate(tmpl, ['A', 'B', 'C']);
    expect(bound.unplaced).toEqual(['C']);
  });

  it('leaves trailing real slots empty when there are fewer stickers than slots', () => {
    const bound = bindTemplate(tmpl, ['A']);
    expect(bound.pages[0].placements[2].stickerId).toBeUndefined();
    expect(bound.unplaced).toEqual([]);
  });
});

describe('gridTemplate', () => {
  it('places a 4-col grid cell at the centre of its column/row', () => {
    const g = gridTemplate('g', [{ cols: 4, cells: [{ col: 1, row: 1 }] }]);
    // Wc = (100 - 3*3)/4 = 22.75 ; column-1 centre = 22.75/2 = 11.375
    // Rh = 22.75 * 0.963 * 1.4 ≈ 30.6705 ; row-1 centre = 15.335
    expect(g.stickerWidthPct).toBeCloseTo(22.75, 3);
    expect(g.pages[0].slots[0].x).toBeCloseTo(11.375, 3);
    expect(g.pages[0].slots[0].y).toBeCloseTo(15.335, 2);
    expect(g.pages[0].slots[0].orientation).toBe('portrait');
  });

  it('centres a colSpan landscape cell across its columns and top-aligns it', () => {
    const g = gridTemplate('g', [
      { cols: 4, cells: [{ col: 3, row: 1, colSpan: 2, landscape: true }] },
    ]);
    const s = g.pages[0].slots[0];
    // cols 3-4 centre: col3 centre 62.875, plus half a (Wc+HGAP) step = +12.875 -> 75.75
    expect(s.x).toBeCloseTo(75.75, 2);
    // landscape height = Wc*aspect = 21.91 ; top-aligned in row 1 -> centre y = 10.954
    expect(s.y).toBeCloseTo(10.954, 2);
    expect(s.orientation).toBe('landscape');
  });
});

describe('clientToPagePercent', () => {
  it('maps a client point into 0–100 page coordinates and clamps to the box', () => {
    const rect = { left: 100, top: 200, width: 400, height: 800 };
    expect(clientToPagePercent(300, 600, rect)).toEqual({ x: 50, y: 50 });
    expect(clientToPagePercent(0, 0, rect)).toEqual({ x: 0, y: 0 }); // clamped
    expect(clientToPagePercent(9999, 9999, rect)).toEqual({ x: 100, y: 100 }); // clamped
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm test -- src/data/layoutGeometry.test.ts`
Expected: FAIL — `Cannot find module './layoutGeometry'`.

- [ ] **Step 3: Write the implementation**

Create `src/data/layoutGeometry.ts`:

```ts
// Pure layout geometry: no React, no DOM — safe to unit-test in the node env.
//
// Coordinate model: every page is a box; slot x/y are 0–100 percentages of that
// box and mark the slot's CENTRE (so flipping orientation never shifts a slot).
// A foil is physically 5:7; landscape is the same foil rotated to 7:5.

export const FOIL_RATIO = 7 / 5;
/** Page width / height. Chosen so 3 rows of portrait foils tile a page. */
export const STANDARD_PAGE_ASPECT = 0.963;
/** Base foil width as % of page width — one of four columns minus gaps. */
export const STANDARD_STICKER_WIDTH_PCT = 22.75;
/** Horizontal / vertical gaps (% of page) used when seeding from a grid. */
export const HGAP = 3;
export const VGAP = 4;

export interface TemplateSlot {
  x: number; // 0–100, % of page width  (centre)
  y: number; // 0–100, % of page height (centre)
  orientation: 'portrait' | 'landscape';
  decorative?: boolean; // pre-printed picture: shown, never bound, never counted
}

export interface TemplatePage {
  slots: TemplateSlot[];
}

export interface SectionTemplate {
  id: string;
  pageAspect: number; // width / height
  stickerWidthPct: number; // base foil width as % of page width (uniform)
  pages: TemplatePage[]; // rendered 2-up as spreads, in page order
}

export interface SlotBox {
  leftPct: number;
  topPct: number;
  widthPct: number; // % of page width
  heightPct: number; // % of page height
}

/** Pixel-free size + position of a slot, in page percentages. */
export function slotBox(slot: TemplateSlot, t: SectionTemplate): SlotBox {
  const w = t.stickerWidthPct;
  const landscape = slot.orientation === 'landscape';
  return {
    leftPct: slot.x,
    topPct: slot.y,
    widthPct: landscape ? w * FOIL_RATIO : w,
    heightPct: landscape ? w * t.pageAspect : w * t.pageAspect * FOIL_RATIO,
  };
}

export interface Placement {
  slot: TemplateSlot;
  stickerId?: string;
}
export interface BoundTemplate {
  pages: { placements: Placement[] }[];
  unplaced: string[];
}

/**
 * Assign stickerIds to the template's non-decorative slots, walked in page
 * order. Decorative slots are skipped; trailing real slots stay empty when
 * under-supplied; surplus stickers come back in `unplaced` so the renderer can
 * still show them and nothing is ever hidden.
 */
export function bindTemplate(t: SectionTemplate, stickerIds: string[]): BoundTemplate {
  let cursor = 0;
  const pages = t.pages.map((p) => ({
    placements: p.slots.map((slot): Placement => {
      if (slot.decorative) return { slot };
      const stickerId = stickerIds[cursor++];
      return { slot, stickerId };
    }),
  }));
  return { pages, unplaced: stickerIds.slice(cursor) };
}

export function clamp(n: number, lo: number, hi: number): number {
  return n < lo ? lo : n > hi ? hi : n;
}

/** Map a client (mouse/touch) point into 0–100 page coordinates, clamped. */
export function clientToPagePercent(
  clientX: number,
  clientY: number,
  rect: { left: number; top: number; width: number; height: number },
): { x: number; y: number } {
  return {
    x: clamp(((clientX - rect.left) / rect.width) * 100, 0, 100),
    y: clamp(((clientY - rect.top) / rect.height) * 100, 0, 100),
  };
}

export interface GridCell {
  col: number; // 1-based
  row: number; // 1-based
  colSpan?: number;
  landscape?: boolean;
  decorative?: boolean;
}

/**
 * Build a template from a column/row grid (the bridge from the old grid format).
 * Used to author every seed: the country spread comes out matching today, and
 * the non-country sections get a sane starting point the editor then nudges.
 * Assumes uniform column count per template (all our pages are 4 columns).
 */
export function gridTemplate(
  id: string,
  pages: { cols: number; cells: GridCell[] }[],
): SectionTemplate {
  const cols0 = pages[0]?.cols ?? 4;
  const colWidth = (100 - (cols0 - 1) * HGAP) / cols0; // % of page width
  const rowHeight = colWidth * STANDARD_PAGE_ASPECT * FOIL_RATIO; // portrait row height %
  const landscapeHeight = colWidth * STANDARD_PAGE_ASPECT; // landscape height %
  const step = colWidth + HGAP;

  const toSlot = (cell: GridCell): TemplateSlot => {
    const span = cell.colSpan ?? 1;
    const firstColCentre = (cell.col - 1) * step + colWidth / 2;
    const x = firstColCentre + ((span - 1) * step) / 2; // centre across spanned columns
    const rowTop = (cell.row - 1) * (rowHeight + VGAP);
    const y = cell.landscape ? rowTop + landscapeHeight / 2 : rowTop + rowHeight / 2;
    return {
      x,
      y,
      orientation: cell.landscape ? 'landscape' : 'portrait',
      ...(cell.decorative ? { decorative: true } : {}),
    };
  };

  return {
    id,
    pageAspect: STANDARD_PAGE_ASPECT,
    stickerWidthPct: colWidth,
    pages: pages.map((p) => ({ slots: p.cells.map(toSlot) })),
  };
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npm test -- src/data/layoutGeometry.test.ts`
Expected: PASS (all assertions).

- [ ] **Step 5: Commit**

```bash
git add src/data/layoutGeometry.ts src/data/layoutGeometry.test.ts
git commit -m "feat: pure free-position layout geometry + binding"
```

---

## Task 2: Template registry & resolver

Replace the contents of `src/data/layouts.ts` with the new format and registry. This is the format swap, but it leaves the OLD renderer (`PageSection`) temporarily importing names that no longer exist — so Task 2 and Task 3 ship together to keep the build green. **Do not run `npm run build` between Task 2 and Task 3; run the unit tests after Task 2 and the full build after Task 3.**

**Files:**
- Modify: `src/data/layouts.ts` (full rewrite)
- Test: `src/data/layouts.test.ts` (create)

**Interfaces:**
- Consumes: everything from `layoutGeometry.ts` (Task 1).
- Produces (consumed by Tasks 3, 6, 7):
  - `TEMPLATES: Record<string, SectionTemplate>`
  - `templateFor(page: Page): SectionTemplate | undefined`
  - re-exports the template types and geometry helpers for existing importers.

- [ ] **Step 1: Write the failing test**

Create `src/data/layouts.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { TEMPLATES, templateFor } from './layouts';
import { bindTemplate } from './layoutGeometry';
import { album } from './sampleAlbum';

const pageById = (id: string) => album.pages.find((p) => p.id === id)!;
const countSlots = (id: string) =>
  TEMPLATES[id].pages.reduce((n, p) => n + p.slots.length, 0);
const countReal = (id: string) =>
  TEMPLATES[id].pages.reduce(
    (n, p) => n + p.slots.filter((s) => !s.decorative).length,
    0,
  );

describe('templateFor', () => {
  it('returns the shared country template for every team page', () => {
    const mex = templateFor(pageById('MEX'))!;
    const bra = templateFor(pageById('BRA'))!;
    expect(mex.id).toBe('country-spread');
    expect(mex).toBe(bra); // one shared template instance
  });

  it('maps each non-country section to its template', () => {
    expect(templateFor(pageById('FWC-trophy'))!.id).toBe('fwc-specials');
    expect(templateFor(pageById('FWC-world'))!.id).toBe('fwc-ball-countries');
    expect(templateFor(pageById('FWC-scroll'))!.id).toBe('fwc-history');
  });
});

describe('templates bind to their real sections', () => {
  it('country spread has 20 real slots and a landscape sticker 13', () => {
    expect(countReal('country-spread')).toBe(20);
    // 13 is the 13th real slot -> page 2, after 10 on page 1.
    const land = TEMPLATES['country-spread'].pages
      .flatMap((p) => p.slots)
      .filter((s) => s.orientation === 'landscape');
    expect(land).toHaveLength(1);
  });

  it('Specials places 00,1,2,3 landscape and 4 portrait', () => {
    const t = TEMPLATES['fwc-specials'];
    const slots = t.pages.flatMap((p) => p.slots);
    expect(slots.map((s) => s.orientation)).toEqual([
      'landscape', // 00
      'landscape', // 1
      'landscape', // 2
      'landscape', // 3
      'portrait', // 4
    ]);
    // Every real slot binds to a Specials sticker, none unplaced.
    const bound = bindTemplate(t, pageById('FWC-trophy').stickerIds);
    expect(bound.unplaced).toEqual([]);
  });

  it('History folios 10-14 are landscape and the pre-printed photos are decorative', () => {
    const t = TEMPLATES['fwc-history'];
    const slots = t.pages.flatMap((p) => p.slots);
    const decorative = slots.filter((s) => s.decorative);
    expect(decorative.length).toBeGreaterThan(0);
    expect(decorative.every((s) => s.orientation === 'landscape')).toBe(true);
    // The 11 folios all bind; decorative photos are skipped.
    const bound = bindTemplate(t, pageById('FWC-scroll').stickerIds);
    expect(bound.unplaced).toEqual([]);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm test -- src/data/layouts.test.ts`
Expected: FAIL — `templateFor`/`TEMPLATES` exports do not exist yet (current `layouts.ts` exports `layoutFor`).

- [ ] **Step 3: Write the implementation**

Replace the **entire** contents of `src/data/layouts.ts` with:

```ts
import type { Page } from '../types';
import { gridTemplate } from './layoutGeometry';
import type { SectionTemplate } from './layoutGeometry';

// Re-export the format so existing importers keep a single source.
export type {
  SectionTemplate,
  TemplateSlot,
  TemplatePage,
} from './layoutGeometry';

/**
 * Free-position section templates that mirror the printed Panini album. Each
 * section binds to one of these by id (see `templateFor`); its stickerIds fill
 * the non-decorative slots in order. Seeds below are authored from the old grid
 * layout via `gridTemplate`, then refined in the dev-only template editor and
 * pasted back here.
 *
 * Country spread: two 4×3 pages (1–10 left, 11–20 right); sticker 13 is the
 * landscape foil spanning the right page's last two columns.
 */
const COUNTRY_SPREAD = gridTemplate('country-spread', [
  {
    cols: 4,
    cells: [
      { col: 3, row: 1 },
      { col: 4, row: 1 },
      { col: 1, row: 2 },
      { col: 2, row: 2 },
      { col: 3, row: 2 },
      { col: 4, row: 2 },
      { col: 1, row: 3 },
      { col: 2, row: 3 },
      { col: 3, row: 3 },
      { col: 4, row: 3 },
    ],
  },
  {
    cols: 4,
    cells: [
      { col: 1, row: 1 },
      { col: 2, row: 1 },
      { col: 3, row: 1, colSpan: 2, landscape: true }, // 13
      { col: 1, row: 2 },
      { col: 2, row: 2 },
      { col: 3, row: 2 },
      { col: 4, row: 2 },
      { col: 2, row: 3 },
      { col: 3, row: 3 },
      { col: 4, row: 3 },
    ],
  },
]);

// Specials (00,1,2,3,4): 00 on the left page; trophy halves (1,2), mascots (3),
// emblem (4) on the right. 00,1,2,3 landscape; 4 portrait.
const FWC_SPECIALS = gridTemplate('fwc-specials', [
  { cols: 4, cells: [{ col: 1, row: 1, colSpan: 2, landscape: true }] }, // 00
  {
    cols: 4,
    cells: [
      { col: 1, row: 1, colSpan: 2, landscape: true }, // 1
      { col: 3, row: 1, colSpan: 2, landscape: true }, // 2
      { col: 1, row: 2, colSpan: 2, landscape: true }, // 3
      { col: 3, row: 2 }, // 4
    ],
  },
]);

// Ball and Countries (5,6,7,8): all portrait.
const FWC_BALL_COUNTRIES = gridTemplate('fwc-ball-countries', [
  {
    cols: 4,
    cells: [
      { col: 1, row: 1 }, // 5
      { col: 3, row: 1 }, // 6
    ],
  },
  {
    cols: 4,
    cells: [
      { col: 1, row: 1 }, // 7
      { col: 3, row: 1 }, // 8
    ],
  },
]);

// Coca-Cola (LATAM, 14 stickers): all portrait. CC1–6 left, CC7–14 right.
const CC_LATAM = gridTemplate('cc-latam', [
  {
    cols: 4,
    cells: [
      { col: 1, row: 1 },
      { col: 1, row: 2 },
      { col: 1, row: 3 },
      { col: 2, row: 1 },
      { col: 2, row: 2 },
      { col: 2, row: 3 },
    ],
  },
  {
    cols: 4,
    cells: [
      { col: 1, row: 1 },
      { col: 1, row: 2 },
      { col: 1, row: 3 },
      { col: 2, row: 1 },
      { col: 2, row: 2 },
      { col: 2, row: 3 },
      { col: 3, row: 1 },
      { col: 3, row: 2 },
    ],
  },
]);

// History (folios 9–19): champion photos interleaved with pre-printed
// (decorative) photos across four pages. Folios 10–14 and every decorative
// photo are landscape; 9,15–19 portrait.
//   Folio → real-slot order: 9,10,11,12,13,14,15,16,17,18,19
const FWC_HISTORY = gridTemplate('fwc-history', [
  {
    cols: 4,
    cells: [
      { col: 1, row: 1, decorative: true, landscape: true }, // 1930
      { col: 2, row: 1 }, // 9 — 1934 (portrait)
      { col: 1, row: 2, decorative: true, landscape: true }, // 1938
      { col: 2, row: 2, landscape: true }, // 10 — 1950
    ],
  },
  {
    cols: 4,
    cells: [
      { col: 1, row: 1, landscape: true }, // 11 — 1954
      { col: 2, row: 1, decorative: true, landscape: true }, // 1958
      { col: 3, row: 1, landscape: true }, // 12 — 1962
      { col: 1, row: 2, decorative: true, landscape: true }, // 1966
      { col: 2, row: 2, decorative: true, landscape: true }, // 1970
      { col: 3, row: 2, landscape: true }, // 13 — 1974
    ],
  },
  {
    cols: 4,
    cells: [
      { col: 1, row: 1, decorative: true, landscape: true }, // 1978
      { col: 2, row: 1, decorative: true, landscape: true }, // 1982
      { col: 3, row: 1, landscape: true }, // 14 — 1986
      { col: 1, row: 2, decorative: true, landscape: true }, // 1990
      { col: 2, row: 2 }, // 15 — 1994 (portrait)
      { col: 3, row: 2, decorative: true, landscape: true }, // 1998
    ],
  },
  {
    cols: 4,
    cells: [
      { col: 1, row: 1 }, // 16 — 2002 (portrait)
      { col: 2, row: 1 }, // 17 — 2006 (portrait)
      { col: 3, row: 1, decorative: true, landscape: true }, // 2010
      { col: 1, row: 2 }, // 18 — 2014 (portrait)
      { col: 2, row: 2, decorative: true, landscape: true }, // 2018
      { col: 3, row: 2 }, // 19 — 2022 (portrait)
    ],
  },
]);

export const TEMPLATES: Record<string, SectionTemplate> = {
  'country-spread': COUNTRY_SPREAD,
  'fwc-specials': FWC_SPECIALS,
  'fwc-ball-countries': FWC_BALL_COUNTRIES,
  'cc-latam': CC_LATAM,
  'fwc-history': FWC_HISTORY,
};

/**
 * Resolve the template for a page, or `undefined` to fall back to the responsive
 * flow grid. The CC template only applies to the 14-sticker LATAM page.
 */
export function templateFor(page: Page): SectionTemplate | undefined {
  if (page.type === 'team') return TEMPLATES['country-spread'];
  switch (page.id) {
    case 'FWC-trophy':
      return TEMPLATES['fwc-specials'];
    case 'FWC-world':
      return TEMPLATES['fwc-ball-countries'];
    case 'FWC-scroll':
      return TEMPLATES['fwc-history'];
    case 'CC':
      return page.stickerIds.length === 14 ? TEMPLATES['cc-latam'] : undefined;
    default:
      return undefined;
  }
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npm test -- src/data/layouts.test.ts`
Expected: PASS.

> Note: `npm run build` will currently FAIL because `PageSection.tsx` still imports the removed `layoutFor`/`LayoutCell`. That is expected and fixed in Task 3. Do not commit a broken build — Task 3 follows immediately.

- [ ] **Step 5: Stage (do not build yet)**

```bash
git add src/data/layouts.ts src/data/layouts.test.ts
```

Proceed directly to Task 3; commit the two together at the end of Task 3.

---

## Task 3: Switch the renderer to absolute-positioned slots

**Files:**
- Modify: `src/components/PageSection.tsx` (full rewrite of the body)
- Modify: `src/styles.css` (the `Album spread` block)

**Interfaces:**
- Consumes: `templateFor`, `TEMPLATES` (Task 2); `slotBox`, `bindTemplate`, `SectionTemplate`, `TemplateSlot`, `Placement` (Task 1).

- [ ] **Step 1: Rewrite `PageSection.tsx`**

Replace the **entire** contents of `src/components/PageSection.tsx` with:

```tsx
import { Fragment } from 'react';
import type { CSSProperties } from 'react';
import type { Page } from '../types';
import { stickerById } from '../data/sampleAlbum';
import { templateFor } from '../data/layouts';
import { slotBox, bindTemplate } from '../data/layoutGeometry';
import type { SectionTemplate, Placement } from '../data/layoutGeometry';
import { useCollection } from '../store/collectionStore';
import StickerCell from './StickerCell';
import type { AlbumFilter } from './FilterBar';

interface Props {
  page: Page;
  filter: AlbumFilter;
  open: boolean;
  onToggle: () => void;
}

/** Absolute placement (centre-anchored) for one slot, in page percentages. */
function slotStyle(placement: Placement, t: SectionTemplate): CSSProperties {
  const b = slotBox(placement.slot, t);
  return {
    position: 'absolute',
    left: `${b.leftPct}%`,
    top: `${b.topPct}%`,
    width: `${b.widthPct}%`,
    height: `${b.heightPct}%`,
    transform: 'translate(-50%, -50%)',
  };
}

/** Group printed pages into spreads of two (rendered side by side). */
function spreadsOf<T>(pages: T[]): T[][] {
  const spreads: T[][] = [];
  for (let i = 0; i < pages.length; i += 2) spreads.push(pages.slice(i, i + 2));
  return spreads;
}

export default function PageSection({ page, filter, open, onToggle }: Props) {
  const counts = useCollection((s) => s.counts);
  const addOne = useCollection((s) => s.addOne);
  const removeOne = useCollection((s) => s.removeOne);
  const locked = useCollection((s) => s.locked);

  const owned = page.stickerIds.filter((id) => (counts[id] ?? 0) >= 1).length;
  const total = page.stickerIds.length;

  const visibleIds = page.stickerIds.filter((id) => {
    const c = counts[id] ?? 0;
    if (filter === 'missing') return c === 0;
    if (filter === 'swaps') return c > 1;
    return true;
  });

  if (filter !== 'all' && visibleIds.length === 0) return null;

  // The printed-album layout only applies under the "all" filter; filtered and
  // untemplated pages keep the responsive flow grid.
  const template = templateFor(page);
  const useSpread = Boolean(template) && filter === 'all';
  const bound = template ? bindTemplate(template, page.stickerIds) : null;

  const renderCell = (id: string, style?: CSSProperties, landscape?: boolean) => (
    <StickerCell
      key={id}
      sticker={stickerById[id]}
      count={counts[id] ?? 0}
      locked={locked}
      landscape={landscape}
      style={style}
      onAdd={() => addOne(id)}
      onRemove={() => removeOne(id)}
    />
  );

  return (
    <section className="page-section">
      <button className="page-head" onClick={onToggle} aria-expanded={open}>
        <span className="emoji">{page.emoji}</span>
        <span className="titles">
          <div className="code">{page.code}</div>
          <div className="name">{page.title}</div>
        </span>
        <span className="mini-bar">
          <span style={{ width: `${total ? (owned / total) * 100 : 0}%` }} />
        </span>
        <span className="count">
          {owned}/{total}
        </span>
        <span className={`chevron ${open ? 'open' : ''}`}>›</span>
      </button>

      {open &&
        (useSpread && template && bound ? (
          <div className="album-spread">
            {spreadsOf(bound.pages).map((spread, si) => (
              <div className="album-spread-row" key={si}>
                {spread.map((bp, pi) => (
                  <Fragment key={pi}>
                    {pi > 0 && <div className="album-fold" aria-hidden="true" />}
                    <div
                      className="album-page"
                      style={{ '--page-aspect': template.pageAspect } as CSSProperties}
                    >
                      {bp.placements.map((pl, ci) => {
                        const style = slotStyle(pl, template);
                        if (pl.slot.decorative || !pl.stickerId) {
                          return (
                            <div
                              key={`d${ci}`}
                              className="cell decorative"
                              style={style}
                              aria-hidden="true"
                            />
                          );
                        }
                        return renderCell(
                          pl.stickerId,
                          style,
                          pl.slot.orientation === 'landscape',
                        );
                      })}
                    </div>
                  </Fragment>
                ))}
              </div>
            ))}
            {bound.unplaced.length > 0 && (
              <div className="sticker-grid">
                {bound.unplaced.map((id) => renderCell(id))}
              </div>
            )}
          </div>
        ) : (
          <div className="sticker-grid">{visibleIds.map((id) => renderCell(id))}</div>
        ))}
    </section>
  );
}
```

- [ ] **Step 2: Rewrite the `Album spread` CSS block**

In `src/styles.css`, replace the whole block from the `/* ---------- Album spread ----------` comment down to (but **not** including) the `/* ---------- Sticker cell ---------- */` comment with:

```css
/* ---------- Album spread ----------
   A section mirrors the printed album: each printed page is an aspect-locked box
   whose slots are absolutely positioned by the layout template, and pages show
   side by side as spreads (a muted fold line marks the page join). The fixed
   page aspect means every section is the country-spread height regardless of how
   few stickers it holds — empty space is reserved, never collapsed. */
.album-spread {
  display: flex;
  flex-direction: column;
  gap: 18px;
  padding: 6px 14px 16px;
}
/* One spread: two printed pages side by side with the fold between them. */
.album-spread-row {
  display: flex;
  align-items: flex-start;
  gap: 16px;
}
.album-page {
  /* flex: 1 1 0 keeps both pages exactly equal width; the aspect ratio (set
     inline per template) then fixes their height, so a spread is always the
     same height. Slots are absolutely positioned within this box. */
  flex: 1 1 0;
  position: relative;
  aspect-ratio: var(--page-aspect, 0.963);
}
/* The fold: a muted divider drawn between the two equal-width pages. */
.album-fold {
  align-self: stretch;
  width: 1px;
  background: var(--border);
}
/* Album-spread cells are sized explicitly (width + height %) by the template, so
   the square default aspect-ratio must be cleared. */
.album-page .cell {
  aspect-ratio: auto;
}
/* Pre-printed pictures (e.g. History's non-folio team photos): a disabled,
   numberless placeholder that just reserves the slot so the real folios line up
   with the album. */
.album-page .cell.decorative {
  background: var(--bg-elev);
  border-style: dashed;
  opacity: 0.45;
  cursor: default;
}
.album-page .cell.decorative:active {
  transform: none;
}
```

- [ ] **Step 3: Type-check and build**

Run: `npm run build`
Expected: PASS (`tsc -b` clean, `vite build` succeeds). If `tsc` reports unused old symbols in `layouts.ts`, they are removed in Task 4 — but at this point `layouts.ts` should contain only the new code from Task 2, so the build is clean.

- [ ] **Step 4: Run the full test suite**

Run: `npm test`
Expected: PASS (geometry, layouts, and the existing swap tests).

- [ ] **Step 5: Manual verification (dev server)**

Run: `npm run dev`, open the app, go to the Album tab, Expand all. Confirm:
- Country sections (e.g. Mexico) look the same as before: 4×3 spread, sticker 13 landscape, every portrait sticker the same size.
- Specials, Ball and Countries, Coca-Cola, History are now **full country-spread height** (no vertical collapse).
- Landscape stickers (Specials 00/1/2/3, History 10–14 and the dashed decorative photos) render wide, not portrait.
- Tap adds, long-press removes, and the `missing`/`swaps` filters still show the responsive flow grid.

- [ ] **Step 6: Commit (Tasks 2 + 3 together)**

```bash
git add src/data/layouts.ts src/data/layouts.test.ts src/components/PageSection.tsx src/styles.css
git commit -m "feat: render sections from free-position templates (aspect-locked, fixes height + orientation)"
```

---

## Task 4: Remove the dead grid format

By now nothing imports the old grid symbols. Confirm and delete any leftovers so a single format remains.

**Files:**
- Modify: `src/data/layouts.ts` (only if old symbols linger), `src/components/PageSection.tsx` (only if a stray import remains)

- [ ] **Step 1: Search for old format references**

Run: `git grep -nE "LayoutCell|LayoutPage|SectionLayout|layoutFor\b|COUNTRY_SPREAD\b" -- src`
Expected: only matches inside this plan/docs, none in `src/*.ts(x)`. If any source file still references them, remove that reference (the new equivalents are `TemplateSlot`/`TemplatePage`/`SectionTemplate`/`templateFor`/`TEMPLATES['country-spread']`).

- [ ] **Step 2: Build and test**

Run: `npm run build && npm test`
Expected: PASS.

- [ ] **Step 3: Commit (skip if Step 1 found nothing to change)**

```bash
git add -A
git commit -m "chore: drop the unused grid layout format"
```

---

## Task 5: Serialize templates for export

**Files:**
- Create: `src/admin/serializeTemplates.ts`
- Test: `src/admin/serializeTemplates.test.ts`

**Interfaces:**
- Consumes: `SectionTemplate` (Task 1).
- Produces (consumed by Task 7):
  - `templatesToJSON(templates: Record<string, SectionTemplate>): string`
  - `templatesToSource(templates: Record<string, SectionTemplate>): string`

- [ ] **Step 1: Write the failing test**

Create `src/admin/serializeTemplates.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { templatesToJSON, templatesToSource } from './serializeTemplates';
import { TEMPLATES } from '../data/layouts';

describe('templatesToJSON', () => {
  it('round-trips the registry exactly through JSON', () => {
    const json = templatesToJSON(TEMPLATES);
    expect(JSON.parse(json)).toEqual(TEMPLATES);
  });
});

describe('templatesToSource', () => {
  it('wraps the JSON in a pasteable TEMPLATES declaration', () => {
    const src = templatesToSource(TEMPLATES);
    expect(src).toContain('export const TEMPLATES');
    expect(src).toContain('country-spread');
    // The JSON payload is embedded verbatim.
    expect(src).toContain(templatesToJSON(TEMPLATES));
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm test -- src/admin/serializeTemplates.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Write the implementation**

Create `src/admin/serializeTemplates.ts`:

```ts
import type { SectionTemplate } from '../data/layoutGeometry';

/** Pretty-printed, round-trippable JSON of the whole template registry. */
export function templatesToJSON(templates: Record<string, SectionTemplate>): string {
  return JSON.stringify(templates, null, 2);
}

/**
 * The registry as a TypeScript snippet to paste over the `TEMPLATES` constant
 * in src/data/layouts.ts. (The seed `gridTemplate(...)` calls can then be
 * dropped in favour of this literal once positions are finalised.)
 */
export function templatesToSource(templates: Record<string, SectionTemplate>): string {
  return [
    '// Generated by the dev-only template editor — paste over TEMPLATES in',
    '// src/data/layouts.ts.',
    "import type { SectionTemplate } from './layoutGeometry';",
    '',
    `export const TEMPLATES: Record<string, SectionTemplate> = ${templatesToJSON(
      templates,
    )};`,
    '',
  ].join('\n');
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npm test -- src/admin/serializeTemplates.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/admin/serializeTemplates.ts src/admin/serializeTemplates.test.ts
git commit -m "feat: serialize templates for export-to-code"
```

---

## Task 6: Dev-only template editor — shell, canvas, move & flip

**Files:**
- Create: `src/admin/TemplateEditor.tsx`
- Modify: `src/main.tsx`

**Interfaces:**
- Consumes: `TEMPLATES` (Task 2); `slotBox`, `bindTemplate`, `clientToPagePercent`, `SectionTemplate`, `TemplateSlot` (Task 1); `album` (sampleAlbum); `templateFor` (Task 2).

**Binding caveat to surface in the UI:** slots bind to stickers positionally (the Nth real slot shows the Nth stickerId). The seeds already contain every sticker, so the normal workflow is **nudge + flip existing slots**. Adding a slot appends the next unplaced sticker; removing a slot reflows the ones after it. Each slot shows its bound sticker number so this stays legible.

- [ ] **Step 1: Create the editor component**

Create `src/admin/TemplateEditor.tsx`:

```tsx
import { useMemo, useRef, useState } from 'react';
import type { CSSProperties, PointerEvent as ReactPointerEvent } from 'react';
import { album } from '../data/sampleAlbum';
import { TEMPLATES, templateFor } from '../data/layouts';
import {
  slotBox,
  bindTemplate,
  clientToPagePercent,
  type SectionTemplate,
  type TemplateSlot,
} from '../data/layoutGeometry';
import { templatesToSource } from './serializeTemplates';

const DRAFT_KEY = 'figuritas-template-draft-v1';

/** Deep clone via JSON — templates are plain data. */
const clone = <T,>(v: T): T => JSON.parse(JSON.stringify(v)) as T;

function loadDraft(): Record<string, SectionTemplate> {
  try {
    const raw = localStorage.getItem(DRAFT_KEY);
    if (raw) return JSON.parse(raw);
  } catch {
    /* ignore corrupt draft */
  }
  return clone(TEMPLATES);
}

// Pages that map to a template, for the "edit which section" picker.
const EDITABLE_PAGES = album.pages.filter((p) => templateFor(p));

export default function TemplateEditor() {
  const [registry, setRegistry] = useState<Record<string, SectionTemplate>>(loadDraft);
  const [pageId, setPageId] = useState<string>(EDITABLE_PAGES[0]?.id ?? '');

  const section = album.pages.find((p) => p.id === pageId)!;
  const templateId = templateFor(section)!.id;
  const template = registry[templateId];

  // Persist on every change so a half-finished layout survives a reload.
  const commit = (next: Record<string, SectionTemplate>) => {
    setRegistry(next);
    try {
      localStorage.setItem(DRAFT_KEY, JSON.stringify(next));
    } catch {
      /* ignore quota errors */
    }
  };

  const updateTemplate = (mut: (t: SectionTemplate) => void) => {
    const next = clone(registry);
    mut(next[templateId]);
    commit(next);
  };

  const bound = useMemo(
    () => bindTemplate(template, section.stickerIds),
    [template, section],
  );

  // Drag state: which (page, slot) is moving, tracked against the page rect.
  const pageRefs = useRef<(HTMLDivElement | null)[]>([]);
  const drag = useRef<{ pageIdx: number; slotIdx: number; moved: boolean } | null>(null);

  const onSlotPointerDown =
    (pageIdx: number, slotIdx: number) => (e: ReactPointerEvent) => {
      e.preventDefault();
      (e.target as Element).setPointerCapture?.(e.pointerId);
      drag.current = { pageIdx, slotIdx, moved: false };
    };

  const onSlotPointerMove = (e: ReactPointerEvent) => {
    const d = drag.current;
    if (!d) return;
    const el = pageRefs.current[d.pageIdx];
    if (!el) return;
    const { x, y } = clientToPagePercent(e.clientX, e.clientY, el.getBoundingClientRect());
    d.moved = true;
    updateTemplate((t) => {
      const slot = t.pages[d.pageIdx].slots[d.slotIdx];
      slot.x = Math.round(x * 10) / 10;
      slot.y = Math.round(y * 10) / 10;
    });
  };

  const onSlotPointerUp = (pageIdx: number, slotIdx: number) => () => {
    const d = drag.current;
    drag.current = null;
    if (d && !d.moved) {
      // A tap (no drag) flips orientation.
      updateTemplate((t) => {
        const slot = t.pages[pageIdx].slots[slotIdx];
        slot.orientation = slot.orientation === 'portrait' ? 'landscape' : 'portrait';
      });
    }
  };

  const removeSlot = (pageIdx: number, slotIdx: number) =>
    updateTemplate((t) => {
      t.pages[pageIdx].slots.splice(slotIdx, 1);
    });

  const resetToSeeds = () => commit(clone(TEMPLATES));

  const exportSource = async () => {
    const src = templatesToSource(registry);
    try {
      await navigator.clipboard.writeText(src);
    } catch {
      /* clipboard may be blocked; the download below still works */
    }
    const blob = new Blob([src], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'layouts.generated.ts';
    a.click();
    URL.revokeObjectURL(url);
  };

  const slotLabel = (pageIdx: number): string[] => {
    // Numbers shown on each slot: the bound sticker's number, or "—" for decorative.
    return bound.pages[pageIdx].placements.map((pl) =>
      pl.slot.decorative
        ? '—'
        : pl.stickerId
          ? (album.stickers.find((s) => s.id === pl.stickerId)?.number ?? '?')
          : '·',
    );
  };

  const slotStyle = (slot: TemplateSlot): CSSProperties => {
    const b = slotBox(slot, template);
    return {
      position: 'absolute',
      left: `${b.leftPct}%`,
      top: `${b.topPct}%`,
      width: `${b.widthPct}%`,
      height: `${b.heightPct}%`,
      transform: 'translate(-50%, -50%)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      border: '1px solid #6aa9ff',
      borderRadius: 6,
      background: slot.decorative ? 'rgba(255,255,255,0.06)' : 'rgba(106,169,255,0.18)',
      borderStyle: slot.decorative ? 'dashed' : 'solid',
      color: '#cfe0ff',
      fontWeight: 800,
      fontSize: 12,
      cursor: 'grab',
      touchAction: 'none',
      userSelect: 'none',
    };
  };

  return (
    <div style={{ padding: 16, color: '#e7ecf3', fontFamily: 'system-ui, sans-serif' }}>
      <h2 style={{ marginTop: 0 }}>Template editor (dev only)</h2>

      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginBottom: 12 }}>
        <label>
          Section:{' '}
          <select value={pageId} onChange={(e) => setPageId(e.target.value)}>
            {EDITABLE_PAGES.map((p) => (
              <option key={p.id} value={p.id}>
                {p.title} ({templateFor(p)!.id})
              </option>
            ))}
          </select>
        </label>
        <button onClick={exportSource}>Export (copy + download)</button>
        <button onClick={resetToSeeds}>Reset to seeds</button>
      </div>

      <p style={{ opacity: 0.7, fontSize: 13, maxWidth: 640 }}>
        Drag a slot to move it · tap a slot to flip portrait↔landscape · ✕ removes it.
        Slots fill stickers in order, so the number on each slot is the sticker it
        currently binds to. Editing autosaves to this browser; Export writes the
        TEMPLATES literal to paste into <code>src/data/layouts.ts</code>.
      </p>

      <div style={{ display: 'flex', gap: 16, alignItems: 'flex-start' }}>
        {template.pages.map((p, pageIdx) => (
          <div
            key={pageIdx}
            ref={(el) => (pageRefs.current[pageIdx] = el)}
            onPointerMove={onSlotPointerMove}
            style={{
              position: 'relative',
              flex: '1 1 0',
              maxWidth: 320,
              aspectRatio: String(template.pageAspect),
              background: '#11161d',
              border: '1px solid #2a3340',
              borderRadius: 8,
            }}
          >
            {p.slots.map((slot, slotIdx) => (
              <div
                key={slotIdx}
                style={slotStyle(slot)}
                onPointerDown={onSlotPointerDown(pageIdx, slotIdx)}
                onPointerUp={onSlotPointerUp(pageIdx, slotIdx)}
              >
                {slotLabel(pageIdx)[slotIdx]}
                <button
                  onPointerDown={(e) => e.stopPropagation()}
                  onClick={(e) => {
                    e.stopPropagation();
                    removeSlot(pageIdx, slotIdx);
                  }}
                  style={{
                    position: 'absolute',
                    top: -8,
                    right: -8,
                    width: 18,
                    height: 18,
                    borderRadius: 9,
                    border: 'none',
                    background: '#c0392b',
                    color: '#fff',
                    fontSize: 11,
                    lineHeight: '18px',
                    padding: 0,
                    cursor: 'pointer',
                  }}
                  aria-label="Remove slot"
                >
                  ✕
                </button>
              </div>
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Mount the editor dev-only in `main.tsx`**

In `src/main.tsx`, replace the final `createRoot(...).render(...)` call with a dev-only branch (keep all the lines above it — the polyfill and `setAppHeight` still run):

```tsx
const root = createRoot(document.getElementById('root')!);

// Dev-only template editor at #/admin/templates. The `import.meta.env.DEV`
// guard plus the dynamic import means Vite tree-shakes this branch out of the
// production build entirely.
if (import.meta.env.DEV && window.location.hash.startsWith('#/admin/templates')) {
  import('./admin/TemplateEditor').then(({ default: TemplateEditor }) => {
    root.render(
      <StrictMode>
        <TemplateEditor />
      </StrictMode>,
    );
  });
} else {
  root.render(
    <StrictMode>
      <App />
    </StrictMode>,
  );
}
```

- [ ] **Step 3: Build (production strip check)**

Run: `npm run build`
Expected: PASS. Then confirm the editor is NOT in the production bundle:
Run: `git grep -l "Template editor (dev only)" dist/assets 2>/dev/null || echo "not bundled (good)"`
Expected: `not bundled (good)` (the string only exists in source, not the built output).

- [ ] **Step 4: Manual verification (dev server)**

Run: `npm run dev`, open `http://localhost:5173/#/admin/templates`. Confirm:
- The editor loads with the first section (e.g. Mexico) and shows two pages with numbered slots matching the live album.
- Dragging a slot moves it; releasing keeps it; the live Album tab reflects the move after Export+paste (here just confirm the drag math feels right).
- Tapping a slot flips portrait↔landscape (the box changes shape).
- ✕ removes a slot.
- Reload the page — your edits persist (autosave). "Reset to seeds" restores the originals.
- Visiting `http://localhost:5173/` (no hash) shows the normal app.

- [ ] **Step 5: Commit**

```bash
git add src/admin/TemplateEditor.tsx src/main.tsx
git commit -m "feat: dev-only template editor — move and flip slots"
```

---

## Task 7: Editor extras — add slots, pages, size/aspect knobs

**Files:**
- Modify: `src/admin/TemplateEditor.tsx`

**Interfaces:**
- Consumes: everything already imported in Task 6.

- [ ] **Step 1: Add a tray, page controls, and size/aspect sliders**

In `src/admin/TemplateEditor.tsx`, add these handlers inside the component (next to `removeSlot`):

```tsx
  const addSlot = (pageIdx: number, decorative: boolean) =>
    updateTemplate((t) => {
      t.pages[pageIdx].slots.push({
        x: 50,
        y: 50,
        orientation: decorative ? 'landscape' : 'portrait',
        ...(decorative ? { decorative: true } : {}),
      });
    });

  const addPage = () =>
    updateTemplate((t) => {
      t.pages.push({ slots: [] });
    });

  const removePage = (pageIdx: number) =>
    updateTemplate((t) => {
      if (t.pages.length > 1) t.pages.splice(pageIdx, 1);
    });

  const setWidth = (v: number) =>
    updateTemplate((t) => {
      t.stickerWidthPct = v;
    });

  const setAspect = (v: number) =>
    updateTemplate((t) => {
      t.pageAspect = v;
    });

  const unplacedCount = bound.unplaced.length;
```

Add this controls row directly **above** the `<div style={{ display: 'flex', gap: 16 ...}}>` pages container:

```tsx
      <div
        style={{
          display: 'flex',
          gap: 14,
          flexWrap: 'wrap',
          alignItems: 'center',
          marginBottom: 12,
          fontSize: 13,
        }}
      >
        <label>
          Sticker size: {template.stickerWidthPct.toFixed(1)}%{' '}
          <input
            type="range"
            min={10}
            max={40}
            step={0.25}
            value={template.stickerWidthPct}
            onChange={(e) => setWidth(Number(e.target.value))}
          />
        </label>
        <label>
          Page aspect: {template.pageAspect.toFixed(3)}{' '}
          <input
            type="range"
            min={0.6}
            max={1.4}
            step={0.001}
            value={template.pageAspect}
            onChange={(e) => setAspect(Number(e.target.value))}
          />
        </label>
        <button onClick={addPage}>+ page</button>
        {unplacedCount > 0 && (
          <span style={{ color: '#f0b450' }}>
            {unplacedCount} sticker(s) unplaced — add slots to place them
          </span>
        )}
      </div>
```

Then, inside the `template.pages.map(...)` page `<div>`, add per-page buttons **after** the slots `.map(...)` (still inside the page div, so they overlay the page corner):

```tsx
            <div
              style={{ position: 'absolute', bottom: 4, left: 4, display: 'flex', gap: 4 }}
            >
              <button onPointerDown={(e) => e.stopPropagation()} onClick={() => addSlot(pageIdx, false)}>
                + sticker
              </button>
              <button onPointerDown={(e) => e.stopPropagation()} onClick={() => addSlot(pageIdx, true)}>
                + photo
              </button>
              <button
                onPointerDown={(e) => e.stopPropagation()}
                onClick={() => removePage(pageIdx)}
              >
                ✕ page
              </button>
            </div>
```

- [ ] **Step 2: Build**

Run: `npm run build`
Expected: PASS.

- [ ] **Step 3: Manual verification (dev server)**

Run: `npm run dev`, open `#/admin/templates`. Confirm:
- "+ sticker" adds a portrait slot at centre; if there was an unplaced sticker, it now binds and the warning count drops.
- "+ photo" adds a dashed decorative slot (does not consume a sticker).
- "+ page" adds an empty page; "✕ page" removes a page (never below one).
- The "Sticker size" slider resizes every slot uniformly; "Page aspect" changes page height. Defaults are 22.75% and 0.963.
- Export downloads `layouts.generated.ts` and copies the same text; it contains `export const TEMPLATES` and parses as valid TS.

- [ ] **Step 4: Commit**

```bash
git add src/admin/TemplateEditor.tsx
git commit -m "feat: template editor — add slots/pages and size/aspect controls"
```

---

## Self-Review

**1. Spec coverage**

| Spec item | Task |
| --- | --- |
| Normalized free-position format (`TemplateSlot`/`TemplatePage`/`SectionTemplate`) | Task 1 |
| Positional binding, decorative skipped, graceful over/under-supply | Task 1 (`bindTemplate`) + Task 3 (unplaced fallback grid) |
| Equal heights via locked `pageAspect` | Task 1 (constant) + Task 3 (`.album-page` aspect-ratio) |
| Uniform size + flip orientation (`slotBox`) | Task 1 + Task 3 |
| `TEMPLATES` registry + `templateFor` (country incl.) | Task 2 |
| Country spread re-created to match today (regression guard) | Task 2 (`gridTemplate` from the same grid) + Task 3 (manual check) |
| Seeded orientations (00,1,2,3,10–14 + History decoratives landscape) | Task 2 |
| Absolute-position renderer; decorative placeholders; filters fall back | Task 3 |
| One format only (remove grid format) | Task 4 |
| Serialize / export round-trip | Task 5 |
| Dev-only editor: free drag, flip, decorative, pages, size/aspect, autosave, export | Tasks 6–7 |
| Editor stripped from production | Task 6 (DEV guard + dynamic import; verified Step 3) |
| Tests: binding, `slotBox` math, export round-trip, country regression | Tasks 1, 2, 5 |

No gaps.

**2. Placeholder scan:** No "TBD"/"add error handling"/"similar to Task N". Every code step shows complete code; the editor's `try/catch` blocks are concrete (corrupt-draft and clipboard-blocked paths).

**3. Type consistency:** `SectionTemplate`, `TemplateSlot`, `TemplatePage`, `Placement`, `BoundTemplate` are defined once in `layoutGeometry.ts` (Task 1) and imported everywhere else. `templateFor`/`TEMPLATES` (Task 2) names match their uses in Tasks 3, 6, 7. `slotBox` returns `{ leftPct, topPct, widthPct, heightPct }` and every consumer reads those exact keys. `templatesToSource`/`templatesToJSON` names match between Task 5 and Task 7. `clientToPagePercent(clientX, clientY, rect)` signature matches its call in Task 6.

Plan is internally consistent and covers the spec.
