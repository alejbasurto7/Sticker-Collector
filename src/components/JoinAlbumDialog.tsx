import { useState } from 'react';
import { formatSyncCode } from '../lib/syncCode';
import { peekRemote, joinAlbumCode } from '../sync/engine';
import { joinErrorMessage, DEFAULT_JOIN_NAME } from '../sync/joinAlbum';

interface Props {
  onClose: () => void;   // cancel — dismiss the dialog, stay in the Library
  onJoined: () => void;  // success — album already switched; close dialog + Library
}

/**
 * Join an album someone shared with you, from a pasted code. The joiner names the album on their own
 * device (default "Shared album"); the owner's name is never shown. On success `joinAlbumCode` has
 * already adopted and switched to the new album, so the parent just closes.
 */
export default function JoinAlbumDialog({ onClose, onJoined }: Props) {
  const [code, setCode] = useState('');
  const [name, setName] = useState(DEFAULT_JOIN_NAME);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const canJoin = code.trim() !== '' && name.trim() !== '' && !busy;

  async function join() {
    setBusy(true);
    setError('');
    const peek = await peekRemote(code);
    const msg = joinErrorMessage(peek);
    if (msg) {
      setError(msg);
      setBusy(false);
      return;
    }
    // msg === null guarantees a joinable album; re-check narrows the type for joinAlbumCode.
    if (peek.ok && peek.kind === 'album') {
      await joinAlbumCode(peek, { displayName: name.trim() });
      onJoined();
    }
  }

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <h2>Join a shared album</h2>
        <p className="modal-sub">Enter the code someone shared with you.</p>

        <div className="settings-field">
          <label htmlFor="join-code-input" className="settings-field-label">Share code</label>
          <input
            id="join-code-input"
            type="text"
            className="settings-input"
            placeholder="XXXX-XXXX-XXXX"
            autoCapitalize="characters"
            autoCorrect="off"
            spellCheck={false}
            autoFocus
            value={code}
            onChange={(e) => setCode(formatSyncCode(e.target.value))}
          />
        </div>

        <div className="settings-field" style={{ marginTop: 10 }}>
          <label htmlFor="join-name-input" className="settings-field-label">Name this album</label>
          <input
            id="join-name-input"
            type="text"
            className="settings-input"
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
          <p className="modal-sub" style={{ margin: '6px 0 0', fontSize: '0.82rem' }}>
            Shown only on your device — you can rename it anytime.
          </p>
        </div>

        {error && <p className="sync-error">{error}</p>}

        <div className="btn-row" style={{ marginTop: 12 }}>
          <button type="button" className="btn full" disabled={busy} onClick={onClose}>
            Cancel
          </button>
          <button type="button" className="btn primary full" disabled={!canJoin} onClick={join}>
            {busy ? 'Joining…' : 'Join album'}
          </button>
        </div>
      </div>
    </div>
  );
}
