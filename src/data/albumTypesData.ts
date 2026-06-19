// Album-type registry DATA. This module is intentionally self-contained so the
// dev-only album-type builder (#/admin/templates) can overwrite it wholesale on
// Export — its "Write to project" action and the downloaded file both have this
// exact shape (`import type { AlbumType }` + ALBUM_TYPES + ACTIVE_ALBUM_TYPE_ID).
// Types and logic live in ./albumTypes, which re-exports these.
import type { AlbumType, SectionDef } from './albumTypes';
import { gridTemplate } from './layoutGeometry';

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

// The non-country templates below are seeded from the old grid: their positions
// are rough and a landscape sticker on column 1 may overflow the page box until
// refined in the dev-only template editor (#/admin/templates). Only orientation
// and the country spread need to be exact.
//
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
