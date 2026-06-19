import { useRef } from 'react';
import { type AlbumType } from '../../data/albumTypes';
import { addSection, moveSection, deleteSection } from '../registryOps';
import { type Confirm } from './useConfirm';

interface SectionListProps {
  type: AlbumType;
  selectedSectionId: string;
  onSelectSection: (id: string) => void;
  onUpdateType: (mut: (t: AlbumType) => AlbumType) => void;
  confirm: Confirm;
}

export default function SectionList({
  type, selectedSectionId, onSelectSection, onUpdateType, confirm,
}: SectionListProps) {
  const dragFrom = useRef<number | null>(null);

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
    const rows = Array.from(target.querySelectorAll<HTMLElement>('[data-row-index]'));
    let toIndex = from;
    for (const row of rows) {
      const rect = row.getBoundingClientRect();
      const mid = rect.top + rect.height / 2;
      if (e.clientY > mid) {
        toIndex = Number(row.dataset.rowIndex);
      }
    }

    if (toIndex !== from) {
      onUpdateType((t) => moveSection(t, from, toIndex));
    }
  };

  return (
    <div className="builder-panel">
      <strong>Sections</strong>
      <div
        onPointerUp={handleListPointerUp}
        style={{ display: 'flex', flexDirection: 'column', gap: 2, marginTop: 8 }}
      >
        {type.sections.length === 0 && (
          <p style={{ opacity: 0.6, fontSize: 13 }}>No sections yet.</p>
        )}
        {type.sections.map((s, i) => (
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
              onClick={(e) => { e.stopPropagation(); onUpdateType((t) => moveSection(t, i, i - 1)); }}
              aria-label="Move up"
            >↑</button>
            <button
              className="builder-btn builder-btn--sm"
              disabled={i === type.sections.length - 1}
              onClick={(e) => { e.stopPropagation(); onUpdateType((t) => moveSection(t, i, i + 1)); }}
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
