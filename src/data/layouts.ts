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
// Non-country seed positions are rough (lifted from the old grid) and may overflow the page box until refined in the dev-only template editor; only orientation and the country spread need to be exact here.
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
