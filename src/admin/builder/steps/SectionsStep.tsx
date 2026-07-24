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
