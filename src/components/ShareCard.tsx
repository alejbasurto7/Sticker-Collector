import { forwardRef } from 'react';
import { ALBUM_TYPE, APP_NAME } from '../config';
import type { Stats } from '../utils/stats';
import ProgressRing from './ProgressRing';

interface Props {
  stats: Stats;
  albumName: string;
}

/** Composed card used for the "share stats as image" export. */
const ShareCard = forwardRef<HTMLDivElement, Props>(({ stats, albumName }, ref) => {
  return (
    <div className="share-card" ref={ref}>
      <div className="sc-title">{albumName}</div>
      <div className="sc-album">
        {ALBUM_TYPE} · {stats.totalStickers} stickers
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 18 }}>
        <ProgressRing pct={stats.completionPct} size={92} />
        <div>
          <div style={{ fontSize: 26, fontWeight: 800 }}>
            {stats.ownedUnique}/{stats.totalStickers}
          </div>
          <div style={{ color: '#9aa3b2', fontSize: 13 }}>stickers collected</div>
        </div>
      </div>

      <div className="sc-stat-row">
        <div className="sc-stat">
          <div className="v" style={{ color: '#e0533d' }}>
            {stats.missing}
          </div>
          <div className="l">Missing</div>
        </div>
        <div className="sc-stat">
          <div className="v" style={{ color: '#3b82f6' }}>
            {stats.swapsTotal}
          </div>
          <div className="l">Swaps</div>
        </div>
        <div className="sc-stat">
          <div className="v" style={{ color: '#18b563' }}>
            {stats.pagesCompleted}/{stats.pagesTotal}
          </div>
          <div className="l">Pages done</div>
        </div>
      </div>

      <div className="sc-foot">{APP_NAME} PWA</div>
    </div>
  );
});

ShareCard.displayName = 'ShareCard';
export default ShareCard;
