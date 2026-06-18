# Album Types — Stage 1 (Dev Authoring) — Design

**Date:** 2026-06-18
**Status:** Approved (pending spec review)

## Problem

The app knows exactly one album: the 2026 FWC, hardcoded in `src/data/sampleAlbum.ts`
(compact `INTRO_PAGES` + `TEAMS` + `CC` tables built into a singleton `album`) with a
hardcoded `templateFor(page)` switch in `src/data/layouts.ts` mapping pages to templates.
The user wants to add more **album types** in the future (2027 Women's World Cup, a Bluey
album). Each album type is a set of **sections**, and every section should **reference a
shared template** so that, e.g., one `country-spread` template is shared by all 48 country
sections — you modify the *template* once, not every country. There is currently no
first-class notion of an album type, no way to author sections, and no way to associate a
section with a template other than editing TypeScript.

## Goal (Stage 1 only)

Make **album types first-class, authored data**, and give the dev-only admin editor the
ability to create album types, add/reorder sections, assign each section a template, and
copy a template between album types — then **bake the result into code** (the same
authoring → Export → commit pattern as the template system shipped 2026-06-18).

This is **Stage 1** of a 3-stage roadmap (see the album-types roadmap memory):

- **Stage 1 (this spec):** dev-only authoring → bake into code.
- **Stage 2 (deferred, near future):** end-user album-type selection when creating a
  collection (touches the multi-album store, stats/totals, edition logic).
- **Stage 3 (eventual):** runtime user-created album types.

Build Stage 1 without hardcoding anything that blocks Stages 2–3, but do **not** build 2
or 3 now.

## Decisions (locked with the user)

- **Scope:** dev-only authoring; bake definitions into code. End users still boot the same
  active album.
- **Section sticker model:** explicit `numbers: string[]` (printed labels, in order) +
  `foils: string[]` (which are special/foil). Faithful to the current album (custom `'00'`,
  per-sticker foils) and simple for a plain album.
- **Templates are owned per album type** and referenced by `section.templateId`. Shared
  within a type (48 country sections → one `country-spread`); a future type brings its own.
- **Copy a template across types = duplicate**, not a live cross-type share. Editing the
  original or the copy never affects the other.
- **Section order = the `sections[]` array order**; the editor reorders by drag.
- **Editions (NA/LATAM CC size) stay FWC-specific** — a thin data-driven layer over the
  definition, not generalized.

## Architecture

### 1. Data model — `src/data/albumTypes.ts`

```ts
interface SectionDef {
  id: string;          // stable, e.g. 'MEX', 'FWC-trophy'
  code: string;        // 'MEX'
  emoji: string;       // '🇲🇽'
  title: string;       // 'Mexico'
  type: PageType;      // 'team' | 'intro' | 'extra' — retained for filters/stats
  templateId: string;  // → a template in THIS album type's `templates`
  numbers: string[];   // printed labels in order, e.g. ['1'..'20'] or ['00','1','2','3','4']
  foils: string[];     // subset of `numbers` that are foil/special
}

interface AlbumType {
  id: string;          // '2026-fwc'
  name: string;        // 'Usa Mex Can 26'
  sections: SectionDef[];                       // album order
  templates: Record<string, SectionTemplate>;   // owned by this type; shared by id across its sections
}

const ALBUM_TYPES: Record<string, AlbumType> = { '2026-fwc': { /* … */ } };
const ACTIVE_ALBUM_TYPE_ID = '2026-fwc';  // which baked-in type the app boots (Stage 2 makes this user-pickable)
```

- **Sticker count = `numbers.length`**, expected to equal the template's non-decorative
  slot count (the editor warns on mismatch). `foils` carries the special/foil flag (teams
  `foils:['1']`; Specials: all; CC: none).
- `type` is retained so existing filters, stats "Progress by Type," and the
  `team → country-spread` defaults keep working.
- **Templates owned per type**, referenced by `section.templateId` — the "edit the
  template once, all 48 countries update" behaviour falls straight out of 48 sections
  carrying the same `templateId`.

### 2. Building the live album — `src/data/sampleAlbum.ts` → generic builder

The singleton `album` (+ `stickerById`, `pageById`, `templateFor`) is preserved so the
~22 consumers and the store are untouched; only how they're produced changes.

```ts
function buildAlbum(type: AlbumType, opts: { ccCount: number; trackCC: boolean }): Album {
  // Walk type.sections IN ORDER; each SectionDef →
  //   one Page { id, code, emoji, title, type, stickerIds }
  //   + Stickers: id = `${section.id}-${number}`, special = section.foils.includes(number)
}
const activeType = ALBUM_TYPES[ACTIVE_ALBUM_TYPE_ID];
```

- **`templateFor(page)`** drops the hardcoded switch: find the active type's `SectionDef`
  by `page.id`, return `activeType.templates[section.templateId]`.
- **Live-binding preserved:** `applyEdition(edition, trackCC)` still rebuilds
  `album`/`stickerById`/`pageById` in place, now via `buildAlbum(activeType, …)`.
- **Editions, thin FWC layer:** the FWC type's `CC` section stores the full LATAM numbers
  (`'1'..'14'`); `buildAlbum` trims it to `ccCount` (12 for NA) and **omits it entirely
  when `trackCC` is false** — exactly today's behaviour, data-driven. No other type has
  editions.

### 3. Authoring UI — extend the dev-only editor

The existing `#/admin/templates` editor grows from a template editor into an **album-type
builder** (still dev-only, still WYSIWYG; the template canvas is reused unchanged).
Organized as small components: an album-type bar, a sections-list, a section-fields form,
and the existing template canvas — each editing one slice of the registry.

- **Album-type bar:** pick the `AlbumType` to edit, or **New album type** (id + name).
- **Sections panel** (active type's sections, in album order; each row: emoji · code ·
  title · sticker count · `templateId`):
  - **Add section**; **Bulk-add** (paste `code, emoji, title` lines → many sections sharing
    a chosen `templateId` + `numbers`/`foils` — spins up 48 countries at once).
  - **Drag-to-reorder** (up/down fallback) — array order = album order.
  - Select to edit; **delete** section.
- **Section editor + canvas** (when a section is selected):
  - Fields: `code`, `emoji`, `title`, `type`, **`numbers`** (comma-separated, with a
    "fill 1..N" helper), **`foils`** (comma-separated subset), and a **template dropdown**
    (`templateId`).
  - The **template canvas** (existing drag / flip / ✕ / size / aspect / reset) edits
    whichever template the section points at.
  - **Count check:** warn when `numbers.length ≠ the template's non-decorative slot count`.
- **Template management:** New template; Clone (within type); **Copy template → [album
  type]** (cross-type duplicate, with overwrite-or-rename on id collision); Delete template.
- **Persistence & Export:** autosave the whole `ALBUM_TYPES` registry + `ACTIVE_ALBUM_TYPE_ID`
  to a dev-only `localStorage` key; **Reset all / Reset this type** mirror today's resets;
  **Export** serializes the whole registry to the `albumTypes.ts` literal (extending today's
  `serializeTemplates`) — copy + download — to paste into code.

### 4. Migration

1. Add the `AlbumType`/`SectionDef` types + `ALBUM_TYPES` + `ACTIVE_ALBUM_TYPE_ID`.
2. Author the `2026-fwc` definition by converting today's data: `TEAMS` → 48 country
   sections (via a one-line `teams.map(...)` helper — data, not 48 hand-written entries),
   intro sections, and the `CC` section; move the `country-spread`/`fwc-*`/`cc-latam`
   templates from `layouts.ts` into the type's `templates`.
3. Replace the FWC-specific `buildAlbum` with the generic `buildAlbum(type, opts)`; point
   `applyEdition` at it.
4. Reimplement `templateFor(page)` to resolve via the active type's `section.templateId`.
5. Extend the dev editor into the album-type builder; extend Export to the whole registry.

Net behaviour is identical to today for FWC; the built album is the regression guard.

## Testing

- **`buildAlbum`:** a small definition → expected pages + stickers (ids
  `${section.id}-${number}`, `special` from `foils`, section order preserved).
- **Editions:** CC section trims to 12 (NA) / 14 (LATAM) and is omitted when `trackCC` is
  false.
- **`templateFor`:** every country section resolves to the same `country-spread` instance;
  each non-country section to its own.
- **Regression guard:** building `2026-fwc` reproduces today's album — same page ids,
  sticker ids + `special` flags, per-section counts, and totals (NA 992 / LATAM 994).
- **Copy-template-to-type:** duplicating a template into another type yields an independent
  copy; an id collision produces a new id.
- **Export round-trip:** serialize the full `ALBUM_TYPES` registry → `JSON.parse` →
  deep-equal.
- The builder UI is dev-only and manually verified.

## Out of scope (YAGNI)

Stage 2 (end-user album-type selection) and Stage 3 (runtime user-created types);
generalizing editions beyond FWC; live cross-type shared templates (copy is duplicate
only); shipping the editor to production; per-sticker metadata beyond `numbers` + `foils`.
