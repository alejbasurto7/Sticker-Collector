import type { Counts } from '../types';
import { album } from '../data/sampleAlbum';

/**
 * Build export text from the user's counts in the same format that parseExport() consumes.
 * Emojis are intentionally omitted to keep the text ASCII-only and the QR code compact —
 * resolveStickerId() has a number-only fallback for all pages including FWC intros.
 */
export function buildExportText(counts: Counts): string {
  const needLines: string[] = [];
  const swapLines: string[] = [];

  for (const page of album.pages) {
    const needNums: string[] = [];
    const swapNums: string[] = [];

    for (const stickerId of page.stickerIds) {
      const sticker = album.stickers.find((s) => s.id === stickerId);
      if (!sticker) continue;
      const count = counts[stickerId] ?? 0;
      if (count === 0) {
        needNums.push(sticker.number);
      } else if (count > 1) {
        const extras = count - 1;
        swapNums.push(extras > 1 ? `${sticker.number} (x${extras})` : sticker.number);
      }
    }

    // No emoji — code alone is enough for resolveStickerId() to match
    if (needNums.length > 0)
      needLines.push(`${page.code}: ${needNums.join(', ')}`);
    if (swapNums.length > 0)
      swapLines.push(`${page.code}: ${swapNums.join(', ')}`);
  }

  const parts: string[] = [];
  if (needLines.length > 0) parts.push('I need', ...needLines);
  if (swapLines.length > 0) parts.push('To swap', ...swapLines);
  return parts.join('\n');
}
