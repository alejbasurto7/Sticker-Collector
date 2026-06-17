import { album, applyEdition } from '../src/data/sampleAlbum';
import { parseExport, parsedToCounts } from '../src/utils/import';
import { computeStats, longestStreak, daysCollecting } from '../src/utils/stats';
import {
  computeCandidates,
  computeConflicts,
  computeReservations,
  quantityAfterGive,
} from '../src/utils/swap';
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
const conflictSwaps: Swap[] = [
  { id: 'a', name: 'A', createdAt: 1, status: 'open', theirNeeds: [], theirSwaps: [], giving: ['BRA-3'], receiving: ['ARG-10'] },
  { id: 'b', name: 'B', createdAt: 2, status: 'open', theirNeeds: [], theirSwaps: [], giving: ['BRA-3'], receiving: ['ARG-10'] },
  { id: 'c', name: 'C', createdAt: 3, status: 'closed', theirNeeds: [], theirSwaps: [], giving: ['BRA-3'], receiving: [] },
];
// BRA-3: count=2 (1 spare) → 2 swaps > 1 spare → conflict
const conf1 = computeConflicts(conflictSwaps, { 'BRA-3': 2, 'ARG-10': 0 });
assert(conf1.giving.has('BRA-3'), 'BRA-3 with 1 spare, promised in 2 open swaps -> conflict');
assert(conf1.receiving.has('ARG-10'), 'ARG-10 missing, expected from 2 open swaps -> conflict');
assert(conf1.giveSwapCounts.get('BRA-3') === 2, 'giveSwapCounts tracks open swap count');
assert(conf1.recvSwapCounts.get('ARG-10') === 2, 'recvSwapCounts tracks open swap count');

// BRA-3: count=3 (2 spares) → 2 swaps <= 2 spares → no conflict
const conf2 = computeConflicts(conflictSwaps, { 'BRA-3': 3, 'ARG-10': 0 });
assert(!conf2.giving.has('BRA-3'), 'BRA-3 with 2 spares, promised in 2 open swaps -> no conflict');
assert(conf2.receiving.has('ARG-10'), 'ARG-10 missing, expected from 2 swaps -> still conflicts');

// Receiving: only 1 swap -> no conflict
const singleRecv: Swap[] = [
  { id: 'd', name: 'D', createdAt: 4, status: 'open', theirNeeds: [], theirSwaps: [], giving: [], receiving: ['ARG-10'] },
];
const conf3 = computeConflicts(singleRecv, { 'ARG-10': 0 });
assert(!conf3.receiving.has('ARG-10'), 'ARG-10 expected from only 1 swap -> no conflict');

// Closed swaps are ignored
const closedOnly: Swap[] = [
  { id: 'e', name: 'E', createdAt: 5, status: 'closed', theirNeeds: [], theirSwaps: [], giving: ['BRA-3'], receiving: [] },
  { id: 'f', name: 'F', createdAt: 6, status: 'closed', theirNeeds: [], theirSwaps: [], giving: ['BRA-3'], receiving: [] },
];
const conf4 = computeConflicts(closedOnly, { 'BRA-3': 2 });
assert(!conf4.giving.has('BRA-3'), 'closed swaps are ignored in conflict detection');

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

// --- Social-media preamble before the export ---
// e.g. a Facebook post: "Does anyone trade in Alpharetta? Figuritas App - List ..."
const WITH_PREAMBLE = 'Does anyone trade in Alpharetta? Figuritas App - List Usa Mex Can 26 I need FWC : 00, 2, 3 Swaps FWC : 1';
console.log('Preamble comment before Figuritas App header');
const wp = parseExport(WITH_PREAMBLE);
assert(wp.needs.includes('FWC-trophy-00'), 'needs parsed after preamble stripped');
assert(wp.swaps.includes('FWC-trophy-1'), 'swaps parsed after preamble stripped');
assert(!wp.needs.some((id) => id.startsWith('Alpharetta')), 'preamble text not parsed as sticker');

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

// --- Reservation rollups across open swaps ---
console.log('Reservation rollups (committed give/get)');
const resSwaps: Swap[] = [
  { id: 'a', name: 'A', createdAt: 1, status: 'open', theirNeeds: [], theirSwaps: [], giving: ['BRA-3'], receiving: ['ARG-10'] },
  { id: 'b', name: 'B', createdAt: 2, status: 'open', theirNeeds: [], theirSwaps: [], giving: ['BRA-3', 'MEX-5'], receiving: [] },
  { id: 'c', name: 'C', createdAt: 3, status: 'closed', theirNeeds: [], theirSwaps: [], giving: ['BRA-3'], receiving: ['ARG-10'] },
];
const res = computeReservations(resSwaps);
assert(res.committedGive.get('BRA-3') === 2, 'BRA-3 committed as give in 2 OPEN swaps (closed ignored)');
assert(res.committedGive.get('MEX-5') === 1, 'MEX-5 committed once');
assert(res.committedGet.has('ARG-10'), 'ARG-10 committed as get (open swap a)');
const resExcl = computeReservations(resSwaps, 'a');
assert(resExcl.committedGive.get('BRA-3') === 1, 'excluding swap a leaves BRA-3 give count 1');
assert(!resExcl.committedGet.has('ARG-10'), 'excluding swap a releases the ARG-10 get');

// --- Reservation-aware candidates (the safety core) ---
console.log('Reservation-aware candidates');
const partyNeedsBra: ParsedList = { needs: ['BRA-3'], swaps: ['ARG-10'], swapQty: {}, unmatched: [] };
// I hold exactly one spare of BRA-3 (count 2) and am missing ARG-10.
const myC: Record<string, number> = { 'BRA-3': 2, 'ARG-10': 0 };
// That one spare is already promised to another open swap -> not offerable again.
const fullyReserved = computeReservations([
  { id: 'x', name: 'X', createdAt: 1, status: 'open', theirNeeds: [], theirSwaps: [], giving: ['BRA-3'], receiving: ['ARG-10'] },
]);
const candR = computeCandidates(myC, partyNeedsBra, fullyReserved);
assert(!candR.youGive.includes('BRA-3'), 'fully-reserved spare is NOT offered to a second swap');
assert(!candR.youGet.includes('ARG-10'), 'a sticker already being received is NOT offered again');
// With two spares (count 3) and one reserved, one copy is still offerable.
const myC2: Record<string, number> = { 'BRA-3': 3, 'ARG-10': 0 };
const candR2 = computeCandidates(myC2, partyNeedsBra, fullyReserved);
assert(candR2.youGive.includes('BRA-3'), 'partially-reserved spare is still offerable');
// Backward compatible: no reservations -> original behaviour.
const candPlain = computeCandidates(myC, partyNeedsBra);
assert(candPlain.youGive.includes('BRA-3') && candPlain.youGet.includes('ARG-10'), 'no reservations behaves as before');

// --- Give floor at settlement (never empties owned, protects others' reservations) ---
console.log('quantityAfterGive floor');
assert(quantityAfterGive(2, 0) === 1, 'give a spare: 2 -> 1');
assert(quantityAfterGive(1, 0) === 0, 'give last copy when nothing reserved: 1 -> 0');
assert(quantityAfterGive(0, 0) === 0, 'nothing to give: 0 -> 0 (no phantom)');
assert(quantityAfterGive(3, 1) === 2, 'one reserved by others: 3 -> 2');
assert(quantityAfterGive(2, 1) === 2, 'protect 1 owned + 1 reserved: cannot drop below 2');
assert(quantityAfterGive(1, 1) === 1, 'inconsistent reserve never creates a phantom copy');

// --- Streak (longest run of consecutive collecting days) ---
console.log('Current streak');
assert(longestStreak([]) === 0, 'no days -> 0 streak');
assert(longestStreak(['2026-06-17']) === 1, 'one day -> streak 1');
assert(
  longestStreak(['2026-06-15', '2026-06-16', '2026-06-17']) === 3,
  'three consecutive days -> streak 3',
);
assert(
  longestStreak(['2026-06-10', '2026-06-15', '2026-06-16']) === 2,
  'gap resets, best run is the 2-day tail',
);
assert(
  longestStreak(['2026-06-16', '2026-06-15', '2026-06-15', '2026-06-17']) === 3,
  'unsorted + duplicate days still yield streak 3',
);

// --- Days collecting (inclusive span, frozen at completion) ---
console.log('Days collecting');
assert(daysCollecting(null, '2026-06-17') === 0, 'no first day -> 0');
assert(daysCollecting('2026-06-17', '2026-06-17') === 1, 'same day -> 1 (first day counts)');
assert(daysCollecting('2026-06-10', '2026-06-17') === 8, 'June 10 to 17 inclusive -> 8 days');
// completedOn freezes the end date: a completion date before "today" stops the count.
const completedStats = computeStats(
  Object.fromEntries(album.stickers.map((s) => [s.id, 1])),
  { collectDays: ['2026-06-01', '2026-06-02'], completedOn: '2026-06-05' },
);
assert(completedStats.daysCollecting === 5, 'frozen at completion: Jun 1 -> Jun 5 = 5 days');
assert(completedStats.currentStreak === 2, 'streak read from collectDays');

console.log(failures === 0 ? '\nALL PASS' : `\n${failures} FAILURES`);
process.exit(failures === 0 ? 0 : 1);
