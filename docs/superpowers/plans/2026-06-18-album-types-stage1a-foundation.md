# Album Types — Stage 1A (Definition-Driven Build) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the hardcoded 2026-FWC album + `templateFor` switch with a first-class, definition-driven model — an `AlbumType` (variants + sections referencing per-type shared templates + optional sections) that a generic builder turns into the live album — with **identical behaviour** for the existing album.

**Architecture:** A new `src/data/albumTypes.ts` holds the definition types, the `2026-fwc` `AlbumType` (variants, sections assembled from the team/intro/CC data, and the templates moved out of `layouts.ts`), a pure `buildAlbumFromType()`, and a `templateFor()` resolver. `sampleAlbum.ts` slims to the live-album layer that calls the builder; `layouts.ts` becomes a thin back-compat shim so the existing renderer, editor, and tests keep working untouched. This plan is **Stage 1A (the foundation)** — it adds no new user-facing UI; the album-type builder UI is **Stage 1B**, a separate plan written afterward.

**Tech Stack:** React 18, TypeScript, Zustand, Vite, Vitest (node environment, pure-function tests only).

## Global Constraints

- **Behaviour-preserving:** the live album for the active `2026-fwc` type must be **identical** to today — same page ids, sticker ids, `special` flags, section order, and per-edition counts (base 980; NA +12 CC = 992; LATAM +14 CC = 994; CC omitted when not tracked). This is the regression guard.
- **Section order (exact):** Specials, Ball and Countries, teams MEX→TUN (24), **CC** (after TUN), teams BEL→PAN (24), History (last).
- **Sticker foils (verbatim):** every intro section (Specials `00,1,2,3,4`; Ball `5,6,7,8`; History `9..19`) is **all foil**; each team's foil is **`'1'`**; CC has **no foils**.
- **Variants:** `2026-fwc` has variants `na` (label `North America`, region `🇺🇸🇲🇽🇨🇦 NA edition`) and `latam` (label `Latin America`, region `🌎 LATAM edition`); **default `latam`**. CC numbers: base/LATAM `'1'..'14'`, NA override `'1'..'12'`.
- **Template gate (verbatim rule):** a section renders with its template **only when `realSlotCount(template) === page.stickerIds.length`**, else the flow grid. This preserves today's "CC uses `cc-latam` only at 14 stickers, NA(12) falls back to flow grid."
- **Preserve these exports** (consumed elsewhere — do not rename): from `sampleAlbum.ts` — `album`, `stickerById`, `pageById`, `applyEdition`, `resolveStickerId`, `EDITION_INFO`, `DEFAULT_EDITION`, `DEFAULT_TRACK_CC`, `CC_EMOJI`; from `layouts.ts` — `TEMPLATES`, `templateFor`, and the `SectionTemplate`/`TemplateSlot`/`TemplatePage` type re-exports.
- **Test command:** `npm test` (Vitest, node env, `src/**/*.test.ts`). Build: `npm run build` (`tsc -b && vite build`). Run the full build + suite before each commit.
- **Branch:** `claude/album-types-stage1`.

---

## File Structure

- **Create** `src/data/albumTypes.ts` — definition types (`AlbumVariant`, `SectionDef`, `AlbumType`); pure `buildAlbumFromType()` + `editionInfoFor()`; the `2026-fwc` definition (variants, sections, templates); `ALBUM_TYPES`, `ACTIVE_ALBUM_TYPE_ID`, `activeType`; `templateFor()`.
- **Create** `src/data/albumTypes.test.ts` — pure tests for the builder, the resolver, edition derivation, and the regression vs. today's album.
- **Modify** `src/data/layoutGeometry.ts` — add pure `realSlotCount()`.
- **Modify** `src/data/layoutGeometry.test.ts` — test `realSlotCount()`.
- **Modify** `src/data/layouts.ts` — slim to a shim (move the 5 template constants into `albumTypes.ts`; re-export `templateFor`; alias `TEMPLATES`).
- **Modify** `src/data/sampleAlbum.ts` — slim to the live-album layer driven by `buildAlbumFromType(activeType, …)`; derive `EDITION_INFO`; refactor `resolveStickerId`.

---

## Task 1: Pure builder, edition derivation, and `realSlotCount`

**Files:**
- Create: `src/data/albumTypes.ts` (types + `buildAlbumFromType` + `editionInfoFor` only — no FWC data yet)
- Modify: `src/data/layoutGeometry.ts` (add `realSlotCount`)
- Test: `src/data/albumTypes.test.ts`, `src/data/layoutGeometry.test.ts`

**Interfaces:**
- Consumes: `SectionTemplate` from `./layoutGeometry`; `Album`, `Page`, `Sticker`, `PageType` from `../types`.
- Produces (used by Tasks 2–3):
  - `interface AlbumVariant { id: string; label: string; region?: string }`
  - `interface SectionDef { id: string; code: string; emoji: string; title: string; type: PageType; templateId: string; numbers: string[]; foils: string[]; optional?: boolean; numbersByVariant?: Record<string, string[]> }`
  - `interface AlbumType { id: string; name: string; variants: AlbumVariant[]; defaultVariant: string; sections: SectionDef[]; templates: Record<string, SectionTemplate> }`
  - `buildAlbumFromType(type: AlbumType, opts: { variant: string; enabledOptional: string[] }): Album`
  - `editionInfoFor(type: AlbumType): Record<string, { label: string; region: string; ccCount: number }>`
  - `realSlotCount(t: SectionTemplate): number` (in `layoutGeometry.ts`)

- [ ] **Step 1: Write the failing tests**

Append to `src/data/layoutGeometry.test.ts`:

```ts
import { realSlotCount } from './layoutGeometry';

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
```

Create `src/data/albumTypes.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { buildAlbumFromType, editionInfoFor, type AlbumType } from './albumTypes';

const FIXTURE: AlbumType = {
  id: 'demo',
  name: 'Demo',
  variants: [
    { id: 'na', label: 'NA', region: 'na-region' },
    { id: 'latam', label: 'LATAM', region: 'latam-region' },
  ],
  defaultVariant: 'latam',
  templates: {},
  sections: [
    { id: 'A', code: 'A', emoji: '🅰️', title: 'Alpha', type: 'team', templateId: 't', numbers: ['1', '2'], foils: ['1'] },
    { id: 'X', code: 'X', emoji: '❌', title: 'Extra', type: 'extra', templateId: 't', optional: true,
      numbers: ['1', '2', '3'], foils: [], numbersByVariant: { na: ['1', '2'] } },
  ],
};

describe('buildAlbumFromType', () => {
  it('builds pages + stickers in section order with foil flags', () => {
    const album = buildAlbumFromType(FIXTURE, { variant: 'latam', enabledOptional: [] });
    expect(album.pages.map((p) => p.id)).toEqual(['A']); // optional X skipped
    expect(album.stickers.map((s) => s.id)).toEqual(['A-1', 'A-2']);
    expect(album.stickers.find((s) => s.id === 'A-1')!.special).toBe(true);
    expect(album.stickers.find((s) => s.id === 'A-2')!.special).toBe(false);
  });

  it('includes an optional section only when enabled, honouring numbersByVariant', () => {
    const latam = buildAlbumFromType(FIXTURE, { variant: 'latam', enabledOptional: ['X'] });
    expect(latam.pages.find((p) => p.id === 'X')!.stickerIds).toEqual(['X-1', 'X-2', 'X-3']);
    const na = buildAlbumFromType(FIXTURE, { variant: 'na', enabledOptional: ['X'] });
    expect(na.pages.find((p) => p.id === 'X')!.stickerIds).toEqual(['X-1', 'X-2']);
  });
});

describe('editionInfoFor', () => {
  it('derives label/region per variant; ccCount is 0 without a CC section', () => {
    const info = editionInfoFor(FIXTURE);
    expect(info.na).toEqual({ label: 'NA', region: 'na-region', ccCount: 0 });
    expect(info.latam.label).toBe('LATAM');
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npm test -- src/data/albumTypes.test.ts src/data/layoutGeometry.test.ts`
Expected: FAIL — `albumTypes` module / `realSlotCount` not found.

- [ ] **Step 3: Implement `realSlotCount`**

In `src/data/layoutGeometry.ts`, add (after `bindTemplate`):

```ts
/** Number of real (non-decorative) slots across a template's pages. */
export function realSlotCount(t: SectionTemplate): number {
  return t.pages.reduce((n, p) => n + p.slots.filter((s) => !s.decorative).length, 0);
}
```

- [ ] **Step 4: Implement the builder module**

Create `src/data/albumTypes.ts`:

```ts
import type { Album, Page, PageType, Sticker } from '../types';
import type { SectionTemplate } from './layoutGeometry';

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
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `npm test -- src/data/albumTypes.test.ts src/data/layoutGeometry.test.ts`
Expected: PASS.

- [ ] **Step 6: Build + full suite**

Run: `npm run build && npm test`
Expected: PASS (the new module is unused by the app so far; nothing else changes).

- [ ] **Step 7: Commit**

```bash
git add src/data/albumTypes.ts src/data/albumTypes.test.ts src/data/layoutGeometry.ts src/data/layoutGeometry.test.ts
git commit -m "feat: definition-driven album builder + realSlotCount (no consumers yet)"
```

---

## Task 2: The 2026-FWC definition, `templateFor`, and the layouts shim

Author the `2026-fwc` `AlbumType` (moving the 5 templates out of `layouts.ts`), the resolver, and slim `layouts.ts` to a shim — all in one task so the build stays green (the shim preserves `TEMPLATES`/`templateFor` for the renderer, editor, and tests).

**Files:**
- Modify: `src/data/albumTypes.ts` (append the FWC definition + `ALBUM_TYPES` + `ACTIVE_ALBUM_TYPE_ID` + `activeType` + `templateFor`)
- Modify: `src/data/layouts.ts` (slim to a shim)
- Test: `src/data/albumTypes.test.ts` (append regression + resolver tests)

**Interfaces:**
- Consumes: `buildAlbumFromType`, `AlbumType` (Task 1); `gridTemplate`, `realSlotCount`, `SectionTemplate` from `./layoutGeometry`; `Page` from `../types`.
- Produces (used by Task 3 + existing consumers):
  - `ALBUM_TYPES: Record<string, AlbumType>`, `ACTIVE_ALBUM_TYPE_ID: string`, `activeType: AlbumType`
  - `templateFor(page: Page): SectionTemplate | undefined`

- [ ] **Step 1: Write the failing tests**

Append to `src/data/albumTypes.test.ts`:

```ts
import { activeType, templateFor, buildAlbumFromType as build } from './albumTypes';

const liveAlbum = (variant: string, trackCC: boolean) =>
  build(activeType, { variant, enabledOptional: trackCC ? ['CC'] : [] });

describe('2026-fwc definition (regression vs. today)', () => {
  it('has the exact section order', () => {
    const ids = activeType.sections.map((s) => s.id);
    expect(ids.slice(0, 2)).toEqual(['FWC-trophy', 'FWC-world']);
    expect(ids[2]).toBe('MEX');
    expect(ids[ids.indexOf('TUN') + 1]).toBe('CC');
    expect(ids[ids.length - 1]).toBe('FWC-scroll');
  });

  it('reproduces base totals and per-edition CC', () => {
    expect(liveAlbum('latam', false).stickers).toHaveLength(980);
    expect(liveAlbum('na', true).stickers).toHaveLength(992);
    expect(liveAlbum('latam', true).stickers).toHaveLength(994);
  });

  it('keeps the foil flags (team crest #1, all intro stickers, no CC foils)', () => {
    const a = liveAlbum('latam', true);
    const byId = Object.fromEntries(a.stickers.map((s) => [s.id, s]));
    expect(byId['MEX-1'].special).toBe(true);
    expect(byId['MEX-2'].special).toBe(false);
    expect(byId['FWC-trophy-00'].special).toBe(true);
    expect(byId['CC-1'].special).toBe(false);
  });
});

describe('templateFor', () => {
  const pageOf = (id: string) => liveAlbum('latam', true).pages.find((p) => p.id === id)!;
  const pageOfNa = (id: string) => liveAlbum('na', true).pages.find((p) => p.id === id)!;

  it('shares one country-spread instance across teams', () => {
    expect(templateFor(pageOf('MEX'))).toBe(templateFor(pageOf('BRA')));
    expect(templateFor(pageOf('MEX'))!.id).toBe('country-spread');
  });

  it('maps non-country sections to their templates', () => {
    expect(templateFor(pageOf('FWC-trophy'))!.id).toBe('fwc-specials');
    expect(templateFor(pageOf('FWC-scroll'))!.id).toBe('fwc-history');
  });

  it('uses cc-latam only at 14 stickers; NA(12) falls back to the flow grid', () => {
    expect(templateFor(pageOf('CC'))!.id).toBe('cc-latam');
    expect(templateFor(pageOfNa('CC'))).toBeUndefined();
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npm test -- src/data/albumTypes.test.ts`
Expected: FAIL — `activeType`/`templateFor` not exported yet.

- [ ] **Step 3: Move the team table + 5 templates and author the FWC definition**

In `src/data/albumTypes.ts`:

(a) Add imports at the top:

```ts
import { gridTemplate, realSlotCount } from './layoutGeometry';
```

(b) **Move the team table** out of `sampleAlbum.ts` into `albumTypes.ts` (cut the `interface TeamDef` and the full 48-entry `const TEAMS: TeamDef[] = [...]` verbatim from `sampleAlbum.ts:42-98`, paste here).

(c) **Move the 5 template constants** out of `layouts.ts` into `albumTypes.ts`: cut `COUNTRY_SPREAD`, `FWC_SPECIALS`, `FWC_BALL_COUNTRIES`, `CC_LATAM`, and `FWC_HISTORY` (the `gridTemplate(...)` definitions) verbatim from `layouts.ts` and paste here (they already use `gridTemplate`, now imported above).

(d) Append the definition, registry, and resolver:

```ts
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
```

- [ ] **Step 4: Slim `layouts.ts` to a shim**

Replace the **entire** contents of `src/data/layouts.ts` with:

```ts
// Back-compat shim. The album layout now lives in the active album type
// (src/data/albumTypes.ts); this keeps the renderer, editor, and tests importing
// `TEMPLATES`/`templateFor` from here unchanged. (Stage 1B rewires them.)
import { activeType } from './albumTypes';

export { templateFor } from './albumTypes';
export type { SectionTemplate, TemplateSlot, TemplatePage } from './layoutGeometry';

/** The active album type's templates, keyed by template id. */
export const TEMPLATES = activeType.templates;
```

- [ ] **Step 5: Run the FWC tests + the existing layouts tests**

Run: `npm test -- src/data/albumTypes.test.ts src/data/layouts.test.ts`
Expected: PASS. (`layouts.test.ts` resolves `TEMPLATES`/`templateFor` via the shim; all its sections match their templates by count, so behaviour is unchanged.)

- [ ] **Step 6: Build + full suite**

Run: `npm run build && npm test`
Expected: PASS. (`sampleAlbum.ts` still builds the album from its own tables for now — Task 3 switches it; the two sources agree because the definition mirrors the tables.)

- [ ] **Step 7: Commit**

```bash
git add src/data/albumTypes.ts src/data/layouts.ts src/data/albumTypes.test.ts
git commit -m "feat: 2026-fwc album-type definition + templateFor resolver; layouts.ts shim"
```

---

## Task 3: Drive the live album from the definition

Switch `sampleAlbum.ts` from its hardcoded tables to `buildAlbumFromType(activeType, …)`, derive `EDITION_INFO`, and refactor `resolveStickerId` — keeping every export name. This removes the last hardcoded copy of the album.

**Files:**
- Modify: `src/data/sampleAlbum.ts` (full rewrite of the build/edition/resolve internals; same exports)

**Interfaces:**
- Consumes: `activeType`, `buildAlbumFromType`, `editionInfoFor` (Task 2/1).

- [ ] **Step 1: Rewrite `sampleAlbum.ts`**

Replace the **entire** contents of `src/data/sampleAlbum.ts` with:

```ts
import type { Album, Edition, Page, Sticker } from '../types';
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
  album = buildAlbumFromType(activeType, { variant: edition, enabledOptional: enabledOptional(trackCC) });
  stickerById = indexStickers(album);
  pageById = indexPages(album);
}

/**
 * Resolve a sticker id from an import line. Intro sections share code "FWC" but
 * split across pages by emoji, so we also match the emoji when provided;
 * otherwise we fall back to whichever FWC section contains that number.
 */
export function resolveStickerId(
  code: string,
  emoji: string,
  number: string,
): string | undefined {
  const normCode = code.trim().toUpperCase();
  const normNum = number.trim();

  if (normCode === 'FWC') {
    const intro = activeType.sections.filter((s) => s.code === 'FWC');
    const byEmoji = intro.find((s) => s.emoji === emoji.trim() && s.numbers.includes(normNum));
    const target = byEmoji ?? intro.find((s) => s.numbers.includes(normNum));
    if (!target) return undefined;
    const id = `${target.id}-${normNum}`;
    return stickerById[id] ? id : undefined;
  }

  const id = `${normCode}-${normNum}`;
  return stickerById[id] ? id : undefined;
}
```

- [ ] **Step 2: Build + full suite**

Run: `npm run build && npm test`
Expected: PASS — `tsc` clean (the removed `TeamDef`/`TEAMS`/`INTRO_PAGES`/old `buildAlbum` are gone; nothing references them), all 21+ tests green including the album regression and resolver tests.

- [ ] **Step 3: Manual verification (dev server)**

Run: `npm run dev`, then confirm against the live app:
- **Album tab:** every section renders exactly as before — Specials/Ball/History/CC layouts, the 48 country spreads (sticker 1 gold foil, 13 landscape), totals, and order (CC after Tunisia, History last).
- **Settings/Edition:** the NA/LATAM picker still shows both editions with their regions; switching to NA changes CC to 12 (and CC there falls back to the flow grid); "Track Coca-Cola" still adds/removes the CC section.
- **Import a list** (paste an export) — FWC intro numbers and team stickers still resolve and apply.
- **`#/admin/templates`** editor still loads and edits the templates (via the shim).

- [ ] **Step 4: Commit**

```bash
git add src/data/sampleAlbum.ts
git commit -m "refactor: build the live album from the 2026-fwc definition (behaviour-preserving)"
```

---

## Self-Review

**1. Spec coverage (Stage 1A scope):**

| Spec item | Task |
| --- | --- |
| `AlbumType`/`SectionDef`/`AlbumVariant` data model | Task 1 (types) + Task 2 (FWC instance) |
| Explicit `numbers` + `foils` sticker model | Task 1 builder + Task 2 definition |
| Templates owned per type, referenced by `templateId`; country-spread shared | Task 2 (`templates` map + `templateFor`) |
| Variants generalize editions (`numbersByVariant`) | Task 1 (`numbersFor`) + Task 2 (CC na/latam) |
| Optional sections generalize trackCC | Task 1 (skip logic) + Task 2 (CC `optional`) + Task 3 (`enabledOptional` mapping) |
| Generic `buildAlbum(type, {variant, enabledOptional})` | Task 1 (`buildAlbumFromType`) |
| `templateFor` via active type; NA-CC flow-grid preserved | Task 2 (real-slot-count gate) |
| `EDITION_INFO` derived; store/Settings untouched | Task 1 (`editionInfoFor`) + Task 3 |
| Refactor the hardcoded FWC album; regression guard | Task 3 + Task 2 regression tests |
| Section order, foils, totals, edition counts | Task 2 tests (order/totals/foils) + Task 3 manual |
| Builder UI (album-type bar, sections panel, copy template, reorder, bulk-add, registry Export) | **Out of scope here — Stage 1B (separate plan)** |

Stage 1A is complete and self-contained; the builder UI is deferred to Stage 1B by design.

**2. Placeholder scan:** No "TBD"/"add error handling"/"similar to Task N". Moved blocks (team table, 5 templates) are concrete cut-paste instructions with exact source locations; all new logic is shown in full.

**3. Type consistency:** `buildAlbumFromType(type, { variant, enabledOptional })`, `editionInfoFor(type)`, `realSlotCount(t)`, `templateFor(page)`, and the `AlbumType`/`SectionDef`/`AlbumVariant` shapes are defined once in Task 1/2 and used identically in Task 3 and the shim. The `enabledOptional: ['CC']` mapping (Task 3) matches the `optional` skip key (`section.id === 'CC'`, Task 2). Exports preserved verbatim per Global Constraints.
