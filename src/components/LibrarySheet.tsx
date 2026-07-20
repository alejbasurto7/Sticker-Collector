import { useState } from 'react';
import { useCollection } from '../store/collectionStore';
import { useSyncMeta } from '../store/syncStore';
import AlbumCard from './AlbumCard';
import { isSyncConfigured } from '../lib/supabase';
import JoinAlbumDialog from './JoinAlbumDialog';

interface Props {
  onClose: () => void;
  onManageAlbum: (id: string) => void; // App switches + opens the album detail
  onOpenCloudSync: () => void;         // manage the whole-collection Cloud link (only if one exists)
}

export default function LibrarySheet({ onClose, onManageAlbum, onOpenCloudSync }: Props) {
  const albums = useCollection((s) => s.albums);
  const activeAlbumId = useCollection((s) => s.activeAlbumId);
  const switchAlbum = useCollection((s) => s.switchAlbum);
  const createAlbum = useCollection((s) => s.createAlbum);
  const setAlbumName = useCollection((s) => s.setAlbumName);
  // A whole-collection Cloud link only exists once the user has set up Cloud sync
  // (via a per-album Sharing → Cloud). Until then there's nothing to manage here.
  const hasCloudLink = useSyncMeta((s) => s.collection !== null);

  // New-album naming step, and a short confirmation after it lands in the list.
  const [naming, setNaming] = useState(false);
  const [draft, setDraft] = useState('');
  const [justCreated, setJustCreated] = useState<string | null>(null);
  const [joining, setJoining] = useState(false);

  function open(id: string) {
    switchAlbum(id);
    onClose();
  }

  function confirmCreate() {
    createAlbum(); // creates AND makes the new album active
    const trimmed = draft.trim();
    if (trimmed) setAlbumName(trimmed); // override the auto-generated default
    setNaming(false);
    // Stay in the sheet so the new album is visibly added to the list (marked
    // "Current"); confirm it by name so the user knows it was created.
    setJustCreated(trimmed || 'New album');
  }

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <h2>Your albums</h2>

        {justCreated && (
          <p className="library-created" role="status">
            ✓ “{justCreated}” created — it’s in your list below.
          </p>
        )}

        <div className="album-list">
          {albums.map((a) => (
            <AlbumCard
              key={a.id}
              album={a}
              isActive={a.id === activeAlbumId}
              onOpen={() => open(a.id)}
              onManage={() => onManageAlbum(a.id)}
            />
          ))}
        </div>
        <div className="btn-row" style={{ marginTop: 12 }}>
          <button
            type="button"
            className="btn primary full"
            onClick={() => { setDraft(''); setJustCreated(null); setNaming(true); }}
          >
            ➕ New album
          </button>
          {isSyncConfigured && (
            <button
              type="button"
              className="btn full"
              onClick={() => { setJustCreated(null); setJoining(true); }}
            >
              📥 Join a shared album
            </button>
          )}
        </div>
        {hasCloudLink && (
          <button type="button" className="btn full" style={{ marginTop: 8 }} onClick={onOpenCloudSync}>
            ☁️ Cloud sync
          </button>
        )}
        <div className="btn-row" style={{ marginTop: 8 }}>
          <button className="btn full" onClick={onClose}>Close</button>
        </div>
      </div>

      {naming && (
        <div className="modal-backdrop" onClick={() => setNaming(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <h2>New album</h2>
            <p className="modal-sub">Give your new album a name. You can change it later from its settings.</p>
            <div className="settings-field">
              <label htmlFor="new-album-name" className="settings-field-label">Album name</label>
              <input
                id="new-album-name"
                type="text"
                className="settings-input"
                placeholder="e.g. Leo’s album"
                value={draft}
                autoFocus
                onChange={(e) => setDraft(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') confirmCreate(); }}
              />
            </div>
            <div className="btn-row">
              <button type="button" className="btn full" onClick={() => setNaming(false)}>Cancel</button>
              <button type="button" className="btn primary full" onClick={confirmCreate}>Create album</button>
            </div>
          </div>
        </div>
      )}

      {joining && (
        <JoinAlbumDialog
          onClose={() => setJoining(false)}
          onJoined={() => { setJoining(false); onClose(); }}
        />
      )}
    </div>
  );
}
