import type { Album, Edition, Page, Sticker } from '../types';
import type { SectionDef } from './albumTypes';
import { activeType, buildAlbumFromType, editionInfoFor } from './albumTypes';

/** Per-edition metadata, derived from the active type's variants + CC section. */
export const EDITION_INFO = editionInfoFor(activeType) as Record<
  Edition,
  { label: string; region: string; ccCount: number }
>;

/** Default edition = the active type's default variant. */
export const DEFAULT_EDITION: Edition = activeType.defaultVariant as Edition;

/** A new album does not track the Coca-Cola extras section until the user opts in. */
export const DEFAULT_TRACK_CC = false;

/** Emoji used for the Coca-Cola section, reused by the Settings switch. */
export const CC_EMOJI = activeType.sections.find((s) => s.id === 'CC')?.emoji ?? '🥤';

/** Optional sections enabled by the CC toggle (the FWC type's one optional section). */
const enabledOptional = (trackCC: boolean): string[] => (trackCC ? ['CC'] : []);

// Live module bindings: rebuilt by applyEdition() and read fresh on each render/call.
export let album: Album = buildAlbumFromType(activeType, {
  variant: DEFAULT_EDITION,
  enabledOptional: enabledOptional(DEFAULT_TRACK_CC),
});

/** Lookup helpers, rebuilt alongside the album. */
export let stickerById: Record<string, Sticker> = indexStickers(album);
export let pageById: Record<string, Page> = indexPages(album);

function indexStickers(a: Album): Record<string, Sticker> {
  return Object.fromEntries(a.stickers.map((s) => [s.id, s]));
}
function indexPages(a: Album): Record<string, Page> {
  return Object.fromEntries(a.pages.map((p) => [p.id, p]));
}

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

/** Order/accent/punctuation-insensitive key for a country name ("Congo DR" ↔ "DR Congo"). */
function nameKey(s: string): string {
  return s
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '') // strip diacritics (Côte → Cote)
    .toLowerCase()
    .split(/[^a-z0-9]+/) // words only — drops flags, punctuation, spacing
    .filter(Boolean)
    .sort()
    .join(' ');
}

/**
 * Resolve which album section a free-form import label points at. The label may
 * be a flag emoji (🇲🇽 / 🏴󠁧󠁢󠁳󠁣󠁴󠁿), a country code (MEX), a country name
 * (Congo DR ↔ DR Congo), or any mix (GHA🇬🇭). Matching is tried flag → code →
 * name. When several sections share a match — the FWC intro pages all use code
 * "FWC" — the `number` picks the one that actually contains it.
 */
function findSection(label: string, number: string): SectionDef | undefined {
  const sections = activeType.sections;
  const num = number.trim();
  const holdsNumber = (s: SectionDef) => Boolean(stickerById[`${s.id}-${num}`]);
  // The label's ASCII letters (GHA🇬🇭 → GHA, "Congo DR" → CONGODR).
  const code = label.replace(/[^a-z]/gi, '').toUpperCase();

  // 1. Flag/emoji — does the label contain a section's emoji verbatim?
  let candidates = sections.filter((s) => s.emoji && label.includes(s.emoji));

  // 2. Country code.
  if (candidates.length === 0 && code) {
    candidates = sections.filter((s) => s.code.toUpperCase() === code);
  }

  // 3. Country name — order/accent-insensitive title match.
  if (candidates.length === 0) {
    const key = nameKey(label);
    if (key) candidates = sections.filter((s) => nameKey(s.title) === key);
  }

  // The FWC intro pages share code "FWC" but each carries a distinct emoji and a
  // disjoint number range (trophy 00–4, ball 5–8, history 9–19). A hand-typed
  // list often files every FWC special under one emoji ("FWC 🏆: 1, 6, 14"), so
  // an emoji/name match can land on a single section that doesn't hold the
  // number — dropping it. When no current candidate holds the number, widen to
  // every same-code section and let the number, which is unambiguous across the
  // siblings, decide.
  if (code && !candidates.some(holdsNumber)) {
    const sameCode = sections.filter((s) => s.code.toUpperCase() === code);
    if (sameCode.length > 1 && sameCode.some(holdsNumber)) candidates = sameCode;
  }

  if (candidates.length <= 1) return candidates[0];
  // Shared code/emoji (FWC intros): pick whichever section holds the number.
  return candidates.find(holdsNumber) ?? candidates[0];
}

/**
 * Resolve a sticker id from a free-form import label + number. See findSection
 * for the accepted label forms (flag emoji, code, country name, or a mix).
 */
export function resolveStickerIdFromLabel(label: string, number: string): string | undefined {
  const section = findSection(label, number);
  if (!section) return undefined;
  const id = `${section.id}-${number.trim()}`;
  return stickerById[id] ? id : undefined;
}

/**
 * Resolve a sticker id from a separate code + emoji + number. Thin wrapper over
 * resolveStickerIdFromLabel kept for callers that hold the parts apart (qr.ts).
 */
export function resolveStickerId(
  code: string,
  emoji: string,
  number: string,
): string | undefined {
  return resolveStickerIdFromLabel(`${code} ${emoji}`.trim(), number);
}
