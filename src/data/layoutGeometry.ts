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

/** Number of real (non-decorative) slots across a template's pages. */
export function realSlotCount(t: SectionTemplate): number {
  return t.pages.reduce((n, p) => n + p.slots.filter((s) => !s.decorative).length, 0);
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
