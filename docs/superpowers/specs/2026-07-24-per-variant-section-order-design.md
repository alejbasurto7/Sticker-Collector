# Per-Variant Section Order Design

**Goal:** Let **every album-type variant preserve its own order of album sections**. Today
the album's one section sequence is shared by all variants; this feature lets, e.g., the
🇺🇸 American edition place the **Coca-Cola (CC)** section mid-album while the 🌐
International edition keeps it at the very end — same sections, different sequence per
variant. Authored in the dev-only admin builder (`#/admin/templates`), applied when the
live album is built for the user's chosen edition.

**Context:** Section order is currently **implicit** — the array index within
`AlbumType.sections` ([albumTypes.ts:31](../../../src/data/albumTypes.ts#L31)). One array
drives the order for **all** variants:

- `buildAlbumFromType` walks `for (const section of type.sections)` in array order
  ([albumTypes.ts:51](../../../src/data/albumTypes.ts#L51)) and emits one `Page` +
  `Sticker`s per kept section.
- The only per-variant variation today is `numbersByVariant` on a `SectionDef`
  (the CC na=12 / latam=14 sticker-count split) — order is not per-variant.
- The admin Sections step reorders that single array via `moveSection`
  ([registryOps.ts:126](../../../src/admin/registryOps.ts#L126)), driven by drag / ↑ / ↓
  in [SectionList.tsx](../../../src/admin/builder/SectionList.tsx).
- The whole registry is exported by `JSON.stringify` (`albumTypesToSource` →
  [serializeTemplates.ts:38](../../../src/admin/serializeTemplates.ts#L38)), so any new
  plain-data field on `AlbumType` round-trips automatically.

The live user-facing album is already rebuilt **per selected edition** via
`buildAlbumFor(edition, trackCC)` ([sampleAlbum.ts:52](../../../src/data/sampleAlbum.ts#L52)),
which passes the variant into `buildAlbumFromType`. So once the build resolves order per
variant, the user-facing page order follows automatically — no view changes.

**Decision (approved):**
1. **Keep `sections` as the single section registry** (definitions + base/fallback order).
   Add an optional **`sectionOrder: Record<variantId, string[]>`** on `AlbumType` — a
   per-variant ordered list of section **ids**. Absent entry → that variant uses the base
   `sections` order. This mirrors the existing `numbersByVariant` "blank = use base"
   convention and the `albumOrder?: string[]` id-list from the album-reorder work.
2. **Scope is order only** — every variant contains the same set of sections; only their
   sequence differs. Per-variant *membership* is out of scope.
3. **Capability only** — no real 2026-fwc orders are seeded. With no `sectionOrder`
   present, every variant falls back to base order, so behavior and the exported data are
   **unchanged until an admin authors an order**.

**Rejected alternatives:** a full separate `sections` array per variant (duplicates every
definition — numbers, template, foils — inviting drift the single registry avoids); a
per-section `orderIndex` field (fragile: indices must stay dense and consistent across
add/delete). An id-list override is minimal and self-healing.

**Tech stack:** React 18, Zustand 4, TypeScript 5 (strict, `noUnusedLocals`), Vite 5,
Vitest 4. Album/section/variant config is 100% local TypeScript in `src/data/` — no DB.

---

## Global Constraints

- **Backward compatible / zero-diff default.** Legacy data has no `sectionOrder`; a missing
  entry (and an empty list) MUST resolve to today's base `sections` order. A type nobody
  has reordered per-variant exports byte-identically (no `sectionOrder` key emitted).
- **`sectionOrder` holds ids, never definitions.** All section data (numbers, template,
  foils, `numbersByVariant`, optional, etc.) stays on the single `SectionDef` in
  `sections`. Only *sequence* is per-variant.
- **Resolution is self-healing.** Ids that no longer exist are dropped; duplicates are
  deduped; sections not listed in an override are appended in base order — so a section can
  never vanish from a variant because its override list drifted.
- **One resolver, shared by runtime + admin.** `buildAlbumFromType` and the builder UI both
  order sections through the same `orderedSectionsFor` helper — no divergent logic.
- **No serializer change.** `sectionOrder` is plain data; `albumTypesToJSON`'s
  `JSON.stringify` round-trips it.
- **Reuse existing conventions:** the builder's pure-op pattern in
  [registryOps.ts](../../../src/admin/registryOps.ts) (immutable `{...type}` returns),
  `onUpdateType((t) => op(t, ...))` wiring, `.builder-*` class family, and the
  "pure logic only" Vitest style (no React Testing Library).

---

## 1. Data model + resolver

**File:** [src/data/albumTypes.ts](../../../src/data/albumTypes.ts)

### Type

Add one optional field to `AlbumType` (after `sections`):

```ts
export interface AlbumType {
  id: string;
  name: string;
  variants: AlbumVariant[];
  defaultVariant: string;
  sections: SectionDef[];                    // canonical registry; array order = base/fallback order
  sectionOrder?: Record<string, string[]>;   // variantId → ordered section ids; absent = use base order
  templates: Record<string, SectionTemplate>;
}
```

### Resolver (exported for reuse + tests)

```ts
/**
 * The sections for a variant in display order. A variant with a `sectionOrder`
 * override is ordered by it; otherwise the base `sections` order is used. Self-healing:
 * unknown / duplicate ids are dropped, and any section missing from the override is
 * appended in base order — so a section is never lost to a stale override.
 * Pure; never mutates inputs.
 */
export function orderedSectionsFor(type: AlbumType, variant: string): SectionDef[] {
  const order = type.sectionOrder?.[variant];
  if (!order) return type.sections;                      // fallback: base order
  const byId = new Map(type.sections.map((s) => [s.id, s]));
  const seen = new Set<string>();
  const listed: SectionDef[] = [];
  for (const id of order) {
    const s = byId.get(id);
    if (s && !seen.has(id)) { listed.push(s); seen.add(id); }
  }
  for (const s of type.sections) if (!seen.has(s.id)) listed.push(s); // append newly-added
  return listed;
}
```

## 2. Runtime build

**File:** [src/data/albumTypes.ts](../../../src/data/albumTypes.ts) — `buildAlbumFromType`

Change the section loop ([albumTypes.ts:51](../../../src/data/albumTypes.ts#L51)) from
`for (const section of type.sections)` to:

```ts
for (const section of orderedSectionsFor(type, opts.variant)) {
```

Everything else is unchanged — the `optional` + `enabledOptional` skip, `numbersFor`
resolution, sticker-id (`${section.id}-${number}`) and `Page` emission all stay. Because
`buildAlbumFor(edition, trackCC)` already passes the variant, switching edition rebuilds
the album in that variant's order; `pageById` / `stickerById` reindex as they do today.

**Unchanged (all id-based, order-independent):** `templateFor`
([albumTypes.ts:102](../../../src/data/albumTypes.ts#L102)), `editionInfoFor`
([albumTypes.ts:80](../../../src/data/albumTypes.ts#L80)), and `findSection` /
`resolveStickerId` in [sampleAlbum.ts](../../../src/data/sampleAlbum.ts).

## 3. Admin builder ops

**File:** [src/admin/registryOps.ts](../../../src/admin/registryOps.ts)

Add / amend these pure ops (all return a new `AlbumType`):

```ts
/** Move a section within one variant's order. The default variant with no override
 *  edits the base `sections` array (existing moveSection); any other case writes/updates
 *  sectionOrder[variantId], seeded from the variant's currently-resolved order. */
export function moveSectionForVariant(
  type: AlbumType, variantId: string, from: number, to: number,
): AlbumType {
  const isBase = variantId === type.defaultVariant && !type.sectionOrder?.[variantId];
  if (isBase) return moveSection(type, from, to);

  const ids = orderedSectionsFor(type, variantId).map((s) => s.id);
  if (from < 0 || from >= ids.length) return type;
  const target = Math.max(0, Math.min(ids.length - 1, to));
  const [moved] = ids.splice(from, 1);
  ids.splice(target, 0, moved);
  return { ...type, sectionOrder: { ...type.sectionOrder, [variantId]: ids } };
}

/** Drop a variant's custom order → it re-inherits the base `sections` order. */
export function resetVariantOrder(type: AlbumType, variantId: string): AlbumType {
  if (!type.sectionOrder?.[variantId]) return type;
  const rest = { ...type.sectionOrder };
  delete rest[variantId];
  return { ...type, sectionOrder: Object.keys(rest).length ? rest : undefined };
}
```

**Prune on delete** — `deleteSection` also strips the id from every `sectionOrder` entry
(dropping any entry that becomes empty, and the whole map if it empties):

```ts
export function deleteSection(type: AlbumType, sectionId: string): AlbumType {
  const sections = type.sections.filter((s) => s.id !== sectionId);
  let sectionOrder = type.sectionOrder;
  if (sectionOrder) {
    const next: Record<string, string[]> = {};
    for (const [v, ids] of Object.entries(sectionOrder)) {
      const kept = ids.filter((id) => id !== sectionId);
      if (kept.length) next[v] = kept;
    }
    sectionOrder = Object.keys(next).length ? next : undefined;
  }
  return { ...type, sections, sectionOrder };
}
```

**Prune on variant removal** — `removeVariant` also drops `sectionOrder[id]`, mirroring its
existing `numbersByVariant` pruning ([registryOps.ts:88-93](../../../src/admin/registryOps.ts#L88-L93)).

`addSection` / `bulkAddSections` need **no change** — the resolver appends the new section
to every overridden variant automatically (self-heal), and the admin can then drag it into
place per variant.

## 4. Admin builder UI — Sections step

**Files:** [src/admin/builder/steps/SectionsStep.tsx](../../../src/admin/builder/steps/SectionsStep.tsx),
[src/admin/builder/SectionList.tsx](../../../src/admin/builder/SectionList.tsx)

- **Variant selector** at the top of the Sections panel — a `<select>` (or segmented
  control) labeled "Order for:" listing `type.variants` by label, defaulting to
  `type.defaultVariant`. Its selected id is local UI state in `SectionsStep`, passed down
  to `SectionList`. **Rendered only when `type.variants.length > 1`** — single-variant types
  look exactly like today.
- **List order** renders `orderedSectionsFor(type, selectedVariant)` instead of
  `type.sections`. Row indices are indices into that resolved list.
- **Reorder writes to the selected variant** — the drag `onPointerUp` handler and the ↑ / ↓
  buttons call `moveSectionForVariant(t, selectedVariant, from, to)` instead of
  `moveSection`. (The default-variant-no-override case routes back to `moveSection`
  internally, so today's behavior and export are preserved.)
- **"Reset to base order"** button + a small "custom order" badge, shown when the selected
  variant is non-default and has a `sectionOrder[selectedVariant]` entry; calls
  `resetVariantOrder`.
- **A one-line note** clarifies scope: reordering changes the sequence for the selected
  variant only; a section's identity, numbers, template, and per-variant counts are shared
  across variants (edit those in the inspector).
- **Delete / add / select** are unchanged — they act on the shared definition. Deleting the
  currently-selected row falls through to today's selection behavior.

The `SectionInspector` and Layout/Export steps are untouched.

## 5. Edge cases

- **No override anywhere (today):** every variant falls back to base order; export emits no
  `sectionOrder`. Zero behavior/diff change.
- **Default variant:** never needs an entry — it uses base `sections`. Editing it keeps
  mutating `sections` (existing `moveSection`), so the base order stays authorable.
- **Newly added section:** appended to `sections`; overridden variants get it appended in
  base order by the resolver until dragged into place.
- **Deleted section:** pruned from all overrides; a resolver reading a stale list would drop
  it anyway.
- **Removed variant:** its override is dropped.
- **Changed `defaultVariant`:** resolution stays `sectionOrder[v] ?? base`; a variant keeps
  whatever override it had. Predictable; no data migration.
- **Optional CC toggled off by the user:** absent from the built pages regardless of its
  position in the order (the `optional`/`enabledOptional` skip runs after ordering).

## 6. Testing

**Unit — [src/data/albumTypes.test.ts](../../../src/data/albumTypes.test.ts):**
- `orderedSectionsFor`: no override → base order (same identity/order); full override →
  that order; partial override → listed first, rest in base order; unknown id → dropped;
  duplicate id → deduped.
- `buildAlbumFromType`: two variants with different `sectionOrder` produce different
  `album.pages` orders from the same `sections`; optional section still excluded unless
  enabled; sticker ids unchanged (order-independent).

**Unit — [src/admin/registryOps.test.ts](../../../src/admin/registryOps.test.ts):**
- `moveSectionForVariant`: default + no override edits base `sections` (no `sectionOrder`
  written); non-default materializes `sectionOrder[variant]` with the moved order; `to`
  index clamped; out-of-range `from` is a no-op.
- `resetVariantOrder`: removes the entry (and clears the map when it empties).
- `deleteSection`: id pruned from every override; emptied entries/map removed; base
  `sections` still filtered.
- `removeVariant`: `sectionOrder[removed]` dropped alongside `numbersByVariant`.

**Manual (running app):** the smoke test below.

## 7. Manual smoke test (from this worktree)

The builder is **dev-only** (`#/admin/templates`, gated by `import.meta.env.DEV` in
[main.tsx:36](../../../src/main.tsx#L36)) and excluded from production builds, so it must be
exercised via the dev server **run from this worktree** (its own `node_modules`).

1. **Start the dev server in the worktree** (not the main checkout):
   - `cd C:\Users\T0226129\Claude\Projects\Sticker-Collector\.claude\worktrees\feat+per-variant-section-order`
   - `npm run dev` → Vite prints a local URL (default `http://localhost:5173`). If the main
     checkout's dev server is already using 5173, Vite auto-picks the next free port — use
     the URL it prints.
2. **Open the builder:** navigate to `http://localhost:5173/#/admin/templates` → **Sections**
   step. (The working draft persists to localStorage key `figuritas-albumtypes-draft-v1`;
   to start clean, clear that key in DevTools → Application → Local Storage.)
3. **Per-variant reorder:** with the multi-variant `2026-fwc` type, use the new **"Order
   for:"** selector to pick **🌐 International edition**, then drag the **CC** section to a
   new position (or use ↑ / ↓). Switch the selector to **🇺🇸 American edition** and confirm
   **its** order is unchanged (independent). Reorder CC differently there.
4. **Reset:** on a non-default variant with a custom order, click **"Reset to base order"**
   and confirm it snaps back to the default variant's sequence.
5. **Export round-trip:** go to the **Export** step and confirm the generated source now
   contains a `sectionOrder` block with the per-variant id lists (and that a type you did
   **not** reorder emits **no** `sectionOrder`).
6. **User-facing order (the payoff):** in the normal app (`http://localhost:5173/`), open an
   album, enable **Coca-Cola** tracking, and switch **Edition** between the two variants in
   the album settings — the CC page should appear in the position you authored for each
   edition, while counts/stickers are untouched. *(Step 6 reflects authored order only if
   the reordered draft has been exported into `src/data/albumTypesData.ts`; if you only
   reordered in the builder draft without exporting, verify order in the builder preview /
   Export output instead.)*
7. **Regression:** confirm a **single-variant** flow shows no "Order for:" selector and
   reorders exactly as before.

**Report shape I'll give you after implementation:** the exact worktree path + `npm run dev`
command, the two URLs (`/#/admin/templates` and `/`), and the click-path for steps 3–7, so
you can run the smoke test without re-deriving any of it.

---

## Out of scope (YAGNI)

- **Per-variant section membership** — including/excluding whole sections per variant
  (order only; confirmed).
- **Seeding real 2026-fwc orders** — capability only; no `albumTypesData.ts` data change.
- **Any database / sync work** — album-type config is local TypeScript; user count data is
  unaffected (keyed by sticker id, not position).
- **Reordering surfaces other than the builder Sections step.**
