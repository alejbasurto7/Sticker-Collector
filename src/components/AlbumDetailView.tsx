import { useEffect, useMemo, useState } from 'react';
import { useCollection } from '../store/collectionStore';
import { useSyncMeta } from '../store/syncStore';
import { resolveAlbumName } from '../sync/albumMode';
import { useForcedReadOnly, useIsJoiner } from '../sync/useAlbumMode';
import { DEFAULT_JOIN_NAME } from '../sync/joinAlbum';
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
  const setLocalAlbumName = useSyncMeta((s) => s.setLocalAlbumName);
  const forcedReadOnly = useForcedReadOnly();
  // A joined share's edition / Coca-Cola layout is owner-controlled (both collaborative
  // and read-only joiners are blocked from changing it).
  const joinedShare = useIsJoiner();
  // For a joiner, the "Album name" field edits THIS device's display name (a local alias); the
  // owner's synced album name is never shown here. Otherwise it edits the album's own synced name.
  const displayName = resolveAlbumName(activeAlbumId, albumName, localAlbumNames);
  const nameValue = joinedShare ? displayName : albumName;

  const [draft, setDraft] = useState(nameValue);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [exported, setExported] = useState(false);

  const supportsPages = useMemo(() => pagesSupportPages(album.pages), [edition, trackCC]);

  useEffect(() => {
    setDraft(nameValue);
  }, [nameValue]);

  function commitName() {
    if (joinedShare) {
      // Rename only THIS device's copy; never adopt or display the owner's synced name.
      setLocalAlbumName(activeAlbumId, draft.trim() || DEFAULT_JOIN_NAME);
    } else {
      setAlbumName(draft);
    }
  }
  function handleNameBlur() {
    commitName();
  }
  function handleNameKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Enter') {
      commitName();
      e.currentTarget.blur();
    }
  }
  async function handleConfirmDelete() {
    await deleteAlbumEverywhere(activeAlbumId);
    setConfirmingDelete(false);
    onClose();
  }
  async function handleExport() {
    const text = buildListExport(counts, displayName, 'both', true);
    if (await copyToClipboard(text)) {
      setExported(true);
      window.setTimeout(() => setExported(false), 1800);
    }
  }

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <h2>{displayName}</h2>
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
            />
            {joinedShare && (
              <p className="modal-sub" style={{ margin: '6px 0 0', fontSize: '0.82rem' }}>
                Shown only on your device.
              </p>
            )}
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
            disabled={joinedShare}
          >
            <span className="setting-label">
              {CC_EMOJI} {trackCC ? 'Untrack' : 'Track'} Coca-Cola stickers
            </span>
            <span className={`switch${trackCC ? ' on' : ''}`} aria-hidden="true">
              <span className="knob" />
            </span>
          </button>

          <p className="modal-sub" style={{ margin: '12px 0 0' }}>
            {joinedShare
              ? 'Only the album’s owner can change Coca-Cola tracking.'
              : trackCC
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
                    disabled={joinedShare}
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
                {displayName}
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
