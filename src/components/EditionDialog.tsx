import { useEffect, useState } from 'react';
import { useCollection } from '../store/collectionStore';
import { CC_EMOJI, EDITION_INFO } from '../data/sampleAlbum';
import type { Edition } from '../types';

interface Props {
  onClose: () => void;
}

const ORDER: Edition[] = ['latam', 'na'];

export default function EditionDialog({ onClose }: Props) {
  const edition = useCollection((s) => s.edition);
  const setEdition = useCollection((s) => s.setEdition);
  const trackCC = useCollection((s) => s.trackCC);
  const setTrackCC = useCollection((s) => s.setTrackCC);
  const albumName = useCollection((s) => s.albumName);
  const setAlbumName = useCollection((s) => s.setAlbumName);
  const albums = useCollection((s) => s.albums);
  const activeAlbumId = useCollection((s) => s.activeAlbumId);
  const createAlbum = useCollection((s) => s.createAlbum);
  const switchAlbum = useCollection((s) => s.switchAlbum);

  const [draft, setDraft] = useState(albumName);

  // The album name changes out from under us when the user creates or switches
  // albums, so keep the editable draft mirrored to the active album's name.
  useEffect(() => {
    setDraft(albumName);
  }, [albumName]);

  function handleNameBlur() {
    setAlbumName(draft);
  }

  function handleNameKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Enter') {
      setAlbumName(draft);
      e.currentTarget.blur();
    }
  }

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <h2>Settings</h2>

        <button type="button" className="btn full" onClick={() => createAlbum()} style={{ marginBottom: '1rem' }}>
          ➕ New Album
        </button>

        {albums.length > 1 && (
          <div style={{ marginBottom: '1rem' }}>
            <label
              htmlFor="album-selector"
              style={{ display: 'block', fontWeight: 600, marginBottom: '0.35rem', fontSize: '0.9rem' }}
            >
              Current album
            </label>
            <select
              id="album-selector"
              value={activeAlbumId}
              onChange={(e) => switchAlbum(e.target.value)}
              style={{
                width: '100%',
                padding: '0.5rem 0.75rem',
                border: '1.5px solid var(--border)',
                borderRadius: '8px',
                fontSize: '1rem',
                background: 'var(--surface)',
                color: 'var(--text)',
                boxSizing: 'border-box',
              }}
            >
              {albums.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.albumName}
                </option>
              ))}
            </select>
          </div>
        )}

        <div style={{ marginBottom: '1rem' }}>
          <label
            htmlFor="album-name-input"
            style={{ display: 'block', fontWeight: 600, marginBottom: '0.35rem', fontSize: '0.9rem' }}
          >
            Album name
          </label>
          <input
            id="album-name-input"
            type="text"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onBlur={handleNameBlur}
            onKeyDown={handleNameKeyDown}
            style={{
              width: '100%',
              padding: '0.5rem 0.75rem',
              border: '1.5px solid var(--border)',
              borderRadius: '8px',
              fontSize: '1rem',
              background: 'var(--surface)',
              color: 'var(--text)',
              boxSizing: 'border-box',
            }}
          />
        </div>

        <div style={{ marginBottom: '1rem' }}>
          <button
            type="button"
            className="setting-toggle"
            role="switch"
            aria-checked={trackCC}
            onClick={() => setTrackCC(!trackCC)}
          >
            <span className="setting-label">
              {CC_EMOJI} {trackCC ? 'Untrack' : 'Track'} Coca-Cola stickers
            </span>
            <span className={`switch${trackCC ? ' on' : ''}`} aria-hidden="true">
              <span className="knob" />
            </span>
          </button>
        </div>

        <h3 style={{ margin: '0.5rem 0 0.5rem', fontSize: '0.9rem', fontWeight: 600 }}>Album edition</h3>
        <p className="modal-sub">
          {trackCC
            ? 'The editions differ only in the Coca-Cola page size. Switching keeps all your existing stickers — it just shows or hides the extra slots.'
            : 'Turn on Coca-Cola tracking above to choose between the NORAM and LATAM editions.'}
        </p>

        {ORDER.map((key) => {
          const info = EDITION_INFO[key];
          const selected = edition === key;
          return (
            <button
              key={key}
              className="swap-card"
              disabled={!trackCC}
              style={{
                width: '100%',
                textAlign: 'left',
                borderColor: selected && trackCC ? 'var(--green)' : 'var(--border)',
                opacity: trackCC ? 1 : 0.45,
                cursor: trackCC ? 'pointer' : 'not-allowed',
              }}
              onClick={() => {
                setEdition(key);
                onClose();
              }}
            >
              <div className="swap-top">
                <span className="swap-name">{info.label}</span>
                {selected && trackCC && <span className="pill open">current</span>}
              </div>
              <div className="swap-summary">
                <span>{info.region}</span>
                <span>Coca-Cola: {info.ccCount} stickers</span>
              </div>
            </button>
          );
        })}

        <div className="btn-row">
          <button className="btn full" onClick={onClose}>
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
