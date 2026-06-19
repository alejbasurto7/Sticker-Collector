import type { AlbumType } from '../../../data/albumTypes';
import VariantManager from '../VariantManager';
import { type Confirm } from '../useConfirm';

interface TypeStepProps {
  type: AlbumType;
  onRename: (name: string) => void;
  onUpdateType: (mut: (t: AlbumType) => AlbumType) => void;
  confirm: Confirm;
}

export default function TypeStep({ type, onRename, onUpdateType, confirm }: TypeStepProps) {
  return (
    <div className="builder-panel">
      <strong>Album type</strong>
      <div className="builder-field-row">
        <span className="builder-field-label">Name</span>
        <input
          className="builder-input"
          value={type.name}
          onChange={(e) => onRename(e.target.value)}
        />
      </div>
      <div className="builder-field-row">
        <span className="builder-field-label">ID</span>
        <span>{type.id}</span>
      </div>
      <p style={{ fontSize: 12, opacity: 0.7, margin: '2px 0 10px' }}>
        The id is permanent — create a new type to change it.
      </p>
      <VariantManager type={type} onUpdateType={onUpdateType} confirm={confirm} />
    </div>
  );
}
