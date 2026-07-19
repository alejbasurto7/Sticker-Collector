import { useEffect, useMemo, useState } from 'react';
import { useCollection } from '../store/collectionStore';
import { useSyncMeta } from '../store/syncStore';
import { resolveAlbumName } from '../sync/albumMode';
import { useForcedReadOnly } from '../sync/useAlbumMode';
import { album, CC_EMOJI, EDITION_INFO } from '../data/sampleAlbum';
import { ALBUM_TYPE } from '../config';
import type { Edition } from '../types';
import { buildListExport } from '../utils/listExport';
import { copyToClipboard } from '../utils/share';
import { deleteAlbumEverywhere } from '../sync/engine';
import AlbumSharing from './AlbumSharing';
import ImportDialog from './ImportDialog';
import { pagesSupportPages } from '../data/layouts';

interface Props {
  onClose: () => void;
}

const ORDER: Edition[] = ['latam', 'na'];

/** Per-album settings hub. App switches to this album before opening, so every
 *  control edits the mirrored active-album state — never a parked snapshot. */
export default function AlbumDetailView({ onClose }: Props) {
  const edition = useCollection((s) => s.edition);
  const setEdition = useCollection((s) => s.setEdition);
  const trackCC = useCollection((s) => s.trackCC);
  const setTrackCC = useCollection((s) => s.setTrackCC);
  const albumLayout = useCollection((s) => s.albumLayout);
  const setAlbumLayout = useCollection((s) => s.setAlbumLayout);
  const albumName = useCollection((s) => s.albumName);
  const setAlbumName = useCollection((s) => s.setAlbumName);
  const activeAlbumId = useCollection((s) => s.activeAlbumId);
  const counts = useCollection((s) => s.counts);
  const localAlbumNames = useSyncMeta((s) => s.localAlbumNames);
  const forcedReadOnly = useForcedReadOnly();

  const [draft, setDraft] = useState(albumName);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [exported, setExported] = useState(false);

  const supportsPages = useMemo(() => pagesSupportPages(album.pages), [edition, trackCC]);

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
  async function handleExport() {
    const text = buildListExport(counts, albumName, 'both', true);
    if (await copyToClipboard(text)) {
      setExported(true);
      window.setTimeout(() => setExported(false), 1800);
    }
  }

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <h2>{resolveAlbumName(activeAlbumId, albumName, localAlbumNames)}</h2>
        <p className="modal-sub">{ALBUM_TYPE}</p>

        {/* ---------- Name / transfer / sharing ---------- */}
        <section className="settings-section">
          <div className="settings-field">
            <label htmlFor="album-name-input" className="settings-field-label">Album name</label>
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
            <button type="button" className="btn full" onClick={() => setImportOpen(true)} disabled={forcedReadOnly}>
              ⬇ Import…
            </button>
            <button type="button" className="btn full" onClick={handleExport} aria-live="polite">
              {exported ? '✓ Copied' : '⬆ Export'}
            </button>
          </div>
          <AlbumSharing key={activeAlbumId} />
        </section>

        {/* ---------- Layout ---------- */}
        <section className="settings-section">
          <h3 className="settings-heading">Layout</h3>
          <div className="settings-card">
            <div className="setting-row">
              <span className="setting-row-text">
                <span className="setting-row-title" id="layout-label">Layout</span>
                <span className="setting-row-sub">
                  {supportsPages ? 'The All view' : "Pages view isn't available for this album."}
                </span>
              </span>
              <span className="mini-seg" role="group" aria-labelledby="layout-label">
                {(['compact', 'pages'] as const).map((opt) => (
                  <button
                    key={opt}
                    type="button"
                    className={albumLayout === opt ? 'on' : ''}
                    aria-pressed={albumLayout === opt}
                    disabled={!supportsPages}
                    onClick={() => setAlbumLayout(opt)}
                  >
                    {opt === 'compact' ? 'Compact' : 'Pages'}
                  </button>
                ))}
              </span>
            </div>
          </div>
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
                    onClick={() => setEdition(key)}
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
          <button type="button" className="btn danger full" onClick={() => setConfirmingDelete(true)}>
            🗑️ Delete album
          </button>
        </section>

        <div className="btn-row">
          <button className="btn full" onClick={onClose}>Close</button>
        </div>
      </div>

      {confirmingDelete && (
        <div className="modal-backdrop" onClick={() => setConfirmingDelete(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <h2>Delete album?</h2>
            <p className="modal-sub">
              This will permanently delete the album below, along with its stickers and swaps. This action
              cannot be undone.
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
              <button className="btn full" onClick={() => setConfirmingDelete(false)}>Cancel</button>
              <button className="btn danger full" onClick={handleConfirmDelete}>Delete</button>
            </div>
          </div>
        </div>
      )}

      {importOpen && <ImportDialog onClose={() => setImportOpen(false)} />}
    </div>
  );
}
