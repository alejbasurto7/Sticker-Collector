import type { Album, Page, PageType, Sticker } from '../types';
import type { SectionTemplate } from './layoutGeometry';
import { realSlotCount } from './layoutGeometry';
import { ALBUM_TYPES, ACTIVE_ALBUM_TYPE_ID } from './albumTypesData';

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
  prefixNumbers?: boolean;    // display only: show numbers code-prefixed (e.g. "CC1")
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
      prefixNumbers: section.prefixNumbers,
      stickerIds,
    });
  }
  // Album.id is the album-type definition id (e.g. '2026-fwc'), NOT the store's
  // per-collection id — collectionStore's DEFAULT_ALBUM_ID is a separate literal.
  // Keep the two decoupled.
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

// The album-type registry data lives in ./albumTypesData — a dedicated module the
// dev-only builder (#/admin/templates) overwrites wholesale on Export. Re-exported
// here so all consumers keep importing ALBUM_TYPES / ACTIVE_ALBUM_TYPE_ID / activeType
// from './albumTypes'.
export { ALBUM_TYPES, ACTIVE_ALBUM_TYPE_ID };
export const activeType: AlbumType = ALBUM_TYPES[ACTIVE_ALBUM_TYPE_ID];

/** Resolve an album type by id, falling back to the active type for unknown/absent
 *  ids (legacy albums and cross-device payloads may carry no albumTypeId). */
export function typeById(albumTypeId: string | undefined): AlbumType {
  return (albumTypeId != null && ALBUM_TYPES[albumTypeId]) || activeType;
}

/**
 * The album type whose layout is currently live (the active album's type). Rebuilt
 * by applyAlbumLayout() so template lookups resolve against the active album's own
 * definition — e.g. an Adrenalyn album no longer borrows the FWC type's templates.
 * Defaults to the active type so non-runtime callers (tests) see the default album.
 */
let currentType: AlbumType = activeType;

/** Point template/layout lookups at the given album type. Called by applyAlbumLayout. */
export function setActiveTypeContext(albumTypeId: string | undefined): void {
  currentType = typeById(albumTypeId);
}

/**
 * The printed-album template for a page, or undefined to use the flow grid. A
 * section uses its template only when the template's real-slot count matches the
 * page's sticker count (so e.g. NA's 12-sticker CC falls back to the flow grid).
 * Resolves against the currently-live album type (see setActiveTypeContext).
 */
export function templateFor(page: Page): SectionTemplate | undefined {
  const section = currentType.sections.find((s) => s.id === page.id);
  if (!section) return undefined;
  const t = currentType.templates[section.templateId];
  if (!t) return undefined;
  return realSlotCount(t) === page.stickerIds.length ? t : undefined;
}

/** True when at least one of these pages maps to a matching printed-album template. */
export function pagesSupportPages(pages: Page[]): boolean {
  return pages.some((p) => templateFor(p) != null);
}
