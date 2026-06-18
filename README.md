# Sticker Collector PWA

A faithful PWA recreation of the **Sticker Collector** app, focused on the
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
- **Achievements** badges that unlock as you progress, each celebrated the moment
  you earn it with a temporary confetti banner (anywhere in the app).
- **Share your stats as an image** (Web Share API with download fallback).

### Swaps
- Create multiple **named** swaps by pasting another collector's export.
- The app computes what **you can give** (your duplicates they need) and **you can get**
  (their duplicates you're missing), and lets you pick what to promise.
- **Reservation-aware matching**: a spare already promised in another open swap is never
  offered again, and a sticker you're already due to receive won't be suggested elsewhere —
  prevention, not just a warning. (A ⚠️ flag remains as a backstop for any legacy clashes.)
- **Conclude** a swap to settle the exchange — your owned / missing / swap counts update
  automatically, and giving a sticker never strips a copy still reserved by another open
  swap.

## Using it with a friend / a second user

Each person gets their **own** collection automatically — there are no accounts and nothing
is shared between devices. All data lives in *your* browser's local storage, so two people
on two different phones (or two different browsers) have completely separate collections. A
brand-new user starts with an empty album.

**To share the app:** send your friend the link —
**https://alejbasurto7.github.io/Sticker-Collector/** — and have them open it and choose
**"Add to Home Screen"** to install it. Once they've started their own collection, you can
trade with each other using the **Trade** tab's QR codes.

**One gotcha:** a separate phone or browser means separate data (what you want). But two
people sharing the *same browser on the same phone* would share one collection — for that
case use a separate device/browser, or the in-app multi-album feature.

**Caveat:** data is local-only. There's no cross-device sync, and clearing your browser's
site data (or uninstalling the app) erases that collection — there is no cloud backup.

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

```bash
npx tsx scripts/test-logic.ts   # run the standalone logic checks
node scripts/generate-icons.mjs # regenerate the PWA icons
```

See [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) for a full map of the codebase — data
model, state store, swap/reservation logic, and the import/export format.

## Deployment

Pushing to the `claude/figuritas-sticker-pwa-vhafqz` branch triggers
`.github/workflows/deploy.yml`, which builds and publishes to **GitHub Pages**. Enable
Pages once in the repo settings (Settings → Pages → Source: GitHub Actions). The public
HTTPS URL works on desktop and mobile and is installable to the home screen.
