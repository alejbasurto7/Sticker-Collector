import type { AlbumType, AlbumVariant, SectionDef } from '../data/albumTypes';
import { orderedSectionsFor } from '../data/albumTypes';
import type { PageType } from '../types';
import type { SectionTemplate } from '../data/layoutGeometry';
import { STANDARD_PAGE_ASPECT, STANDARD_STICKER_WIDTH_PCT } from '../data/layoutGeometry';

/** The dev-only editor's working copy: the whole registry + which type is active. */
export interface RegistryDraft {
  activeId: string;
  types: Record<string, AlbumType>;
}

/** Deep clone via JSON — every value here is plain data. */
const clone = <T,>(v: T): T => JSON.parse(JSON.stringify(v)) as T;

/** Split a comma-separated label list into trimmed, non-empty tokens. */
export function parseNumbers(input: string): string[] {
  return input.split(',').map((s) => s.trim()).filter((s) => s.length > 0);
}

/** ['1','2',…,'N'] — the "fill 1..N" helper. */
export function fillNumbers(n: number): string[] {
  return Array.from({ length: Math.max(0, Math.floor(n)) }, (_, i) => String(i + 1));
}

/** Parse pasted "code, emoji, title" lines into section seeds (blank lines skipped). */
export function parseBulkLines(input: string): { code: string; emoji: string; title: string }[] {
  return input
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.length > 0)
    .map((line) => {
      const [code = '', emoji = '', ...rest] = line.split(',').map((s) => s.trim());
      return { code, emoji, title: rest.join(', ') };
    });
}

/** A non-colliding id: `base`, else `base-2`, `base-3`, … */
export function uniqueId(base: string, taken: string[]): string {
  const seed = base.trim() || 'item';
  if (!taken.includes(seed)) return seed;
  for (let i = 2; ; i++) {
    const candidate = `${seed}-${i}`;
    if (!taken.includes(candidate)) return candidate;
  }
}

/** An empty single-page template at the standard album geometry. */
export function blankTemplate(id: string): SectionTemplate {
  return {
    id,
    pageAspect: STANDARD_PAGE_ASPECT,
    stickerWidthPct: STANDARD_STICKER_WIDTH_PCT,
    pages: [{ slots: [] }],
  };
}

/** A fresh album type with one default variant and no sections/templates. */
export function newAlbumType(id: string, name: string): AlbumType {
  return {
    id,
    name: name.trim() || id,
    variants: [{ id: 'base', label: 'Base' }],
    defaultVariant: 'base',
    sections: [],
    templates: {},
  };
}

// --- variants -------------------------------------------------------------

export function addVariant(type: AlbumType, variant: AlbumVariant): AlbumType {
  const id = uniqueId(variant.id, type.variants.map((v) => v.id));
  return { ...type, variants: [...type.variants, { ...variant, id }] };
}

export function updateVariant(type: AlbumType, id: string, patch: Partial<AlbumVariant>): AlbumType {
  return {
    ...type,
    variants: type.variants.map((v) => (v.id === id ? { ...v, ...patch, id: v.id } : v)),
  };
}

export function removeVariant(type: AlbumType, id: string): AlbumType {
  if (type.variants.length <= 1) return type; // never drop the last variant
  const variants = type.variants.filter((v) => v.id !== id);
  const defaultVariant = type.defaultVariant === id ? variants[0].id : type.defaultVariant;
  // Drop any per-variant number overrides keyed by the removed variant.
  const sections = type.sections.map((s) => {
    if (!s.numbersByVariant || !(id in s.numbersByVariant)) return s;
    const rest = { ...s.numbersByVariant };
    delete rest[id];
    return { ...s, numbersByVariant: rest };
  });
  // Drop the removed variant's section-order override, if any.
  let sectionOrder = type.sectionOrder;
  if (sectionOrder && id in sectionOrder) {
    const rest = { ...sectionOrder };
    delete rest[id];
    sectionOrder = Object.keys(rest).length ? rest : undefined;
  }
  return { ...type, variants, defaultVariant, sections, sectionOrder };
}

export function setDefaultVariant(type: AlbumType, id: string): AlbumType {
  if (!type.variants.some((v) => v.id === id)) return type;
  return { ...type, defaultVariant: id };
}

// --- sections -------------------------------------------------------------

export function addSection(type: AlbumType): AlbumType {
  const id = uniqueId('section', type.sections.map((s) => s.id));
  const templateId = Object.keys(type.templates)[0] ?? '';
  const section: SectionDef = {
    id, code: '', emoji: '', title: 'New section', type: 'extra',
    templateId, numbers: [], foils: [],
  };
  return { ...type, sections: [...type.sections, section] };
}

export function updateSection(type: AlbumType, sectionId: string, patch: Partial<SectionDef>): AlbumType {
  return {
    ...type,
    sections: type.sections.map((s) => (s.id === sectionId ? { ...s, ...patch, id: s.id } : s)),
  };
}

export function deleteSection(type: AlbumType, sectionId: string): AlbumType {
  const sections = type.sections.filter((s) => s.id !== sectionId);
  let sectionOrder = type.sectionOrder;
  if (sectionOrder) {
    const next: Record<string, string[]> = {};
    for (const [variantId, ids] of Object.entries(sectionOrder)) {
      const kept = ids.filter((id) => id !== sectionId);
      if (kept.length) next[variantId] = kept;
    }
    sectionOrder = Object.keys(next).length ? next : undefined;
  }
  return { ...type, sections, sectionOrder };
}

/** Move the section at `from` to index `to` (clamped); array order = album order. */
export function moveSection(type: AlbumType, from: number, to: number): AlbumType {
  if (from < 0 || from >= type.sections.length) return type;
  const sections = [...type.sections];
  const target = Math.max(0, Math.min(sections.length - 1, to));
  const [moved] = sections.splice(from, 1);
  sections.splice(target, 0, moved);
  return { ...type, sections };
}

/**
 * Move the section at `from` to `to` within one variant's order. The default
 * variant with no override edits the base `sections` array (via moveSection);
 * any other case writes/updates sectionOrder[variantId], seeded from the
 * variant's currently-resolved order. Array order = album order.
 */
export function moveSectionForVariant(
  type: AlbumType, variantId: string, from: number, to: number,
): AlbumType {
  const editsBase = variantId === type.defaultVariant && !type.sectionOrder?.[variantId];
  if (editsBase) return moveSection(type, from, to);
  const ids = orderedSectionsFor(type, variantId).map((s) => s.id);
  if (from < 0 || from >= ids.length) return type;
  const target = Math.max(0, Math.min(ids.length - 1, to));
  const [moved] = ids.splice(from, 1);
  ids.splice(target, 0, moved);
  return { ...type, sectionOrder: { ...type.sectionOrder, [variantId]: ids } };
}

/** Drop a variant's custom section order → it re-inherits the base order. */
export function resetVariantOrder(type: AlbumType, variantId: string): AlbumType {
  if (!type.sectionOrder?.[variantId]) return type;
  const rest = { ...type.sectionOrder };
  delete rest[variantId];
  return { ...type, sectionOrder: Object.keys(rest).length ? rest : undefined };
}

/** Append one section per pasted line, all sharing a template + numbers/foils. */
export function bulkAddSections(
  type: AlbumType,
  lines: { code: string; emoji: string; title: string }[],
  opts: { templateId: string; numbers: string[]; foils: string[]; type: PageType },
): AlbumType {
  const taken = type.sections.map((s) => s.id);
  const sections = [...type.sections];
  for (const line of lines) {
    const id = uniqueId(line.code || 'section', taken);
    taken.push(id);
    sections.push({
      id, code: line.code, emoji: line.emoji, title: line.title, type: opts.type,
      templateId: opts.templateId, numbers: [...opts.numbers], foils: [...opts.foils],
    });
  }
  return { ...type, sections };
}

// --- templates ------------------------------------------------------------

export function newTemplate(type: AlbumType, id: string): AlbumType {
  const finalId = uniqueId(id, Object.keys(type.templates));
  return { ...type, templates: { ...type.templates, [finalId]: blankTemplate(finalId) } };
}

export function cloneTemplate(type: AlbumType, sourceId: string, newId: string): AlbumType {
  const source = type.templates[sourceId];
  if (!source) return type;
  const finalId = uniqueId(newId || `${sourceId}-copy`, Object.keys(type.templates));
  return { ...type, templates: { ...type.templates, [finalId]: { ...clone(source), id: finalId } } };
}

export function deleteTemplate(type: AlbumType, templateId: string): AlbumType {
  const templates = { ...type.templates };
  delete templates[templateId];
  return { ...type, templates };
}

/**
 * Copy a template from one album type into another as an independent duplicate
 * (id auto-renamed on collision). Returns the new registry + the id used.
 */
export function copyTemplateToType(
  types: Record<string, AlbumType>,
  fromTypeId: string,
  templateId: string,
  toTypeId: string,
): { types: Record<string, AlbumType>; newId: string } {
  const source = types[fromTypeId]?.templates[templateId];
  const target = types[toTypeId];
  if (!source || !target) return { types, newId: '' };
  const newId = uniqueId(templateId, Object.keys(target.templates));
  return {
    types: {
      ...types,
      [toTypeId]: {
        ...target,
        templates: { ...target.templates, [newId]: { ...clone(source), id: newId } },
      },
    },
    newId,
  };
}
