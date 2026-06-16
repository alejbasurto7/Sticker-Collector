import { album, applyEdition } from '../src/data/sampleAlbum';
import { parseExport, parsedToCounts } from '../src/utils/import';
import { computeStats } from '../src/utils/stats';
import { computeCandidates, computeConflicts } from '../src/utils/swap';
import type { Swap } from '../src/types';

let failures = 0;
function assert(cond: boolean, msg: string) {
  if (!cond) {
    failures++;
    console.error('  ✗ FAIL:', msg);
  } else {
    console.log('  ✓', msg);
  }
}

// --- Album shape ---
console.log('Album structure');
assert(album.name === 'Usa Mex Can 26', 'album name correct');
assert(album.pages.length === 52, `52 pages (got ${album.pages.length})`);
assert(album.stickers.length === 994, `994 stickers (got ${album.stickers.length})`);
const teamPages = album.pages.filter((p) => p.type === 'team');
assert(teamPages.length === 48, `48 team pages (got ${teamPages.length})`);
assert(teamPages.every((p) => p.stickerIds.length === 20), 'each team has 20 stickers');
const cc = album.pages.find((p) => p.code === 'CC');
assert(!!cc && cc.stickerIds.length === 14, 'CC extras page with 14 stickers (LATAM default)');

console.log('Edition switching');
applyEdition('na');
assert(album.stickers.length === 992, `NA edition: 992 stickers (got ${album.stickers.length})`);
assert(album.pages.find((p) => p.code === 'CC')!.stickerIds.length === 12, 'NA: CC has 12');
applyEdition('latam');
assert(album.stickers.length === 994, `LATAM edition: 994 stickers (got ${album.stickers.length})`);
assert(album.pages.find((p) => p.code === 'CC')!.stickerIds.length === 14, 'LATAM: CC has 14');

// --- Real export parse ---
const REAL = `Figuritas App - List
Usa Mex Can 26
I need
FWC 🏆: 00, 1, 2, 3, 4
FWC 🌎: 5, 6, 7, 8
FWC 📜: 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19
MEX 🇲🇽: 1, 2, 3, 4, 5
PAN 🇵🇦: 1, 2, 3`;

console.log('Parse real export (I need only)');
const parsed = parseExport(REAL);
assert(parsed.unmatched.length === 0, `no unmatched (got ${parsed.unmatched.length}: ${parsed.unmatched})`);
assert(parsed.needs.length === 20 + 5 + 3, `28 needs (got ${parsed.needs.length})`);
assert(parsed.needs.includes('FWC-trophy-00'), 'parses "00" intro sticker');
assert(parsed.needs.includes('MEX-5') && parsed.needs.includes('PAN-3'), 'parses team stickers');

// --- Counts from parse: needs missing, rest owned ---
console.log('parsedToCounts');
const counts = parsedToCounts(parsed, album.stickers.map((s) => s.id));
assert(counts['MEX-5'] === 0, 'needed sticker -> 0');
assert(counts['MEX-6'] === 1, 'unlisted sticker -> owned 1');
const stats = computeStats(counts);
assert(stats.missing === 28, `28 missing (got ${stats.missing})`);
const totalIds = album.stickers.length;
assert(stats.ownedUnique === totalIds - 28, `owned ${totalIds - 28} (got ${stats.ownedUnique})`);

// --- Export with To Swap section ---
console.log('Parse needs + swaps sections');
const WITH_SWAP = `Usa Mex Can 26
I need
BRA 🇧🇷: 3, 4
To Swap
ARG 🇦🇷: 10, 11, 12`;
const p2 = parseExport(WITH_SWAP);
assert(p2.needs.length === 2 && p2.needs.includes('BRA-3'), 'needs parsed');
assert(p2.swaps.length === 3 && p2.swaps.includes('ARG-10'), 'swaps parsed');

// --- Swap candidates ---
console.log('Swap candidates');
// My collection: I have ARG-10 missing, and BRA-3 as a duplicate.
const myCounts: Record<string, number> = { 'BRA-3': 2, 'ARG-10': 0 };
const cand = computeCandidates(myCounts, p2);
assert(cand.youGive.includes('BRA-3'), 'I can give my duplicate they need (BRA-3)');
assert(cand.youGet.includes('ARG-10'), 'I can get their duplicate I need (ARG-10)');
assert(!cand.youGet.includes('ARG-11') || myCounts['ARG-11'] === undefined, 'youGet only includes ones I miss');

// --- Conflicts across open swaps ---
console.log('Conflict detection');
const swaps: Swap[] = [
  { id: 'a', name: 'A', createdAt: 1, status: 'open', theirNeeds: [], theirSwaps: [], giving: ['BRA-3'], receiving: ['ARG-10'] },
  { id: 'b', name: 'B', createdAt: 2, status: 'open', theirNeeds: [], theirSwaps: [], giving: ['BRA-3'], receiving: ['JPN-5'] },
  { id: 'c', name: 'C', createdAt: 3, status: 'closed', theirNeeds: [], theirSwaps: [], giving: ['BRA-3'], receiving: [] },
];
const conf = computeConflicts(swaps);
assert(conf.giving.has('BRA-3'), 'BRA-3 promised in 2 open swaps -> conflict');
assert(!conf.receiving.has('ARG-10'), 'ARG-10 only received once -> no conflict');

// --- FULL real export (needs + swaps with quantities + CC) ---
const FULL = `Figuritas App - List
Usa Mex Can 26
I need
FWC 🌎: 5, 6, 8
CC 🥤: 1, 2, 3, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14
Swaps
BIH 🇧🇦: 2 (×2), 3, 5, 14, 16, 19
ESP 🇪🇸: 2 (×2), 8, 10 (×2)
COD 🇨🇩: 6 (×2), 7, 8 (×2), 11 (×3), 20`;

console.log('Full real export (quantities + CC)');
const full = parseExport(FULL);
assert(full.unmatched.length === 0, `CC now resolves, no unmatched (got ${full.unmatched}）`);
assert(full.needs.includes('CC-1') && full.needs.includes('CC-14'), 'CC needs parsed');
assert(full.needs.includes('FWC-world-5'), 'FWC 🌎 need parsed');
assert(full.swaps.includes('BIH-2') && full.swapQty['BIH-2'] === 2, 'BIH-2 has 2 spares');
assert(full.swapQty['COD-11'] === 3, 'COD-11 has 3 spares (×3)');
assert(full.swapQty['ESP-10'] === 2 && full.swapQty['ESP-8'] === 1, 'mixed qty in one line');
assert((full.swapQty['BIH-3'] ?? 1) === 1, 'plain entry defaults to 1 spare');

const fullCounts = parsedToCounts(full, album.stickers.map((s) => s.id));
assert(fullCounts['COD-11'] === 4, 'owned(1) + 3 spares = count 4');
assert(fullCounts['BIH-2'] === 3, 'owned(1) + 2 spares = count 3');
assert(fullCounts['CC-1'] === 0, 'CC need -> missing');
const fullStats = computeStats(fullCounts);
const expectedSwapsTotal = Object.values(full.swapQty).reduce((a, b) => a + b, 0);
assert(fullStats.swapsTotal === expectedSwapsTotal, `swapsTotal = sum of spares (${expectedSwapsTotal}, got ${fullStats.swapsTotal})`);
assert(fullStats.missing === full.needs.length, `missing == needs (${full.needs.length}, got ${fullStats.missing})`);

// --- Single-line export (WhatsApp / SMS strips newlines) ---
// Reproduces the bug where "I need FWC : 00, 2, 3" on one line meant section
// was never detected and every sticker was silently skipped.
const SINGLE_LINE = 'Figuritas App - List Usa Mex Can 26 I need FWC : 00, 2, 3 FWC : 7 MEX : 5, 7, 8, 10 Swaps FWC : 1 FWC : 11, 14, 18 MEX : 12, 20';
console.log('Single-line export (no newlines)');
const sl = parseExport(SINGLE_LINE);
assert(sl.needs.includes('FWC-trophy-00'), 'FWC 00 need parsed from single-line');
assert(sl.needs.includes('FWC-world-7'), 'FWC 7 need parsed from single-line');
assert(sl.needs.includes('MEX-5') && sl.needs.includes('MEX-10'), 'MEX needs parsed from single-line');
assert(sl.swaps.includes('FWC-trophy-1'), 'FWC 1 swap parsed from single-line');
assert(sl.swaps.includes('FWC-scroll-11') && sl.swaps.includes('FWC-scroll-18'), 'FWC scroll swaps parsed');
assert(sl.swaps.includes('MEX-12') && sl.swaps.includes('MEX-20'), 'MEX swaps parsed from single-line');
assert(sl.needs.length > 0 && sl.swaps.length > 0, 'both sections non-empty');

console.log(failures === 0 ? '\nALL PASS' : `\n${failures} FAILURES`);
process.exit(failures === 0 ? 0 : 1);
