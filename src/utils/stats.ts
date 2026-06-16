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

export interface CollectorSkill {
  key: string;
  label: string;
  description: string;
  unlocked: boolean;
}

/** Gamified "Collector Skills" derived from progress, mirroring the app. */
export function computeSkills(stats: Stats): CollectorSkill[] {
  return [
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
      key: 'swap-master',
      label: 'Swap Master',
      description: 'Hold 10+ duplicates',
      unlocked: stats.swapsTotal >= 10,
    },
    {
      key: 'home-stretch',
      label: 'Home Stretch',
      description: 'Reach 90% completion',
      unlocked: stats.completionPct >= 0.9,
    },
    {
      key: 'complete',
      label: 'Album Complete',
      description: 'Collect every sticker',
      unlocked: stats.completionPct >= 1,
    },
  ];
}
