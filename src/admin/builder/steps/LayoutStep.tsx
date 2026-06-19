import { useState } from 'react';
import type { AlbumType, SectionDef } from '../../../data/albumTypes';
import type { SectionTemplate } from '../../../data/layoutGeometry';
import { newTemplate, cloneTemplate, deleteTemplate } from '../../registryOps';
import { type Confirm } from '../useConfirm';
import TemplateCanvas, { type SelectedSlot } from '../TemplateCanvas';
import SlotInspector from '../SlotInspector';
import { ALBUM_TYPES } from '../../../data/albumTypes';

interface LayoutStepProps {
  type: AlbumType;
  section: SectionDef | undefined;
  template: SectionTemplate | undefined;
  previewNumbers: string[];
  editingTypeId: string;
  otherTypeIds: string[];
  selectedSlot: SelectedSlot;
  onSelectSlot: (sel: SelectedSlot) => void;
  onUpdateType: (mut: (t: AlbumType) => AlbumType) => void;
  onCanvasChange: (mut: (t: SectionTemplate) => void) => void;
  onResetTemplate: () => void;
  onCopyTemplate: (toId: string) => void;
  confirm: Confirm;
}

export default function LayoutStep({
  section,
  template,
  previewNumbers,
  editingTypeId,
  otherTypeIds,
  selectedSlot,
  onSelectSlot,
  onUpdateType,
  onCanvasChange,
  onResetTemplate,
  onCopyTemplate,
  confirm,
}: LayoutStepProps) {
  const [snap, setSnap] = useState(0);

  const hasSeedTemplate =
    section != null && !!ALBUM_TYPES[editingTypeId]?.templates[section.templateId];

  return (
    <div>
      {/* Template toolbar */}
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 10, alignItems: 'center' }}>
        <button
          className="builder-btn builder-btn--sm"
          onClick={() => onUpdateType((t) => newTemplate(t, 'template'))}
        >
          + template
        </button>

        {section?.templateId && (
          <>
            <button
              className="builder-btn builder-btn--sm"
              onClick={() =>
                onUpdateType((t) =>
                  cloneTemplate(t, section.templateId, `${section.templateId}-copy`),
                )
              }
            >
              Clone
            </button>

            <button
              className="builder-btn builder-btn--sm builder-btn--danger"
              onClick={async () => {
                const ok = await confirm({
                  message: `Delete template "${section.templateId}"? This cannot be undone.`,
                  confirmLabel: 'Delete',
                  danger: true,
                });
                if (ok) onUpdateType((t) => deleteTemplate(t, section.templateId));
              }}
            >
              Delete template
            </button>

            {hasSeedTemplate && (
              <button className="builder-btn builder-btn--sm" onClick={onResetTemplate}>
                Reset template
              </button>
            )}

            {otherTypeIds.length > 0 && (
              <label style={{ fontSize: 12 }}>
                Copy →{' '}
                <select
                  className="builder-select"
                  value=""
                  onChange={(e) => {
                    const to = e.target.value;
                    if (!to) return;
                    onCopyTemplate(to);
                  }}
                >
                  <option value="">(album type)</option>
                  {otherTypeIds.map((id) => (
                    <option key={id} value={id}>{id}</option>
                  ))}
                </select>
              </label>
            )}
          </>
        )}
      </div>

      {/* Main content */}
      {section && template ? (
        <div className="builder-two-pane">
          <TemplateCanvas
            template={template}
            numbers={previewNumbers}
            onChange={onCanvasChange}
            selected={selectedSlot}
            onSelect={onSelectSlot}
            snap={snap}
          />
          <SlotInspector
            template={template}
            selected={selectedSlot}
            onChange={onCanvasChange}
            snap={snap}
            onSnapChange={setSnap}
          />
        </div>
      ) : (
        <p style={{ opacity: 0.6 }}>Pick a section with a template in Sections first.</p>
      )}
    </div>
  );
}
