import { useEffect, useMemo, useRef, useState } from 'react';
import { useCollection } from '../store/collectionStore';
import { computeStats, computeAchievements, type Achievement } from '../utils/stats';
import { badgeFor } from '../data/achievementBadges';
import { fireConfetti } from '../utils/confetti';

/** How long a single unlock banner stays on screen. */
const BANNER_MS = 5000;
/** Gap between consecutive banners when several unlock at once. */
const GAP_MS = 350;
/** How many badge emojis to show in a summary before collapsing to "+N". */
const SUMMARY_EMOJI_CAP = 12;

/**
 * A queued banner is either a single freshly-earned achievement or a summary of
 * several that unlocked together (e.g. from importing an existing collection).
 */
type BannerItem =
  | { kind: 'single'; achievement: Achievement }
  | { kind: 'summary'; achievements: Achievement[] };

/**
 * Watches for freshly-unlocked achievements anywhere in the app (not just the
 * Stats tab) and celebrates them with a temporary, non-blocking banner plus a
 * confetti burst. The banner is purely informational — it never captures focus
 * or pointer events, so the user can keep tapping and typing underneath.
 *
 * Detection mirrors StatsView: an achievement counts as "newly unlocked" when
 * its condition is met but it isn't yet in the persisted ledger. On first mount
 * we prime the set of already-earned achievements so returning users aren't
 * greeted by a flood of banners for things they unlocked in a past session.
 *
 * When many achievements unlock in a single change — most notably the first
 * time a user *imports* a collection instead of starting from scratch — they
 * arrive together in one detection pass. Rather than queue a long parade of
 * banners, we coalesce them into one celebratory summary banner.
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
  const [queue, setQueue] = useState<BannerItem[]>([]);
  const [current, setCurrent] = useState<BannerItem | null>(null);

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
    // Several at once (e.g. an import) collapse into one summary banner; a lone
    // unlock from normal play gets its own celebratory banner.
    const item: BannerItem =
      fresh.length === 1
        ? { kind: 'single', achievement: fresh[0] }
        : { kind: 'summary', achievements: fresh };
    setQueue((q) => [...q, item]);
  }, [achievements, unlockedAchievements, markUnlocked]);

  // Pull the next queued banner onto the stage once the slot is free. The short
  // delay gives a visible breather between back-to-back unlocks.
  useEffect(() => {
    if (current || queue.length === 0) return;
    const t = window.setTimeout(() => {
      setCurrent(queue[0]);
      setQueue((q) => q.slice(1));
    }, GAP_MS);
    return () => window.clearTimeout(t);
  }, [current, queue]);

  // Show the current banner for a fixed beat, with confetti, then clear it.
  // Summaries get an extra-big burst to match the bigger milestone.
  useEffect(() => {
    if (!current) return;
    fireConfetti(current.kind === 'summary' ? 220 : 130);
    const hide = window.setTimeout(() => setCurrent(null), BANNER_MS);
    return () => window.clearTimeout(hide);
  }, [current]);

  if (!current) return null;

  return (
    <div className="achievement-toaster" aria-live="polite" role="status">
      {current.kind === 'single' ? (
        <div className="achievement-banner" key={current.achievement.key}>
          <div className="ab-spark" aria-hidden>
            🎉
          </div>
          <div className="ab-body">
            <div className="ab-kicker">Achievement unlocked!</div>
            <div className="ab-title">
              <span className="ab-emoji" aria-hidden>
                {badgeFor(current.achievement.key)}
              </span>
              {current.achievement.label}
            </div>
            <div className="ab-desc">{current.achievement.description}</div>
          </div>
        </div>
      ) : (
        <div className="achievement-banner" key={`summary-${current.achievements.length}`}>
          <div className="ab-spark" aria-hidden>
            🎉
          </div>
          <div className="ab-body">
            <div className="ab-kicker">Achievements unlocked!</div>
            <div className="ab-title">{current.achievements.length} new achievements</div>
            <div className="ab-emoji-row" aria-hidden>
              {current.achievements.slice(0, SUMMARY_EMOJI_CAP).map((a) => (
                <span key={a.key}>{badgeFor(a.key)}</span>
              ))}
              {current.achievements.length > SUMMARY_EMOJI_CAP && (
                <span className="ab-more">+{current.achievements.length - SUMMARY_EMOJI_CAP}</span>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
