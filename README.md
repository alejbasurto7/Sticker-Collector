# Sticker Collector PWA

**Sticker Collector** is a PWA for collecting sticker albums, built around three experiences:
**Album**, **Stats**, and **Swaps**. It adds reservation-aware swap matching, multi-album
support, achievements, and shareable stats — and it reads and writes the **Figuritas app's
text export format**, so lists shared by collectors who use that app drop straight in. Built
with React + Vite + TypeScript, fully offline-capable, installable on desktop and mobile. Data
lives in your browser by default, with **optional cross-device sync** (see below) so the same
collection can follow you between your phone and computer.

The bundled album is the real **"Usa Mex Can 26"** (2026 48-team World Cup): an FWC
intro section, 48 national teams, and a Coca-Cola extras page. Pick your **edition** from
the ⚙️ menu — **Latin America** (14 CC stickers, 994 total) or **North America** (12 CC
stickers, 992 total); switching preserves all your existing stickers.

## Features

### Album
- Every page (FWC intro + 48 teams) with its sticker grid and live progress.
- **Tap** a sticker to add it, **long-press** to remove one.
- Duplicates show a `+N` swap badge; special/foil crests are highlighted.
- Filter by **All / Missing / Swaps**; **search** pages by name or code; **sort** by album
  order, A→Z, or completion.
- **Lock** the album (🔒 in the header) for read-only browsing, so a stray tap never changes
  your counts.

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
- **Share your list** (share button in the header) — copy or share your missing / duplicate
  lists as text for a friend to paste straight into a swap.

### Settings (⚙️)
- Manage **multiple albums** — create, switch, rename, or delete; each keeps its own
  stickers and swaps.
- **Import** a list in the Figuritas-app text format (Replace or Merge) — interop, so lists
  from that app drop straight in.
- Toggle **Coca-Cola tracking** and pick your **edition** (Latin America / North America).
- **Light / dark** theme.
- **Sync** (when configured) — pair devices with a sync code; see below.

## Cross-device sync

The same collection can live on your **iOS PWA** and a **desktop browser** at once, synced
automatically. Sync is **optional and offline-first**: your browser stays the working copy, and
a small cloud copy (a free [Supabase](https://supabase.com) database) mirrors it and pulls
changes on the other device.

- **Pairing uses a sync code — no accounts, no passwords.** On one device: **Settings → Sync →
  Create a sync code**. On the other: **Settings → Sync → Enter a code** (type it or scan the
  QR). Both devices now share one collection.
- **How it stays secure:** the code is the only secret and never leaves your device — only its
  hash is stored — so whoever holds the code can access that one collection. Keep it to yourself.
- **Conflict rule:** whole-collection **last-write-wins**. Avoid editing both devices at the
  same time while one is offline, or the later save wins.
- **Setup:** sync only appears when the app is built with Supabase credentials. See
  [docs/SUPABASE_SETUP.md](docs/SUPABASE_SETUP.md) for the one-time ~5-minute setup. Without it,
  the app works exactly as before (local-only) and the Sync section is hidden.

## Using it with a friend / a second user

Each person gets their **own** collection automatically — there are no accounts and nothing
is shared between devices. All data lives in *your* browser's local storage, so two people
on two different phones (or two different browsers) have completely separate collections. A
brand-new user starts with an empty album.

**To share the app:** send your friend the link —
**https://alejbasurto7.github.io/Sticker-Collector/** — and have them open it and choose
**"Add to Home Screen"** to install it. Once they've started their own collection, you can
trade: tap the **share button** in the header to copy your "I need" / "To Swap" list as text,
send it over, and have them paste it into a new swap in the **Swaps** tab — and vice-versa.

**One gotcha:** a separate phone or browser means separate data (what you want). But two
people sharing the *same browser on the same phone* would share one collection — for that
case use a separate device/browser, or the in-app multi-album feature.

**Caveat:** by default data is local-only — clearing your browser's site data (or uninstalling
the app) erases that collection. Turn on **cross-device sync** (above) to keep a cloud copy that
also serves as an off-device backup shared across your own devices.

## Export / import format

For interoperability, Sticker Collector reads and writes the same plain-text list format the
Figuritas app uses, so collectors can swap lists across both apps:

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
npm run build     # type-check (tsc -b) + production build (outputs dist/)
npm run preview   # preview the production build
npm test          # run the unit tests (vitest)
```

```bash
npx tsx scripts/test-logic.ts   # run the standalone logic checks
node scripts/generate-icons.mjs # regenerate the PWA icons
```

The album-type **builder** is a dev-only tool at `#/admin/templates` (available under
`npm run dev`; it's tree-shaken out of production builds).

See [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) for a full map of the codebase — data
model, state store, swap/reservation logic, and the import/export format.

## Deployment

Pushing to **`main`** (or running the workflow manually via *workflow_dispatch*) triggers
`.github/workflows/deploy.yml`, which builds and publishes to **GitHub Pages** at
**https://alejbasurto7.github.io/Sticker-Collector/**. Enable Pages once in the repo settings
(Settings → Pages → Source: GitHub Actions). The public HTTPS URL works on desktop and mobile
and is installable to the home screen.
