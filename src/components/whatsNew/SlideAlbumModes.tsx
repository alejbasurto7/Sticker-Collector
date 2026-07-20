/**
 * Slide 2 — every album can be Local, Cloud or Shared. Presentational only:
 * a mock of the three-way segmented control (as it appears on the ⚙️ manage screen)
 * plus a colour-coded legend. Colours match the real pills: Cloud → blue,
 * Shared → green, Local → neutral.
 */
export default function SlideAlbumModes() {
  return (
    <div className="wn-slide-body">
      <h3 className="wn-slide-title">Local, Cloud or Shared — your choice</h3>
      <p className="wn-slide-text">
        Pick how each album lives. Switch anytime from its ⚙️ manage screen.
      </p>

      <div className="wn-hero">
        <div className="wn-modeseg" aria-hidden="true">
          <span className="wn-modeseg-btn">📱 Local</span>
          <span className="wn-modeseg-btn active">☁️ Cloud</span>
          <span className="wn-modeseg-btn">👥 Shared</span>
        </div>

        <div className="wn-legend">
          <div className="wn-legrow">
            <span className="wn-pill mode-pill mode-local">📱 Local</span>
            <span className="wn-legdef">On this device — no cloud sync or backup.</span>
          </div>
          <div className="wn-legrow">
            <span className="wn-pill mode-pill mode-cloud">☁️ Cloud</span>
            <span className="wn-legdef">Backed up and synced across your devices.</span>
          </div>
          <div className="wn-legrow">
            <span className="wn-pill mode-pill mode-shared">👥 Shared</span>
            <span className="wn-legdef">Collect together — invite others with a code or QR.</span>
          </div>
        </div>
      </div>
    </div>
  );
}
