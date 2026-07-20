import { useEffect, useState } from 'react';
import QRCode from 'qrcode';
import { isSyncConfigured } from '../lib/supabase';
import { QR_PREFIX } from '../lib/syncCode';
import { useSyncMeta, type SyncStatus } from '../store/syncStore';
import { unlink } from '../sync/engine';
import { copyToClipboard, shareImage } from '../utils/share';
import { APP_NAME } from '../config';
import SyncDialog from './SyncDialog';

const STATUS_LABEL: Record<SyncStatus, string> = {
  unlinked: 'Not linked',
  syncing: 'Syncing…',
  synced: 'Synced',
  offline: 'Offline',
  error: 'Sync error',
};

/** Relative "x ago" for the last-synced timestamp. */
function relTime(ts: number): string {
  const s = Math.max(0, Math.round((Date.now() - ts) / 1000));
  if (s < 60) return 'just now';
  const m = Math.round(s / 60);
  if (m < 60) return `${m} min ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h} h ago`;
  return `${Math.round(h / 24)} d ago`;
}

/**
 * The Sync settings section (rendered inside the ⚙️ dialog). Self-hides when
 * sync isn't configured for this build, so the app degrades to local-only.
 */
export default function SyncSection() {
  const collection = useSyncMeta((s) => s.collection);
  const code = collection?.code ?? null;
  const status = collection?.status ?? 'unlinked';
  const lastSyncedAt = collection?.lastSyncedAt ?? null;
  const [dialogOpen, setDialogOpen] = useState(false);
  const [revealed, setRevealed] = useState(false);
  const [confirmingUnlink, setConfirmingUnlink] = useState(false);
  const [copied, setCopied] = useState(false);
  const [qrUrl, setQrUrl] = useState('');

  // Regenerate the QR whenever the code changes; clear it when unlinked.
  useEffect(() => {
    if (!code) {
      setQrUrl('');
      return;
    }
    let cancelled = false;
    QRCode.toDataURL(`${QR_PREFIX}${code}`, { margin: 1, width: 240 })
      .then((url) => {
        if (!cancelled) setQrUrl(url);
      })
      .catch(() => {
        if (!cancelled) setQrUrl('');
      });
    return () => {
      cancelled = true;
    };
  }, [code]);

  if (!isSyncConfigured) return null;

  const linked = Boolean(collection);

  async function handleCopy() {
    if (code && (await copyToClipboard(code))) {
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1800);
    }
  }

  async function handleShareQr() {
    if (!qrUrl || !code) return;
    await shareImage(qrUrl, {
      fileName: 'sticker-collector-sync.png',
      title: `${APP_NAME} sync`,
      text: `Sync code: ${code} — add it in ${APP_NAME} to link a device.`,
    });
  }

  return (
    <section className="settings-section">
      <h3 className="settings-heading">Sync</h3>

      {!linked ? (
        <>
          <p className="modal-sub" style={{ margin: '0 0 12px' }}>
            Cloud sync keeps <strong>your own devices</strong> in step — phone and computer share
            one collection. Automatic, offline-first, no account. (To share a single album with
            someone else, use <strong>Sharing</strong> in the Album section above.)
          </p>
          <button type="button" className="btn full" onClick={() => setDialogOpen(true)}>
            🔗 Set up sync
          </button>
        </>
      ) : (
        <>
          <div className="sync-status-row">
            <span className={`sync-chip sync-${status}`}>{STATUS_LABEL[status]}</span>
            {lastSyncedAt && <span className="sync-time">Last synced {relTime(lastSyncedAt)}</span>}
          </div>

          <div className="settings-field">
            <label className="settings-field-label">Sync code</label>
            <div className="sync-code-row">
              <code className="sync-code">{revealed ? code : '••••-••••-••••'}</code>
              <button type="button" className="btn" onClick={() => setRevealed((v) => !v)}>
                {revealed ? 'Hide' : 'Reveal'}
              </button>
              <button type="button" className="btn" onClick={handleCopy} aria-live="polite">
                {copied ? '✓' : 'Copy'}
              </button>
            </div>
            {qrUrl && (
              <div className="sync-qr-block">
                <img className="sync-qr" src={qrUrl} alt="Sync code QR" />
                <p className="sync-qr-caption">Scan on another device to link</p>
                <button type="button" className="btn" onClick={() => void handleShareQr()}>
                  Share
                </button>
              </div>
            )}
          </div>

          {!confirmingUnlink ? (
            <button type="button" className="btn full" onClick={() => setConfirmingUnlink(true)}>
              Unlink this device
            </button>
          ) : (
            <>
              <p className="modal-sub" style={{ margin: '8px 0' }}>
                Stop syncing on this device? Your collection stays here — it just won’t update
                to/from your other devices anymore.
              </p>
              <div className="btn-row">
                <button type="button" className="btn full" onClick={() => setConfirmingUnlink(false)}>
                  Cancel
                </button>
                <button
                  type="button"
                  className="btn danger full"
                  onClick={() => {
                    unlink();
                    setConfirmingUnlink(false);
                    setRevealed(false);
                  }}
                >
                  Unlink
                </button>
              </div>
            </>
          )}
        </>
      )}

      {dialogOpen && <SyncDialog onClose={() => setDialogOpen(false)} />}
    </section>
  );
}
