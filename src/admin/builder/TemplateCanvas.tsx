import { useRef, useState } from 'react';
import type { PointerEvent as ReactPointerEvent } from 'react';
import {
  slotBox, bindTemplate, clientToPagePercent,
  type SectionTemplate,
} from '../../data/layoutGeometry';
import { snapTo } from './history';

export type SelectedSlot = { pageIdx: number; slotIdx: number } | null;

interface TemplateCanvasProps {
  template: SectionTemplate;
  /** Sticker numbers in bind order — shown as the label on each real slot. */
  numbers: string[];
  /** Apply a mutation to the live template (the parent clones + persists). Records history. */
  onChange: (mut: (t: SectionTemplate) => void) => void;
  /** Apply a mutation live (no per-tick history). Use during drag gestures. */
  onChangeLive: (mut: (t: SectionTemplate) => void) => void;
  /** Record ONE history checkpoint at the start of a gesture. */
  onGestureStart: () => void;
  /** Currently selected slot (lifted to parent). */
  selected: SelectedSlot;
  /** Called when a slot is tapped (no drag). */
  onSelect: (sel: SelectedSlot) => void;
  /** Snap step in percentage points; 0 = off. */
  snap: number;
}

export default function TemplateCanvas({
  template, numbers, onChange, onChangeLive, onGestureStart, selected, onSelect, snap,
}: TemplateCanvasProps) {
  const bound = bindTemplate(template, numbers);
  const pageRefs = useRef<(HTMLDivElement | null)[]>([]);
  const drag = useRef<{ pageIdx: number; slotIdx: number; moved: boolean } | null>(null);
  const [draggingSlot, setDraggingSlot] = useState<{ pageIdx: number; slotIdx: number } | null>(null);

  const onSlotPointerDown =
    (pageIdx: number, slotIdx: number) => (e: ReactPointerEvent) => {
      e.preventDefault();
      (e.target as Element).setPointerCapture?.(e.pointerId);
      drag.current = { pageIdx, slotIdx, moved: false };
      setDraggingSlot({ pageIdx, slotIdx });
    };

  const onSlotPointerMove = (e: ReactPointerEvent) => {
    const d = drag.current;
    if (!d) return;
    const el = pageRefs.current[d.pageIdx];
    if (!el) return;
    const { x, y } = clientToPagePercent(e.clientX, e.clientY, el.getBoundingClientRect());
    if (!d.moved) { d.moved = true; onGestureStart(); }   // one checkpoint per drag
    onChangeLive((t) => {                                  // live, no per-tick history
      const slot = t.pages[d.pageIdx].slots[d.slotIdx];
      slot.x = snap > 0 ? snapTo(x, snap) : Math.round(x * 10) / 10;
      slot.y = snap > 0 ? snapTo(y, snap) : Math.round(y * 10) / 10;
    });
  };

  const onSlotPointerUp = (pageIdx: number, slotIdx: number) => () => {
    const d = drag.current;
    drag.current = null;
    setDraggingSlot(null);
    if (d && !d.moved) {
      // A tap (no drag) selects the slot.
      onSelect({ pageIdx, slotIdx });
    }
  };

  const removeSlot = (pageIdx: number, slotIdx: number) =>
    onChange((t) => { t.pages[pageIdx].slots.splice(slotIdx, 1); });

  const addSlot = (pageIdx: number, decorative: boolean) =>
    onChange((t) => {
      t.pages[pageIdx].slots.push({
        x: 50, y: 50, orientation: decorative ? 'landscape' : 'portrait',
        ...(decorative ? { decorative: true } : {}),
      });
    });

  const addPage = () => onChange((t) => { t.pages.push({ slots: [] }); });
  const removePage = (pageIdx: number) =>
    onChange((t) => { if (t.pages.length > 1) t.pages.splice(pageIdx, 1); });

  const labels = (pageIdx: number): string[] =>
    bound.pages[pageIdx].placements.map((pl) =>
      pl.slot.decorative ? '—' : (pl.stickerId ?? '·'),
    );

  return (
    <div>
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center', marginBottom: 10 }}>
        <button className="builder-btn builder-btn--sm" onClick={addPage}>+ page</button>
        {bound.unplaced.length > 0 && (
          <span className="builder-validation builder-validation--warn">
            {bound.unplaced.length} sticker(s) unplaced — add slots to place them
          </span>
        )}
      </div>

      {/* Two pages per row (left + right) so the canvas mirrors an open album spread;
          fixed grid columns keep every page the same size regardless of page count. */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', columnGap: 10, rowGap: 22, alignItems: 'start', maxWidth: 720 }}>
        {template.pages.map((p, pageIdx) => (
          <div key={pageIdx} style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <div
              ref={(el) => (pageRefs.current[pageIdx] = el)}
              className="builder-page"
              style={{ aspectRatio: String(template.pageAspect) }}
              onPointerMove={onSlotPointerMove}
            >
              {p.slots.map((slot, slotIdx) => {
                const b = slotBox(slot, template);
                const isSelected = selected?.pageIdx === pageIdx && selected?.slotIdx === slotIdx;
                const isDragging =
                  draggingSlot?.pageIdx === pageIdx && draggingSlot?.slotIdx === slotIdx;
                return (
                  <div
                    key={slotIdx}
                    className={`builder-slot ${slot.decorative ? 'is-decorative' : 'is-real'} ${isSelected ? 'is-selected' : ''} ${isDragging ? 'is-dragging' : ''}`}
                    style={{
                      left: `${b.leftPct}%`,
                      top: `${b.topPct}%`,
                      width: `${b.widthPct}%`,
                      height: `${b.heightPct}%`,
                    }}
                    onPointerDown={onSlotPointerDown(pageIdx, slotIdx)}
                    onPointerUp={onSlotPointerUp(pageIdx, slotIdx)}
                  >
                    {labels(pageIdx)[slotIdx]}
                    <button
                      className="builder-slot-remove"
                      onPointerDown={(e) => e.stopPropagation()}
                      onClick={(e) => { e.stopPropagation(); removeSlot(pageIdx, slotIdx); }}
                      aria-label="Remove slot"
                    >✕</button>
                  </div>
                );
              })}
            </div>
            <div style={{ display: 'flex', gap: 4, justifyContent: 'center' }}>
              <button className="builder-btn builder-btn--sm" onClick={() => addSlot(pageIdx, false)}>+ slot</button>
              <button className="builder-btn builder-btn--sm" onClick={() => addSlot(pageIdx, true)}>+ decorative</button>
              <button className="builder-btn builder-btn--sm" onClick={() => removePage(pageIdx)}>✕ page</button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
