# Share App & PWA Install Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a "📤 Share app" sub-screen to the Settings tab that hands out the app URL (native share sheet, copy link, QR code) and provides the PWA install mechanism (native install prompt on Android/Chromium, Add-to-Home-Screen steps on iOS, already-installed note in standalone).

**Architecture:** Two new pure/near-pure utility modules (`platform.ts` for OS detection, `pwa/installPrompt.ts` for capturing the browser's `beforeinstallprompt` event at boot) feed two new presentational components (`InstallInstructions.tsx`, `ShareAppScreen.tsx`). `ShareAppScreen` is wired into the existing `SettingsView` sub-screen pattern. The shared link is a hardcoded canonical constant so localhost/preview builds still share the real site.

**Tech Stack:** React 18 (`useSyncExternalStore`), TypeScript 5 (strict, `noUnusedLocals`), Vite 5, `vite-plugin-pwa`, the `qrcode` lib, Vitest 4 (Node env).

## Global Constraints

- **No new persisted state.** Install-prompt state is in-memory only; nothing is added to the Zustand store or the sync payload.
- **Canonical share URL:** `https://alejbasurto7.github.io/Sticker-Collector/` — hardcoded, never derived from `window.location`.
- **No new dependencies.** Reuse `qrcode`, `copyToClipboard()`, and existing CSS.
- **Testing = pure logic only, Vitest in a Node environment** (`src/**/*.test.ts`). **Do NOT add React Testing Library.** Components are gated by `npm run build` (`tsc -b`) + a manual checklist.
- **Strict + `noUnusedLocals`:** every import must be used; `npm run build` must compile clean.

---

## File Structure

**Create:**
- `src/utils/platform.ts` — OS detection: pure `parsePlatform(ua)` + runtime `getPlatform()` / `isStandalone()`.
- `src/utils/platform.test.ts` — unit tests for `parsePlatform`.
- `src/pwa/installPrompt.ts` — `beforeinstallprompt` capture store + `useInstallPrompt()` hook.
- `src/pwa/installPrompt.test.ts` — unit tests for the store transitions.
- `src/components/InstallInstructions.tsx` — the "Install on your phone" block (4 states).
- `src/components/ShareAppScreen.tsx` — the Share sub-screen (QR, URL, share/copy, install block).

**Modify:**
- `src/config.ts` — add `APP_URL` constant.
- `src/components/SettingsView.tsx` — add `'share'` screen + nav row + branch.
- `src/main.tsx` — import `./pwa/installPrompt` at boot.
- `src/styles.css` — `.share-url`, `.install-steps`, `.install-note`.

---

## Task 1: Platform detection utility

**Files:**
- Create: `src/utils/platform.ts`
- Test: `src/utils/platform.test.ts`

**Interfaces:**
- Produces: `type Platform = 'ios' | 'android' | 'other'`; `parsePlatform(ua: string): Platform`; `getPlatform(): Platform`; `isStandalone(): boolean`.

- [ ] **Step 1: Write the failing test**

Create `src/utils/platform.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { parsePlatform } from './platform';

describe('parsePlatform', () => {
  it('detects iPhone as ios', () => {
    const ua =
      'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1';
    expect(parsePlatform(ua)).toBe('ios');
  });

  it('detects a classic (pre-iPadOS-13) iPad as ios', () => {
    const ua =
      'Mozilla/5.0 (iPad; CPU OS 12_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/12.0 Mobile/15E148 Safari/604.1';
    expect(parsePlatform(ua)).toBe('ios');
  });

  it('detects Android as android', () => {
    const ua =
      'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36';
    expect(parsePlatform(ua)).toBe('android');
  });

  it('classifies desktop Chrome on Windows as other', () => {
    const ua =
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';
    expect(parsePlatform(ua)).toBe('other');
  });

  it('classifies an iPadOS-13+ Mac-style UA as other (wrapper corrects this at runtime)', () => {
    const ua =
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Safari/605.1.15';
    expect(parsePlatform(ua)).toBe('other');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/utils/platform.test.ts`
Expected: FAIL — cannot resolve `./platform` / `parsePlatform is not a function`.

- [ ] **Step 3: Write the implementation**

Create `src/utils/platform.ts`:

```ts
export type Platform = 'ios' | 'android' | 'other';

/**
 * Classify the OS from a User-Agent string. Pure (UA-only) so it is unit-testable
 * in the Node test env. NOTE: iPadOS 13+ reports a *Mac* desktop UA and so resolves
 * to 'other' here — getPlatform() corrects that at runtime with a touch heuristic.
 * Classic (pre-iPadOS-13) iPad UAs still contain "iPad" and match 'ios'.
 */
export function parsePlatform(ua: string): Platform {
  if (/iPhone|iPad|iPod/i.test(ua)) return 'ios';
  if (/Android/i.test(ua)) return 'android';
  return 'other';
}

/** True when the app is running as an installed PWA (home-screen / standalone). */
export function isStandalone(): boolean {
  if (typeof window === 'undefined') return false;
  const displayMode = window.matchMedia?.('(display-mode: standalone)').matches === true;
  // iOS Safari exposes navigator.standalone instead of the display-mode media query.
  const iosStandalone =
    (window.navigator as Navigator & { standalone?: boolean }).standalone === true;
  return displayMode || iosStandalone;
}

/**
 * The current OS, with an iPadOS correction on top of the pure parse: iPadOS 13+
 * masquerades as macOS, so a Mac-like UA reporting multi-touch is treated as iOS.
 */
export function getPlatform(): Platform {
  if (typeof navigator === 'undefined') return 'other';
  const base = parsePlatform(navigator.userAgent);
  if (base !== 'other') return base;
  const looksMac = /Macintosh|Mac OS X/i.test(navigator.userAgent);
  if (looksMac && navigator.maxTouchPoints > 1) return 'ios';
  return 'other';
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/utils/platform.test.ts`
Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
git add src/utils/platform.ts src/utils/platform.test.ts
git commit -m "feat(share): OS detection + standalone check for install UI"
```

---

## Task 2: Install-prompt capture store + hook

**Files:**
- Create: `src/pwa/installPrompt.ts`
- Test: `src/pwa/installPrompt.test.ts`
- Modify: `src/main.tsx`

**Interfaces:**
- Consumes: nothing.
- Produces: `captureInstallPrompt(e: BeforeInstallPromptEvent): void`; `clearInstallPrompt(): void`; `canInstall(): boolean`; `promptInstall(): Promise<void>`; `useInstallPrompt(): { canPrompt: boolean; promptInstall: () => Promise<void> }`.

- [ ] **Step 1: Write the failing test**

Create `src/pwa/installPrompt.test.ts`:

```ts
import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  captureInstallPrompt,
  clearInstallPrompt,
  canInstall,
  promptInstall,
} from './installPrompt';

function makeFakeEvent() {
  return {
    preventDefault: vi.fn(),
    prompt: vi.fn().mockResolvedValue(undefined),
    userChoice: Promise.resolve({ outcome: 'accepted' as const }),
  };
}

describe('installPrompt store', () => {
  beforeEach(() => clearInstallPrompt());

  it('starts with no prompt available', () => {
    expect(canInstall()).toBe(false);
  });

  it('captures a prompt, suppresses the default banner, and offers install', () => {
    const e = makeFakeEvent();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    captureInstallPrompt(e as any);
    expect(e.preventDefault).toHaveBeenCalledOnce();
    expect(canInstall()).toBe(true);
  });

  it('fires the native prompt and clears itself after promptInstall resolves', async () => {
    const e = makeFakeEvent();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    captureInstallPrompt(e as any);
    await promptInstall();
    expect(e.prompt).toHaveBeenCalledOnce();
    expect(canInstall()).toBe(false);
  });

  it('clearInstallPrompt makes install unavailable (the appinstalled path)', () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    captureInstallPrompt(makeFakeEvent() as any);
    clearInstallPrompt();
    expect(canInstall()).toBe(false);
  });

  it('promptInstall is a no-op when nothing was captured', async () => {
    await expect(promptInstall()).resolves.toBeUndefined();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/pwa/installPrompt.test.ts`
Expected: FAIL — cannot resolve `./installPrompt`.

- [ ] **Step 3: Write the implementation**

Create `src/pwa/installPrompt.ts`:

```ts
import { useSyncExternalStore } from 'react';

/**
 * The non-standard beforeinstallprompt event (Chromium only). Not in lib.dom, so we
 * declare the minimal shape we use.
 */
export interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

let deferredPrompt: BeforeInstallPromptEvent | null = null;
const listeners = new Set<() => void>();

function emit(): void {
  for (const l of listeners) l();
}

// --- store (no DOM access, so it is unit-testable in the Node env) ---

/** Stash a captured prompt and suppress Chrome's default mini-infobar. */
export function captureInstallPrompt(e: BeforeInstallPromptEvent): void {
  e.preventDefault();
  deferredPrompt = e;
  emit();
}

/** Forget any captured prompt (used on appinstalled and after the prompt is spent). */
export function clearInstallPrompt(): void {
  deferredPrompt = null;
  emit();
}

/** Whether a native install prompt is currently available. */
export function canInstall(): boolean {
  return deferredPrompt !== null;
}

/** Fire the stored native install prompt, then clear it (the event is single-use). */
export async function promptInstall(): Promise<void> {
  if (!deferredPrompt) return;
  const evt = deferredPrompt;
  await evt.prompt();
  await evt.userChoice;
  clearInstallPrompt(); // beforeinstallprompt is single-use; Chrome re-fires later if still eligible
}

function subscribe(cb: () => void): () => void {
  listeners.add(cb);
  return () => {
    listeners.delete(cb);
  };
}

// --- DOM wiring: registered at import time (from main.tsx) because
// beforeinstallprompt fires once, early — often before Settings is ever opened.
// Guarded so importing this module in the Node test env is a no-op.
if (typeof window !== 'undefined') {
  window.addEventListener('beforeinstallprompt', (e) =>
    captureInstallPrompt(e as BeforeInstallPromptEvent),
  );
  window.addEventListener('appinstalled', clearInstallPrompt);
}

/** React binding: whether install is available, plus the trigger. */
export function useInstallPrompt(): {
  canPrompt: boolean;
  promptInstall: () => Promise<void>;
} {
  const canPrompt = useSyncExternalStore(subscribe, canInstall, () => false);
  return { canPrompt, promptInstall };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/pwa/installPrompt.test.ts`
Expected: PASS (5 tests).

- [ ] **Step 5: Register the boot listener**

In `src/main.tsx`, add the side-effect import directly under the `App` import (line 4):

```ts
import App from './App';
import './pwa/installPrompt'; // registers beforeinstallprompt capture at boot
import './styles.css';
```

- [ ] **Step 6: Verify the build compiles**

Run: `npm run build`
Expected: `tsc -b` clean, Vite build succeeds.

- [ ] **Step 7: Commit**

```bash
git add src/pwa/installPrompt.ts src/pwa/installPrompt.test.ts src/main.tsx
git commit -m "feat(share): capture beforeinstallprompt at boot + useInstallPrompt hook"
```

---

## Task 3: Install instructions component

**Files:**
- Create: `src/components/InstallInstructions.tsx`

**Interfaces:**
- Consumes: `getPlatform`, `isStandalone` (Task 1); `useInstallPrompt` (Task 2).
- Produces: `default` React component `InstallInstructions` (no props).

> No unit test: the repo tests pure logic only (Node env, no component harness). Gated by `npm run build` + the manual checklist in Task 4.

- [ ] **Step 1: Write the component**

Create `src/components/InstallInstructions.tsx`:

```tsx
import { getPlatform, isStandalone } from '../utils/platform';
import { useInstallPrompt } from '../pwa/installPrompt';

/**
 * The "Install on your phone" block. Renders exactly one of four states, in priority
 * order:
 *   1. already installed (standalone)  -> a confirmation note
 *   2. a native prompt is available    -> a one-tap Install button (Android/Chromium)
 *   3. iOS                             -> Add-to-Home-Screen steps
 *   4. everything else                 -> generic browser-menu steps
 */
export default function InstallInstructions() {
  const { canPrompt, promptInstall } = useInstallPrompt();

  if (isStandalone()) {
    return <p className="install-note">✓ You’ve already installed the app.</p>;
  }

  if (canPrompt) {
    return (
      <button type="button" className="btn primary full" onClick={() => void promptInstall()}>
        ⬇ Install app
      </button>
    );
  }

  if (getPlatform() === 'ios') {
    return (
      <ol className="install-steps">
        <li>
          Tap the <strong>Share</strong> button <span aria-hidden="true">⬆</span> in the toolbar.
        </li>
        <li>
          Choose <strong>“Add to Home Screen”</strong>.
        </li>
        <li>
          Tap <strong>“Add”</strong>.
        </li>
      </ol>
    );
  }

  return (
    <ol className="install-steps">
      <li>
        Open the browser menu <span aria-hidden="true">⋮</span>.
      </li>
      <li>
        Choose <strong>“Install app”</strong> or <strong>“Add to Home screen”</strong>.
      </li>
      <li>Confirm to add it to your home screen.</li>
    </ol>
  );
}
```

- [ ] **Step 2: Verify the build compiles**

Run: `npm run build`
Expected: `tsc -b` clean (component is imported by Task 4; a temporary unused-import is fine to leave until Task 4 wires it — build here just confirms this file itself type-checks).

Note: if `noUnusedLocals`/module isolation flags the not-yet-consumed component, proceed to Task 4 and run the build gate there; do not add a throwaway import.

- [ ] **Step 3: Commit**

```bash
git add src/components/InstallInstructions.tsx
git commit -m "feat(share): platform-aware PWA install instructions block"
```

---

## Task 4: Share screen, config URL, CSS, and Settings wiring

**Files:**
- Modify: `src/config.ts`
- Create: `src/components/ShareAppScreen.tsx`
- Modify: `src/styles.css`
- Modify: `src/components/SettingsView.tsx`

**Interfaces:**
- Consumes: `APP_NAME` (existing) + new `APP_URL` from `config.ts`; `copyToClipboard` from `utils/share.ts`; `InstallInstructions` (Task 3); `QRCode` from `qrcode`.
- Produces: `default` React component `ShareAppScreen`; a new `'share'` screen in `SettingsView`.

> No unit test (component/UI). Gated by `npm run build` + the manual checklist below.

- [ ] **Step 1: Add the canonical URL constant**

In `src/config.ts`, append:

```ts
/** Canonical, installable production URL — used for the Share link + QR. Hardcoded
 *  (not derived from window.location) so a localhost/preview build still shares the
 *  real, installable site. */
export const APP_URL = 'https://alejbasurto7.github.io/Sticker-Collector/';
```

- [ ] **Step 2: Write the Share screen component**

Create `src/components/ShareAppScreen.tsx`:

```tsx
import { useEffect, useState } from 'react';
import QRCode from 'qrcode';
import { APP_NAME, APP_URL } from '../config';
import { copyToClipboard } from '../utils/share';
import InstallInstructions from './InstallInstructions';

/** Human-readable form of APP_URL for on-screen display (scheme + trailing slash stripped). */
const APP_URL_LABEL = APP_URL.replace(/^https?:\/\//, '').replace(/\/$/, '');

/** Settings → Share app: hand out the app URL (native share / copy / QR) and show
 *  how to install it as a PWA. */
export default function ShareAppScreen() {
  const [qrUrl, setQrUrl] = useState('');
  const [copied, setCopied] = useState(false);

  // Generate the QR once; the URL never changes at runtime.
  useEffect(() => {
    let cancelled = false;
    QRCode.toDataURL(APP_URL, { margin: 1, width: 200 })
      .then((url) => {
        if (!cancelled) setQrUrl(url);
      })
      .catch(() => {
        if (!cancelled) setQrUrl('');
      });
    return () => {
      cancelled = true;
    };
  }, []);

  async function copy() {
    if (await copyToClipboard(APP_URL)) {
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1600);
    }
  }

  async function share() {
    const data: ShareData = {
      title: APP_NAME,
      text: `Collect your World Cup 2026 stickers with ${APP_NAME}:`,
      url: APP_URL,
    };
    const nav = navigator as Navigator & { share?: (d: ShareData) => Promise<void> };
    if (nav.share) {
      try {
        await nav.share(data);
        return;
      } catch {
        // User cancelled or share failed — fall through to copy.
      }
    }
    void copy();
  }

  return (
    <>
      <p className="modal-sub" style={{ marginTop: 0 }}>
        Send a friend the link, or let them scan the code.
      </p>

      <div className="sync-qr-block">
        {qrUrl && (
          <img className="sync-qr" src={qrUrl} alt={`QR code linking to ${APP_NAME}`} />
        )}
        <p className="share-url">{APP_URL_LABEL}</p>
      </div>

      <div className="btn-row">
        <button type="button" className="btn full" onClick={() => void share()}>
          📤 Share link
        </button>
        <button type="button" className="btn full" onClick={() => void copy()} aria-live="polite">
          {copied ? '✓ Copied' : '🔗 Copy link'}
        </button>
      </div>

      <section className="settings-section" style={{ marginTop: 20 }}>
        <h3 className="settings-heading">Install on your phone</h3>
        <InstallInstructions />
      </section>
    </>
  );
}
```

- [ ] **Step 3: Add the CSS**

Append to `src/styles.css`:

```css
/* ---------- Settings → Share app ---------- */
.share-url {
  margin: 0;
  text-align: center;
  font-size: 0.85rem;
  color: var(--text-dim);
  word-break: break-all;
  user-select: all;
}
.install-steps {
  margin: 0;
  padding-left: 20px;
  display: flex;
  flex-direction: column;
  gap: 8px;
  font-size: 0.9rem;
  color: var(--text);
}
.install-steps li {
  line-height: 1.4;
}
.install-note {
  margin: 0;
  font-size: 0.9rem;
  color: var(--text-dim);
}
```

- [ ] **Step 4: Wire the Share screen into SettingsView**

In `src/components/SettingsView.tsx`:

(a) Add the import under the existing imports (after the `AlbumHelpSteps` import on line 4):

```tsx
import ShareAppScreen from './ShareAppScreen';
```

(b) Widen the `Screen` type (line 6):

```tsx
type Screen = 'root' | 'help' | 'about' | 'share';
```

(c) Add the sub-screen branch — insert directly above the `if (screen === 'help') {` block:

```tsx
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

(d) Add the nav row as the **first** child of the `.settings-card` (immediately after `<div className="settings-card">`, before the "How to modify my album" button):

```tsx
          <button type="button" className="setting-nav-row" onClick={() => setScreen('share')}>
            <span className="setting-row-title">📤 Share app</span>
            <span className="setting-nav-chevron" aria-hidden="true">›</span>
          </button>
```

- [ ] **Step 5: Verify the full build + tests**

Run: `npm run build`
Expected: `tsc -b` clean (strict + `noUnusedLocals`), Vite build succeeds.

Run: `npm test`
Expected: all tests PASS (existing suite + the two new test files from Tasks 1–2).

- [ ] **Step 6: Manual verification (`npm run dev`)**

Start: `npm run dev`, open the app, go to the **⚙️ Settings** tab.

- [ ] **📤 Share app** is the first row in the settings card; tapping it opens the sub-screen with a working `‹ Back`.
- [ ] The QR renders; scanning it with a phone camera opens `https://alejbasurto7.github.io/Sticker-Collector/`.
- [ ] The URL text `alejbasurto7.github.io/Sticker-Collector` shows and is selectable.
- [ ] **🔗 Copy link** copies the full `APP_URL` and flips to **✓ Copied** for ~1.6s.
- [ ] **📤 Share link** opens the OS share sheet where supported; on desktop Chrome/Firefox without Web Share it copies instead (no error).
- [ ] Desktop Chrome shows either **⬇ Install app** (if the browser offers a prompt) or the generic menu steps.
- [ ] (If testable) iOS Safari shows the 3-step Add-to-Home-Screen instructions; Android Chrome shows **⬇ Install app**.
- [ ] Launching the installed app from the home screen shows the **✓ already installed** note instead of steps/button.

- [ ] **Step 7: Drive the change with the verify skill**

Use the `verify` skill to exercise the Share flow end-to-end before finishing.

- [ ] **Step 8: Commit**

```bash
git add src/config.ts src/components/ShareAppScreen.tsx src/components/SettingsView.tsx src/styles.css
git commit -m "feat(share): Share app screen in Settings — URL, QR, and PWA install"
```

---

## Self-Review

**1. Spec coverage:**
- Share screen entry point (first nav row, sub-screen pattern) → Task 4 Step 4. ✓
- QR of canonical URL → Task 4 Step 2. ✓
- Native share sheet + copy link (with fallbacks) → Task 4 Step 2. ✓
- Canonical `APP_URL` constant (not runtime-derived) → Task 4 Step 1. ✓
- `beforeinstallprompt` captured at boot + `useInstallPrompt` → Task 2. ✓
- Native install button / iOS steps / generic steps / already-installed → Task 3. ✓
- iPadOS Mac-UA touch heuristic → Task 1 `getPlatform`. ✓
- CSS additions → Task 4 Step 3. ✓
- Unit tests for `parsePlatform` + install store → Tasks 1 & 2. ✓
- No new deps / no persisted state / Node-only tests → honored throughout. ✓

**2. Placeholder scan:** No TBD/TODO/"handle edge cases"; every code step shows complete code. ✓

**3. Type consistency:** `Platform`, `parsePlatform/getPlatform/isStandalone` (Task 1) used verbatim in Task 3. `canInstall/promptInstall/captureInstallPrompt/clearInstallPrompt/useInstallPrompt` + `BeforeInstallPromptEvent` (Task 2) used verbatim in Task 3 and the Task 2 test. `APP_URL`/`APP_NAME` (config) used in Task 4. `copyToClipboard` signature matches `utils/share.ts`. ✓
