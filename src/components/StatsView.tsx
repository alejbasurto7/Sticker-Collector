import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useCollection } from '../store/collectionStore';
import { computeStats, computeAchievements } from '../utils/stats';
import { shareNodeAsImage } from '../utils/share';
import ProgressRing from './ProgressRing';
import ProgressBar from './ProgressBar';
import BarChart from './BarChart';
import Achievements from './Achievements';
import ShareCard from './ShareCard';

type PageSort = 'album' | 'pct-desc' | 'az';
type PageFilter = 'all' | 'incomplete' | 'complete';

export default function StatsView() {
  const counts = useCollection((s) => s.counts);
  const swaps = useCollection((s) => s.swaps);
  const albumName = useCollection((s) => s.albumName);
  const firstStickerAt = useCollection((s) => s.firstStickerAt);
  const activityDays = useCollection((s) => s.activityDays);
  const completedOn = useCollection((s) => s.completedOn);
  const unlockedAchievements = useCollection((s) => s.unlockedAchievements);
  const markUnlocked = useCollection((s) => s.markUnlocked);
  const stats = useMemo(
    () => computeStats(counts, { activityDays, completedOn }),
    [counts, activityDays, completedOn],
  );
  const closedSwaps = useMemo(() => swaps.filter((s) => s.status === 'closed').length, [swaps]);
  const achievements = useMemo(
    () => computeAchievements(stats, { closedSwaps, firstStickerAt, activityDays, now: Date.now() }),
    [stats, closedSwaps, firstStickerAt, activityDays],
  );

  // Achievements are permanent: once a condition is met it's recorded, so deleting
  // stickers later never strips an earned badge. Display = currently true OR earned.
  useEffect(() => {
    const newly = achievements
      .filter((a) => a.unlocked && unlockedAchievements[a.key] == null)
      .map((a) => a.key);
    if (newly.length) markUnlocked(newly);
  }, [achievements, unlockedAchievements, markUnlocked]);

  const earnedAchievements = useMemo(
    () => achievements.map((a) => ({ ...a, unlocked: a.unlocked || unlockedAchievements[a.key] != null })),
    [achievements, unlockedAchievements],
  );
  const shareRef = useRef<HTMLDivElement>(null);
  const [sharing, setSharing] = useState(false);
  const [pageSort, setPageSort] = useState<PageSort>('album');
  const [pageFilter, setPageFilter] = useState<PageFilter>('all');

  // "Progress by page" list, reshaped by the sort/filter controls. Album order
  // is the natural order of stats.pages, so we only re-sort for the other modes.
  const visiblePages = useMemo(() => {
    let pages = stats.pages;
    if (pageFilter === 'incomplete') pages = pages.filter((p) => !p.complete);
    else if (pageFilter === 'complete') pages = pages.filter((p) => p.complete);

    if (pageSort === 'pct-desc') {
      pages = [...pages].sort((a, b) => b.pct - a.pct);
    } else if (pageSort === 'az') {
      pages = [...pages].sort((a, b) => a.code.localeCompare(b.code));
    }
    return pages;
  }, [stats.pages, pageSort, pageFilter]);

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
        <div className="tile dupes">
          <div className="num">{stats.dupesTotal}</div>
          <div className="lbl">Dupes</div>
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
          <div className="h-top">Current streak</div>
          <div className="h-main">
            🔥 {stats.currentStreak} {stats.currentStreak === 1 ? 'day' : 'days'}
          </div>
        </div>
        <div className="highlight">
          <div className="h-top">Days collecting</div>
          <div className="h-main">
            📅 {stats.daysCollecting} {stats.daysCollecting === 1 ? 'day' : 'days'}
          </div>
        </div>
      </div>

      <div className="section-title">Achievements</div>
      <Achievements achievements={earnedAchievements} />

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
      <div className="page-controls">
        <select
          className="sort-select"
          aria-label="Sort pages"
          value={pageSort}
          onChange={(e) => setPageSort(e.target.value as PageSort)}
        >
          <option value="album">Album order</option>
          <option value="pct-desc">Percentage</option>
          <option value="az">Alphabetical</option>
        </select>
        <select
          className="sort-select"
          aria-label="Filter pages"
          value={pageFilter}
          onChange={(e) => setPageFilter(e.target.value as PageFilter)}
        >
          <option value="all">All pages</option>
          <option value="incomplete">Not completed</option>
          <option value="complete">Completed</option>
        </select>
      </div>
      <div className="card">
        {visiblePages.length ? (
          <BarChart pages={visiblePages} />
        ) : (
          <p className="empty-note">No pages match this filter.</p>
        )}
      </div>

      {/* Off-screen card rendered for image export — portaled to body so it
          sits outside the .app flex container and can't disturb the layout. */}
      {createPortal(
        <div style={{ position: 'fixed', left: -9999, top: 0, width: 360 }} aria-hidden>
          <ShareCard ref={shareRef} stats={stats} albumName={albumName} />
        </div>,
        document.body,
      )}
    </div>
  );
}
