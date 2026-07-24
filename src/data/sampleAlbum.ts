import type { Album, Edition, Page, Sticker } from '../types';
import type { AlbumType, SectionDef } from './albumTypes';
import { activeType, buildAlbumFromType, typeById, setActiveTypeContext } from './albumTypes';

/** Default variant = the active type's default (fallback for the top-level mirror). */
export const DEFAULT_EDITION: Edition = activeType.defaultVariant;

/** A new album does not track opt-in extra sections (e.g. Coca-Cola) until the user asks. */
export const DEFAULT_TRACK_CC = false;

/** Ids of a type's opt-in sections, enabled only while `trackCC` is on (else none).
 *  For the FWC type this is `['CC']`; a type with no optional section yields `[]`. */
const enabledOptional = (type: AlbumType, trackCC: boolean): string[] =>
  trackCC ? type.sections.filter((s) => s.optional).map((s) => s.id) : [];

// The album type whose layout is currently live at the top level (the active album's
// type). Kept in step with albumTypes' currentType so the import resolver matches the
// right section set. Rebuilt by applyAlbumLayout().
let liveType: AlbumType = activeType;

// Live module bindings: rebuilt by applyAlbumLayout() and read fresh on each render/call.
export let album: Album = buildAlbumFor(activeType.id, DEFAULT_EDITION, DEFAULT_TRACK_CC);

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
 * Rebuild the live album for the given album type + variant + opt-in tracking, and
 * point template/import lookups at that type. Existing count data is unaffected.
 */
export function applyAlbumLayout(albumTypeId: string | undefined, variant: Edition, trackCC: boolean): void {
  liveType = typeById(albumTypeId);
  setActiveTypeContext(albumTypeId);
  album = buildAlbumFor(albumTypeId, variant, trackCC);
  stickerById = indexStickers(album);
  pageById = indexPages(album);
}

/** Build an album layout for an arbitrary type + variant + tracking, without mutating
 *  the live `album` singleton. Used by per-album stats for parked albums. */
export function buildAlbumFor(albumTypeId: string | undefined, variant: Edition, trackCC: boolean): Album {
  const type = typeById(albumTypeId);
  return buildAlbumFromType(type, { variant, enabledOptional: enabledOptional(type, trackCC) });
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
  const sections = liveType.sections;
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
