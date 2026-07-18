import { useState } from 'react';
import QRCode from 'qrcode';
import { createLink, peekRemote, linkWithRemote, linkWithLocal, type PeekOk } from '../sync/engine';
import { formatSyncCode } from '../lib/syncCode';
import { copyToClipboard } from '../utils/share';
import QrScanner from './QrScanner';

interface Props {
  onClose: () => void;
}

type Mode = 'choose' | 'create' | 'enter' | 'direction';

const QR_PREFIX = 'sticker-sync:';

export default function SyncDialog({ onClose }: Props) {
  const [mode, setMode] = useState<Mode>('choose');
  const [code, setCode] = useState('');
  const [qrUrl, setQrUrl] = useState('');
  const [entry, setEntry] = useState('');
  const [scanning, setScanning] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [copied, setCopied] = useState(false);
  const [peek, setPeek] = useState<PeekOk | null>(null);

  async function handleCreate() {
    setBusy(true);
    setError('');
    try {
      const c = await createLink();
      setCode(c);
      setQrUrl(await QRCode.toDataURL(`${QR_PREFIX}${c}`, { margin: 1, width: 240 }));
      setMode('create');
    } catch {
      setError('Could not create a sync code. Check your connection and try again.');
    } finally {
      setBusy(false);
    }
  }

  async function handleJoin(raw: string) {
    setBusy(true);
    setError('');
    const res = await peekRemote(raw);
    if (!res.ok) {
      setBusy(false);
      setError(
        res.reason === 'not-found'
          ? 'No collection found for that code. Double-check it, or create the code on your other device first.'
          : res.reason === 'invalid'
            ? 'That code doesn’t look right — it should be 12 letters/numbers.'
            : 'Sync failed. Check your connection and try again.',
      );
      return;
    }
    if (res.kind !== 'collection') {
      // Shared-album codes aren't joinable from this dialog yet — that UI lands separately.
      setBusy(false);
      setError('No collection found for that code. Double-check it, or create the code on your other device first.');
      return;
    }
    // Safe path: this device is empty, so pulling the shared collection loses nothing.
    if (!res.localHasData) {
      linkWithRemote(res);
      setBusy(false);
      onClose();
      return;
    }
    // This device already has a collection — never overwrite it silently. Ask.
    setPeek(res);
    setBusy(false);
    setMode('direction');
  }

  function keepLocal() {
    if (!peek) return;
    setBusy(true);
    void linkWithLocal(peek).finally(() => {
      setBusy(false);
      onClose();
    });
  }

  function useShared() {
    if (!peek) return;
    linkWithRemote(peek);
    onClose();
  }

  function handleScan(text: string) {
    setScanning(false);
    const raw = text.startsWith(QR_PREFIX) ? text.slice(QR_PREFIX.length) : text;
    setEntry(formatSyncCode(raw));
    void handleJoin(raw);
  }

  async function handleCopy() {
    if (await copyToClipboard(code)) {
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1800);
    }
  }

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        {mode === 'choose' && (
          <>
            <h2>Set up sync</h2>
            <p className="modal-sub">
              Sync this collection between your devices. On one device create a code, then enter
              it on the other — no accounts, no passwords.
            </p>
            <div className="btn-row" style={{ flexDirection: 'column' }}>
              <button className="btn full" disabled={busy} onClick={handleCreate}>
                {busy ? 'Creating…' : '✨ Create a sync code'}
              </button>
              <button className="btn full" disabled={busy} onClick={() => setMode('enter')}>
                🔗 Enter a code from another device
              </button>
            </div>
            {error && <p className="sync-error">{error}</p>}
            <div className="btn-row">
              <button className="btn full" onClick={onClose}>
                Cancel
              </button>
            </div>
          </>
        )}

        {mode === 'create' && (
          <>
            <h2>Your sync code</h2>
            <p className="modal-sub">
              On your other device, open <strong>Settings → Sync → Enter a code</strong> and type
              this in (or scan the QR). Anyone with this code can access this collection, so keep
              it to yourself.
            </p>
            <div className="sync-code-display">{code}</div>
            {qrUrl && <img className="sync-qr" src={qrUrl} alt="Sync code QR" />}
            <div className="btn-row">
              <button className="btn full" onClick={handleCopy} aria-live="polite">
                {copied ? '✓ Copied' : 'Copy code'}
              </button>
              <button className="btn full" onClick={onClose}>
                Done
              </button>
            </div>
          </>
        )}

        {mode === 'enter' && (
          <>
            <h2>Enter sync code</h2>
            <p className="modal-sub">
              Type the code shown on your other device. If this device already has stickers,
              you’ll choose which collection to keep before anything changes.
            </p>
            <input
              type="text"
              className="settings-input"
              placeholder="XXXX-XXXX-XXXX"
              autoCapitalize="characters"
              autoCorrect="off"
              spellCheck={false}
              value={entry}
              onChange={(e) => setEntry(formatSyncCode(e.target.value))}
            />
            {scanning ? (
              <div className="qr-scan-wrap">
                <QrScanner
                  onResult={handleScan}
                  onError={() => {
                    setScanning(false);
                    setError('Couldn’t open the camera. Type the code instead.');
                  }}
                />
                <button className="btn full" onClick={() => setScanning(false)}>
                  Stop camera
                </button>
              </div>
            ) : (
              <button className="btn full" onClick={() => setScanning(true)} disabled={busy}>
                📷 Scan QR instead
              </button>
            )}
            {error && <p className="sync-error">{error}</p>}
            <div className="btn-row">
              <button className="btn full" onClick={() => setMode('choose')} disabled={busy}>
                Back
              </button>
              <button className="btn full" disabled={busy || !entry} onClick={() => handleJoin(entry)}>
                {busy ? 'Linking…' : 'Link device'}
              </button>
            </div>
          </>
        )}

        {mode === 'direction' && (
          <>
            <h2>Which collection do you want to keep?</h2>
            <p className="modal-sub">
              This device already has its own collection, and so does the code you entered.
              Linking merges them onto one shared collection — pick which one to keep.
              <strong> Nothing is lost — the two are merged together.</strong>
            </p>
            <div className="btn-row" style={{ flexDirection: 'column' }}>
              <button className="btn full" disabled={busy} onClick={keepLocal}>
                {busy ? 'Linking…' : '📱 Keep THIS device’s collection'}
              </button>
              <button className="btn danger full" disabled={busy} onClick={useShared}>
                ☁️ Use the shared collection
              </button>
            </div>
            <p className="modal-sub" style={{ margin: '10px 0 0', fontSize: '0.82rem' }}>
              Tip: keep the device that has the collection you care about. Both devices will then
              show the combined collection.
            </p>
            {error && <p className="sync-error">{error}</p>}
            <div className="btn-row">
              <button className="btn full" disabled={busy} onClick={() => { setPeek(null); setMode('enter'); }}>
                Cancel
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
