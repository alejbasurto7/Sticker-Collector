import { resolveStickerIdFromLabel } from '../data/sampleAlbum';

export interface ParsedList {
  /** Sticker ids the collector is missing. */
  needs: string[];
  /** Sticker ids the collector has as duplicates (available to swap). */
  swaps: string[];
  /** Spare copies per swap sticker id, e.g. "2 (×3)" -> 3. Defaults to 1. */
  swapQty: Record<string, number>;
  /**
   * Copies the collector needs per need sticker id, e.g. "1 (×2)" -> 2; repeats
   * of the same number sum. Defaults to 1. Lets a swap offer more than one copy
   * of a sticker the other collector needs multiple of.
   */
  needQty: Record<string, number>;
  /**
   * Total copies listed per sticker id across the ENTIRE list, ignoring which
   * section (or none) each line sat under. Every listed number contributes its
   * quantity (1, or N for a "(×N)" suffix); repeats sum. This is what an
   * additive Merge adds on top of the current counts.
   */
  all: Record<string, number>;
  /** Raw tokens that could not be matched to a sticker. */
  unmatched: string[];
}

// Matches a quantity suffix with the multiplier either side of the digit:
// "(×2)", "(x3)", "( × 2 )" or the reversed "(2x)", "(3 X)". The count lands in
// group 1 (symbol-first) or group 2 (digit-first).
const QTY_RE = /\(\s*(?:[x×]\s*(\d+)|(\d+)\s*[x×])\s*\)/i;

type Section = 'needs' | 'swaps' | null;

// Header keywords (English + Spanish), matched case-insensitively as substrings.
const NEED_KEYWORDS = ['i need', 'need', 'necesito', 'me faltan', 'faltan', 'busco'];
const SWAP_KEYWORDS = ['to swap', 'swap', 'have', 'cambio', 'repe', 'tengo', 'doy'];

const SKIP_LINES = ['figuritas app - list', 'figuritas app', 'list', 'lista'];

// A content line is `LABEL<sep>numbers`, where LABEL is a flag emoji, country
// code, and/or name (everything up to the first digit) and the separator is a
// colon and/or whitespace. Both `🇲🇽 1,11` and the legacy `MEX: 1, 2` match;
// group 1 is the label, group 2 the comma-separated numbers.
const CONTENT_RE = /^([^\d]*?)\s*:?\s*(\d.*)$/;

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
  // Strip any preamble that precedes the export (social-media context, questions,
  // etc. posted alongside the list). "Figuritas App" is the reliable start marker.
  const appMarker = text.search(/figuritas\s+app\b/i);
  const body = appMarker > 0 ? text.slice(appMarker) : text;

  // Chat apps (WhatsApp, Facebook, SMS) often strip newlines when copying.
  // Re-insert line breaks before section keywords and before every "CODE :"
  // sticker-entry token so each line is classified independently.
  const normalized = body
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
  const needQty: Record<string, number> = {};
  const all: Record<string, number> = {};
  const unmatched: string[] = [];
  let section: Section = null;

  for (const rawLine of normalized.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line) continue;
    if (SKIP_LINES.includes(line.toLowerCase())) continue;

    const match = line.match(CONTENT_RE);
    if (match) {
      // Left side is the label (flag emoji / code / country name, any mix);
      // right side the comma-separated numbers.
      const label = match[1].trim();

      for (const piece of match[2].split(',')) {
        const token = piece.trim();
        if (!token) continue;
        // Split an optional "(×N)" spare-count suffix off the sticker number.
        const qtyMatch = token.match(QTY_RE);
        const qtyDigits = qtyMatch?.[1] ?? qtyMatch?.[2];
        const qty = qtyDigits ? Math.max(parseInt(qtyDigits, 10), 1) : 1;
        const number = token.replace(QTY_RE, '').trim();
        // Sticker numbers are always digits (e.g. "00", "7"). Anything else is
        // stray prose (like the trailing "Download the app" URL) — skip silently.
        if (!/^\d+$/.test(number)) continue;
        const id = resolveStickerIdFromLabel(label, number);
        if (!id) {
          // Only flag unknowns that sit under a real section header. Stray
          // numbers in the pre-list preamble (album name, edition) aren't
          // stickers and shouldn't be reported as skipped.
          if (section) unmatched.push(`${label} ${number}`.trim());
          continue;
        }
        // Additive-merge tally: every listed copy counts, whatever section (or
        // none) it appeared under.
        all[id] = (all[id] ?? 0) + qty;
        // The needs/swaps split still honours the header, for Replace mode.
        if (section === 'needs') {
          needs.push(id);
          // Sum copies so "1 (×2)" (or a number repeated) offers every copy.
          needQty[id] = (needQty[id] ?? 0) + qty;
        } else if (section === 'swaps') {
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
    needQty,
    all,
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
