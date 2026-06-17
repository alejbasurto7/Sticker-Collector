import { useEffect, useMemo, useRef, useState } from 'react';
import { useCollection } from '../store/collectionStore';
import { computeStats, computeAchievements, type Achievement } from '../utils/stats';
import { badgeFor } from '../data/achievementBadges';
import { fireConfetti } from '../utils/confetti';

/** How long a single unlock banner stays on screen. */
const BANNER_MS = 3000;
/** Gap between consecutive banners when several unlock at once. */
const GAP_MS = 350;

/**
 * Watches for freshly-unlocked achievements anywhere in the app (not just the
 * Stats tab) and celebrates each one with a temporary, non-blocking banner plus
 * a confetti burst. The banner is purely informational — it never captures
 * focus or pointer events, so the user can keep tapping and typing underneath.
 *
 * Detection mirrors StatsView: an achievement counts as "newly unlocked" when
 * its condition is met but it isn't yet in the persisted ledger. On first mount
 * we prime the set of already-earned achievements so returning users aren't
 * greeted by a flood of banners for things they unlocked in a past session.
 */
export default function AchievementToaster() {
  const counts = useCollection((s) => s.counts);
  const swaps = useCollection((s) => s.swaps);
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

  // Keys we've already accounted for, so each unlock is celebrated exactly once.
  // null until primed on first render.
  const announced = useRef<Set<string> | null>(null);
  const [queue, setQueue] = useState<Achievement[]>([]);
  const [current, setCurrent] = useState<Achievement | null>(null);

  // Detect new unlocks and record them permanently.
  useEffect(() => {
    const unlockedKeys = achievements.filter((a) => a.unlocked).map((a) => a.key);

    if (announced.current === null) {
      // First pass: treat everything already earned as old news.
      announced.current = new Set([...unlockedKeys, ...Object.keys(unlockedAchievements)]);
      return;
    }

    const fresh = achievements.filter((a) => a.unlocked && !announced.current!.has(a.key));
    if (fresh.length === 0) return;

    for (const a of fresh) announced.current.add(a.key);
    markUnlocked(fresh.map((a) => a.key));
    setQueue((q) => [...q, ...fresh]);
  }, [achievements, unlockedAchievements, markUnlocked]);

  // Pull the next queued achievement onto the stage once the slot is free. The
  // short delay gives a visible breather between back-to-back unlocks.
  useEffect(() => {
    if (current || queue.length === 0) return;
    const t = window.setTimeout(() => {
      setCurrent(queue[0]);
      setQueue((q) => q.slice(1));
    }, GAP_MS);
    return () => window.clearTimeout(t);
  }, [current, queue]);

  // Show the current banner for a fixed beat, with confetti, then clear it.
  useEffect(() => {
    if (!current) return;
    fireConfetti();
    const hide = window.setTimeout(() => setCurrent(null), BANNER_MS);
    return () => window.clearTimeout(hide);
  }, [current]);

  if (!current) return null;

  return (
    <div className="achievement-toaster" aria-live="polite" role="status">
      <div className="achievement-banner" key={current.key}>
        <div className="ab-spark" aria-hidden>
          🎉
        </div>
        <div className="ab-body">
          <div className="ab-kicker">Achievement unlocked!</div>
          <div className="ab-title">
            <span className="ab-emoji" aria-hidden>
              {badgeFor(current.key)}
            </span>
            {current.label}
          </div>
          <div className="ab-desc">{current.description}</div>
        </div>
      </div>
    </div>
  );
}
