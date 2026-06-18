import type { Album, Page, PageType, Sticker } from '../types';
import type { SectionTemplate } from './layoutGeometry';
import { gridTemplate, realSlotCount } from './layoutGeometry';

export interface AlbumVariant {
  id: string;
  label: string;
  region?: string;
}

export interface SectionDef {
  id: string;
  code: string;
  emoji: string;
  title: string;
  type: PageType;
  templateId: string;
  numbers: string[];          // printed labels in order
  foils: string[];            // subset of `numbers` that are foil/special
  optional?: boolean;         // opt-in section (excluded unless enabled)
  numbersByVariant?: Record<string, string[]>; // per-variant override of `numbers`
}

export interface AlbumType {
  id: string;
  name: string;
  variants: AlbumVariant[];
  defaultVariant: string;
  sections: SectionDef[];     // album order
  templates: Record<string, SectionTemplate>;
}

/** Resolve a section's numbers for a variant (override or base). */
function numbersFor(section: SectionDef, variant: string): string[] {
  return section.numbersByVariant?.[variant] ?? section.numbers;
}

/**
 * Build the live Album from a definition: walk sections in order, skipping any
 * `optional` section not listed in `enabledOptional`; each kept section becomes
 * one Page plus its Stickers (id `${section.id}-${number}`, special from foils).
 */
export function buildAlbumFromType(
  type: AlbumType,
  opts: { variant: string; enabledOptional: string[] },
): Album {
  const pages: Page[] = [];
  const stickers: Sticker[] = [];
  for (const section of type.sections) {
    if (section.optional && !opts.enabledOptional.includes(section.id)) continue;
    const numbers = numbersFor(section, opts.variant);
    const stickerIds: string[] = [];
    for (const number of numbers) {
      const id = `${section.id}-${number}`;
      stickers.push({ id, number, pageId: section.id, special: section.foils.includes(number) });
      stickerIds.push(id);
    }
    pages.push({
      id: section.id,
      code: section.code,
      emoji: section.emoji,
      title: section.title,
      type: section.type,
      stickerIds,
    });
  }
  return { id: type.id, name: type.name, pages, stickers };
}

/**
 * Derive the legacy EDITION_INFO shape from a type's variants + its optional CC
 * section, so the existing Settings/Edition UI keeps working off the definition.
 */
export function editionInfoFor(
  type: AlbumType,
): Record<string, { label: string; region: string; ccCount: number }> {
  const cc = type.sections.find((s) => s.id === 'CC');
  const ccCount = (variant: string) => (cc ? numbersFor(cc, variant).length : 0);
  return Object.fromEntries(
    type.variants.map((v) => [v.id, { label: v.label, region: v.region ?? '', ccCount: ccCount(v.id) }]),
  );
}

// ---------------------------------------------------------------------------
// 2026-FWC album type definition
// ---------------------------------------------------------------------------

interface TeamDef {
  code: string;
  emoji: string;
  title: string;
}

// 48 national teams, in the exact order of the export.
const TEAMS: TeamDef[] = [
  { code: 'MEX', emoji: '🇲🇽', title: 'Mexico' },
  { code: 'RSA', emoji: '🇿🇦', title: 'South Africa' },
  { code: 'KOR', emoji: '🇰🇷', title: 'South Korea' },
  { code: 'CZE', emoji: '🇨🇿', title: 'Czechia' },
  { code: 'CAN', emoji: '🇨🇦', title: 'Canada' },
  { code: 'BIH', emoji: '🇧🇦', title: 'Bosnia & Herzegovina' },
  { code: 'QAT', emoji: '🇶🇦', title: 'Qatar' },
  { code: 'SUI', emoji: '🇨🇭', title: 'Switzerland' },
  { code: 'BRA', emoji: '🇧🇷', title: 'Brazil' },
  { code: 'MAR', emoji: '🇲🇦', title: 'Morocco' },
  { code: 'HAI', emoji: '🇭🇹', title: 'Haiti' },
  { code: 'SCO', emoji: '🏴󠁧󠁢󠁳󠁣󠁴󠁿', title: 'Scotland' },
  { code: 'USA', emoji: '🇺🇸', title: 'United States' },
  { code: 'PAR', emoji: '🇵🇾', title: 'Paraguay' },
  { code: 'AUS', emoji: '🇦🇺', title: 'Australia' },
  { code: 'TUR', emoji: '🇹🇷', title: 'Turkey' },
  { code: 'GER', emoji: '🇩🇪', title: 'Germany' },
  { code: 'CUW', emoji: '🇨🇼', title: 'Curaçao' },
  { code: 'CIV', emoji: '🇨🇮', title: "Côte d'Ivoire" },
  { code: 'ECU', emoji: '🇪🇨', title: 'Ecuador' },
  { code: 'NED', emoji: '🇳🇱', title: 'Netherlands' },
  { code: 'JPN', emoji: '🇯🇵', title: 'Japan' },
  { code: 'SWE', emoji: '🇸🇪', title: 'Sweden' },
  { code: 'TUN', emoji: '🇹🇳', title: 'Tunisia' },
  { code: 'BEL', emoji: '🇧🇪', title: 'Belgium' },
  { code: 'EGY', emoji: '🇪🇬', title: 'Egypt' },
  { code: 'IRN', emoji: '🇮🇷', title: 'Iran' },
  { code: 'NZL', emoji: '🇳🇿', title: 'New Zealand' },
  { code: 'ESP', emoji: '🇪🇸', title: 'Spain' },
  { code: 'CPV', emoji: '🇨🇻', title: 'Cape Verde' },
  { code: 'KSA', emoji: '🇸🇦', title: 'Saudi Arabia' },
  { code: 'URU', emoji: '🇺🇾', title: 'Uruguay' },
  { code: 'FRA', emoji: '🇫🇷', title: 'France' },
  { code: 'SEN', emoji: '🇸🇳', title: 'Senegal' },
  { code: 'IRQ', emoji: '🇮🇶', title: 'Iraq' },
  { code: 'NOR', emoji: '🇳🇴', title: 'Norway' },
  { code: 'ARG', emoji: '🇦🇷', title: 'Argentina' },
  { code: 'ALG', emoji: '🇩🇿', title: 'Algeria' },
  { code: 'AUT', emoji: '🇦🇹', title: 'Austria' },
  { code: 'JOR', emoji: '🇯🇴', title: 'Jordan' },
  { code: 'POR', emoji: '🇵🇹', title: 'Portugal' },
  { code: 'COD', emoji: '🇨🇩', title: 'DR Congo' },
  { code: 'UZB', emoji: '🇺🇿', title: 'Uzbekistan' },
  { code: 'COL', emoji: '🇨🇴', title: 'Colombia' },
  { code: 'ENG', emoji: '🏴󠁧󠁢󠁥󠁮󠁧󠁿', title: 'England' },
  { code: 'CRO', emoji: '🇭🇷', title: 'Croatia' },
  { code: 'GHA', emoji: '🇬🇭', title: 'Ghana' },
  { code: 'PAN', emoji: '🇵🇦', title: 'Panama' },
];

/**
 * Free-position section templates that mirror the printed Panini album. Moved
 * from layouts.ts so the AlbumType owns all its layout data.
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

const TEAM_NUMBERS = Array.from({ length: 20 }, (_, i) => String(i + 1));
const HISTORY_NUMBERS = Array.from({ length: 11 }, (_, i) => String(i + 9)); // 9..19
const CC_NUMBERS_LATAM = Array.from({ length: 14 }, (_, i) => String(i + 1));
const CC_NUMBERS_NA = Array.from({ length: 12 }, (_, i) => String(i + 1));
const CC_AFTER_TEAM = 'TUN';

const teamSection = (t: TeamDef): SectionDef => ({
  id: t.code, code: t.code, emoji: t.emoji, title: t.title, type: 'team',
  templateId: 'country-spread', numbers: TEAM_NUMBERS, foils: ['1'],
});

const ccIndex = TEAMS.findIndex((t) => t.code === CC_AFTER_TEAM) + 1;

const FWC_SECTIONS: SectionDef[] = [
  { id: 'FWC-trophy', code: 'FWC', emoji: '🏆', title: 'Specials', type: 'intro',
    templateId: 'fwc-specials', numbers: ['00', '1', '2', '3', '4'], foils: ['00', '1', '2', '3', '4'] },
  { id: 'FWC-world', code: 'FWC', emoji: '🌎', title: 'Ball and Countries', type: 'intro',
    templateId: 'fwc-ball-countries', numbers: ['5', '6', '7', '8'], foils: ['5', '6', '7', '8'] },
  ...TEAMS.slice(0, ccIndex).map(teamSection),
  { id: 'CC', code: 'CC', emoji: '🥤', title: 'Coca-Cola', type: 'extra',
    templateId: 'cc-latam', optional: true, numbers: CC_NUMBERS_LATAM, foils: [],
    numbersByVariant: { na: CC_NUMBERS_NA } },
  ...TEAMS.slice(ccIndex).map(teamSection),
  { id: 'FWC-scroll', code: 'FWC', emoji: '📜', title: 'History', type: 'intro',
    templateId: 'fwc-history', numbers: HISTORY_NUMBERS, foils: HISTORY_NUMBERS },
];

const FWC: AlbumType = {
  id: '2026-fwc',
  name: 'Usa Mex Can 26',
  variants: [
    { id: 'na', label: 'North America', region: '🇺🇸🇲🇽🇨🇦 NA edition' },
    { id: 'latam', label: 'Latin America', region: '🌎 LATAM edition' },
  ],
  defaultVariant: 'latam',
  sections: FWC_SECTIONS,
  templates: {
    'country-spread': COUNTRY_SPREAD,
    'fwc-specials': FWC_SPECIALS,
    'fwc-ball-countries': FWC_BALL_COUNTRIES,
    'cc-latam': CC_LATAM,
    'fwc-history': FWC_HISTORY,
  },
};

export const ALBUM_TYPES: Record<string, AlbumType> = { '2026-fwc': FWC };
export const ACTIVE_ALBUM_TYPE_ID = '2026-fwc';
export const activeType: AlbumType = ALBUM_TYPES[ACTIVE_ALBUM_TYPE_ID];

/**
 * The printed-album template for a page, or undefined to use the flow grid. A
 * section uses its template only when the template's real-slot count matches the
 * page's sticker count (so e.g. NA's 12-sticker CC falls back to the flow grid).
 */
export function templateFor(page: Page): SectionTemplate | undefined {
  const section = activeType.sections.find((s) => s.id === page.id);
  if (!section) return undefined;
  const t = activeType.templates[section.templateId];
  if (!t) return undefined;
  return realSlotCount(t) === page.stickerIds.length ? t : undefined;
}
