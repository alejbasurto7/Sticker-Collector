import { album, stickerById, pageById } from '../data/sampleAlbum';
import type { Page, Sticker } from '../types';

export interface PageGroup {
  page: Page;
  stickers: Sticker[];
}

/** Group sticker ids by their page, preserving album page + sticker order. */
export function groupByPage(ids: string[]): PageGroup[] {
  const set = new Set(ids);
  const groups: PageGroup[] = [];
  for (const page of album.pages) {
    const stickers = page.stickerIds.filter((id) => set.has(id)).map((id) => stickerById[id]);
    if (stickers.length) groups.push({ page, stickers });
  }
  return groups;
}

export function labelFor(id: string): string {
  const s = stickerById[id];
  if (!s) return id;
  const p = pageById[s.pageId];
  return `${p.code} ${s.number}`;
}
