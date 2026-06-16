import { resolveStickerId } from '../data/sampleAlbum';

export interface ParsedList {
  /** Sticker ids the collector is missing. */
  needs: string[];
  /** Sticker ids the collector has as duplicates (available to swap). */
  swaps: string[];
  /** Spare copies per swap sticker id, e.g. "2 (×3)" -> 3. Defaults to 1. */
  swapQty: Record<string, number>;
  /** Raw tokens that could not be matched to a sticker. */
  unmatched: string[];
}

// Matches a quantity suffix like "(×2)", "(x3)" or "( × 2 )".
const QTY_RE = /\(\s*[x×]\s*(\d+)\s*\)/i;

type Section = 'needs' | 'swaps' | null;

// Header keywords (English + Spanish), matched case-insensitively as substrings.
const NEED_KEYWORDS = ['i need', 'need', 'necesito', 'me faltan', 'faltan', 'busco'];
const SWAP_KEYWORDS = ['to swap', 'swap', 'cambio', 'repe', 'tengo', 'doy'];

const SKIP_LINES = ['figuritas app - list', 'figuritas app', 'list', 'lista'];

/** A content line looks like `CODE emoji: 1, 2, 3`. */
const CONTENT_RE = /^(.+?):\s*(.+)$/;

function classifyHeader(line: string): Section {
  const l = line.toLowerCase();
  // Swap keywords take priority so "to swap" isn't caught by a generic need rule.
  if (SWAP_KEYWORDS.some((k) => l.includes(k))) return 'swaps';
  if (NEED_KEYWORDS.some((k) => l.includes(k))) return 'needs';
  return null;
}

/**
 * Parse the Figuritas export text into needs/swaps sticker-id lists.
 * Lines before the first recognized section header (app banner, album name) are
 * ignored. Each content line maps its numbers to sticker ids via the album.
 */
export function parseExport(text: string): ParsedList {
  // Chat apps (WhatsApp, Telegram, SMS) often strip newlines when copying.
  // Re-insert line breaks before section keywords and before every "CODE :"
  // sticker-entry token so each line is classified independently.
  const normalized = text
    // Pass 1: newline before section-header keywords appearing mid-line.
    .replace(
      /[^\S\r\n]+(?=(?:I[ \t]+need|To[ \t]+swap|swaps?|necesito|me[ \t]+faltan|faltan|busco|cambio|repe|tengo|doy)(?:[ \t]|$))/gi,
      '\n',
    )
    // Pass 2: newline before sticker-entry tokens (e.g. "FWC :" or "MEX :").
    .replace(/[^\S\r\n]+(?=[A-Z]{2,5}\s*:)/g, '\n');

  const needs: string[] = [];
  const swaps: string[] = [];
  const swapQty: Record<string, number> = {};
  const unmatched: string[] = [];
  let section: Section = null;

  for (const rawLine of normalized.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line) continue;
    if (SKIP_LINES.includes(line.toLowerCase())) continue;

    const match = line.match(CONTENT_RE);
    if (match) {
      // Left side holds the code + emoji; right side the comma-separated numbers.
      const left = match[1].trim();
      const tokens = left.split(/\s+/);
      const code = tokens[0];
      const emoji = tokens.slice(1).join(' ');

      if (!section) continue; // numbers before any section header → ignore

      for (const piece of match[2].split(',')) {
        const token = piece.trim();
        if (!token) continue;
        // Split an optional "(×N)" spare-count suffix off the sticker number.
        const qtyMatch = token.match(QTY_RE);
        const qty = qtyMatch ? Math.max(parseInt(qtyMatch[1], 10), 1) : 1;
        const number = token.replace(QTY_RE, '').trim();
        // Sticker numbers are always digits (e.g. "00", "7"). Anything else is
        // stray prose (like the trailing "Download the app" URL) — skip silently.
        if (!/^\d+$/.test(number)) continue;
        const id = resolveStickerId(code, emoji, number);
        if (!id) {
          unmatched.push(`${code} ${number}`.trim());
          continue;
        }
        if (section === 'needs') {
          needs.push(id);
        } else {
          swaps.push(id);
          swapQty[id] = qty;
        }
      }
      continue;
    }

    // Non-content line → maybe a section header.
    const next = classifyHeader(line);
    if (next) section = next;
  }

  return {
    needs: [...new Set(needs)],
    swaps: [...new Set(swaps)],
    swapQty,
    unmatched,
  };
}

/**
 * Build a full counts map for the user's own collection from a parsed export.
 * Everything not listed as "needed" is owned (1); swap-listed gets an extra (2).
 */
export function parsedToCounts(parsed: ParsedList, allStickerIds: string[]): Record<string, number> {
  const needSet = new Set(parsed.needs);
  const swapSet = new Set(parsed.swaps);
  const counts: Record<string, number> = {};
  for (const id of allStickerIds) {
    if (needSet.has(id)) counts[id] = 0;
    // Owned (1) plus the listed spare copies.
    else if (swapSet.has(id)) counts[id] = 1 + (parsed.swapQty[id] ?? 1);
    else counts[id] = 1;
  }
  return counts;
}
