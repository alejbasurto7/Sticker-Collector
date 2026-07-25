import { APP_URL } from '../../config';

/** Human-readable form of APP_URL (scheme + trailing slash stripped) — mirrors ShareAppScreen. */
const APP_URL_LABEL = APP_URL.replace(/^https?:\/\//, '').replace(/\/$/, '');

/** One QR finder pattern (the corner squares) at grid position (x, y). */
function Finder({ x, y }: { x: number; y: number }) {
  return (
    <>
      <rect x={x} y={y} width="7" height="7" rx="1" fill="#0b1220" />
      <rect x={x + 1} y={y + 1} width="5" height="5" fill="#fff" />
      <rect x={x + 2} y={y + 2} width="3" height="3" fill="#0b1220" />
    </>
  );
}

/** A static, QR-like glyph — decorative only (not scannable). Reads as "code" at a glance. */
function QrGlyph() {
  // A fixed scatter of data modules in the non-finder area — just enough to read as a QR.
  const modules = [
    [10, 2], [12, 3], [14, 1], [16, 4], [18, 2], [11, 5], [15, 5],
    [2, 10], [4, 12], [1, 14], [3, 16], [5, 11], [2, 18], [5, 15],
    [10, 10], [12, 12], [14, 10], [16, 13], [11, 15], [13, 17], [15, 11],
    [17, 16], [10, 18], [18, 10], [12, 18], [16, 18], [18, 14], [14, 16],
    [20, 11], [22, 13], [24, 12], [26, 15], [21, 17], [25, 18], [23, 10],
  ];
  return (
    <svg className="wn-qr" viewBox="0 0 29 29" role="img" aria-hidden="true">
      <rect width="29" height="29" rx="3" fill="#fff" />
      <Finder x={1} y={1} />
      <Finder x={21} y={1} />
      <Finder x={1} y={21} />
      {modules.map(([x, y]) => (
        <rect key={`${x}-${y}`} x={x} y={y} width="1.4" height="1.4" fill="#0b1220" />
      ))}
    </svg>
  );
}

/**
 * Slide 2 — share & install. Presentational only: a mock of the Settings → Share app
 * screen (QR + link) plus its two headline actions. The QR is a static glyph, not the
 * real scannable code the live screen renders.
 */
export default function SlideShareApp() {
  return (
    <div className="wn-slide-body">
      <h3 className="wn-slide-title">Share it — or install it like an app</h3>
      <p className="wn-slide-text">
        New under Settings → Share app: send a friend the link or a QR code, and add the
        app to your home screen so it opens full-screen, just like a native app.
      </p>

      <div className="wn-hero">
        <div className="wn-share" aria-hidden="true">
          <QrGlyph />
          <span className="share-url">{APP_URL_LABEL}</span>
        </div>
        <div className="wn-lib-actions" aria-hidden="true">
          <span className="wn-lib-btn">📤&nbsp;&nbsp;Share link</span>
          <span className="wn-lib-btn">⬇&nbsp;&nbsp;Install app</span>
        </div>
      </div>
    </div>
  );
}
