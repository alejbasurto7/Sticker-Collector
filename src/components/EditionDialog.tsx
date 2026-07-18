import { useEffect, useState } from 'react';
import { useCollection } from '../store/collectionStore';
import { useSyncMeta } from '../store/syncStore';
import { resolveAlbumName } from '../sync/albumMode';
import { useForcedReadOnly } from '../sync/useAlbumMode';
import { CC_EMOJI, EDITION_INFO } from '../data/sampleAlbum';
import { ALBUM_TYPE } from '../config';
import { VERSION_LABEL } from '../version';
import type { Edition } from '../types';
import { buildListExport } from '../utils/listExport';
import { copyToClipboard } from '../utils/share';
import { deleteAlbumEverywhere } from '../sync/engine';
import AlbumSharing from './AlbumSharing';
import ImportDialog from './ImportDialog';
import SyncSection from './SyncSection';

interface Props {
  onClose: () => void;
}

const ORDER: Edition[] = ['latam', 'na'];

export default function EditionDialog({ onClose }: Props) {
  const edition = useCollection((s) => s.edition);
  const setEdition = useCollection((s) => s.setEdition);
  const trackCC = useCollection((s) => s.trackCC);
  const setTrackCC = useCollection((s) => s.setTrackCC);
  const theme = useCollection((s) => s.theme);
  const toggleTheme = useCollection((s) => s.toggleTheme);
  const albumName = useCollection((s) => s.albumName);
  const setAlbumName = useCollection((s) => s.setAlbumName);
  const albums = useCollection((s) => s.albums);
  const activeAlbumId = useCollection((s) => s.activeAlbumId);
  const createAlbum = useCollection((s) => s.createAlbum);
  const switchAlbum = useCollection((s) => s.switchAlbum);
  const counts = useCollection((s) => s.counts);
  const localAlbumNames = useSyncMeta((s) => s.localAlbumNames);
  const forcedReadOnly = useForcedReadOnly();

  const [draft, setDraft] = useState(albumName);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [exported, setExported] = useState(false);

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

  async function handleConfirmDelete() {
    await deleteAlbumEverywhere(activeAlbumId);
    setConfirmingDelete(false);
    onClose();
  }

  // Copy the whole collection to the clipboard in the exact "Figuritas App - List"
  // format the Import dialog consumes, so it can be transferred to another app or
  // kept as a backup. Both sections + swap quantities make the export lossless.
  async function handleExport() {
    const text = buildListExport(counts, albumName, 'both', true);
    const ok = await copyToClipboard(text);
    if (ok) {
      setExported(true);
      window.setTimeout(() => setExported(false), 1800);
    }
  }

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <h2>Settings</h2>

        {/* ---------- Album ---------- */}
        <section className="settings-section">
          <h3 className="settings-heading">Album</h3>

          {albums.length > 1 && (
            <div className="settings-field">
              <label htmlFor="album-selector" className="settings-field-label">
                Current album
              </label>
              <select
                id="album-selector"
                className="settings-select"
                value={activeAlbumId}
                onChange={(e) => switchAlbum(e.target.value)}
              >
                {albums.map((a) => (
                  <option key={a.id} value={a.id}>
                    {resolveAlbumName(a.id, a.albumName, localAlbumNames)}
                  </option>
                ))}
              </select>
            </div>
          )}

          <div className="settings-field">
            <label htmlFor="album-name-input" className="settings-field-label">
              Album name
            </label>
            <input
              id="album-name-input"
              type="text"
              className="settings-input"
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onBlur={handleNameBlur}
              onKeyDown={handleNameKeyDown}
              disabled={forcedReadOnly}
            />
          </div>

          <div className="settings-actions">
            <button
              type="button"
              className="btn full"
              style={{ gridColumn: '1 / -1' }}
              onClick={() => createAlbum()}
            >
              ➕ New Album
            </button>
            <button
              type="button"
              className="btn full"
              onClick={() => setImportOpen(true)}
              disabled={forcedReadOnly}
            >
              ⬇ Import…
            </button>
            <button
              type="button"
              className="btn full"
              onClick={handleExport}
              aria-live="polite"
            >
              {exported ? '✓ Copied' : '⬆ Export'}
            </button>
          </div>

          <AlbumSharing key={activeAlbumId} />
        </section>

        {/* ---------- Sync (self-hides when Supabase isn't configured) ---------- */}
        <SyncSection />

        {/* ---------- Appearance ---------- */}
        <section className="settings-section">
          <h3 className="settings-heading">Appearance</h3>
          <button
            type="button"
            className="setting-toggle"
            role="switch"
            aria-checked={theme === 'light'}
            aria-label="Toggle light mode"
            onClick={toggleTheme}
          >
            <span className="setting-label">{theme === 'light' ? '☀️ Light mode' : '🌙 Dark mode'}</span>
            <span className={`switch theme-switch${theme === 'light' ? ' on' : ''}`} aria-hidden="true">
              <span className="knob">{theme === 'light' ? '☀️' : '🌙'}</span>
            </span>
          </button>
        </section>

        {/* ---------- Coca-Cola tracking ---------- */}
        <section className="settings-section">
          <h3 className="settings-heading">Coca-Cola tracking</h3>
          <button
            type="button"
            className="setting-toggle"
            role="switch"
            aria-checked={trackCC}
            onClick={() => setTrackCC(!trackCC)}
            disabled={forcedReadOnly}
          >
            <span className="setting-label">
              {CC_EMOJI} {trackCC ? 'Untrack' : 'Track'} Coca-Cola stickers
            </span>
            <span className={`switch${trackCC ? ' on' : ''}`} aria-hidden="true">
              <span className="knob" />
            </span>
          </button>

          <p className="modal-sub" style={{ margin: '12px 0 0' }}>
            {trackCC
              ? 'The editions differ only in the Coca-Cola page size. Switching keeps all your existing stickers — it just shows or hides the extra slots.'
              : 'Turn on Coca-Cola tracking above to choose between the NORAM and LATAM editions.'}
          </p>

          {trackCC && (
            <div className="edition-grid">
              {ORDER.map((key) => {
                const info = EDITION_INFO[key];
                const selected = edition === key;
                return (
                  <button
                    key={key}
                    className="swap-card edition-card"
                    style={{ borderColor: selected ? 'var(--green)' : undefined }}
                    onClick={() => {
                      setEdition(key);
                      onClose();
                    }}
                    disabled={forcedReadOnly}
                  >
                    <div className="swap-top">
                      <span className="swap-name">{info.label}</span>
                      {selected && <span className="pill open">current</span>}
                    </div>
                    <div className="swap-summary edition-summary">
                      <span>{info.region}</span>
                      <span>Coca-Cola: {info.ccCount} stickers</span>
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </section>

        {/* ---------- Danger zone ---------- */}
        <section className="settings-section">
          <h3 className="settings-heading danger-heading">Danger zone</h3>
          <button
            type="button"
            className="btn danger full"
            onClick={() => setConfirmingDelete(true)}
          >
            🗑️ Delete album
          </button>
        </section>

        <div className="btn-row">
          <button className="btn full" onClick={onClose}>
            Close
          </button>
        </div>

        <p className="settings-version">{VERSION_LABEL}</p>
      </div>

      {confirmingDelete && (
        <div className="modal-backdrop" onClick={() => setConfirmingDelete(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <h2>Delete album?</h2>
            <p className="modal-sub">
              This will permanently delete the album below, along with its stickers and
              swaps. This action cannot be undone.
            </p>
            <div
              style={{
                border: '1.5px solid var(--border)',
                borderRadius: '8px',
                padding: '0.75rem',
                marginBottom: '0.5rem',
              }}
            >
              <div style={{ fontWeight: 700, fontSize: '1rem' }}>
                {resolveAlbumName(activeAlbumId, albumName, localAlbumNames)}
              </div>
              <div style={{ color: 'var(--text-dim)', fontSize: '0.85rem' }}>{ALBUM_TYPE}</div>
            </div>
            <div className="btn-row">
              <button className="btn full" onClick={() => setConfirmingDelete(false)}>
                Cancel
              </button>
              <button className="btn danger full" onClick={handleConfirmDelete}>
                Delete
              </button>
            </div>
          </div>
        </div>
      )}

      {importOpen && <ImportDialog onClose={() => setImportOpen(false)} />}
    </div>
  );
}
