import { useMemo, useRef, useState } from 'react';
import type { CSSProperties, PointerEvent as ReactPointerEvent } from 'react';
import { album } from '../data/sampleAlbum';
import { TEMPLATES, templateFor } from '../data/layouts';
import {
  slotBox,
  bindTemplate,
  clientToPagePercent,
  type SectionTemplate,
  type TemplateSlot,
} from '../data/layoutGeometry';
import { templatesToSource } from './serializeTemplates';

const DRAFT_KEY = 'figuritas-template-draft-v1';

// Readable button styling — the app's global button CSS leaves plain buttons as
// near-white text on the browser's default light button, i.e. invisible on the
// editor's dark background. BTN_SM is the compact variant for the in-page buttons.
const BTN: CSSProperties = {
  background: '#223047',
  color: '#e7ecf3',
  border: '1px solid #3a4a60',
  borderRadius: 6,
  padding: '5px 10px',
  fontSize: 13,
  fontWeight: 600,
  cursor: 'pointer',
  whiteSpace: 'nowrap',
};
const BTN_SM: CSSProperties = { ...BTN, padding: '3px 7px', fontSize: 11 };

/** Deep clone via JSON — templates are plain data. */
const clone = <T,>(v: T): T => JSON.parse(JSON.stringify(v)) as T;

function loadDraft(): Record<string, SectionTemplate> {
  try {
    const raw = localStorage.getItem(DRAFT_KEY);
    if (raw) return JSON.parse(raw);
  } catch {
    /* ignore corrupt draft */
  }
  return clone(TEMPLATES);
}

// Pages that map to a template, for the "edit which section" picker.
const EDITABLE_PAGES = album.pages.filter((p) => templateFor(p));

export default function TemplateEditor() {
  const [registry, setRegistry] = useState<Record<string, SectionTemplate>>(loadDraft);
  const [pageId, setPageId] = useState<string>(EDITABLE_PAGES[0]?.id ?? '');

  const section = album.pages.find((p) => p.id === pageId)!;
  const templateId = templateFor(section)!.id;
  const template = registry[templateId];

  // Persist on every change so a half-finished layout survives a reload.
  const commit = (next: Record<string, SectionTemplate>) => {
    setRegistry(next);
    try {
      localStorage.setItem(DRAFT_KEY, JSON.stringify(next));
    } catch {
      /* ignore quota errors */
    }
  };

  const updateTemplate = (mut: (t: SectionTemplate) => void) => {
    const next = clone(registry);
    mut(next[templateId]);
    commit(next);
  };

  const bound = useMemo(
    () => bindTemplate(template, section.stickerIds),
    [template, section],
  );

  // Drag state: which (page, slot) is moving, tracked against the page rect.
  const pageRefs = useRef<(HTMLDivElement | null)[]>([]);
  const drag = useRef<{ pageIdx: number; slotIdx: number; moved: boolean } | null>(null);

  const onSlotPointerDown =
    (pageIdx: number, slotIdx: number) => (e: ReactPointerEvent) => {
      e.preventDefault();
      (e.target as Element).setPointerCapture?.(e.pointerId);
      drag.current = { pageIdx, slotIdx, moved: false };
    };

  const onSlotPointerMove = (e: ReactPointerEvent) => {
    const d = drag.current;
    if (!d) return;
    const el = pageRefs.current[d.pageIdx];
    if (!el) return;
    const { x, y } = clientToPagePercent(e.clientX, e.clientY, el.getBoundingClientRect());
    d.moved = true;
    updateTemplate((t) => {
      const slot = t.pages[d.pageIdx].slots[d.slotIdx];
      slot.x = Math.round(x * 10) / 10;
      slot.y = Math.round(y * 10) / 10;
    });
  };

  const onSlotPointerUp = (pageIdx: number, slotIdx: number) => () => {
    const d = drag.current;
    drag.current = null;
    if (d && !d.moved) {
      // A tap (no drag) flips orientation.
      updateTemplate((t) => {
        const slot = t.pages[pageIdx].slots[slotIdx];
        slot.orientation = slot.orientation === 'portrait' ? 'landscape' : 'portrait';
      });
    }
  };

  const removeSlot = (pageIdx: number, slotIdx: number) =>
    updateTemplate((t) => {
      t.pages[pageIdx].slots.splice(slotIdx, 1);
    });

  const addSlot = (pageIdx: number, decorative: boolean) =>
    updateTemplate((t) => {
      t.pages[pageIdx].slots.push({
        x: 50,
        y: 50,
        orientation: decorative ? 'landscape' : 'portrait',
        ...(decorative ? { decorative: true } : {}),
      });
    });

  const addPage = () =>
    updateTemplate((t) => {
      t.pages.push({ slots: [] });
    });

  const removePage = (pageIdx: number) =>
    updateTemplate((t) => {
      if (t.pages.length > 1) t.pages.splice(pageIdx, 1);
    });

  const setWidth = (v: number) =>
    updateTemplate((t) => {
      t.stickerWidthPct = v;
    });

  const setAspect = (v: number) =>
    updateTemplate((t) => {
      t.pageAspect = v;
    });

  const unplacedCount = bound.unplaced.length;

  const resetToSeeds = () => commit(clone(TEMPLATES));

  const exportSource = async () => {
    const src = templatesToSource(registry);
    try {
      await navigator.clipboard.writeText(src);
    } catch {
      /* clipboard may be blocked; the download below still works */
    }
    const blob = new Blob([src], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'layouts.generated.ts';
    a.click();
    URL.revokeObjectURL(url);
  };

  const slotLabel = (pageIdx: number): string[] => {
    // Numbers shown on each slot: the bound sticker's number, or "—" for decorative.
    return bound.pages[pageIdx].placements.map((pl) =>
      pl.slot.decorative
        ? '—'
        : pl.stickerId
          ? (album.stickers.find((s) => s.id === pl.stickerId)?.number ?? '?')
          : '·',
    );
  };

  const slotStyle = (slot: TemplateSlot): CSSProperties => {
    const b = slotBox(slot, template);
    return {
      position: 'absolute',
      left: `${b.leftPct}%`,
      top: `${b.topPct}%`,
      width: `${b.widthPct}%`,
      height: `${b.heightPct}%`,
      transform: 'translate(-50%, -50%)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      border: '1px solid #6aa9ff',
      borderRadius: 6,
      background: slot.decorative ? 'rgba(255,255,255,0.06)' : 'rgba(106,169,255,0.18)',
      borderStyle: slot.decorative ? 'dashed' : 'solid',
      color: '#cfe0ff',
      fontWeight: 800,
      fontSize: 12,
      cursor: 'grab',
      touchAction: 'none',
      userSelect: 'none',
    };
  };

  return (
    <div style={{ padding: 16, color: '#e7ecf3', fontFamily: 'system-ui, sans-serif' }}>
      <h2 style={{ marginTop: 0 }}>Template editor (dev only)</h2>

      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginBottom: 12 }}>
        <label>
          Section:{' '}
          <select value={pageId} onChange={(e) => setPageId(e.target.value)}>
            {EDITABLE_PAGES.map((p) => (
              <option key={p.id} value={p.id}>
                {p.title} ({templateFor(p)!.id})
              </option>
            ))}
          </select>
        </label>
        <button style={BTN} onClick={exportSource}>Export (copy + download)</button>
        <button style={BTN} onClick={resetToSeeds}>Reset to seeds</button>
      </div>

      <p style={{ opacity: 0.7, fontSize: 13, maxWidth: 640 }}>
        Drag a slot to move it · tap a slot to flip portrait↔landscape · ✕ removes it.
        Slots fill stickers in order, so the number on each slot is the sticker it
        currently binds to. Editing autosaves to this browser; Export writes the
        TEMPLATES literal to paste into <code>src/data/layouts.ts</code>.
      </p>

      <div
        style={{
          display: 'flex',
          gap: 14,
          flexWrap: 'wrap',
          alignItems: 'center',
          marginBottom: 12,
          fontSize: 13,
        }}
      >
        <label>
          Sticker size: {template.stickerWidthPct.toFixed(1)}%{' '}
          <input
            type="range"
            min={10}
            max={40}
            step={0.25}
            value={template.stickerWidthPct}
            onChange={(e) => setWidth(Number(e.target.value))}
          />
        </label>
        <label>
          Page aspect: {template.pageAspect.toFixed(3)}{' '}
          <input
            type="range"
            min={0.6}
            max={1.4}
            step={0.001}
            value={template.pageAspect}
            onChange={(e) => setAspect(Number(e.target.value))}
          />
        </label>
        <button style={BTN} onClick={addPage}>+ page</button>
        {unplacedCount > 0 && (
          <span style={{ color: '#f0b450' }}>
            {unplacedCount} sticker(s) unplaced — add slots to place them
          </span>
        )}
      </div>

      <div style={{ display: 'flex', gap: 16, alignItems: 'flex-start' }}>
        {template.pages.map((p, pageIdx) => (
          <div
            key={pageIdx}
            ref={(el) => (pageRefs.current[pageIdx] = el)}
            style={{
              position: 'relative',
              flex: '1 1 0',
              maxWidth: 320,
              aspectRatio: String(template.pageAspect),
              background: '#11161d',
              border: '1px solid #2a3340',
              borderRadius: 8,
            }}
          >
            {p.slots.map((slot, slotIdx) => (
              <div
                key={slotIdx}
                style={slotStyle(slot)}
                onPointerDown={onSlotPointerDown(pageIdx, slotIdx)}
                onPointerMove={onSlotPointerMove}
                onPointerUp={onSlotPointerUp(pageIdx, slotIdx)}
              >
                {slotLabel(pageIdx)[slotIdx]}
                <button
                  onPointerDown={(e) => e.stopPropagation()}
                  onClick={(e) => {
                    e.stopPropagation();
                    removeSlot(pageIdx, slotIdx);
                  }}
                  style={{
                    position: 'absolute',
                    top: -8,
                    right: -8,
                    width: 18,
                    height: 18,
                    borderRadius: 9,
                    border: 'none',
                    background: '#c0392b',
                    color: '#fff',
                    fontSize: 11,
                    lineHeight: '18px',
                    padding: 0,
                    cursor: 'pointer',
                  }}
                  aria-label="Remove slot"
                >
                  ✕
                </button>
              </div>
            ))}
            <div
              style={{ position: 'absolute', bottom: 4, left: 4, display: 'flex', gap: 4 }}
            >
              <button style={BTN_SM} onPointerDown={(e) => e.stopPropagation()} onClick={() => addSlot(pageIdx, false)}>
                + sticker
              </button>
              <button style={BTN_SM} onPointerDown={(e) => e.stopPropagation()} onClick={() => addSlot(pageIdx, true)}>
                + photo
              </button>
              <button
                style={BTN_SM}
                onPointerDown={(e) => e.stopPropagation()}
                onClick={() => removePage(pageIdx)}
              >
                ✕ page
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
