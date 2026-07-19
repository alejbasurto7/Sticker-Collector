import { useCollection } from '../store/collectionStore';
import { useSyncMeta } from '../store/syncStore';
import { VERSION_LABEL } from '../version';
import SyncSection from './SyncSection';

interface Props {
  onClose: () => void;
}

/** App-wide settings only: appearance + the whole-collection Cloud link. Per-album
 *  settings live in AlbumDetailView; album switching lives in the Library sheet. */
export default function SettingsDialog({ onClose }: Props) {
  const theme = useCollection((s) => s.theme);
  const setTheme = useCollection((s) => s.setTheme);
  // Only manages an existing Cloud link; setup happens on a per-album Sharing → Cloud button.
  const hasCloudLink = useSyncMeta((s) => s.collection !== null);

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <h2>Settings</h2>

        <section className="settings-section">
          <h3 className="settings-heading">Appearance</h3>
          <div className="settings-card">
            <div className="setting-row">
              <span className="setting-row-ico" aria-hidden="true">{theme === 'light' ? '☀️' : '🌙'}</span>
              <span className="setting-row-text">
                <span className="setting-row-title" id="theme-label">Theme</span>
              </span>
              <span className="mini-seg" role="group" aria-labelledby="theme-label">
                {(['light', 'dark'] as const).map((opt) => (
                  <button
                    key={opt}
                    type="button"
                    className={theme === opt ? 'on' : ''}
                    aria-pressed={theme === opt}
                    onClick={() => setTheme(opt)}
                  >
                    {opt === 'light' ? 'Light' : 'Dark'}
                  </button>
                ))}
              </span>
            </div>
          </div>
        </section>

        {hasCloudLink && <SyncSection />}

        <div className="btn-row">
          <button className="btn full" onClick={onClose}>Close</button>
        </div>
        <p className="settings-version">{VERSION_LABEL}</p>
      </div>
    </div>
  );
}
