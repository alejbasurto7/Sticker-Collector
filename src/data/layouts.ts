import type { Page } from '../types';

/**
 * Declarative section layouts that mirror the printed Panini album, so a user
 * can eye the real pages against the app while tapping. Each section is one or
 * more printed pages; cells are placed on a per-page grid by 1-based column and
 * row. This replaces the hardcoded country arrays that used to live in
 * PageSection, and is the format a future visual layout editor would read/write.
 */

/** One cell on a printed page. `col`/`row` are 1-based grid coordinates. */
export interface LayoutCell {
  /**
   * 1-based position within the section's `stickerIds` (album order). Omitted
   * for decorative cells, which are not real stickers.
   */
  index?: number;
  col: number;
  row: number;
  colSpan?: number;
  rowSpan?: number;
  /** Wide/rotated foil (e.g. the country spread's sticker 13). */
  landscape?: boolean;
  /**
   * Pre-printed picture, not a collectible sticker: rendered as a disabled,
   * numberless placeholder (no tap/long-press, never counted). Used by the
   * History section, where pre-printed team photos sit among the folios.
   */
  decorative?: boolean;
}

/** A single printed page. A spread is two of these rendered side by side. */
export interface LayoutPage {
  cols: number;
  rows: number;
  /** Cells on this page; blank slots are simply omitted. */
  cells: LayoutCell[];
}

/** A full section layout: printed pages left → right, top spread → bottom. */
export interface SectionLayout {
  /** Stable key, e.g. 'country-spread', 'fwc-specials'. */
  id: string;
  pages: LayoutPage[];
}

/**
 * Country (team) spread — identical for all 48 teams, mirroring the printed
 * album: two 4×3 pages, stickers 1–10 on the left and 11–20 on the right.
 * Sticker 13 is the same foil turned landscape, spanning the right page's last
 * two columns. (Lifted verbatim from the former LEFT_LAYOUT/RIGHT_LAYOUT.)
 */
const COUNTRY_SPREAD: SectionLayout = {
  id: 'country-spread',
  pages: [
    {
      cols: 4,
      rows: 3,
      cells: [
        { index: 1, col: 3, row: 1 },
        { index: 2, col: 4, row: 1 },
        { index: 3, col: 1, row: 2 },
        { index: 4, col: 2, row: 2 },
        { index: 5, col: 3, row: 2 },
        { index: 6, col: 4, row: 2 },
        { index: 7, col: 1, row: 3 },
        { index: 8, col: 2, row: 3 },
        { index: 9, col: 3, row: 3 },
        { index: 10, col: 4, row: 3 },
      ],
    },
    {
      cols: 4,
      rows: 3,
      cells: [
        { index: 11, col: 1, row: 1 },
        { index: 12, col: 2, row: 1 },
        { index: 13, col: 3, row: 1, colSpan: 2, landscape: true },
        { index: 14, col: 1, row: 2 },
        { index: 15, col: 2, row: 2 },
        { index: 16, col: 3, row: 2 },
        { index: 17, col: 4, row: 2 },
        { index: 18, col: 2, row: 3 },
        { index: 19, col: 3, row: 3 },
        { index: 20, col: 4, row: 3 },
      ],
    },
  ],
};

/**
 * Specials (FWC-trophy): stickers 00,1,2,3,4 — index 1=00, 2=1, … 5=4.
 * Left page holds only the foil 00; the right page's top row is the large
 * trophy split across two cells (1,2) plus the mascots (3) and the holographic
 * emblem (4).
 */
const FWC_SPECIALS: SectionLayout = {
  id: 'fwc-specials',
  pages: [
    { cols: 4, rows: 1, cells: [{ index: 1, col: 1, row: 1 }] },
    {
      cols: 4,
      rows: 1,
      cells: [
        { index: 2, col: 1, row: 1 },
        { index: 3, col: 2, row: 1 },
        { index: 4, col: 3, row: 1 },
        { index: 5, col: 4, row: 1 },
      ],
    },
  ],
};

/**
 * Ball and Countries (FWC-world): stickers 5,6,7,8 — index 1=5 … 4=8.
 * Left page: Official Ball (5) and CAN host emblem (6). Right page: the foil
 * "Ball & Flags" sticker (7) and the USA/MEX host emblem (8). 4-column pages
 * keep every sticker the same size as a country sticker.
 */
const FWC_BALL_COUNTRIES: SectionLayout = {
  id: 'fwc-ball-countries',
  pages: [
    {
      cols: 4,
      rows: 1,
      cells: [
        { index: 1, col: 1, row: 1 },
        { index: 2, col: 3, row: 1 },
      ],
    },
    {
      cols: 4,
      rows: 1,
      cells: [
        { index: 3, col: 1, row: 1 },
        { index: 4, col: 3, row: 1 },
      ],
    },
  ],
};

/**
 * Coca-Cola — LATAM edition (14 stickers). 4-column pages (matching the country
 * sections) keep every sticker the same size. Left page: CC1–6 in two columns
 * (1–3 / 4–6). Right page: CC7–14 in three columns (7–9 / 10–12 / 13–14).
 */
const CC_LATAM: SectionLayout = {
  id: 'cc-latam',
  pages: [
    {
      cols: 4,
      rows: 3,
      cells: [
        { index: 1, col: 1, row: 1 },
        { index: 2, col: 1, row: 2 },
        { index: 3, col: 1, row: 3 },
        { index: 4, col: 2, row: 1 },
        { index: 5, col: 2, row: 2 },
        { index: 6, col: 2, row: 3 },
      ],
    },
    {
      cols: 4,
      rows: 3,
      cells: [
        { index: 7, col: 1, row: 1 },
        { index: 8, col: 1, row: 2 },
        { index: 9, col: 1, row: 3 },
        { index: 10, col: 2, row: 1 },
        { index: 11, col: 2, row: 2 },
        { index: 12, col: 2, row: 3 },
        { index: 13, col: 3, row: 1 },
        { index: 14, col: 3, row: 2 },
      ],
    },
  ],
};

/**
 * History (FWC-scroll): folios 9–19 across two spreads (four printed pages).
 * Each tournament is a champion team photo; the collectible folios are 11 of
 * them, interleaved with pre-printed team photos (rendered as decorative,
 * numberless placeholders). Folio → index: 9→1, 10→2, … 19→11.
 *
 * Folio map (confirmed with user): 9=1934, 10=1950, 11=1954, 12=1962, 13=1974,
 * 14=1986, 15=1994, 16=2002, 17=2006, 18=2014, 19=2022.
 */
const D = (col: number, row: number): LayoutCell => ({ col, row, decorative: true });

const FWC_HISTORY: SectionLayout = {
  id: 'fwc-history',
  // 4-column pages keep History's team-photo cells the same size as country
  // stickers; each page fills the columns its tournament blocks occupy.
  pages: [
    // Page 1 (2 block columns): 1930(D) 1934(F9) / 1938(D) 1950(F10)
    {
      cols: 4,
      rows: 2,
      cells: [
        D(1, 1), // 1930
        { index: 1, col: 2, row: 1 }, // 9 — 1934
        D(1, 2), // 1938
        { index: 2, col: 2, row: 2 }, // 10 — 1950
      ],
    },
    // Page 2 (3 block columns): 1954(F11) 1958(D) 1962(F12) / 1966(D) 1970(D) 1974(F13)
    {
      cols: 4,
      rows: 2,
      cells: [
        { index: 3, col: 1, row: 1 }, // 11 — 1954
        D(2, 1), // 1958
        { index: 4, col: 3, row: 1 }, // 12 — 1962
        D(1, 2), // 1966
        D(2, 2), // 1970
        { index: 5, col: 3, row: 2 }, // 13 — 1974
      ],
    },
    // Page 3 (3 block columns): 1978(D) 1982(D) 1986(F14) / 1990(D) 1994(F15) 1998(D)
    {
      cols: 4,
      rows: 2,
      cells: [
        D(1, 1), // 1978
        D(2, 1), // 1982
        { index: 6, col: 3, row: 1 }, // 14 — 1986
        D(1, 2), // 1990
        { index: 7, col: 2, row: 2 }, // 15 — 1994
        D(3, 2), // 1998
      ],
    },
    // Page 4 (3 block columns): 2002(F16) 2006(F17) 2010(D) / 2014(F18) 2018(D) 2022(F19)
    {
      cols: 4,
      rows: 2,
      cells: [
        { index: 8, col: 1, row: 1 }, // 16 — 2002
        { index: 9, col: 2, row: 1 }, // 17 — 2006
        D(3, 1), // 2010
        { index: 10, col: 1, row: 2 }, // 18 — 2014
        D(2, 2), // 2018
        { index: 11, col: 3, row: 2 }, // 19 — 2022
      ],
    },
  ],
};

/**
 * Resolve the printed-album layout for a page, or `undefined` to fall back to
 * the responsive flow grid. The CC template only applies to the 14-sticker
 * LATAM page (the edition we have a photo for); the 12-sticker NA page keeps
 * the flow grid until its layout is captured.
 */
export function layoutFor(page: Page): SectionLayout | undefined {
  if (page.type === 'team') return COUNTRY_SPREAD;
  switch (page.id) {
    case 'FWC-trophy':
      return FWC_SPECIALS;
    case 'FWC-world':
      return FWC_BALL_COUNTRIES;
    case 'FWC-scroll':
      return FWC_HISTORY;
    case 'CC':
      return page.stickerIds.length === 14 ? CC_LATAM : undefined;
    default:
      return undefined;
  }
}
