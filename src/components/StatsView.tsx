import { useMemo, useRef, useState } from 'react';
import { useCollection } from '../store/collectionStore';
import { computeStats, computeAchievements } from '../utils/stats';
import { shareNodeAsImage } from '../utils/share';
import ProgressRing from './ProgressRing';
import ProgressBar from './ProgressBar';
import BarChart from './BarChart';
import Achievements from './Achievements';
import ShareCard from './ShareCard';

const PACK_SIZE = 5;

export default function StatsView() {
  const counts = useCollection((s) => s.counts);
  const swaps = useCollection((s) => s.swaps);
  const stats = useMemo(() => computeStats(counts), [counts]);
  const closedSwaps = useMemo(() => swaps.filter((s) => s.status === 'closed').length, [swaps]);
  const achievements = useMemo(
    () => computeAchievements(stats, { closedSwaps }),
    [stats, closedSwaps],
  );
  const shareRef = useRef<HTMLDivElement>(null);
  const [sharing, setSharing] = useState(false);

  // Simple completion projection: as the album fills up, new packs yield fewer
  // needed stickers. Estimate remaining packs with a coupon-collector-style factor.
  const projection = useMemo(() => {
    if (stats.missing === 0) return null;
    const fillRatio = stats.ownedUnique / stats.totalStickers;
    // Probability a given new sticker is one you still need shrinks as you fill up.
    const usefulPerSticker = Math.max(1 - fillRatio, 0.03);
    const stickersNeeded = stats.missing / usefulPerSticker;
    return Math.ceil(stickersNeeded / PACK_SIZE);
  }, [stats]);

  const onShare = async () => {
    if (!shareRef.current) return;
    setSharing(true);
    try {
      await shareNodeAsImage(shareRef.current);
    } finally {
      setSharing(false);
    }
  };

  const md = stats.mostDuplicated;
  const topPage = [...stats.pages].sort((a, b) => b.pct - a.pct)[0];

  return (
    <div>
      <div className="stats-hero">
        <ProgressRing pct={stats.completionPct} />
        <div className="ring-label">
          <div className="big">
            {stats.ownedUnique}/{stats.totalStickers}
          </div>
          <div className="sub">stickers collected · {Math.round(stats.completionPct * 100)}% complete</div>
        </div>
      </div>

      <div className="tiles">
        <div className="tile owned">
          <div className="num">{stats.ownedUnique}</div>
          <div className="lbl">Owned (unique)</div>
        </div>
        <div className="tile missing">
          <div className="num">{stats.missing}</div>
          <div className="lbl">Missing</div>
        </div>
        <div className="tile swaps">
          <div className="num">{stats.swapsTotal}</div>
          <div className="lbl">Swaps (duplicates)</div>
        </div>
        <div className="tile">
          <div className="num">{stats.totalCollected}</div>
          <div className="lbl">Total collected</div>
        </div>
      </div>

      <button className="btn primary full" onClick={onShare} disabled={sharing}>
        {sharing ? 'Preparing…' : '📤 Share stats as image'}
      </button>

      <div className="section-title">Highlights</div>
      <div className="highlight-grid">
        <div className="highlight">
          <div className="h-top">Pages completed</div>
          <div className="h-main">
            {stats.pagesCompleted} / {stats.pagesTotal}
          </div>
        </div>
        <div className="highlight">
          <div className="h-top">Most duplicated</div>
          <div className="h-main">
            {md ? `${md.emoji} ${md.code} ${md.number} ×${md.extra + 1}` : '—'}
          </div>
        </div>
        <div className="highlight">
          <div className="h-top">Top page</div>
          <div className="h-main">
            {topPage ? `${topPage.emoji} ${topPage.code} ${Math.round(topPage.pct * 100)}%` : '—'}
          </div>
        </div>
        <div className="highlight">
          <div className="h-top">Projection to finish</div>
          <div className="h-main">{projection === null ? '🎉 Done!' : `≈ ${projection} packs`}</div>
        </div>
      </div>

      <div className="section-title">Achievements</div>
      <Achievements achievements={achievements} />

      <div className="section-title">Progress by type</div>
      <div className="card type-progress">
        {stats.byType.map((t) => (
          <ProgressBar
            key={t.type}
            label={`${t.emoji} ${t.label}`}
            value={`${t.owned}/${t.total} · ${Math.round(t.pct * 100)}%`}
            pct={t.pct}
          />
        ))}
      </div>

      <div className="section-title">Progress by page</div>
      <div className="card">
        <BarChart pages={stats.pages} />
      </div>

      {/* Off-screen card rendered for image export. */}
      <div style={{ position: 'fixed', left: -9999, top: 0, width: 360 }} aria-hidden>
        <ShareCard ref={shareRef} stats={stats} />
      </div>
    </div>
  );
}
