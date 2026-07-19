import { useRef } from 'react';
import type { SectionTemplate } from '../../data/layoutGeometry';
import { tapVerb } from '../../utils/device';
import type { SelectedSlot } from './TemplateCanvas';

interface SlotInspectorProps {
  template: SectionTemplate;
  selected: SelectedSlot;
  onChange: (mut: (t: SectionTemplate) => void) => void;
  onChangeLive: (mut: (t: SectionTemplate) => void) => void;
  onGestureStart: () => void;
  snap: number;
  onSnapChange: (step: number) => void;
}

const SNAP_OPTIONS: { label: string; value: number }[] = [
  { label: 'Off', value: 0 },
  { label: '1%', value: 1 },
  { label: '2.5%', value: 2.5 },
  { label: '5%', value: 5 },
];

export default function SlotInspector({
  template, selected, onChange, onChangeLive, onGestureStart, snap, onSnapChange,
}: SlotInspectorProps) {
  const sliderArmed = useRef(false);
  const slot =
    selected != null
      ? template.pages[selected.pageIdx]?.slots[selected.slotIdx]
      : undefined;

  return (
    <div className="builder-inspector">
      {/* Snap control */}
      <div className="builder-field-row">
        <span className="builder-field-label">Snap</span>
        <select
          className="builder-select"
          value={snap}
          onChange={(e) => onSnapChange(Number(e.target.value))}
        >
          {SNAP_OPTIONS.map((opt) => (
            <option key={opt.value} value={opt.value}>{opt.label}</option>
          ))}
        </select>
      </div>

      {/* Sticker size slider */}
      <div className="builder-field-row">
        <span className="builder-field-label">Sticker size</span>
        <input
          type="range" min={10} max={40} step={0.25}
          value={template.stickerWidthPct}
          onPointerDown={() => { sliderArmed.current = true; }}
          onPointerUp={() => { sliderArmed.current = false; }}
          onBlur={() => { sliderArmed.current = false; }}
          onChange={(e) => {
            if (sliderArmed.current) { onGestureStart(); sliderArmed.current = false; }
            onChangeLive((t) => { t.stickerWidthPct = Number(e.target.value); });
          }}
        />
        <span style={{ fontSize: 11, opacity: 0.7, minWidth: 36 }}>
          {template.stickerWidthPct.toFixed(1)}%
        </span>
      </div>

      {/* Page aspect slider */}
      <div className="builder-field-row">
        <span className="builder-field-label">Page aspect</span>
        <input
          type="range" min={0.6} max={1.4} step={0.001}
          value={template.pageAspect}
          onPointerDown={() => { sliderArmed.current = true; }}
          onPointerUp={() => { sliderArmed.current = false; }}
          onBlur={() => { sliderArmed.current = false; }}
          onChange={(e) => {
            if (sliderArmed.current) { onGestureStart(); sliderArmed.current = false; }
            onChangeLive((t) => { t.pageAspect = Number(e.target.value); });
          }}
        />
        <span style={{ fontSize: 11, opacity: 0.7, minWidth: 36 }}>
          {template.pageAspect.toFixed(3)}
        </span>
      </div>

      {/* Slot-specific controls */}
      {slot != null ? (
        <>
          <hr style={{ border: 'none', borderTop: '1px solid var(--border)', margin: '10px 0' }} />

          {/* Orientation toggle */}
          <div className="builder-field-row">
            <span className="builder-field-label">Orientation</span>
            <button
              className="builder-btn builder-btn--sm"
              onClick={() =>
                onChange((t) => {
                  const s = t.pages[selected!.pageIdx].slots[selected!.slotIdx];
                  s.orientation = s.orientation === 'portrait' ? 'landscape' : 'portrait';
                })
              }
            >
              {slot.orientation === 'portrait' ? 'Portrait' : 'Landscape'}
            </button>
          </div>

          {/* Decorative checkbox */}
          <div className="builder-field-row">
            <span className="builder-field-label">Decorative</span>
            <input
              type="checkbox"
              checked={!!slot.decorative}
              onChange={(e) =>
                onChange((t) => {
                  const s = t.pages[selected!.pageIdx].slots[selected!.slotIdx];
                  if (e.target.checked) {
                    s.decorative = true;
                  } else {
                    delete s.decorative;
                  }
                })
              }
            />
          </div>

          {/* Read-only position */}
          <div className="builder-field-row">
            <span className="builder-field-label">Position</span>
            <span style={{ fontSize: 12, opacity: 0.8 }}>
              x: {slot.x.toFixed(1)}%&nbsp;&nbsp;y: {slot.y.toFixed(1)}%
            </span>
          </div>
        </>
      ) : (
        <p style={{ margin: '12px 0 4px', opacity: 0.55, fontSize: 12 }}>
          {tapVerb()} a slot to edit it.
        </p>
      )}
    </div>
  );
}
