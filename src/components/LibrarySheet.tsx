import { useCollection } from '../store/collectionStore';
import AlbumCard from './AlbumCard';

interface Props {
  onClose: () => void;
  onManageAlbum: (id: string) => void; // App switches + opens the album detail
  onOpenSettings: () => void;
}

export default function LibrarySheet({ onClose, onManageAlbum, onOpenSettings }: Props) {
  const albums = useCollection((s) => s.albums);
  const activeAlbumId = useCollection((s) => s.activeAlbumId);
  const switchAlbum = useCollection((s) => s.switchAlbum);
  const createAlbum = useCollection((s) => s.createAlbum);

  function open(id: string) {
    switchAlbum(id);
    onClose();
  }
  function newAlbum() {
    createAlbum(); // creates AND makes the new album active
    onClose();
  }

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <h2>Your albums</h2>
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
          <button type="button" className="btn primary full" onClick={newAlbum}>➕ New album</button>
          <button type="button" className="btn full" disabled title="Coming soon">👥 Groups</button>
        </div>
        <button type="button" className="btn full" style={{ marginTop: 8 }} onClick={onOpenSettings}>
          ⚙️ App settings
        </button>
        <div className="btn-row" style={{ marginTop: 8 }}>
          <button className="btn full" onClick={onClose}>Close</button>
        </div>
      </div>
    </div>
  );
}
