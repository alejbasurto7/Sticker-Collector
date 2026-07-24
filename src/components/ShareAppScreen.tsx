import { useEffect, useState } from 'react';
import QRCode from 'qrcode';
import { APP_NAME, APP_URL } from '../config';
import { copyToClipboard } from '../utils/share';
import InstallInstructions from './InstallInstructions';

/** Human-readable form of APP_URL for on-screen display (scheme + trailing slash stripped). */
const APP_URL_LABEL = APP_URL.replace(/^https?:\/\//, '').replace(/\/$/, '');

/** Settings → Share app: hand out the app URL (native share / copy / QR) and show
 *  how to install it as a PWA. */
export default function ShareAppScreen() {
  const [qrUrl, setQrUrl] = useState('');
  const [copied, setCopied] = useState(false);

  // Generate the QR once; the URL never changes at runtime.
  useEffect(() => {
    let cancelled = false;
    QRCode.toDataURL(APP_URL, { margin: 1, width: 200 })
      .then((url) => {
        if (!cancelled) setQrUrl(url);
      })
      .catch(() => {
        if (!cancelled) setQrUrl('');
      });
    return () => {
      cancelled = true;
    };
  }, []);

  async function copy() {
    if (await copyToClipboard(APP_URL)) {
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1600);
    }
  }

  async function share() {
    const data: ShareData = {
      title: APP_NAME,
      text: `Track your sticker collection, view stats, and organize swaps with ${APP_NAME}:`,
      url: APP_URL,
    };
    const nav = navigator as Navigator & { share?: (d: ShareData) => Promise<void> };
    if (nav.share) {
      try {
        await nav.share(data);
        return;
      } catch {
        // User cancelled or share failed — fall through to copy.
      }
    }
    void copy();
  }

  return (
    <>
      <p className="modal-sub" style={{ marginTop: 0 }}>
        Send a friend the link, or let them scan the code.
      </p>

      <div className="sync-qr-block">
        {qrUrl && (
          <img className="sync-qr" src={qrUrl} alt={`QR code linking to ${APP_NAME}`} />
        )}
        <p className="share-url">{APP_URL_LABEL}</p>
      </div>

      <div className="btn-row">
        <button type="button" className="btn full" onClick={() => void share()}>
          📤 Share link
        </button>
        <button type="button" className="btn full" onClick={() => void copy()} aria-live="polite">
          {copied ? '✓ Copied' : '🔗 Copy link'}
        </button>
      </div>

      <section className="settings-section" style={{ marginTop: 20 }}>
        <h3 className="settings-heading">Install on your phone</h3>
        <InstallInstructions />
      </section>
    </>
  );
}
