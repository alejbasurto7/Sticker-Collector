# Design: A second user with their own data (+ repo-rename deploy fix)

**Date:** 2026-06-18
**Status:** Approved design, pending spec review

## Problem

The original question was "how can we have a second user using our app with their own
data?" Investigation showed two things:

1. **Data isolation already works, for free.** Sticker Collector is a client-only PWA with
   no backend. All state lives in the browser's `localStorage` (key
   `figuritas-collection-v1`, written only by the Zustand `persist` middleware in
   [`src/store/collectionStore.ts`](../../../src/store/collectionStore.ts)). Two people on
   two different phones/browsers therefore have physically separate stores — isolation is
   automatic and total, with no code required. A brand-new user also lands clean (empty
   `counts`, one default "My Album", LATAM edition), so "their own data" starts empty and
   correct.

2. **The live deployment is currently broken by a repo rename.** The repository was renamed
   from `Sticker-Swap` to `Sticker-Collector`. GitHub Pages now serves the site from
   `/Sticker-Collector/`, but [`vite.config.ts`](../../../vite.config.ts) still hardcodes
   `const REPO = 'Sticker-Swap'`, which becomes the build's `base`. The deployed
   `index.html` therefore requests assets at `/Sticker-Swap/...`, which 404, leaving a blank
   app shell. Verified:

   ```
   404  ←  https://alejbasurto7.github.io/Sticker-Swap/assets/index-BgEXVtTE.js   (what live HTML requests)
   200  ←  https://alejbasurto7.github.io/Sticker-Collector/assets/index-BgEXVtTE.js  (where the file is)
   ```

Because sharing the app with a second user means sending them a **working** URL, fixing the
rename fallout is the real blocker and is in scope.

Note (reassuring, not a task): `localStorage` is scoped per **origin**
(`alejbasurto7.github.io`), not per path, so the rename did **not** wipe existing
collections — the same browser visiting the new URL sees the same data.

## Goals

- Restore the live deployed PWA to a working state at its current URL.
- Remove stale `Sticker-Swap` references that would mislead future work.
- Document, for the user, how a second person gets their own data and how to share the app.

## Non-goals (explicitly out of scope)

- User accounts / authentication.
- Cloud sync or cross-device data sharing.
- In-app profile switching UI.
- First-run onboarding or "Add to Home Screen" install UI.
- Fixing the README "Deployment" section's stale deploy-branch name (separate drift; the
  user chose not to include it).

## The current public URL

`https://alejbasurto7.github.io/Sticker-Collector/`

## Design

Three parts, in priority order.

### Part 1 — Fix the broken deployment (code; blocking)

- In [`vite.config.ts`](../../../vite.config.ts), change `const REPO = 'Sticker-Swap'` to
  `const REPO = 'Sticker-Collector'`. This is the only code change; `base` is derived from
  `REPO` (`/${REPO}/` on build), so nothing else needs touching.
- Redeploy by landing the change on `main` (the
  [`deploy.yml`](../../../.github/workflows/deploy.yml) workflow triggers on push to
  `main`).
- **Verification:**
  - Local build: `npm run build`, then confirm the emitted `dist/index.html` references
    `/Sticker-Collector/...` asset paths.
  - After deploy: the JS bundle URL under `/Sticker-Collector/assets/` returns HTTP 200,
    and the live page loads as a working app (not a blank shell).

### Part 2 — Fix stale references (docs)

- [`docs/ARCHITECTURE.md`](../../ARCHITECTURE.md):
  - Line ~227: the build comment `-> dist/ (base /Sticker-Swap/)` → `/Sticker-Collector/`.
  - Line ~239: "The production base path is `/Sticker-Swap/`." → `/Sticker-Collector/`.

### Part 3 — README "second user / sharing" section (docs; the original ask)

Add a short, user-facing section to [`README.md`](../../../README.md) titled
**"Using it with a friend / a second user"**, covering four beats:

1. **It just works, separately.** Each person on their own phone/browser automatically gets
   their own collection — data is stored locally in *their* browser; nothing is shared
   between devices.
2. **How to share it.** Send them the app URL
   (`https://alejbasurto7.github.io/Sticker-Collector/`); they open it and "Add to Home
   Screen" to install, then swap with you via the existing QR/Trade flow.
3. **One gotcha.** A separate device or browser = separate data (good). But two people
   sharing the *same browser on the same phone* would share one collection — for that case
   use a separate phone/browser, or the built-in multi-album feature.
4. **Caveat.** Local-only: no sync across devices, and clearing site data / uninstalling
   wipes that person's collection (no cloud backup).

## Verification summary

- `npm run build` succeeds and `dist/index.html` uses `/Sticker-Collector/` asset paths.
- Post-deploy: `/Sticker-Collector/assets/<bundle>.js` returns 200; live app renders.
- `docs/ARCHITECTURE.md` contains no remaining `/Sticker-Swap/` base-path references.
- `README.md` has the new section with the correct URL.
- A grep for `Sticker-Swap` across the repo (excluding `node_modules`) returns no
  unintended remaining references.

## Risks / notes

- **Old installs / old URL.** Anyone who previously installed the PWA from
  `/Sticker-Swap/`, or has that URL bookmarked, will hit a dead path (no GitHub redirect for
  the project Pages path). Their data is safe (same-origin `localStorage`) and reappears
  once they open the new URL, but they must navigate to the new URL manually. Acceptable for
  an early/personal app; noted so it is a conscious choice.
- **Single commit landing on `main`.** Deployment only happens from `main`, so the fix must
  reach `main` (direct or via merge) to take effect; work on a feature branch alone will not
  redeploy.
