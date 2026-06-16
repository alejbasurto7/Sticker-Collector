import { useState } from 'react';
import { useCollection } from '../store/collectionStore';
import { EDITION_INFO } from '../data/sampleAlbum';
import type { Edition } from '../types';

interface Props {
  onClose: () => void;
}

const ORDER: Edition[] = ['latam', 'na'];

export default function EditionDialog({ onClose }: Props) {
  const edition = useCollection((s) => s.edition);
  const setEdition = useCollection((s) => s.setEdition);
  const albumName = useCollection((s) => s.albumName);
  const setAlbumName = useCollection((s) => s.setAlbumName);

  const [draft, setDraft] = useState(albumName);

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

        <h3 style={{ margin: '0.5rem 0 0.5rem', fontSize: '0.9rem', fontWeight: 600 }}>Album edition</h3>
        <p className="modal-sub">
          The editions differ only in the Coca-Cola page size. Switching keeps all your
          existing stickers — it just shows or hides the extra slots.
        </p>

        {ORDER.map((key) => {
          const info = EDITION_INFO[key];
          const selected = edition === key;
          return (
            <button
              key={key}
              className="swap-card"
              style={{
                width: '100%',
                textAlign: 'left',
                borderColor: selected ? 'var(--green)' : 'var(--border)',
              }}
              onClick={() => {
                setEdition(key);
                onClose();
              }}
            >
              <div className="swap-top">
                <span className="swap-name">{info.label}</span>
                {selected && <span className="pill open">current</span>}
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
