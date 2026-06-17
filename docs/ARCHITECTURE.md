# Architecture

This document describes **what is actually in the codebase**. The code is the source of
truth; this file is a map of it. (There is no separate spec — earlier design/plan
documents were removed because they described an abandoned server-side architecture that
was never built.)

**Figuritas — Sticker Collector** is a client-only React PWA for tracking a Panini-style
sticker album, viewing collection stats, and organizing swaps with other collectors. There
is **no backend**: all data lives in the browser's `localStorage`.

---

## Stack

| Concern | Choice |
|---|---|
| UI | React 18.3 (function components + hooks) |
| Build / dev | Vite 5.4, `@vitejs/plugin-react` |
| Language | TypeScript 5.6, `strict` |
| State | Zustand 4.5 with the `persist` middleware |
| Persistence | `localStorage`, key `figuritas-collection-v1` |
| PWA / offline | `vite-plugin-pwa` (Workbox precache, `registerType: 'autoUpdate'`) |
| QR codes | `qrcode` (generate) + `jsqr` (decode) |
| Image export | `html-to-image` |
| Styling | Hand-written CSS design system ([src/styles.css](../src/styles.css)), dark theme |
| Routing | None — tabs are local component state |
| Auth | None |

---

## App shell & navigation

[src/main.tsx](../src/main.tsx) mounts `<App>` into `#root`. [src/App.tsx](../src/App.tsx)
is the whole shell:

- Sticky header: album name, an **edition** button (⚙️), and the overall
  [ProgressBar](../src/components/ProgressBar.tsx).
- A `main` region **keyed by `edition`** so all views remount and recompute when the album
  layout changes.
- Four tabs selected via `useState<Tab>` (no router): **album · swaps · trade · stats**.
- A fixed-bottom [TabBar](../src/components/TabBar.tsx) with a badge counting open swaps.

```
App
├─ AlbumView    (tab: album)   browse + edit the collection
├─ SwapsView    (tab: swaps)   create/manage swaps
├─ TradeView    (tab: trade)   QR generate / scan
├─ StatsView    (tab: stats)   progress, skills, share
└─ EditionDialog (modal)       NA / LATAM picker
```

---

## Data model

Defined in [src/types.ts](../src/types.ts):

```ts
Sticker { id; number; pageId; special }      // id e.g. "MEX-1" or "FWC-trophy-00"
Page    { id; code; emoji; title; type; stickerIds[] }   // type: intro | team | extra
Album   { id; name; pages[]; stickers[] }
Counts  = Record<stickerId, number>          // 0 = missing, 1 = owned, >1 = has spares
Swap    { id; name; createdAt; closedAt?; status; theirNeeds[]; theirSwaps[]; giving[]; receiving[] }
Edition = 'na' | 'latam'
```

**One integer per sticker (`Counts`) is the source of truth** for the whole app: `0` =
missing, `1` = owned, `n>1` = owned + `(n−1)` spares. Stats, swap candidates, and exports
are all derived from it.

> **Id nuance:** team/extra sticker ids are `CODE-NUMBER` (`MEX-1`, `CC-14`). The three FWC
> intro pages share the code `FWC` but have distinct page ids, so their sticker ids are
> `PAGEID-NUMBER` (`FWC-trophy-00`, `FWC-world-5`, `FWC-scroll-19`).

### The album ([src/data/sampleAlbum.ts](../src/data/sampleAlbum.ts))

The bundled album is **"Usa Mex Can 26"** (2026 48-team World Cup), built from compact
tables so ids are deterministic:

- **3 FWC intro pages** — `🏆 World Cup` (00–4, all foil), `🌎 Host Cities` (5–8),
  `📜 Legends` (9–19).
- **48 team pages** — 20 stickers each; sticker `#1` is the foil crest.
- **1 Coca-Cola extras page** (`🥤`) — size depends on edition.

| Edition | CC stickers | Total | Pages |
|---|---|---|---|
| `latam` (default) | 14 | **994** | 52 |
| `na` | 12 | **992** | 52 |

`album`, `stickerById`, and `pageById` are **live module bindings** rebuilt by
`applyEdition(edition)`; views read them fresh each render. `resolveStickerId(code, emoji,
number)` maps an import token to an id — for `FWC` it matches by emoji first, then falls
back to whichever intro page contains that number; all other codes resolve directly to
`CODE-NUMBER`. Switching edition rebuilds the layout but **never touches saved counts**.

---

## State store ([src/store/collectionStore.ts](../src/store/collectionStore.ts))

A single Zustand store holds `{ counts, swaps, edition }`, persisted to `localStorage`. On
rehydration it calls `applyEdition` so the album matches the saved edition before first
render.

| Action | Effect |
|---|---|
| `setEdition(e)` | rebuild album, store edition |
| `addOne / removeOne / setCount` | adjust a sticker's count (clamped ≥ 0) |
| `importCounts(map, 'replace' \| 'merge')` | bulk-apply a parsed collection |
| `reset()` | clear all counts |
| `createSwap / updateSwap / deleteSwap` | swap CRUD |
| `closeSwap(id, settled)` | settle a swap into counts (see reservation floor below) |
| `undoLastTrade()` | revert the most recently closed swap |

---

## Swaps — reservation-aware matching ([src/utils/swap.ts](../src/utils/swap.ts))

This is the core trade logic. A `Swap` records what you've promised to **give** and expect
to **receive**; an `open` swap is a live reservation.

- **`computeReservations(swaps, excludeSwapId?)`** → `{ committedGive: Map<id, count>,
  committedGet: Set<id> }`, rolled up across all **open** swaps. `committedGive` counts how
  many copies of each sticker are already promised out; `committedGet` is the set of
  stickers you're already due to receive. Pass `excludeSwapId` to leave a swap out of its
  own reservation picture.

- **`computeCandidates(counts, other, reservations?)`** → `{ youGive, youGet }`, the
  two-way overlap with another collector's parsed list:
  - `youGive` = their needs where your **offerable** spares (`spareCount − committedGive`)
    are `≥ 1` — a spare already promised elsewhere is **not** offered again.
  - `youGet` = their spares you're missing **and** are not already receiving.
  - With no `reservations` it degrades to the plain overlap (used by tests / callers that
    don't need safety).

- **`quantityAfterGive(current, committedByOthers)`** → the settlement floor. Giving a copy
  never drops a sticker below `1 owned + copies still reserved by other open swaps`, and
  never invents a copy you don't hold. `closeSwap` uses it so settling one deal can't strip
  a spare promised to another.

- **`computeConflicts(swaps)`** → advisory sets of stickers promised in 2+ open swaps. With
  reservation-aware candidates this should rarely trigger; it remains as a **backstop /
  legacy-data warning** surfaced as ⚠️ in [SwapDetail](../src/components/SwapDetail.tsx) and
  [SwapsView](../src/components/SwapsView.tsx).

**Net effect:** double-promising a spare or chasing a sticker you're already getting is
prevented at the point of selection (candidates) and again at settlement (the give floor),
not merely flagged.

---

## Import / export ([src/utils/import.ts](../src/utils/import.ts), [src/utils/qr.ts](../src/utils/qr.ts))

`parseExport(text)` → `{ needs[], swaps[], swapQty, unmatched[] }`, tolerant of how lists
arrive in the wild:

- Strips any preamble before the `Figuritas App` marker (e.g. a Facebook post).
- Re-inserts newlines when chat apps (WhatsApp/SMS) flatten the list to one line.
- Classifies sections by English **and** Spanish keywords (`NEED_KEYWORDS` /
  `SWAP_KEYWORDS`; swap keywords win ties).
- Parses content lines `CODE emoji: 1, 2 (×3), …`; `(×N)` sets spare count; non-numeric
  tokens are skipped; unresolved codes go to `unmatched`.

`parsedToCounts(parsed, allStickerIds)` turns a parse into a full counts map in
**combined mode**: listed needs → `0`, listed swaps → `1 + spares`, **everything unlisted →
owned (`1`)**.

`buildExportText(counts)` produces the inverse — an ASCII, emoji-free `I need / To swap`
text (compact for QR). [TradeView](../src/components/TradeView.tsx) renders it as a QR via
`qrcode`, and scans another collector's QR with the camera (`getUserMedia` + `jsqr`) or an
uploaded image; scanned text feeds [NewSwapDialog](../src/components/NewSwapDialog.tsx).

---

## Stats & sharing ([src/utils/stats.ts](../src/utils/stats.ts), [src/utils/share.ts](../src/utils/share.ts))

`computeStats(counts, history?)` derives totals (owned/missing/spares/collected), completion %,
per-page progress, and the most-duplicated sticker. When given the optional `history`
(`collectDays` + `completedOn`, persisted by the store) it also derives the current streak
(longest run of consecutive collecting days) and days collecting (first sticker → today,
frozen once the album is complete). `computeSkills(stats)` returns 7
gamified achievement badges. [StatsView](../src/components/StatsView.tsx) renders the ring,
tiles, [BarChart](../src/components/BarChart.tsx), and
[CollectorSkills](../src/components/CollectorSkills.tsx); `shareNodeAsImage` exports the
[ShareCard](../src/components/ShareCard.tsx) as a PNG via `html-to-image` + the Web Share
API (with a download fallback).

`groupByPage(ids)` / `labelFor(id)` in [src/utils/group.ts](../src/utils/group.ts) are
shared helpers for rendering sticker collections grouped by page.

---

## Module map

```
src/
├─ App.tsx                 shell + tab routing
├─ types.ts                Sticker / Page / Album / Counts / Swap / Edition
├─ data/sampleAlbum.ts     album definition, editions, resolveStickerId
├─ store/collectionStore.ts  Zustand store (counts, swaps, edition) + persistence
├─ utils/
│  ├─ import.ts            parseExport, parsedToCounts
│  ├─ swap.ts              reservations, candidates, give floor, conflicts
│  ├─ qr.ts                buildExportText (QR payload)
│  ├─ stats.ts             computeStats, computeSkills
│  ├─ share.ts             shareNodeAsImage
│  └─ group.ts             groupByPage, labelFor
└─ components/
   ├─ Album:  AlbumView · PageSection · StickerCell · FilterBar · ImportDialog
   ├─ Swaps:  SwapsView · SwapCard · SwapDetail · NewSwapDialog · SwapClose · StickerChips
   ├─ Trade:  TradeView · TradeHistory
   ├─ Stats:  StatsView · ProgressRing · ProgressBar · BarChart · CollectorSkills · ShareCard
   └─ Shell:  TabBar · EditionDialog
```

---

## Build, test, deploy

```bash
npm install
npm run dev       # vite dev server (base /)
npm run build     # tsc -b && vite build  ->  dist/  (base /Sticker-Swap/)
npm run preview   # serve the production build
```

- **Logic checks:** [scripts/test-logic.ts](../scripts/test-logic.ts) is a standalone
  assertion script (album shape, edition switching, parser, stats, and the reservation
  logic). Run it with `npx tsx scripts/test-logic.ts`. It is **not** wired into
  `package.json` and there is no component-test runner.
- **PWA:** [vite.config.ts](../vite.config.ts) configures the manifest (green `#0b8a4b`
  theme, standalone/portrait) and Workbox precaching of `js/css/html/svg/png/ico/woff2`.
- **Deploy:** [.github/workflows/deploy.yml](../.github/workflows/deploy.yml) builds and
  publishes `dist/` to **GitHub Pages** on push to `claude/figuritas-sticker-pwa-vhafqz`
  (or manual `workflow_dispatch`). The production base path is `/Sticker-Swap/`.

---

## Notable characteristics & limitations

- **Local-only, single-device.** No accounts, no sync; clearing site data wipes the
  collection. Swaps store the other collector's pasted list, not a real user.
- **Editions share counts.** Switching NA/LATAM only resizes the Coca-Cola page; your
  counts persist (CC stickers 13–14 simply have no tiles in NA).
- **No automated CI tests.** Only the manual `test-logic.ts` script guards the core logic;
  the deploy workflow runs `build` (type-check) but not tests.
