import type { Album, Edition, Page, Sticker } from '../types';

/** Per-edition metadata. Only the Coca-Cola extras page size differs. */
export const EDITION_INFO: Record<Edition, { label: string; region: string; ccCount: number }> = {
  na: { label: 'North America', region: '🇺🇸🇲🇽🇨🇦 NA edition', ccCount: 12 },
  latam: { label: 'Latin America', region: '🌎 LATAM edition', ccCount: 14 },
};

export const DEFAULT_EDITION: Edition = 'latam';

/**
 * The real "Usa Mex Can 26" album (2026 48-team World Cup), reconstructed from an
 * actual Figuritas app export. Built from a compact table so ids stay deterministic.
 */

interface IntroDef {
  id: string;
  code: string;
  emoji: string;
  title: string;
  numbers: string[];
}

const INTRO_PAGES: IntroDef[] = [
  { id: 'FWC-trophy', code: 'FWC', emoji: '🏆', title: 'World Cup', numbers: ['00', '1', '2', '3', '4'] },
  { id: 'FWC-world', code: 'FWC', emoji: '🌎', title: 'Host Cities', numbers: ['5', '6', '7', '8'] },
  {
    id: 'FWC-scroll',
    code: 'FWC',
    emoji: '📜',
    title: 'Legends',
    numbers: ['9', '10', '11', '12', '13', '14', '15', '16', '17', '18', '19'],
  },
];

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

const TEAM_STICKER_COUNT = 20;

function buildAlbum(ccCount: number): Album {
  const pages: Page[] = [];
  const stickers: Sticker[] = [];

  for (const intro of INTRO_PAGES) {
    const stickerIds: string[] = [];
    for (const number of intro.numbers) {
      const id = `${intro.id}-${number}`;
      // Trophy/badge page is foil; numbers 1-4 there are the shiny crests.
      const special = intro.emoji === '🏆';
      stickers.push({ id, number, pageId: intro.id, special });
      stickerIds.push(id);
    }
    pages.push({
      id: intro.id,
      code: intro.code,
      emoji: intro.emoji,
      title: intro.title,
      type: 'intro',
      stickerIds,
    });
  }

  for (const team of TEAMS) {
    const stickerIds: string[] = [];
    for (let n = 1; n <= TEAM_STICKER_COUNT; n++) {
      const number = String(n);
      const id = `${team.code}-${number}`;
      // First sticker of each team is the foil crest.
      const special = n === 1;
      stickers.push({ id, number, pageId: team.code, special });
      stickerIds.push(id);
    }
    pages.push({
      id: team.code,
      code: team.code,
      emoji: team.emoji,
      title: team.title,
      type: 'team',
      stickerIds,
    });
  }

  // Coca-Cola extras section (size depends on edition), shown after the teams.
  const ccIds: string[] = [];
  for (let n = 1; n <= ccCount; n++) {
    const number = String(n);
    const id = `CC-${number}`;
    stickers.push({ id, number, pageId: 'CC', special: false });
    ccIds.push(id);
  }
  pages.push({
    id: 'CC',
    code: 'CC',
    emoji: '🥤',
    title: 'Coca-Cola',
    type: 'extra',
    stickerIds: ccIds,
  });

  return { id: 'usa-mex-can-26', name: 'Usa Mex Can 26', pages, stickers };
}

// Live module bindings: rebuilt by applyEdition() and read fresh on each render/call.
export let album: Album = buildAlbum(EDITION_INFO[DEFAULT_EDITION].ccCount);

/** Lookup helpers, rebuilt alongside the album. */
export let stickerById: Record<string, Sticker> = indexStickers(album);
export let pageById: Record<string, Page> = indexPages(album);

function indexStickers(a: Album): Record<string, Sticker> {
  return Object.fromEntries(a.stickers.map((s) => [s.id, s]));
}
function indexPages(a: Album): Record<string, Page> {
  return Object.fromEntries(a.pages.map((p) => [p.id, p]));
}

/** Rebuild the album for the given edition. Existing count data is unaffected. */
export function applyEdition(edition: Edition): void {
  album = buildAlbum(EDITION_INFO[edition].ccCount);
  stickerById = indexStickers(album);
  pageById = indexPages(album);
}

/**
 * Resolve a sticker id from an import line. Intro lines share code "FWC" but split
 * across three pages by emoji, so we also match the emoji when provided; otherwise
 * we fall back to whichever FWC page contains that number.
 */
export function resolveStickerId(
  code: string,
  emoji: string,
  number: string,
): string | undefined {
  const normCode = code.trim().toUpperCase();
  const normNum = number.trim();

  if (normCode === 'FWC') {
    const byEmoji = INTRO_PAGES.find(
      (p) => p.emoji === emoji.trim() && p.numbers.includes(normNum),
    );
    const target = byEmoji ?? INTRO_PAGES.find((p) => p.numbers.includes(normNum));
    if (!target) return undefined;
    const id = `${target.id}-${normNum}`;
    return stickerById[id] ? id : undefined;
  }

  const id = `${normCode}-${normNum}`;
  return stickerById[id] ? id : undefined;
}
