# Native iOS App — Research & Options

_What it would take to turn Sticker Collector into a native iOS app._

> **TL;DR** — The app is already an installable PWA, and iOS users can "Add to
> Home Screen" today. If the goal is a real **App Store** presence with native
> feel, the fastest, lowest-risk path is to **wrap the existing web app with
> [Capacitor](https://capacitorjs.com/)** — it reuses ~100% of the current
> code and can be on TestFlight in days, not months. A React Native rewrite or a
> full Swift rewrite are also viable but cost weeks-to-months for benefits most
> of this app doesn't need. **Recommendation: Capacitor.**

---

## 1. Where the app is today

| Aspect | Detail |
| --- | --- |
| Stack | React 18 + TypeScript + Vite, built as a PWA (`vite-plugin-pwa` / Workbox) |
| Size | ~8,100 LOC of app code (26 components), ~11,100 incl. tests + dev-only builder |
| State / storage | `zustand` + `persist` middleware → **`localStorage`** |
| Optional sync | Supabase (RPC-based, sync-code hashing; no accounts) — already works **iOS PWA ↔ desktop** |
| Distribution | GitHub Pages, installable via "Add to Home Screen" |

**Browser/platform APIs in use** (these are the only things that need native
bridging):

- `localStorage` — all collection/swap data (via zustand persist)
- `navigator.mediaDevices.getUserMedia` + `jsQR` — camera QR scanning for sync pairing (`QrScanner.tsx`)
- Web Share API + clipboard — share stats image / share lists (`utils/share.ts`, several dialogs)
- `html-to-image` — rasterize the share card to PNG (`utils/share.ts`)
- Canvas — confetti effects (`utils/confetti.ts`)
- Service worker — offline caching + "new version" prompt (`ReloadPrompt.tsx`)

**Key architectural advantage:** the business logic is already cleanly
decoupled from the DOM. Swap matching, import/export, stats, sync
serialization, the zustand store, sync-code hashing, and all album data are
**pure TypeScript with no `window`/`document` dependency**. Only the 26
components, `styles.css`, and a handful of utilities touch the browser. That
separation is what makes every option below cheaper than it would otherwise be.

---

## 2. What "native iOS app" could mean

"Native" is used loosely. Three distinct goals, each with a different answer:

1. **"In the App Store, launches like an app"** → Capacitor (a WebView shell). Minimal work.
2. **"Native UI widgets, native scroll/gestures, one shared codebase with a future Android app"** → React Native / Expo. Moderate rewrite.
3. **"Pure Swift/SwiftUI, maximum platform integration"** → Full native rewrite. Large effort.

Most people asking for a "native iOS app" for a collection tracker actually
want #1 (App Store + native shell), occasionally #2. #3 is rarely justified for
an app like this.

---

## 3. Option A — Capacitor wrapper _(recommended)_

Capacitor wraps the existing web build in a native iOS project (a full-screen
`WKWebView`) and gives native plugins for camera, share, storage, etc. The
React app runs **unchanged**; you swap a few browser API calls for Capacitor
plugin calls behind the interfaces that already exist.

**What gets reused:** essentially the entire codebase — all 26 components, all
logic, all styles, the Supabase sync.

**What needs work:**

- Add Capacitor + an `ios/` native project (`npm i @capacitor/core @capacitor/ios`, `npx cap add ios`); point it at the Vite `dist/` build.
- **Camera QR:** replace `getUserMedia`+`jsQR` with [`@capacitor/barcode-scanner`](https://capacitorjs.com/docs/apis) (or keep the web scanner — it works in the WebView, but the native scanner is smoother). `QrScanner.tsx` is the only file affected.
- **Storage durability:** `localStorage` in a WKWebView **can be evicted by iOS under storage pressure.** For a data-holding app this is the single most important fix — migrate the persist layer to [`@capacitor/preferences`](https://capacitorjs.com/docs/apis/preferences) or SQLite so collections can't silently vanish. Zustand's persist middleware takes a custom storage adapter, so this is a small, localized change. (Users with sync on already have a cloud backup; local-only users are the ones at risk.)
- **Share:** point `utils/share.ts` at [`@capacitor/share`](https://capacitorjs.com/docs/apis/share) + filesystem for the PNG (Web Share also works in the WebView as a fallback).
- **Safe areas / status bar:** the app already handles iOS viewport quirks (`--app-height` in `main.tsx`); add `env(safe-area-inset-*)` padding and the status-bar plugin.
- **Updates:** drop the service-worker "reload prompt" flow in the native build (App Store handles versioning); optionally add [live updates](https://capacitorjs.com/docs/guides/live-updates) later.

**App Store requirements (applies to A and B):**

- Apple Developer Program membership — **$99/year**.
- A Mac with Xcode to build, sign, and archive (or a cloud Mac CI like Codemagic / GitHub Actions macOS runners).
- App icons, launch screen, screenshots, privacy policy, and a filled-out **App Privacy** questionnaire (declare camera use + any data collection).
- **Apple's "minimum functionality" guideline (4.2):** a thin website wrapper can be rejected. This app is interactive, offline-capable, and uses the camera, so it comfortably clears the bar — but the review notes should highlight the native camera/storage integration.

**Effort:** ~**1–2 weeks** to a solid TestFlight build; a few more days for
App Store polish and review.

**Trade-offs:** UI is still web-rendered (excellent here — the app is already
touch-first and looks native), so scroll/gestures are ~95% native-feeling, not
100%. One codebase continues to serve web **and** iOS.

---

## 4. Option B — React Native / Expo rewrite

Rebuild the UI in React Native (via Expo for the smoothest toolchain). You keep
the language (TypeScript) and the mental model (React + hooks + zustand), and —
crucially — **reuse the pure-logic layer nearly verbatim**: `utils/*`,
`sync/serialize`, the store, `syncCode`, and all album data have no DOM
dependency and drop straight in.

**What gets rewritten:**

- All 26 components — RN uses `<View>`/`<Text>`/`<Pressable>` instead of HTML, and **`styles.css` does not carry over** (RN has its own StyleSheet / Flexbox-only model). This is the bulk of the work.
- Camera QR → `expo-camera` / `expo-barcode-scanner`.
- Storage → `expo-secure-store` / AsyncStorage / SQLite (zustand adapter again).
- Share card PNG → `react-native-view-shot` + `expo-sharing` (replaces `html-to-image`).
- Confetti → an RN library or Reanimated.

**Effort:** ~**4–8 weeks** depending on how faithfully the current visual design
is reproduced. The logic port is fast; re-implementing the album grid, dialogs,
stats charts, and CSS-driven polish is where the time goes.

**When it's worth it:** you want genuinely native UI **and** a real Android app
from the same codebase, and you're willing to maintain a second codebase
separate from the web app (or migrate the web app to React-Native-Web too).

---

## 5. Option C — Full native Swift / SwiftUI rewrite

Rebuild from scratch in Swift/SwiftUI. Nothing but the data model concepts and
the Supabase schema carry over; all ~8,000 lines of logic and UI are
re-authored.

**Effort:** ~**2–4 months** for feature parity, plus ongoing dual maintenance
(the web app doesn't go away).

**When it's worth it:** deep iOS integration this app doesn't currently need —
widgets, App Intents/Siri, iCloud sync via CloudKit, Apple Pencil, etc. For a
sticker-swap tracker, this is almost certainly over-investment.

---

## 6. Option D — Stay a PWA (do nothing / polish)

Already shipped and working. iOS users install via Share → "Add to Home
Screen." **No App Store, $0, no Mac needed.**

iOS PWA limitations to be aware of (and which the App Store options remove):
- No App Store discoverability; users must be told to "Add to Home Screen."
- `localStorage` eviction risk under storage pressure (same as the WebView caveat — sync mitigates it).
- Web Push on iOS requires the PWA to be home-screen-installed (already true here) and iOS 16.4+.
- No native camera-quality scanner (the web scanner is fine but less polished).

Reasonable low-cost polish without going native: harden storage (mirror to
IndexedDB), nudge users toward enabling sync as a backup, and improve the
install prompt.

---

## 7. Comparison

| | A. Capacitor | B. React Native | C. Swift | D. PWA (today) |
| --- | --- | --- | --- | --- |
| Code reused | ~100% | logic yes, UI no | ~0% | 100% |
| Effort | **1–2 wks** | 4–8 wks | 2–4 mo | 0 |
| In App Store | ✅ | ✅ | ✅ | ❌ |
| Native UI feel | Very good (web-rendered) | Native | Native | Very good |
| Android for free | ✅ (add `@capacitor/android`) | ✅ | ❌ | ✅ |
| Ongoing cost | $99/yr + Mac | $99/yr + Mac | $99/yr + Mac + Swift skills | $0 |
| Extra maintenance | ~none (same codebase) | second codebase | second codebase | none |

---

## 8. Recommendation & suggested path

**Go with Capacitor (Option A).** It matches what "native iOS app" almost
always means for an app like this (App Store presence + native shell), reuses
the entire codebase, keeps web and iOS in lockstep, and — as a bonus — gives
Android essentially for free later. The two things that genuinely need doing
regardless (durable native storage, native camera) are small, localized
changes because the logic is already decoupled from the DOM.

Suggested incremental plan:

1. **Harden storage first** — swap the zustand persist adapter to a durable
   store and encourage sync. This is valuable even if you never ship native,
   and it's a prerequisite for a trustworthy App Store app.
2. **Add Capacitor + `ios/` project**, get the current build running in the
   simulator, add safe-area/status-bar handling.
3. **Bridge camera + share** to native plugins (only `QrScanner.tsx` and
   `utils/share.ts` change).
4. **TestFlight** internal build; iterate on polish and icons/launch screen.
5. **App Store submission** (Developer account, privacy questionnaire,
   screenshots, review).
6. Later, if wanted: `@capacitor/android`, live updates, Web Push.

Reserve **React Native** for if/when you want fully-native UI plus a
first-class Android app and are ready to maintain a separate codebase, and
**Swift** only if a future feature demands deep iOS-only platform integration.

---

_Prerequisites for any App Store route: an Apple Developer account ($99/yr) and
access to a Mac/Xcode (local or cloud CI)._
