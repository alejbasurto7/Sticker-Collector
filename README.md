# Figuritas — Sticker Collector PWA

A faithful PWA recreation of the **Figuritas: Sticker Collector** app, focused on the
**Album**, **Stats**, and **Swaps** experiences. Built with React + Vite + TypeScript,
fully offline-capable, and installable on desktop and mobile. All data lives in your
browser — no backend.

The bundled album is the real **"Usa Mex Can 26"** (2026 48-team World Cup): an FWC
intro section, 48 national teams, and a Coca-Cola extras page. Pick your **edition** from
the ⚙️ menu — **Latin America** (14 CC stickers, 994 total) or **North America** (12 CC
stickers, 992 total); switching preserves all your existing stickers.

## Features

### Album
- Every page (FWC intro + 48 teams) with its sticker grid and live progress.
- **Tap** a sticker to add it, **long-press** to remove one.
- Duplicates show a `+N` swap badge; special/foil crests are highlighted.
- Filter by **All / Missing / Swaps**.
- **Import** a collection from a Figuritas text export (Replace or Merge).

### Stats
- Completion ring, owned / missing / swaps / total-collected tiles.
- Per-page progress bar chart, highlights, and a completion **projection**.
- **Collector Skills** badges that unlock as you progress.
- **Share your stats as an image** (Web Share API with download fallback).

### Swaps
- Create multiple **named** swaps by pasting another collector's export.
- The app computes what **you can give** (your duplicates they need) and **you can get**
  (their duplicates you're missing), and lets you pick what to promise.
- **Conflict warnings** when a sticker is promised across more than one open swap.
- **Conclude** a swap to settle the exchange — your owned / missing / swap counts update
  automatically.

## Export / import format

```
Figuritas App - List
Usa Mex Can 26
I need
FWC 🏆: 00, 1, 2, 3, 4
MEX 🇲🇽: 1, 2, 3
To Swap
ARG 🇦🇷: 10, 11
```

`I need` → missing stickers, `To Swap` → duplicates available to trade. English and
Spanish section labels are recognized.

## Development

```bash
npm install
npm run dev       # local dev server
npm run build     # type-check + production build (outputs dist/)
npm run preview   # preview the production build
```

`node scripts/generate-icons.mjs` regenerates the PWA icons.
`node_modules/.bin/esbuild scripts/test-logic.ts --bundle --platform=node --format=esm --outfile=/tmp/t.mjs && node /tmp/t.mjs`
runs the logic checks.

## Deployment

Pushing to the `claude/figuritas-sticker-pwa-vhafqz` branch triggers
`.github/workflows/deploy.yml`, which builds and publishes to **GitHub Pages**. Enable
Pages once in the repo settings (Settings → Pages → Source: GitHub Actions). The public
HTTPS URL works on desktop and mobile and is installable to the home screen.
