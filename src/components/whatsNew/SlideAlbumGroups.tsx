import type { CSSProperties } from 'react';

/** A CSS custom property (`--wn-tint`) typed for the inline style object. */
type TintStyle = CSSProperties & { '--wn-tint': string };

/** A static, non-interactive mock of a grouped album member — illustration only. */
function MemberRow({
  letter, tint, name, mode, badge, pct,
}: {
  letter: string; tint: string; name: string;
  mode: 'local' | 'cloud' | 'shared'; badge: string; pct: number;
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
    </div>
  );
}

/**
 * Slide 1 — album groups (the headline). Presentational only: a mock of a two-member
 * group flowing down into what a combined swap does (auto-routing + internal moves),
 * grounded in the real 👥 Groups sheet without wiring any store-bound component.
 */
export default function SlideAlbumGroups() {
  return (
    <div className="wn-slide-body">
      <h3 className="wn-slide-title">Swap several albums as one</h3>
      <p className="wn-slide-text">
        Group two or more albums and trade them from a single pool. A combined swap sends
        each sticker to the album that needs it — and spots doubles you can shift between
        your own albums.
      </p>

      <div className="wn-hero">
        <div className="wn-lib" aria-hidden="true">
          <span className="wn-lib-title">👥 Kids’ World Cup</span>
          <MemberRow letter="L" tint="#e0533d" name="Leo’s album" mode="cloud" badge="☁️ Cloud" pct={64} />
          <MemberRow letter="M" tint="#3b82f6" name="Mia’s album" mode="cloud" badge="☁️ Cloud" pct={48} />
        </div>

        <span className="wn-flow" aria-hidden="true">↓ combined swap</span>

        <div className="wn-legend">
          <div className="wn-legrow">
            <span className="wn-pill">🎯 Routed</span>
            <span className="wn-legdef">Each sticker you get in goes to the album that needs it.</span>
          </div>
          <div className="wn-legrow">
            <span className="wn-pill">🔁 Internal</span>
            <span className="wn-legdef">A spare in one album fills a gap in another — no trade needed.</span>
          </div>
        </div>
      </div>
    </div>
  );
}
