import { useState } from 'react';
import { useCollection } from '../store/collectionStore';
import { ALBUM_TYPES } from '../data/albumTypes';

const TYPES = Object.values(ALBUM_TYPES);

/**
 * First-run collection picker. App renders this (and nothing else) whenever the store has
 * no albums — a brand-new install, or after the user deleted their last album. Creating the
 * first album here replaces the old auto-seeded "My Album", so the user's very first album is
 * a collection they chose and (optionally) named. Mandatory: there is no dismiss, because the
 * app needs at least one album to show anything.
 */
export default function CollectionPickerOnboarding() {
  const createAlbum = useCollection((s) => s.createAlbum);
  const [typeId, setTypeId] = useState(TYPES[0]?.id ?? '');
  const [name, setName] = useState('');

  function start() {
    if (!typeId) return;
    createAlbum({ albumTypeId: typeId, name: name.trim() || undefined });
  }

  return (
    <div className="modal-backdrop" role="dialog" aria-modal="true" aria-label="Start your collection">
      <div className="modal welcome-modal" onClick={(e) => e.stopPropagation()}>
        <div className="onboarding-ribbon" aria-hidden="true" />
        <p className="whats-new-eyebrow">Welcome</p>
        <h2 className="whats-new-title">Start your collection</h2>
        <p className="modal-sub">Pick the album you’re collecting. You can add more later.</p>

        <div className="collection-picker-list">
          {TYPES.map((t) => {
            const selected = t.id === typeId;
            return (
              <button
                key={t.id}
                type="button"
                className="swap-card edition-card collection-picker-card"
                style={{ borderColor: selected ? 'var(--green)' : undefined }}
                aria-pressed={selected}
                onClick={() => setTypeId(t.id)}
              >
                <div className="swap-top">
                  <span className="swap-name">{t.name}</span>
                  {selected && <span className="pill open">selected</span>}
                </div>
              </button>
            );
          })}
        </div>

        <div className="settings-field">
          <label htmlFor="first-album-name" className="settings-field-label">Album name (optional)</label>
          <input
            id="first-album-name"
            type="text"
            className="settings-input"
            placeholder="e.g. Leo’s album"
            value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') start(); }}
          />
        </div>

        <div className="btn-row" style={{ marginTop: 12 }}>
          <button type="button" className="btn primary full" onClick={start} disabled={!typeId}>
            Start collecting
          </button>
        </div>
      </div>
    </div>
  );
}
