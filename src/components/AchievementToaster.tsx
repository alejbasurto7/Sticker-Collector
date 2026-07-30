import { useEffect, useMemo, useRef, useState } from 'react';
import { useCollection } from '../store/collectionStore';
import { computeStats, computeAchievements, type Achievement } from '../utils/stats';
import { countClosedSwaps } from '../utils/swap';
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
 * Importing a collection (instead of collecting from scratch) can unlock many
 * achievements in one go. That bulk case is coalesced into a single celebratory
 * summary banner; achievements earned through normal play always get their own
 * banner, even on the rare occasion two unlock at once. Imports are identified
 * via the store's `importSeq` marker so only true imports are summarised.
 */
export default function AchievementToaster() {
  const counts = useCollection((s) => s.counts);
  const swaps = useCollection((s) => s.swaps);
  const groups = useCollection((s) => s.groups);
  const firstStickerAt = useCollection((s) => s.firstStickerAt);
  const activityDays = useCollection((s) => s.activityDays);
  const completedOn = useCollection((s) => s.completedOn);
  const unlockedAchievements = useCollection((s) => s.unlockedAchievements);
  const markUnlocked = useCollection((s) => s.markUnlocked);
  const importSeq = useCollection((s) => s.importSeq);
  const activeAlbumId = useCollection((s) => s.activeAlbumId);

  const stats = useMemo(
    () => computeStats(counts, { activityDays, completedOn }),
    [counts, activityDays, completedOn],
  );
  // Solo swaps plus the group's combined ones this album took part in — see StatsView,
  // which must count trades the same way or the two disagree about what is unlocked.
  const closedSwaps = useMemo(
    () => countClosedSwaps(activeAlbumId, swaps, groups),
    [activeAlbumId, swaps, groups],
  );
  const achievements = useMemo(
    () => computeAchievements(stats, { closedSwaps, firstStickerAt, activityDays, now: Date.now() }),
    [stats, closedSwaps, firstStickerAt, activityDays],
  );

  // Keys we've already accounted for, so each unlock is celebrated exactly once.
  // null until primed on first render.
  const announced = useRef<Set<string> | null>(null);
  // Last-seen import marker and album, used to classify a batch of new unlocks.
  const lastImportSeq = useRef(importSeq);
  const lastAlbumId = useRef(activeAlbumId);
  const [queue, setQueue] = useState<BannerItem[]>([]);
  const [current, setCurrent] = useState<BannerItem | null>(null);

  // Detect new unlocks and record them permanently.
  useEffect(() => {
    const unlockedKeys = achievements.filter((a) => a.unlocked).map((a) => a.key);

    // First mount, or switching album, swaps in a whole different collection —
    // its already-earned achievements aren't fresh accomplishments, so silently
    // re-baseline without celebrating anything.
    if (announced.current === null || activeAlbumId !== lastAlbumId.current) {
      announced.current = new Set([...unlockedKeys, ...Object.keys(unlockedAchievements)]);
      lastAlbumId.current = activeAlbumId;
      lastImportSeq.current = importSeq;
      return;
    }

    // A bump in importSeq means this batch arrived via an import.
    const isImport = importSeq !== lastImportSeq.current;
    lastImportSeq.current = importSeq;

    const fresh = achievements.filter((a) => a.unlocked && !announced.current!.has(a.key));
    if (fresh.length === 0) return;

    for (const a of fresh) announced.current.add(a.key);
    markUnlocked(fresh.map((a) => a.key));

    if (isImport && fresh.length > 1) {
      // Bulk import: one summary banner instead of a parade.
      setQueue((q) => [...q, { kind: 'summary', achievements: fresh }]);
    } else {
      // Normal play (or an import that happened to unlock just one): celebrate
      // each achievement on its own.
      setQueue((q) => [...q, ...fresh.map((a): BannerItem => ({ kind: 'single', achievement: a }))]);
    }
  }, [achievements, unlockedAchievements, markUnlocked, importSeq, activeAlbumId]);

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
