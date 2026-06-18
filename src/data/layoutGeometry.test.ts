import { describe, it, expect } from 'vitest';
import {
  slotBox,
  bindTemplate,
  gridTemplate,
  clientToPagePercent,
  realSlotCount,
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

describe('realSlotCount', () => {
  it('counts non-decorative slots across pages', () => {
    const t = {
      id: 'x', pageAspect: 1, stickerWidthPct: 20,
      pages: [
        { slots: [{ x: 0, y: 0, orientation: 'portrait' as const }, { x: 0, y: 0, orientation: 'landscape' as const, decorative: true }] },
        { slots: [{ x: 0, y: 0, orientation: 'portrait' as const }] },
      ],
    };
    expect(realSlotCount(t)).toBe(2);
  });
});
