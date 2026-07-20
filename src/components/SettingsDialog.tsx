import SyncSection from './SyncSection';

interface Props {
  onClose: () => void;
}

/** Whole-collection Cloud sync management (view/copy the sync code + status).
 *  Reached from the Library sheet only when a Cloud link exists. Theme now lives
 *  on the header sun/moon button; the app version shows in the Help window footer. */
export default function SettingsDialog({ onClose }: Props) {
  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <h2>Cloud sync</h2>
        <SyncSection />
        <div className="btn-row">
          <button className="btn full" onClick={onClose}>Close</button>
        </div>
      </div>
    </div>
  );
}
