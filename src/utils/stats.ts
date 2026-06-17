import { album } from '../data/sampleAlbum';
import type { Counts } from '../types';

export interface PageProgress {
  pageId: string;
  code: string;
  emoji: string;
  title: string;
  total: number;
  owned: number;
  pct: number;
  complete: boolean;
}

export type StickerType = 'hologram' | 'regular' | 'team';

export interface TypeProgress {
  type: StickerType;
  label: string;
  emoji: string;
  total: number;
  owned: number;
  pct: number;
}

export interface Stats {
  totalStickers: number;
  ownedUnique: number;
  missing: number;
  swapsTotal: number;
  totalCollected: number;
  completionPct: number;
  pagesCompleted: number;
  pagesTotal: number;
  pages: PageProgress[];
  byType: TypeProgress[];
  mostDuplicated: { id: string; number: string; code: string; emoji: string; extra: number } | null;
}

/** The team photo sticker is always #13 on every national-team page. */
const TEAM_STICKER_NUMBER = '13';

/** Classify a sticker into one of the three progress categories. */
export function stickerType(sticker: { number: string; special: boolean }, pageType: string): StickerType {
  if (pageType === 'team' && sticker.number === TEAM_STICKER_NUMBER) return 'team';
  if (sticker.special) return 'hologram';
  return 'regular';
}

export function countOf(counts: Counts, id: string): number {
  return counts[id] ?? 0;
}

export function computeStats(counts: Counts): Stats {
  const total = album.stickers.length;
  let ownedUnique = 0;
  let swapsTotal = 0;
  let totalCollected = 0;

  for (const s of album.stickers) {
    const c = counts[s.id] ?? 0;
    if (c >= 1) ownedUnique++;
    if (c > 1) swapsTotal += c - 1;
    totalCollected += c;
  }

  const pages: PageProgress[] = album.pages.map((p) => {
    const owned = p.stickerIds.reduce((acc, id) => acc + ((counts[id] ?? 0) >= 1 ? 1 : 0), 0);
    const totalP = p.stickerIds.length;
    return {
      pageId: p.id,
      code: p.code,
      emoji: p.emoji,
      title: p.title,
      total: totalP,
      owned,
      pct: totalP ? owned / totalP : 0,
      complete: owned === totalP,
    };
  });

  // Progress grouped by sticker type (Holograms / Regular / Team).
  const pageTypeById = Object.fromEntries(album.pages.map((p) => [p.id, p.type]));
  const typeOrder: { type: StickerType; label: string; emoji: string }[] = [
    { type: 'hologram', label: 'Holograms', emoji: '✨' },
    { type: 'regular', label: 'Regular', emoji: '🟦' },
    { type: 'team', label: 'Team', emoji: '👕' },
  ];
  const typeAcc: Record<StickerType, { owned: number; total: number }> = {
    hologram: { owned: 0, total: 0 },
    regular: { owned: 0, total: 0 },
    team: { owned: 0, total: 0 },
  };
  for (const s of album.stickers) {
    const t = stickerType(s, pageTypeById[s.pageId] ?? '');
    typeAcc[t].total++;
    if ((counts[s.id] ?? 0) >= 1) typeAcc[t].owned++;
  }
  const byType: TypeProgress[] = typeOrder.map(({ type, label, emoji }) => {
    const { owned, total } = typeAcc[type];
    return { type, label, emoji, total, owned, pct: total ? owned / total : 0 };
  });

  // Most duplicated sticker.
  let mostDuplicated: Stats['mostDuplicated'] = null;
  for (const s of album.stickers) {
    const extra = (counts[s.id] ?? 0) - 1;
    if (extra > 0 && (!mostDuplicated || extra > mostDuplicated.extra)) {
      const page = album.pages.find((p) => p.id === s.pageId)!;
      mostDuplicated = { id: s.id, number: s.number, code: page.code, emoji: page.emoji, extra };
    }
  }

  return {
    totalStickers: total,
    ownedUnique,
    missing: total - ownedUnique,
    swapsTotal,
    totalCollected,
    completionPct: total ? ownedUnique / total : 0,
    pagesCompleted: pages.filter((p) => p.complete).length,
    pagesTotal: pages.length,
    pages,
    byType,
    mostDuplicated,
  };
}

export interface Achievement {
  key: string;
  label: string;
  description: string;
  unlocked: boolean;
}

/** Extra collection signals (outside raw counts) that feed some achievements. */
export interface AchievementContext {
  /** Number of swaps that have been settled/closed. */
  closedSwaps: number;
}

/** Gamified "Achievements" derived from progress, mirroring the app. */
export function computeAchievements(
  stats: Stats,
  ctx: AchievementContext = { closedSwaps: 0 },
): Achievement[] {
  const typePct = (type: StickerType) => stats.byType.find((t) => t.type === type)?.pct ?? 0;
  const topDuplicate = stats.mostDuplicated ? stats.mostDuplicated.extra + 1 : 0;

  return [
    // Getting started
    {
      key: 'first-sticker',
      label: 'First Sticker',
      description: 'Add your first sticker',
      unlocked: stats.ownedUnique >= 1,
    },
    {
      key: 'first-page',
      label: 'Page Master',
      description: 'Complete a full page',
      unlocked: stats.pagesCompleted >= 1,
    },
    // Completion milestones
    {
      key: 'liftoff',
      label: 'Liftoff',
      description: 'Reach 10% completion',
      unlocked: stats.completionPct >= 0.1,
    },
    {
      key: 'quarter',
      label: 'Getting There',
      description: 'Reach 25% completion',
      unlocked: stats.completionPct >= 0.25,
    },
    {
      key: 'halfway',
      label: 'Halfway Hero',
      description: 'Reach 50% completion',
      unlocked: stats.completionPct >= 0.5,
    },
    {
      key: 'on-a-roll',
      label: 'On a Roll',
      description: 'Reach 75% completion',
      unlocked: stats.completionPct >= 0.75,
    },
    {
      key: 'home-stretch',
      label: 'Home Stretch',
      description: 'Reach 90% completion',
      unlocked: stats.completionPct >= 0.9,
    },
    {
      key: 'final-push',
      label: 'Final Push',
      description: 'Reach 95% completion',
      unlocked: stats.completionPct >= 0.95,
    },
    {
      key: 'complete',
      label: 'Album Complete',
      description: 'Collect every sticker',
      unlocked: stats.completionPct >= 1,
    },
    // Volume & pages
    {
      key: 'century',
      label: 'Century',
      description: 'Collect 100 unique stickers',
      unlocked: stats.ownedUnique >= 100,
    },
    {
      key: 'bookworm',
      label: 'Bookworm',
      description: 'Complete 5 pages',
      unlocked: stats.pagesCompleted >= 5,
    },
    {
      key: 'librarian',
      label: 'Librarian',
      description: 'Complete 25 pages',
      unlocked: stats.pagesCompleted >= 25,
    },
    // Type completion
    {
      key: 'shiny-hunter',
      label: 'Shiny Hunter',
      description: 'Collect every hologram',
      unlocked: typePct('hologram') >= 1,
    },
    {
      key: 'squad-goals',
      label: 'Squad Goals',
      description: 'Collect every team sticker',
      unlocked: typePct('team') >= 1,
    },
    {
      key: 'by-the-book',
      label: 'By the Book',
      description: 'Collect every regular sticker',
      unlocked: typePct('regular') >= 1,
    },
    // Duplicates
    {
      key: 'first-dupe',
      label: 'Got, Got, Need',
      description: 'Hold your first duplicate',
      unlocked: stats.swapsTotal >= 1,
    },
    {
      key: 'swap-master',
      label: 'Swap Master',
      description: 'Hold 10+ duplicates',
      unlocked: stats.swapsTotal >= 10,
    },
    {
      key: 'hoarder',
      label: 'Hoarder',
      description: 'Hold 50+ duplicates',
      unlocked: stats.swapsTotal >= 50,
    },
    {
      key: 'seeing-double',
      label: 'Seeing Double',
      description: 'Have 5 copies of one sticker',
      unlocked: topDuplicate >= 5,
    },
    // Trading
    {
      key: 'first-trade',
      label: 'First Trade',
      description: 'Complete your first swap',
      unlocked: ctx.closedSwaps >= 1,
    },
    {
      key: 'wheeler-dealer',
      label: 'Wheeler Dealer',
      description: 'Complete 10 swaps',
      unlocked: ctx.closedSwaps >= 10,
    },
  ];
}
