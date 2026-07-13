import type { Counts } from '../types';
import { album, stickerById } from '../data/sampleAlbum';

/** Which sections to include in the exported list. */
export type ListExportScope = 'both' | 'needs' | 'swaps';

/**
 * Build a shareable list in the exact same text format consumed by parseExport()
 * (see utils/import.ts) — the "Figuritas App - List" banner, the album name, then
 * an "I need" and/or "To Swap" section of `CODE emoji: n, n, n` lines.
 *
 * Missing stickers (count 0) go under "I need"; duplicates (count > 1) under
 * "To Swap". When `includeSwapQty` is on, stickers with more than one spare get a
 * `(×N)` suffix so the spare count survives a round-trip through the importer.
 */
export function buildListExport(
  counts: Counts,
  albumName: string,
  scope: ListExportScope,
  includeSwapQty: boolean,
): string {
  const needLines: string[] = [];
  const swapLines: string[] = [];

  for (const page of album.pages) {
    const needNums: string[] = [];
    const swapNums: string[] = [];

    for (const stickerId of page.stickerIds) {
      const sticker = stickerById[stickerId];
      if (!sticker) continue;
      const count = counts[stickerId] ?? 0;
      if (count === 0) {
        needNums.push(sticker.number);
      } else if (count > 1) {
        const extras = count - 1;
        swapNums.push(
          includeSwapQty && extras > 1 ? `${sticker.number} (×${extras})` : sticker.number,
        );
      }
    }

    if (needNums.length > 0) needLines.push(`${page.code} ${page.emoji}: ${needNums.join(', ')}`);
    if (swapNums.length > 0) swapLines.push(`${page.code} ${page.emoji}: ${swapNums.join(', ')}`);
  }

  const parts: string[] = ['Figuritas App - List', albumName];
  if (scope !== 'swaps' && needLines.length > 0) parts.push('I need', ...needLines);
  if (scope !== 'needs' && swapLines.length > 0) parts.push('To Swap', ...swapLines);
  return parts.join('\n');
}

/**
 * Rebuild a collector's list text from explicit needs/swaps sticker-id arrays,
 * in the same "Figuritas App - List" format buildListExport() produces and
 * parseExport() consumes. Used to re-populate the "Their list" field when
 * editing a saved swap, whose parsed needs/swaps are all that's kept.
 */
export function buildListFromIds(needs: string[], swaps: string[], albumName: string): string {
  const needSet = new Set(needs);
  const swapSet = new Set(swaps);
  const needLines: string[] = [];
  const swapLines: string[] = [];

  for (const page of album.pages) {
    const needNums: string[] = [];
    const swapNums: string[] = [];

    for (const stickerId of page.stickerIds) {
      const sticker = stickerById[stickerId];
      if (!sticker) continue;
      if (needSet.has(stickerId)) needNums.push(sticker.number);
      if (swapSet.has(stickerId)) swapNums.push(sticker.number);
    }

    if (needNums.length > 0) needLines.push(`${page.code} ${page.emoji}: ${needNums.join(', ')}`);
    if (swapNums.length > 0) swapLines.push(`${page.code} ${page.emoji}: ${swapNums.join(', ')}`);
  }

  const parts: string[] = ['Figuritas App - List', albumName];
  if (needLines.length > 0) parts.push('I need', ...needLines);
  if (swapLines.length > 0) parts.push('To Swap', ...swapLines);
  return parts.join('\n');
}
