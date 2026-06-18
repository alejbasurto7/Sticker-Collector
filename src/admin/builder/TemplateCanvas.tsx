import { useRef } from 'react';
import type { CSSProperties, PointerEvent as ReactPointerEvent } from 'react';
import {
  slotBox, bindTemplate, clientToPagePercent,
  type SectionTemplate, type TemplateSlot,
} from '../../data/layoutGeometry';
import { BTN, BTN_SM } from './ui';

interface TemplateCanvasProps {
  template: SectionTemplate;
  /** Sticker numbers in bind order — shown as the label on each real slot. */
  numbers: string[];
  /** Apply a mutation to the live template (the parent clones + persists). */
  onChange: (mut: (t: SectionTemplate) => void) => void;
}

export default function TemplateCanvas({ template, numbers, onChange }: TemplateCanvasProps) {
  const bound = bindTemplate(template, numbers);
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
    onChange((t) => {
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
      onChange((t) => {
        const slot = t.pages[pageIdx].slots[slotIdx];
        slot.orientation = slot.orientation === 'portrait' ? 'landscape' : 'portrait';
      });
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
  const setWidth = (v: number) => onChange((t) => { t.stickerWidthPct = v; });
  const setAspect = (v: number) => onChange((t) => { t.pageAspect = v; });

  const labels = (pageIdx: number): string[] =>
    bound.pages[pageIdx].placements.map((pl) =>
      pl.slot.decorative ? '—' : (pl.stickerId ?? '·'),
    );

  const slotStyle = (slot: TemplateSlot): CSSProperties => {
    const b = slotBox(slot, template);
    return {
      position: 'absolute',
      left: `${b.leftPct}%`, top: `${b.topPct}%`,
      width: `${b.widthPct}%`, height: `${b.heightPct}%`,
      transform: 'translate(-50%, -50%)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      border: '1px solid #6aa9ff', borderRadius: 6,
      background: slot.decorative ? 'rgba(255,255,255,0.06)' : 'rgba(106,169,255,0.18)',
      borderStyle: slot.decorative ? 'dashed' : 'solid',
      color: '#cfe0ff', fontWeight: 800, fontSize: 12,
      cursor: 'grab', touchAction: 'none', userSelect: 'none',
    };
  };

  return (
    <div>
      <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap', alignItems: 'center', marginBottom: 12, fontSize: 13 }}>
        <label>
          Sticker size: {template.stickerWidthPct.toFixed(1)}%{' '}
          <input type="range" min={10} max={40} step={0.25}
            value={template.stickerWidthPct} onChange={(e) => setWidth(Number(e.target.value))} />
        </label>
        <label>
          Page aspect: {template.pageAspect.toFixed(3)}{' '}
          <input type="range" min={0.6} max={1.4} step={0.001}
            value={template.pageAspect} onChange={(e) => setAspect(Number(e.target.value))} />
        </label>
        <button style={BTN} onClick={addPage}>+ page</button>
        {bound.unplaced.length > 0 && (
          <span style={{ color: '#f0b450' }}>
            {bound.unplaced.length} sticker(s) unplaced — add slots to place them
          </span>
        )}
      </div>

      <div style={{ display: 'flex', gap: 16, alignItems: 'flex-start', flexWrap: 'wrap' }}>
        {template.pages.map((p, pageIdx) => (
          <div key={pageIdx} style={{ flex: '1 1 0', maxWidth: 320, display: 'flex', flexDirection: 'column', gap: 6 }}>
            <div ref={(el) => (pageRefs.current[pageIdx] = el)}
              style={{ position: 'relative', width: '100%', aspectRatio: String(template.pageAspect),
                background: '#11161d', border: '1px solid #2a3340', borderRadius: 8 }}>
              {p.slots.map((slot, slotIdx) => (
                <div key={slotIdx} style={slotStyle(slot)}
                  onPointerDown={onSlotPointerDown(pageIdx, slotIdx)}
                  onPointerMove={onSlotPointerMove}
                  onPointerUp={onSlotPointerUp(pageIdx, slotIdx)}>
                  {labels(pageIdx)[slotIdx]}
                  <button onPointerDown={(e) => e.stopPropagation()}
                    onClick={(e) => { e.stopPropagation(); removeSlot(pageIdx, slotIdx); }}
                    style={{ position: 'absolute', top: -8, right: -8, width: 18, height: 18, borderRadius: 9,
                      border: 'none', background: '#c0392b', color: '#fff', fontSize: 11, lineHeight: '18px',
                      padding: 0, cursor: 'pointer' }}
                    aria-label="Remove slot">✕</button>
                </div>
              ))}
            </div>
            <div style={{ display: 'flex', gap: 4, justifyContent: 'center' }}>
              <button style={BTN_SM} onClick={() => addSlot(pageIdx, false)}>+ sticker</button>
              <button style={BTN_SM} onClick={() => addSlot(pageIdx, true)}>+ photo</button>
              <button style={BTN_SM} onClick={() => removePage(pageIdx)}>✕ page</button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
