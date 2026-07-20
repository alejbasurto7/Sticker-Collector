import type { CSSProperties } from 'react';

/** A CSS custom property (`--wn-tint`) typed for the inline style object. */
type TintStyle = CSSProperties & { '--wn-tint': string };

/** A static, non-interactive mock of a Library album row — illustration only. */
function MockCard({
  letter, tint, name, mode, badge, pct, ping,
}: {
  letter: string; tint: string; name: string;
  mode: 'local' | 'cloud' | 'shared'; badge: string; pct: number; ping?: boolean;
}) {
  return (
    <div className="wn-card">
      <span className="wn-mono" style={{ '--wn-tint': tint } as TintStyle} aria-hidden="true">{letter}</span>
      <span className="wn-card-body">
        <span className="wn-card-top">
          <span className="wn-card-name">{name}</span>
          <span className={`wn-pill mode-pill mode-${mode}`}>{badge}</span>
        </span>
        <span className="wn-bar"><span style={{ width: `${pct}%` }} /></span>
      </span>
      <span className={`wn-gear${ping ? ' ping' : ''}`} aria-hidden="true">⚙️</span>
    </div>
  );
}

/**
 * Slide 1 — album management now lives in the album selector. Purely presentational:
 * a mock of the header switcher flowing down into the Library sheet, so the copy is
 * grounded in the real UI without wiring any store-bound component.
 */
export default function SlideManageAlbums() {
  return (
    <div className="wn-slide-body">
      <h3 className="wn-slide-title">Manage albums right from the switcher</h3>
      <p className="wn-slide-text">
        Tap the album name up top to switch, start a new one, or hit ⚙️ to rename,
        share or delete. No more digging through Settings.
      </p>

      <div className="wn-hero">
        <div className="wn-switcher" aria-hidden="true">
          <span className="wn-mono" style={{ '--wn-tint': '#e0533d' } as TintStyle}>C</span>
          <span className="wn-switcher-text">
            <span className="wn-switcher-line">
              <span className="wn-switcher-name">Champions ’26</span>
              <span className="wn-pill mode-pill mode-shared">👥 Shared</span>
            </span>
            <span className="wn-switcher-sub">Tap to switch, add or manage</span>
          </span>
          <span className="wn-caret">▾</span>
        </div>

        <span className="wn-flow" aria-hidden="true">↓</span>

        <div className="wn-lib" aria-hidden="true">
          <span className="wn-lib-title">Your albums</span>
          <MockCard letter="C" tint="#e0533d" name="Champions ’26" mode="shared" badge="👥 Shared" pct={36} ping />
          <MockCard letter="W" tint="#3b82f6" name="World Cup 2026" mode="cloud" badge="☁️ Cloud" pct={72} />
          <MockCard letter="M" tint="#8b5cf6" name="My Garden" mode="local" badge="📱 Local" pct={54} />
          <div className="wn-lib-actions">
            <span className="wn-lib-btn">➕&nbsp;&nbsp;New album</span>
            <span className="wn-lib-btn">📥&nbsp;&nbsp;Join a shared album</span>
          </div>
        </div>
      </div>
    </div>
  );
}
