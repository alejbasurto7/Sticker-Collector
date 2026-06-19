import { type AlbumType } from '../../../data/albumTypes';
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

  return (
    <div>
      <BulkAddPanel type={type} onUpdateType={onUpdateType} />
      <div className="builder-two-pane" style={{ marginTop: 8 }}>
        <SectionList
          type={type}
          selectedSectionId={selectedSectionId}
          onSelectSection={onSelectSection}
          onUpdateType={onUpdateType}
          confirm={confirm}
        />
        {section ? (
          <SectionInspector type={type} section={section} onUpdateType={onUpdateType} />
        ) : (
          <div className="builder-panel">
            <p style={{ opacity: 0.6 }}>Select or add a section to edit it.</p>
          </div>
        )}
      </div>
    </div>
  );
}
