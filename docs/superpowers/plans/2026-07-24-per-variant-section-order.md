# Per-Variant Section Order Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let every album-type variant preserve its own section sequence (e.g. CC mid-album for one edition, at the end for another) — same sections, different order per variant.

**Architecture:** Keep `AlbumType.sections` as the single section registry (definitions + base/fallback order). Add an optional `sectionOrder: Record<variantId, string[]>` — a per-variant ordered list of section **ids**. A shared, self-healing `orderedSectionsFor(type, variant)` resolver drives both the runtime album build and the dev-only admin builder. Absent entry → base order, so untouched types behave and serialize identically to today.

**Tech Stack:** React 18, Zustand 4, TypeScript 5 (strict, `noUnusedLocals`), Vite 5, Vitest 4. Album/section/variant config is local TypeScript in `src/data/`; the admin builder is dev-only (`#/admin/templates`). No database.

**Spec:** [docs/superpowers/specs/2026-07-24-per-variant-section-order-design.md](../specs/2026-07-24-per-variant-section-order-design.md)

## Global Constraints

- **Backward compatible / zero-diff default.** A missing `sectionOrder` entry (and an empty list) MUST resolve to today's base `sections` order. A type nobody reordered per-variant exports byte-identically (no `sectionOrder` key).
- **`sectionOrder` holds section ids, never definitions.** All section data (numbers, template, foils, `numbersByVariant`, optional) stays on the single `SectionDef` in `sections`. Only sequence is per-variant.
- **Resolution is self-healing:** unknown/duplicate ids dropped; sections missing from an override appended in base order.
- **One resolver shared by runtime + admin** — no divergent ordering logic.
- **No serializer change** — `sectionOrder` is plain data; `JSON.stringify` round-trips it.
- **Pure-logic tests only (Vitest).** No React Testing Library. UI is verified by `tsc` typecheck + running the app (matches the codebase convention noted in the album-reorder spec).
- **TypeScript strict + `noUnusedLocals`** — no unused imports/vars; all new code fully typed.
- **Reuse builder conventions:** pure `{...type}` ops in `registryOps.ts`, `onUpdateType((t) => op(t, ...))` wiring, `.builder-*` classes.

---

### Task 1: Data model + `orderedSectionsFor` resolver + runtime build

**Files:**
- Modify: `src/data/albumTypes.ts` (interface + new resolver + `buildAlbumFromType` loop)
- Test: `src/data/albumTypes.test.ts`

**Interfaces:**
- Produces: `orderedSectionsFor(type: AlbumType, variant: string): SectionDef[]` — exported. Returns `type.sections` when the variant has no override; else the override order with unknown/duplicate ids dropped and missing sections appended in base order.
- Produces: `AlbumType.sectionOrder?: Record<string, string[]>` — new optional field.
- Consumes: nothing new.

- [ ] **Step 1: Write the failing tests**

Add to the end of `src/data/albumTypes.test.ts`. Also add `orderedSectionsFor` to the existing import on line 2 (`import { buildAlbumFromType, editionInfoFor, orderedSectionsFor, type AlbumType, activeType, templateFor, pagesSupportPages } from './albumTypes';`).

```ts
describe('orderedSectionsFor', () => {
  const base: AlbumType = {
    id: 'demo', name: 'Demo',
    variants: [{ id: 'na', label: 'NA' }, { id: 'latam', label: 'LATAM' }],
    defaultVariant: 'na', templates: {},
    sections: [
      { id: 'A', code: 'A', emoji: '', title: 'A', type: 'team', templateId: '', numbers: [], foils: [] },
      { id: 'B', code: 'B', emoji: '', title: 'B', type: 'team', templateId: '', numbers: [], foils: [] },
      { id: 'C', code: 'C', emoji: '', title: 'C', type: 'team', templateId: '', numbers: [], foils: [] },
    ],
  };

  it('returns the base sections (same array) when the variant has no override', () => {
    expect(orderedSectionsFor(base, 'na')).toBe(base.sections);
  });

  it('applies a full override order', () => {
    const t = { ...base, sectionOrder: { latam: ['C', 'A', 'B'] } };
    expect(orderedSectionsFor(t, 'latam').map((s) => s.id)).toEqual(['C', 'A', 'B']);
    expect(orderedSectionsFor(t, 'na').map((s) => s.id)).toEqual(['A', 'B', 'C']); // other variant untouched
  });

  it('appends sections missing from a partial override, in base order', () => {
    const t = { ...base, sectionOrder: { latam: ['C'] } };
    expect(orderedSectionsFor(t, 'latam').map((s) => s.id)).toEqual(['C', 'A', 'B']);
  });

  it('drops unknown ids and dedupes repeated ids', () => {
    const t = { ...base, sectionOrder: { latam: ['Z', 'B', 'B', 'A'] } };
    expect(orderedSectionsFor(t, 'latam').map((s) => s.id)).toEqual(['B', 'A', 'C']);
  });
});

describe('buildAlbumFromType — per-variant order', () => {
  const t: AlbumType = {
    id: 'demo', name: 'Demo',
    variants: [{ id: 'na', label: 'NA' }, { id: 'latam', label: 'LATAM' }],
    defaultVariant: 'na', templates: {},
    sections: [
      { id: 'A', code: 'A', emoji: '', title: 'A', type: 'team', templateId: '', numbers: ['1'], foils: [] },
      { id: 'B', code: 'B', emoji: '', title: 'B', type: 'team', templateId: '', numbers: ['1'], foils: [] },
      { id: 'X', code: 'X', emoji: '', title: 'X', type: 'extra', templateId: '', optional: true, numbers: ['1'], foils: [] },
    ],
    sectionOrder: { latam: ['B', 'X', 'A'] },
  };

  it('builds pages in the variant-specific order', () => {
    expect(buildAlbumFromType(t, { variant: 'na', enabledOptional: ['X'] }).pages.map((p) => p.id))
      .toEqual(['A', 'B', 'X']);
    expect(buildAlbumFromType(t, { variant: 'latam', enabledOptional: ['X'] }).pages.map((p) => p.id))
      .toEqual(['B', 'X', 'A']);
  });

  it('still excludes an optional section when not enabled, regardless of order', () => {
    expect(buildAlbumFromType(t, { variant: 'latam', enabledOptional: [] }).pages.map((p) => p.id))
      .toEqual(['B', 'A']); // X (optional) dropped; remaining kept in override order
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run src/data/albumTypes.test.ts`
Expected: FAIL — `orderedSectionsFor` is not exported (`orderedSectionsFor is not a function`), and the per-variant build assertions fail (pages come back in base order).

- [ ] **Step 3: Add the `sectionOrder` field to `AlbumType`**

In `src/data/albumTypes.ts`, replace the `sections`/`templates` lines of the `AlbumType` interface (lines 31-32):

```ts
  sections: SectionDef[];                    // canonical section registry; array order = base/fallback order
  sectionOrder?: Record<string, string[]>;   // variantId → ordered section ids; absent = base order
  templates: Record<string, SectionTemplate>;
```

- [ ] **Step 4: Add the `orderedSectionsFor` resolver**

In `src/data/albumTypes.ts`, insert immediately after `numbersFor` (after line 38, before the `buildAlbumFromType` doc comment):

```ts
/**
 * The sections for a variant in display order. A variant with a `sectionOrder`
 * override is ordered by it; otherwise the base `sections` order is used.
 * Self-healing: unknown/duplicate ids are dropped, and any section missing from
 * the override is appended in base order — so a section is never lost to a stale
 * override. Pure; never mutates inputs.
 */
export function orderedSectionsFor(type: AlbumType, variant: string): SectionDef[] {
  const order = type.sectionOrder?.[variant];
  if (!order) return type.sections;
  const byId = new Map(type.sections.map((s) => [s.id, s]));
  const seen = new Set<string>();
  const listed: SectionDef[] = [];
  for (const id of order) {
    const s = byId.get(id);
    if (s && !seen.has(id)) { listed.push(s); seen.add(id); }
  }
  for (const s of type.sections) if (!seen.has(s.id)) listed.push(s);
  return listed;
}
```

- [ ] **Step 5: Use the resolver in `buildAlbumFromType`**

In `src/data/albumTypes.ts`, change the section loop (line 51) from:

```ts
  for (const section of type.sections) {
```

to:

```ts
  for (const section of orderedSectionsFor(type, opts.variant)) {
```

- [ ] **Step 6: Run the tests to verify they pass**

Run: `npx vitest run src/data/albumTypes.test.ts`
Expected: PASS — all new tests green, and the existing "has the exact section order" regression (which reads `activeType.sections`, the untouched base) still passes.

- [ ] **Step 7: Commit**

```bash
git add src/data/albumTypes.ts src/data/albumTypes.test.ts
git commit -m "feat(albums): per-variant section order model + build

Add optional AlbumType.sectionOrder (variantId -> section ids) and a
self-healing orderedSectionsFor resolver; buildAlbumFromType now walks
sections in the variant's order. Absent override = base order (no change)."
```

---

### Task 2: Builder ops for per-variant order

**Files:**
- Modify: `src/admin/registryOps.ts` (import + `moveSectionForVariant`, `resetVariantOrder`, `deleteSection`, `removeVariant`)
- Test: `src/admin/registryOps.test.ts`

**Interfaces:**
- Consumes: `orderedSectionsFor` from `../data/albumTypes` (Task 1); existing `moveSection`.
- Produces: `moveSectionForVariant(type, variantId, from, to): AlbumType`, `resetVariantOrder(type, variantId): AlbumType`. `deleteSection` and `removeVariant` also prune `sectionOrder`.

- [ ] **Step 1: Write the failing tests**

Add `moveSectionForVariant, resetVariantOrder` to the imports at the top of `src/admin/registryOps.test.ts` (they come from `./registryOps`), then append this describe block:

```ts
describe('per-variant section order', () => {
  // base + na variant; sections A, B, C; defaultVariant 'base'
  const multi = () => {
    let t = addVariant(T(), { id: 'na', label: 'NA' });
    t = bulkAddSections(t, parseBulkLines('A,,\nB,,\nC,,'),
      { templateId: '', numbers: [], foils: [], type: 'team' });
    return t;
  };

  it('moveSectionForVariant edits the base sections for the default variant with no override', () => {
    const t = moveSectionForVariant(multi(), 'base', 2, 0);
    expect(t.sections.map((s) => s.id)).toEqual(['C', 'A', 'B']);
    expect(t.sectionOrder).toBeUndefined(); // default edits base, no override written
  });

  it('moveSectionForVariant materializes an override for a non-default variant', () => {
    const t = moveSectionForVariant(multi(), 'na', 2, 0);
    expect(t.sectionOrder).toEqual({ na: ['C', 'A', 'B'] });
    expect(t.sections.map((s) => s.id)).toEqual(['A', 'B', 'C']); // base untouched
  });

  it('moveSectionForVariant clamps the target and no-ops an out-of-range source', () => {
    expect(moveSectionForVariant(multi(), 'na', 0, 99).sectionOrder).toEqual({ na: ['B', 'C', 'A'] });
    expect(moveSectionForVariant(multi(), 'na', 5, 0)).toEqual(multi()); // from out of range
  });

  it('resetVariantOrder removes the entry (and clears the map when it empties)', () => {
    const t = moveSectionForVariant(multi(), 'na', 2, 0);
    expect(resetVariantOrder(t, 'na').sectionOrder).toBeUndefined();
  });

  it('deleteSection prunes the id from every variant order', () => {
    const t = moveSectionForVariant(multi(), 'na', 2, 0); // sectionOrder.na = ['C','A','B']
    const d = deleteSection(t, 'A');
    expect(d.sections.map((s) => s.id)).toEqual(['B', 'C']);
    expect(d.sectionOrder).toEqual({ na: ['C', 'B'] });
  });

  it('removeVariant drops that variant’s section order', () => {
    const t = moveSectionForVariant(multi(), 'na', 2, 0);
    expect(removeVariant(t, 'na').sectionOrder).toBeUndefined();
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run src/admin/registryOps.test.ts`
Expected: FAIL — `moveSectionForVariant`/`resetVariantOrder` are not exported; `deleteSection`/`removeVariant` don’t yet prune `sectionOrder`.

- [ ] **Step 3: Import the resolver**

In `src/admin/registryOps.ts`, add a value import below the existing type import (line 1):

```ts
import type { AlbumType, AlbumVariant, SectionDef } from '../data/albumTypes';
import { orderedSectionsFor } from '../data/albumTypes';
```

- [ ] **Step 4: Prune `sectionOrder` in `deleteSection`**

Replace the existing `deleteSection` (lines 121-123) with:

```ts
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
```

- [ ] **Step 5: Drop the removed variant’s order in `removeVariant`**

In `src/admin/registryOps.ts`, in `removeVariant`, replace the final `return { ...type, variants, defaultVariant, sections };` (line 94) with:

```ts
  // Drop the removed variant's section-order override, if any.
  let sectionOrder = type.sectionOrder;
  if (sectionOrder && id in sectionOrder) {
    const rest = { ...sectionOrder };
    delete rest[id];
    sectionOrder = Object.keys(rest).length ? rest : undefined;
  }
  return { ...type, variants, defaultVariant, sections, sectionOrder };
```

- [ ] **Step 6: Add `moveSectionForVariant` + `resetVariantOrder`**

In `src/admin/registryOps.ts`, insert after `moveSection` (after line 133):

```ts
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
```

- [ ] **Step 7: Run the tests to verify they pass**

Run: `npx vitest run src/admin/registryOps.test.ts`
Expected: PASS — new block green; the existing `removeVariant`/`deleteSection`/`moveSection` tests still pass.

- [ ] **Step 8: Commit**

```bash
git add src/admin/registryOps.ts src/admin/registryOps.test.ts
git commit -m "feat(albums): builder ops for per-variant section order

Add moveSectionForVariant + resetVariantOrder; prune sectionOrder in
deleteSection and removeVariant. Default variant with no override still
edits the base sections array."
```

---

### Task 3: Sections-step variant selector + list wiring (admin UI)

**Files:**
- Modify: `src/admin/builder/SectionList.tsx` (reorder per selected variant)
- Modify: `src/admin/builder/steps/SectionsStep.tsx` (variant selector + reset)

**Interfaces:**
- Consumes: `moveSectionForVariant`, `resetVariantOrder` (Task 2); `orderedSectionsFor` (Task 1).
- Produces: `SectionList` gains a required `orderVariantId: string` prop. No test-facing exports.

**Note on TDD:** the repo unit-tests pure logic only — there is no component-test harness (see the album-reorder spec). Tasks 1-2 already cover all pure logic under this feature. This task is verified by a strict TypeScript build (catches prop/type wiring) plus the manual smoke test in §7 of the spec.

- [ ] **Step 1: Rewrite `SectionList.tsx` to reorder the selected variant**

Replace the entire contents of `src/admin/builder/SectionList.tsx` with:

```tsx
import { useRef } from 'react';
import { type AlbumType, orderedSectionsFor } from '../../data/albumTypes';
import { addSection, moveSectionForVariant, deleteSection } from '../registryOps';
import { type Confirm } from './useConfirm';

interface SectionListProps {
  type: AlbumType;
  selectedSectionId: string;
  orderVariantId: string;
  onSelectSection: (id: string) => void;
  onUpdateType: (mut: (t: AlbumType) => AlbumType) => void;
  confirm: Confirm;
}

export default function SectionList({
  type, selectedSectionId, orderVariantId, onSelectSection, onUpdateType, confirm,
}: SectionListProps) {
  const dragFrom = useRef<number | null>(null);
  const rows = orderedSectionsFor(type, orderVariantId);

  const handleAddSection = () => {
    const before = new Set(type.sections.map((s) => s.id));
    const next = addSection(type);                 // addSection is pure
    const added = next.sections.find((s) => !before.has(s.id));
    onUpdateType(() => next);
    if (added) onSelectSection(added.id);
  };

  const handleDelete = async (e: React.MouseEvent, id: string, label: string) => {
    e.stopPropagation();
    const ok = await confirm({ message: `Delete section "${label}"?`, confirmLabel: 'Delete', danger: true });
    if (ok) onUpdateType((t) => deleteSection(t, id));
  };

  const handleDragHandlePointerDown = (e: React.PointerEvent, fromIndex: number) => {
    e.preventDefault();
    e.stopPropagation();
    (e.currentTarget as Element).setPointerCapture(e.pointerId);
    dragFrom.current = fromIndex;
  };

  const handleListPointerUp = (e: React.PointerEvent) => {
    const from = dragFrom.current;
    if (from === null) return;
    dragFrom.current = null;

    const target = e.currentTarget as HTMLElement;
    const rowEls = Array.from(target.querySelectorAll<HTMLElement>('[data-row-index]'));
    let toIndex = from;
    for (const row of rowEls) {
      const rect = row.getBoundingClientRect();
      const mid = rect.top + rect.height / 2;
      if (e.clientY > mid) {
        toIndex = Number(row.dataset.rowIndex);
      }
    }

    if (toIndex !== from) {
      onUpdateType((t) => moveSectionForVariant(t, orderVariantId, from, toIndex));
    }
  };

  return (
    <div className="builder-panel">
      <strong>Sections</strong>
      <div
        onPointerUp={handleListPointerUp}
        style={{ display: 'flex', flexDirection: 'column', gap: 2, marginTop: 8 }}
      >
        {rows.length === 0 && (
          <p style={{ opacity: 0.6, fontSize: 13 }}>No sections yet.</p>
        )}
        {rows.map((s, i) => (
          <div
            key={s.id}
            data-row-index={i}
            className={`builder-field-row${s.id === selectedSectionId ? ' is-selected' : ''}`}
            onClick={() => onSelectSection(s.id)}
            style={{ cursor: 'pointer' }}
          >
            <span
              style={{ cursor: 'grab', opacity: 0.5, userSelect: 'none', touchAction: 'none', paddingRight: 4 }}
              onPointerDown={(e) => handleDragHandlePointerDown(e, i)}
              onClick={(e) => e.stopPropagation()}
            >
              ⋮⋮
            </span>
            <span style={{ width: 22 }}>{s.emoji}</span>
            <span style={{ width: 48, fontWeight: 700, fontSize: 13 }}>{s.code}</span>
            <span style={{ flex: 1, fontSize: 13 }}>{s.title}</span>
            <span style={{ opacity: 0.6, fontSize: 12 }}>{s.numbers.length}</span>
            <span style={{ opacity: 0.5, fontSize: 11 }}>{s.templateId || '—'}</span>
            <button
              className="builder-btn builder-btn--sm"
              disabled={i === 0}
              onClick={(e) => { e.stopPropagation(); onUpdateType((t) => moveSectionForVariant(t, orderVariantId, i, i - 1)); }}
              aria-label="Move up"
            >↑</button>
            <button
              className="builder-btn builder-btn--sm"
              disabled={i === rows.length - 1}
              onClick={(e) => { e.stopPropagation(); onUpdateType((t) => moveSectionForVariant(t, orderVariantId, i, i + 1)); }}
              aria-label="Move down"
            >↓</button>
            <button
              className="builder-btn builder-btn--danger builder-btn--sm"
              onClick={(e) => handleDelete(e, s.id, s.title || s.code)}
              aria-label="Delete section"
            >✕</button>
          </div>
        ))}
      </div>
      <button
        className="builder-btn builder-btn--sm"
        style={{ marginTop: 8 }}
        onClick={handleAddSection}
      >
        + section
      </button>
    </div>
  );
}
```

(Changes vs. today: import `moveSectionForVariant`/`orderedSectionsFor`; new `orderVariantId` prop; render `rows = orderedSectionsFor(type, orderVariantId)` instead of `type.sections`; all three reorder call sites use `moveSectionForVariant(t, orderVariantId, …)`; the drag-target local was renamed `rowEls` to avoid shadowing `rows`.)

- [ ] **Step 2: Add the variant selector + reset to `SectionsStep.tsx`**

Replace the entire contents of `src/admin/builder/steps/SectionsStep.tsx` with:

```tsx
import { useState } from 'react';
import { type AlbumType } from '../../../data/albumTypes';
import { resetVariantOrder } from '../../registryOps';
import { type Confirm } from '../useConfirm';
import BulkAddPanel from '../BulkAddPanel';
import SectionList from '../SectionList';
import SectionInspector from '../SectionInspector';

interface SectionsStepProps {
  type: AlbumType;
  selectedSectionId: string;
  onSelectSection: (id: string) => void;
  onUpdateType: (mut: (t: AlbumType) => AlbumType) => void;
  confirm: Confirm;
}

export default function SectionsStep({
  type, selectedSectionId, onSelectSection, onUpdateType, confirm,
}: SectionsStepProps) {
  const section = type.sections.find((s) => s.id === selectedSectionId);
  const [orderVariantId, setOrderVariantId] = useState(type.defaultVariant);

  // Guard against a stale selection (variant removed / default changed).
  const activeVariantId = type.variants.some((v) => v.id === orderVariantId)
    ? orderVariantId
    : type.defaultVariant;
  const hasOverride = !!type.sectionOrder?.[activeVariantId];

  return (
    <div>
      <BulkAddPanel type={type} onUpdateType={onUpdateType} />

      {type.variants.length > 1 && (
        <div className="builder-panel" style={{ marginTop: 8 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
            <span className="builder-field-label">Order for</span>
            <select
              className="builder-select"
              value={activeVariantId}
              onChange={(e) => setOrderVariantId(e.target.value)}
            >
              {type.variants.map((v) => (
                <option key={v.id} value={v.id}>{v.label}</option>
              ))}
            </select>
            {hasOverride && <span className="builder-chip">custom order</span>}
            {hasOverride && (
              <button
                className="builder-btn builder-btn--sm"
                onClick={() => onUpdateType((t) => resetVariantOrder(t, activeVariantId))}
              >
                Reset to base order
              </button>
            )}
          </div>
          <p style={{ fontSize: 12, opacity: 0.6, margin: '6px 0 0' }}>
            Reordering changes the sequence for this variant only. A section's identity,
            numbers, and template are shared across variants.
          </p>
        </div>
      )}

      <div className="builder-two-pane" style={{ marginTop: 8 }}>
        <SectionList
          type={type}
          selectedSectionId={selectedSectionId}
          orderVariantId={activeVariantId}
          onSelectSection={onSelectSection}
          onUpdateType={onUpdateType}
          confirm={confirm}
        />
        {section ? (
          <SectionInspector key={section.id} type={type} section={section} onUpdateType={onUpdateType} />
        ) : (
          <div className="builder-panel">
            <p style={{ opacity: 0.6 }}>Select or add a section to edit it.</p>
          </div>
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Typecheck (strict build) and run the full test suite**

Run: `npx tsc -b && npx vitest run`
Expected: tsc reports no errors (the new `orderVariantId` prop is required and supplied; no unused locals). Vitest: all tests pass (Task 1 + Task 2 additions plus the existing suite).

- [ ] **Step 4: Manual smoke test (dev server from this worktree)**

Follow §7 of the spec. Quick path:
- `npm run dev` in the worktree → open `http://localhost:5173/#/admin/templates` → **Sections**.
- With `2026-fwc` (2 variants): the new **"Order for:"** selector appears. Pick **🌐 International edition**, drag **CC** to a new spot; switch to **🇺🇸 American edition** and confirm its order is independent.
- Confirm **"custom order"** badge + **"Reset to base order"** appear for the customized variant and that Reset restores the base sequence.
- **Export** step: the generated source contains a `sectionOrder` block for the customized variant only.

Expected: reordering one variant never moves another; single-variant types show no selector.

- [ ] **Step 5: Commit**

```bash
git add src/admin/builder/SectionList.tsx src/admin/builder/steps/SectionsStep.tsx
git commit -m "feat(albums): per-variant section order in the admin builder

Sections step gains an 'Order for' variant selector; reordering writes to
the selected variant's order (default variant still edits the base). Adds a
custom-order badge and Reset to base order."
```

---

## Final verification

- [ ] `npx tsc -b` — clean.
- [ ] `npx vitest run` — full suite green (baseline was 217 tests; this adds ~11).
- [ ] Manual smoke test §7 complete (per-variant reorder independent; reset works; export emits `sectionOrder` only for customized variants; single-variant types unchanged).

## Notes for the implementer

- **Edit files in the worktree** at `.claude/worktrees/feat+per-variant-section-order`, not the main checkout — concurrent sessions are committing to `main`.
- **No `albumTypesData.ts` change** — this is capability-only; do not seed real 2026-fwc orders.
- **No serializer change** — `sectionOrder` round-trips through `albumTypesToSource`’s `JSON.stringify` automatically. If you want to confirm, the Export step output is the proof.
- **`orderedSectionsFor` is the single source of truth** for ordering — do not re-derive order anywhere else.
