import { useState } from 'react';
import QRCode from 'qrcode';
import { isSyncConfigured } from '../lib/supabase';
import { useCollection } from '../store/collectionStore';
import { useSyncMeta, type SyncStatus } from '../store/syncStore';
import { useAlbumMode } from '../sync/useAlbumMode';
import {
  createAlbumShare, setAlbumMode, setShareAccess, stopSharing, leaveAlbumShare,
} from '../sync/engine';
import { copyToClipboard } from '../utils/share';
import { QR_PREFIX } from '../lib/syncCode';
import SyncDialog from './SyncDialog';

type Access = 'collaborative' | 'read-only';

const STATUS_LABEL: Record<SyncStatus, string> = {
  unlinked: 'Not linked', syncing: 'Syncing…', synced: 'Synced', offline: 'Offline', error: 'Sync error',
};

export default function AlbumSharing() {
  const activeAlbumId = useCollection((s) => s.activeAlbumId);
  const link = useSyncMeta((s) => s.albumLinks[activeAlbumId]);
  const hasCloudLink = useSyncMeta((s) => s.collection !== null);
  const mode = useAlbumMode(activeAlbumId);

  // Shared sub-panel: access (owner picks the access level, then a code is created).
  const [panel, setPanel] = useState<'closed' | 'access'>('closed');
  const [code, setCode] = useState('');
  const [qrUrl, setQrUrl] = useState('');
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);
  const [confirmingStop, setConfirmingStop] = useState(false);
  const [confirmingLeave, setConfirmingLeave] = useState(false);
  const [syncOpen, setSyncOpen] = useState(false);       // Cloud setup dialog (create/join a Cloud code)

  if (!isSyncConfigured) return null;

  const isOwner = link?.role === 'owner';
  const sharePanelOpen = panel !== 'closed';

  async function share(access: Access) {
    setBusy(true);
    try {
      const c = await createAlbumShare(activeAlbumId, access);
      setCode(c);
      setQrUrl(await QRCode.toDataURL(`${QR_PREFIX}${c}`, { margin: 1, width: 200 }));
      setPanel('closed');
    } finally {
      setBusy(false);
    }
  }

  async function copy() {
    const c = code || link?.code || '';
    if (c && (await copyToClipboard(c))) {
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1600);
    }
  }

  return (
    <div className="settings-field" style={{ marginTop: 12 }}>
      <label className="settings-field-label">Sharing</label>

      {/* Mode selector */}
      <div className="btn-row" role="group" aria-label="Album sync mode">
        <button
          type="button"
          className={`btn full${mode === 'local' && !sharePanelOpen ? ' primary' : ''}`}
          disabled={busy}
          onClick={() => {
            setPanel('closed'); // leaving Shared: dismiss the sub-panel
            if (mode === 'shared') {
              if (isOwner) void stopSharing(activeAlbumId, 'local');
              else leaveAlbumShare(activeAlbumId, true);
              return;
            }
            setAlbumMode(activeAlbumId, 'local'); // durable Local (stays on-device even after Cloud is set up)
          }}
        >
          📱 Local
        </button>
        <button
          type="button"
          className={`btn full${mode === 'cloud' && !sharePanelOpen ? ' primary' : ''}`}
          disabled={busy || (mode === 'shared' && !isOwner)}
          onClick={() => {
            setPanel('closed'); // leaving Shared: dismiss the sub-panel
            if (mode === 'cloud') return;
            if (mode === 'shared') {
              if (isOwner) void stopSharing(activeAlbumId, 'cloud');
              return;
            }
            setAlbumMode(activeAlbumId, 'cloud'); // ensure this album isn't carved out to Local
            if (!hasCloudLink) setSyncOpen(true); // no Cloud code yet -> open setup (create/join)
          }}
        >
          ☁️ Cloud
        </button>
        <button
          type="button"
          className={`btn full${mode === 'shared' || sharePanelOpen ? ' primary' : ''}`}
          disabled={busy}
          onClick={() => { if (mode !== 'shared') setPanel('access'); }}
          aria-pressed={mode === 'shared' || sharePanelOpen}
        >
          👥 Shared
        </button>
      </div>

      {/* The current album's mode description — hidden while a Shared sub-panel is open, where it
          would contradict the pending action (e.g. "never synced" shown while joining a share). */}
      {!sharePanelOpen && (
        <p className="modal-sub" style={{ margin: '8px 0 0', fontSize: '0.82rem' }}>
          {mode === 'local' && 'On this device only — never synced.'}
          {mode === 'cloud' && 'Synced across your own devices (the Cloud sync code).'}
          {mode === 'shared' && (isOwner
            ? 'Shared via a code. Anyone with the code can view or edit per the access level below.'
            : 'Shared with you by someone else’s code.')}
        </p>
      )}

      {/* Shared -> access: owner picks who can edit, then a code is created */}
      {panel === 'access' && (
        <div className="settings-field" style={{ marginTop: 10 }}>
          <p className="modal-sub" style={{ margin: '0 0 8px' }}>Who can edit?</p>
          <div className="btn-row" style={{ flexDirection: 'column' }}>
            <button type="button" className="btn full" disabled={busy} onClick={() => share('collaborative')}>
              🤝 Collaborative — they can edit
            </button>
            <button type="button" className="btn full" disabled={busy} onClick={() => share('read-only')}>
              👁️ Read-only — they can only view
            </button>
            <button type="button" className="btn full" disabled={busy} onClick={() => setPanel('closed')}>
              Back
            </button>
          </div>
        </div>
      )}

      {/* Owner manage view */}
      {mode === 'shared' && isOwner && link && (
        <div className="settings-field" style={{ marginTop: 10 }}>
          <div className="sync-status-row">
            <span className={`sync-chip sync-${link.status}`}>{STATUS_LABEL[link.status]}</span>
          </div>

          <div className="btn-row" role="group" aria-label="Access level" style={{ marginTop: 8 }}>
            <button
              type="button"
              className={`btn full${link.access === 'collaborative' ? ' primary' : ''}`}
              onClick={() => setShareAccess(activeAlbumId, 'collaborative')}
            >
              Collaborative
            </button>
            <button
              type="button"
              className={`btn full${link.access === 'read-only' ? ' primary' : ''}`}
              onClick={() => setShareAccess(activeAlbumId, 'read-only')}
            >
              Read-only
            </button>
          </div>

          <div className="sync-code-display" style={{ marginTop: 8 }}>{code || link.code}</div>
          {qrUrl && <img className="sync-qr" src={qrUrl} alt="Album share QR" />}
          <div className="btn-row" style={{ marginTop: 8 }}>
            <button type="button" className="btn full" onClick={copy} aria-live="polite">
              {copied ? '✓ Copied' : 'Copy code'}
            </button>
          </div>

          {!confirmingStop ? (
            <button type="button" className="btn danger full" style={{ marginTop: 8 }} onClick={() => setConfirmingStop(true)}>
              Stop sharing
            </button>
          ) : (
            <>
              <p className="modal-sub" style={{ margin: '8px 0' }}>
                Stop sharing this album? People you shared with keep their own copy, but won’t get
                further updates. Keep this album as:
              </p>
              <div className="btn-row">
                <button type="button" className="btn full" disabled={busy} onClick={() => { setBusy(true); void stopSharing(activeAlbumId, 'cloud').finally(() => { setBusy(false); setConfirmingStop(false); }); }}>
                  ☁️ Cloud
                </button>
                <button type="button" className="btn full" disabled={busy} onClick={() => { setBusy(true); void stopSharing(activeAlbumId, 'local').finally(() => { setBusy(false); setConfirmingStop(false); }); }}>
                  📱 Local
                </button>
              </div>
              <button type="button" className="btn full" style={{ marginTop: 6 }} onClick={() => setConfirmingStop(false)}>
                Cancel
              </button>
            </>
          )}
        </div>
      )}

      {/* Joiner view */}
      {mode === 'shared' && !isOwner && link && (
        <div className="settings-field" style={{ marginTop: 10 }}>
          <div className="sync-status-row">
            <span className={`sync-chip sync-${link.status}`}>{STATUS_LABEL[link.status]}</span>
            <span className="sync-time">
              {link.access === 'read-only' ? 'Shared with you · read-only' : 'Shared with you · collaborative'}
            </span>
          </div>
          {!confirmingLeave ? (
            <button type="button" className="btn danger full" style={{ marginTop: 8 }} onClick={() => setConfirmingLeave(true)}>
              Leave shared album
            </button>
          ) : (
            <>
              <p className="modal-sub" style={{ margin: '8px 0' }}>Leave this shared album?</p>
              <div className="btn-row">
                <button type="button" className="btn full" onClick={() => { leaveAlbumShare(activeAlbumId, true); setConfirmingLeave(false); }}>
                  Keep a copy
                </button>
                <button type="button" className="btn danger full" onClick={() => { leaveAlbumShare(activeAlbumId, false); setConfirmingLeave(false); }}>
                  Leave & delete
                </button>
              </div>
              <button type="button" className="btn full" style={{ marginTop: 6 }} onClick={() => setConfirmingLeave(false)}>
                Cancel
              </button>
            </>
          )}
        </div>
      )}

      {syncOpen && <SyncDialog onClose={() => setSyncOpen(false)} />}
    </div>
  );
}
