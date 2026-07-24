# Share App & PWA Install Design

**Goal:** Add a **"📤 Share app"** entry to the Settings tab that (a) hands out the app
URL — via the native share sheet, a copy-link button, and a scannable QR code — and
(b) provides the mechanism to install the app as a PWA on iOS and Android: a real
one-tap install prompt on Android/Chromium where the browser offers one, and
illustrated step-by-step instructions everywhere else (notably iOS Safari).

**Context:** The app is a GitHub-Pages-hosted PWA
(`https://alejbasurto7.github.io/Sticker-Collector/`) built with `vite-plugin-pwa`
(`display: standalone`, valid manifest + icons). [SettingsView.tsx](../../../src/components/SettingsView.tsx)
is a full-screen tab that already uses an in-tab sub-screen pattern (`Screen =
'root' | 'help' | 'about'`, a `‹ Back` header, and drill-down nav rows inside a
`.settings-card`). The repo already ships the primitives this feature needs:

- `copyToClipboard()` and `shareImage()` in [share.ts](../../../src/utils/share.ts).
- The `qrcode` lib (`QRCode.toDataURL`), used by `AlbumSharing`/`SyncSection`/`SyncDialog`.
- `.sync-qr`, `.settings-card`, `.setting-nav-row`, `.settings-back`, `.btn`/`.btn-row` CSS.

There is **no** existing iOS/Android platform detection and **no** `beforeinstallprompt`
handling — both are new in this feature.

**Tech stack:** React 18, Zustand 4, TypeScript 5 (strict, `noUnusedLocals`), Vite 5,
`vite-plugin-pwa` 0.21, Vitest 4.

---

## Global Constraints

- **No new persisted state.** The install-prompt state is ephemeral (in-memory only);
  nothing is added to the Zustand store or the sync payload.
- **Reuse existing conventions:** className strings + CSS custom properties, the
  `screen`-state sub-screen pattern, and the existing share/QR/clipboard helpers. Do
  not add a router or a modal.
- **The shared link is a canonical constant, not runtime-derived.** The share URL and
  QR must always point at the real installable production site, even when the running
  instance is `localhost` or a preview build. (Runtime-deriving from
  `window.location.origin + import.meta.env.BASE_URL` was considered and rejected for
  exactly this reason — it would share a `localhost`/preview URL.)
- **Testing pattern:** the repo unit-tests **pure logic only** with Vitest in a **Node
  environment** (`src/**/*.test.ts`). There is **no component-test harness — do not add
  React Testing Library.** Platform detection is written as a pure UA-string parser so
  it is unit-testable; UI is gated by `npm run build` (`tsc -b`) + a manual checklist.

---

## Architecture & Component Structure

Small, single-purpose units. The one architectural subtlety is `beforeinstallprompt`
capture (below).

**New files**

- `src/utils/platform.ts` — pure `parsePlatform(ua: string): Platform` (`'ios' |
  'android' | 'other'`) plus thin runtime wrappers `getPlatform()` and `isStandalone()`
  (checks `display-mode: standalone` and iOS `navigator.standalone`). The pure parser is
  the unit-tested surface.
  - **iPadOS caveat:** iPadOS 13+ reports a **Mac** desktop UA, so `parsePlatform` alone
    would classify an iPad as `'other'` and hand it the wrong (menu-style) steps. The
    runtime `getPlatform()` wrapper therefore applies a touch heuristic **on top of** the
    pure parse: if `parsePlatform(navigator.userAgent)` is `'other'` but the device looks
    like a touch Mac (`navigator.maxTouchPoints > 1` with a Mac-like UA), treat it as
    `'ios'`. The heuristic lives in the wrapper (needs `navigator`); `parsePlatform` stays
    pure over the UA string and still recognises classic (pre-iPadOS-13) iPad UAs.
- `src/pwa/installPrompt.ts` — captures the browser's `beforeinstallprompt` event,
  stores the deferred prompt in a module-level variable, listens for `appinstalled` to
  clear it, and exposes a `useInstallPrompt()` hook returning
  `{ canPrompt: boolean, promptInstall: () => Promise<void> }` via `useSyncExternalStore`.
  Registers its listeners once, on module import.
- `src/components/ShareAppScreen.tsx` — the `'share'` sub-screen: QR generation (via
  the `qrcode` lib), the URL display, the Share/Copy buttons, and the install block.
- `src/components/InstallInstructions.tsx` — presentational; renders the correct
  install block based on `getPlatform()`, `isStandalone()`, and `useInstallPrompt()`.

**Modified files**

- `src/config.ts` — add `export const APP_URL = 'https://alejbasurto7.github.io/Sticker-Collector/';`.
- `src/components/SettingsView.tsx` — extend `Screen` to include `'share'`; add the
  "📤 Share app" nav row (first row in the settings-card); render `<ShareAppScreen />`
  when `screen === 'share'`.
- `src/main.tsx` — `import './pwa/installPrompt';` at boot so the `beforeinstallprompt`
  listener is active before the event can fire.
- `src/styles.css` — a few new rules for the URL display + install-steps list.

---

## Why `beforeinstallprompt` capture must happen at boot

`beforeinstallprompt` fires **once, early**, often before the user ever opens Settings.
A listener registered only when `ShareAppScreen` mounts would miss it. So
`installPrompt.ts` registers its listener at module-import time and is imported from
`main.tsx`. It:

1. On `beforeinstallprompt`: calls `e.preventDefault()` (suppresses Chrome's default
   mini-infobar), stores the event as `deferredPrompt`, notifies subscribers.
2. Exposes `promptInstall()` → calls `deferredPrompt.prompt()`, awaits
   `userChoice`, then clears `deferredPrompt` (the event is single-use) and notifies.
3. On `appinstalled`: clears `deferredPrompt` and notifies.

`useInstallPrompt()` subscribes via `useSyncExternalStore` so the Install button
appears/disappears reactively.

---

## Screen — Share app (`screen === 'share'`)

```
‹ Back
Share app
────────────────────────────
 Send a friend the link, or let them scan the code.

        ┌───────────────┐
        │   ▓▓ QR ▓▓    │      ← .sync-qr, encodes APP_URL
        └───────────────┘
   alejbasurto7.github.io/Sticker-Collector   ← selectable URL text

   [ 📤 Share link ]   [ 🔗 Copy link ]

────────────────────────────
 Install on your phone

   ‹platform-specific block — see below›
```

- **Back header:** `‹ Back` (`.settings-back`) → `setScreen('root')`, then the title
  "Share app".
- **QR:** `QRCode.toDataURL(APP_URL, { margin: 1, width: 200 })` in an effect, rendered
  as `<img className="sync-qr">`. On generation failure the QR is hidden; the URL and
  buttons remain.
- **URL text:** `APP_URL` shown as selectable text (a `.share-url` style, `user-select:
  all`), so it can be read/copied manually.
- **Share link:** `navigator.share({ title: APP_NAME, text: <invite copy>, url: APP_URL })`
  when the Web Share API is present; otherwise falls back to `copyToClipboard(APP_URL)`
  with the same "✓ Copied" confirmation. (User cancel of the native sheet is swallowed,
  matching `shareImage`.)
- **Copy link:** `copyToClipboard(APP_URL)` → transient "✓ Copied" state for ~1.6s
  (same pattern as `AlbumSharing.copy`).

### Install block (`InstallInstructions.tsx`)

Chooses exactly one of four states:

1. **Already installed** — `isStandalone()` true → `✓ You've already installed the app.`
   (No steps, no button.)
2. **Native prompt available** — `useInstallPrompt().canPrompt` true (Android/Chromium)
   → a `[ ⬇ Install app ]` button calling `promptInstall()`.
3. **iOS** — `getPlatform() === 'ios'` and no prompt → illustrated steps:
   1. Tap the **⬆ Share** button
   2. Choose **"Add to Home Screen"**
   3. Tap **"Add"**
4. **Other / Android without a prompt** — generic steps:
   1. Open the **browser menu** (⋮)
   2. Choose **"Install app"** / **"Add to Home screen"**

(State 2 takes priority over 3/4 when a prompt exists; state 1 takes priority over all.)

---

## Wiring — SettingsView

Extend the union and the root card; add the sub-screen branch.

```tsx
type Screen = 'root' | 'help' | 'about' | 'share';

// root card — new first row, above "How to modify my album":
<button type="button" className="setting-nav-row" onClick={() => setScreen('share')}>
  <span className="setting-row-title">📤 Share app</span>
  <span className="setting-nav-chevron" aria-hidden="true">›</span>
</button>

// sub-screen branch:
if (screen === 'share') {
  return (
    <div className="settings-view">
      <BackButton onBack={() => setScreen('root')} />
      <h2 className="settings-title">Share app</h2>
      <ShareAppScreen />
    </div>
  );
}
```

`ShareAppScreen` owns its own content (QR, buttons, install block); `SettingsView` only
owns the back header + title, matching how `help`/`about` are structured.

---

## CSS additions (small)

Reuse `.sync-qr`, `.settings-card`, `.settings-section`, `.btn`/`.btn-row`,
`.settings-back`. New rules (names indicative):

- `.share-url` — centered, selectable (`user-select: all`), dimmed, word-break for the
  URL text.
- `.install-steps` — an ordered-list style for the numbered install steps (compact,
  dimmed markers), reusing the settings type scale.
- `.install-note` — the "already installed" confirmation line (dimmed, small).

---

## Error handling / edge cases

- **No Web Share API** (most desktop browsers) → **Share link** falls back to copying.
- **QR generation fails** → QR hidden; URL + buttons still work.
- **`beforeinstallprompt` never fires** (iOS always; Chromium if criteria unmet or
  already installed) → `canPrompt` stays false; the iOS/other instruction block shows.
- **Already installed / launched standalone** → install block shows the ✓ note; no
  button or steps.
- **Prompt used once** → after `promptInstall()` resolves (accept or dismiss),
  `deferredPrompt` is cleared so the button doesn't linger; on accept, `appinstalled`
  also clears it. (Chrome only re-fires `beforeinstallprompt` on a later eligible load.)
- **Copy denied / insecure context** → `copyToClipboard` already falls back to the
  hidden-textarea path and returns a boolean; the "✓ Copied" state only shows on success.

---

## Testing

- **Unit (Vitest, Node):**
  - `src/utils/platform.test.ts` — `parsePlatform()` over representative UA strings:
    iPhone Safari and classic iPad → `'ios'`; Android Chrome → `'android'`; desktop
    Chrome/Firefox and an iPadOS-13+ Mac-style UA → `'other'` (the latter is corrected to
    `'ios'` by the wrapper's touch heuristic, which is exercised manually on-device, not
    in the Node unit test).
  - `src/pwa/installPrompt.test.ts` — the store transitions: initial `canPrompt` false →
    dispatch a fake `beforeinstallprompt` → `canPrompt` true → `appinstalled` (or a
    resolved `promptInstall`) → `canPrompt` false. (The event listeners are on `window`;
    the test dispatches `Event`-like objects with a stubbed `prompt()`/`userChoice`.)
- **Build gate:** `npm run build` (`tsc -b`) clean under strict + `noUnusedLocals`.
- **Manual checklist:**
  - Settings root shows **📤 Share app** as the first drill-down row; tapping it opens
    the sub-screen with a working `‹ Back`.
  - The QR renders and encodes `APP_URL`; scanning it (phone camera) opens the app.
  - **Copy link** copies `APP_URL` and shows "✓ Copied"; the URL text is selectable.
  - **Share link** opens the OS share sheet on a supporting browser; on desktop Chrome/
    Firefox without Web Share it copies instead.
  - **Android/Chromium:** an **Install app** button appears and triggers the native
    install dialog; after install it disappears.
  - **iOS Safari:** the 3-step "Add to Home Screen" instructions show (no button).
  - **Launched from the home screen (standalone):** the ✓ "already installed" note
    shows instead of steps/button.
- **Verification:** drive the flow with `npm run dev` + the `verify` skill before
  finishing.

---

## Out of scope

- Deep-linking / sharing specific albums or stats (album share already exists via
  `AlbumSharing`; this is the *app*-level install/share only).
- Any change to the PWA manifest, service worker, or icons.
- A custom domain / changing the hosting URL.
- Analytics or install-conversion tracking.
- Desktop "install" affordances beyond whatever the browser's own prompt offers.
