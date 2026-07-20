# Settings Tab Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a fourth **⚙️ Settings** bottom tab containing an app-appearance toggle and two drill-down sub-screens — "How to modify my album" (gesture help) and "About" (build metadata + developer credit).

**Architecture:** A new full-screen `SettingsView` (rendered in `<main>` like the other tabs) owns local `screen` navigation state (`'root' | 'help' | 'about'`) and renders the root list or a sub-screen with a `‹ Back` control. The gesture-demo content is extracted from the now-dead `HelpDialog` into a reusable `AlbumHelpSteps` component; `HelpDialog` is deleted. No modals, no router.

**Tech Stack:** React 18, Zustand 4, TypeScript 5 (strict, `noUnusedLocals`), Vite 5, Vitest 4.

## Global Constraints

- **No new persisted state.** `theme`/`toggleTheme` already exist in the store; About data comes from build-time constants in `src/version.ts`. Do not touch the store or sync payload.
- **No component-test harness.** The repo unit-tests **pure logic only**; do **not** add React Testing Library. UI tasks are gated by `npm run build` (`tsc -b`, strict + `noUnusedLocals`) + `npm test` (regression) + the manual checklist in the task.
- **Reuse existing conventions:** className strings + CSS custom properties (`var(--bg)`, `var(--bg-elev)`, `var(--border)`, `var(--text)`, `var(--text-dim)`, `var(--green-bright)`, `var(--radius)`, `var(--radius-sm)`); `useCollection` selectors; existing settings classes (`.settings-section`, `.settings-heading`, `.settings-card`, `.setting-row`, `.setting-row-title`, `.setting-toggle`, `.setting-label`, `.switch`/`.knob`) and help classes (`.help-steps`, `.help-step`, `.help-step-label`, `.help-demo`, `.help-arrow`, `.cell`, `.dupe-badge`).
- **Exact copy:** tab label `Settings`, icon `⚙️`; About developer row value is exactly `Alex Basurto`.

---

## File Structure

**New files**
- `src/components/AlbumHelpSteps.tsx` — the three tap / tap-again / long-press gesture demos (presentational, device-aware labels). No props.
- `src/components/SettingsView.tsx` — the tab: `screen` nav state + root / help / about screens.

**Modified files**
- `src/version.ts` — add `BUILD_TIME_LABEL` export.
- `src/components/TabBar.tsx` — `Tab` union gains `'settings'`; add the 4th tab entry.
- `src/App.tsx` — render `{tab === 'settings' && <SettingsView />}`.
- `src/styles.css` — small additions for the settings-tab title, back button, drill-down rows, and About value column.

**Deleted files**
- `src/components/HelpDialog.tsx` — retired (already unreferenced after point 1). Its steps move to `AlbumHelpSteps`; its version footer is superseded by the About screen.

---

## Task 1: Extract `AlbumHelpSteps`, retire `HelpDialog`

Move the reusable gesture demos out of the dead `HelpDialog` modal into a standalone presentational component, then delete `HelpDialog`. Behaviour-neutral: `HelpDialog` has had no trigger since point 1.

**Files:**
- Create: `src/components/AlbumHelpSteps.tsx`
- Delete: `src/components/HelpDialog.tsx`

**Interfaces:**
- Consumes: `isDesktop()` from `src/utils/device.ts` (already used by `HelpDialog`).
- Produces: `AlbumHelpSteps` — default export, no props. Renders a `.help-steps` block of three `.help-step` demos.

- [ ] **Step 1: Create `src/components/AlbumHelpSteps.tsx`**

```tsx
import { isDesktop } from '../utils/device';

/**
 * A demo sticker cell mirroring the real album cell states, used purely to
 * illustrate the tap / long-press gestures — it is not interactive.
 */
function DemoCell({ owned, swap }: { owned?: boolean; swap?: boolean }) {
  return (
    <div className={`cell${owned ? ' owned' : ''}`} aria-hidden="true">
      1
      {swap && <span className="dupe-badge">+1</span>}
    </div>
  );
}

function Arrow() {
  return (
    <svg
      className="help-arrow"
      width="24"
      height="24"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <line x1="5" y1="12" x2="19" y2="12" />
      <polyline points="13 6 19 12 13 18" />
    </svg>
  );
}

/**
 * The three tap / tap-again / long-press gesture demos, with device-aware copy.
 * Presentational only — rendered by the Settings → "How to modify my album"
 * sub-screen. (Extracted from the retired HelpDialog modal.)
 */
export default function AlbumHelpSteps() {
  const desktop = isDesktop();
  const addLabel = desktop
    ? 'Click to add it to your collection'
    : 'Tap to add it to your collection';
  const swapLabel = desktop
    ? 'Click it again to mark it as a swap'
    : 'Tap it again to mark it as a swap';
  const removeLabel = desktop ? 'Right-click to remove it' : 'Long press to remove it';

  return (
    <div className="help-steps">
      <section className="help-step">
        <p className="help-step-label">{addLabel}</p>
        <div className="help-demo">
          <DemoCell />
          <Arrow />
          <DemoCell owned />
        </div>
      </section>

      <section className="help-step">
        <p className="help-step-label">{swapLabel}</p>
        <div className="help-demo">
          <DemoCell owned />
          <Arrow />
          <DemoCell owned swap />
        </div>
      </section>

      <section className="help-step">
        <p className="help-step-label">{removeLabel}</p>
        <div className="help-demo">
          <DemoCell owned swap />
          <Arrow />
          <DemoCell owned />
        </div>
      </section>
    </div>
  );
}
```

- [ ] **Step 2: Delete the retired modal**

```bash
git rm src/components/HelpDialog.tsx
```

- [ ] **Step 3: Confirm nothing still imports `HelpDialog`**

Run: `git grep -n "HelpDialog"`
Expected: **no matches** (App.tsx dropped the import in point 1; this file is now gone).

- [ ] **Step 4: Typecheck + build**

Run: `npm run build`
Expected: compiles clean. `AlbumHelpSteps.tsx` is not imported yet — an unimported, self-valid module compiles fine; `noUnusedLocals` flags unused *locals*, not unused modules.

- [ ] **Step 5: Regression tests**

Run: `npm test`
Expected: all existing tests PASS (no logic changed).

- [ ] **Step 6: Commit**

```bash
git add src/components/AlbumHelpSteps.tsx
git commit -m "refactor(help): extract AlbumHelpSteps; retire dead HelpDialog"
```

---

## Task 2: `SettingsView` + `BUILD_TIME_LABEL` + styles

Build the whole tab component (root + both sub-screens) and its styles. Not wired into the app yet, so it is build-gated here and made reachable in Task 3.

**Files:**
- Modify: `src/version.ts`
- Create: `src/components/SettingsView.tsx`
- Modify: `src/styles.css` (append new rules)

**Interfaces:**
- Consumes: `useCollection` selectors `theme` and `toggleTheme` (store, already defined); `APP_VERSION`, `APP_COMMIT`, `BUILD_TIME_LABEL` from `src/version.ts`; `AlbumHelpSteps` (Task 1).
- Produces: `SettingsView` — default export, no props. `BUILD_TIME_LABEL: string` from `src/version.ts`.

- [ ] **Step 1: Add `BUILD_TIME_LABEL` to `src/version.ts`**

Append after the existing `VERSION_LABEL` line (end of file). `formatBuildTime` and `APP_BUILD_TIME` are already defined above it:

```ts
// Formatted build timestamp on its own, for the About screen's "Built" row.
export const BUILD_TIME_LABEL = formatBuildTime(APP_BUILD_TIME);
```

(Leave `VERSION_LABEL` exported even though it becomes unreferenced — `noUnusedLocals` never flags unused exports.)

- [ ] **Step 2: Create `src/components/SettingsView.tsx`**

```tsx
import { useState } from 'react';
import { useCollection } from '../store/collectionStore';
import { APP_VERSION, APP_COMMIT, BUILD_TIME_LABEL } from '../version';
import AlbumHelpSteps from './AlbumHelpSteps';

type Screen = 'root' | 'help' | 'about';

/** `‹ Back` control shown at the top of each sub-screen. */
function BackButton({ onBack }: { onBack: () => void }) {
  return (
    <button type="button" className="settings-back" onClick={onBack} aria-label="Back to settings">
      ‹ Back
    </button>
  );
}

/** The ⚙️ Settings tab: appearance toggle + two informational sub-screens. */
export default function SettingsView() {
  const [screen, setScreen] = useState<Screen>('root');
  const theme = useCollection((s) => s.theme);
  const toggleTheme = useCollection((s) => s.toggleTheme);
  const dark = theme === 'dark';

  if (screen === 'help') {
    return (
      <div className="settings-view">
        <BackButton onBack={() => setScreen('root')} />
        <h2 className="settings-title">How to modify my album</h2>
        <AlbumHelpSteps />
      </div>
    );
  }

  if (screen === 'about') {
    return (
      <div className="settings-view">
        <BackButton onBack={() => setScreen('root')} />
        <h2 className="settings-title">About</h2>
        <section className="settings-section">
          <div className="settings-card">
            <div className="setting-row">
              <span className="setting-row-title">Version</span>
              <span className="setting-row-value">v{APP_VERSION}</span>
            </div>
            <div className="setting-row">
              <span className="setting-row-title">Build</span>
              <span className="setting-row-value">{APP_COMMIT}</span>
            </div>
            <div className="setting-row">
              <span className="setting-row-title">Built</span>
              <span className="setting-row-value">{BUILD_TIME_LABEL}</span>
            </div>
            <div className="setting-row">
              <span className="setting-row-title">Developer</span>
              <span className="setting-row-value">Alex Basurto</span>
            </div>
          </div>
        </section>
      </div>
    );
  }

  // root
  return (
    <div className="settings-view">
      <h2 className="settings-title">Settings</h2>

      <section className="settings-section">
        <h3 className="settings-heading">Appearance</h3>
        <button
          type="button"
          className="setting-toggle"
          role="switch"
          aria-checked={dark}
          onClick={toggleTheme}
        >
          <span className="setting-label">{dark ? '🌙 Dark mode' : '☀️ Light mode'}</span>
          <span className={`switch${dark ? ' on' : ''}`} aria-hidden="true">
            <span className="knob" />
          </span>
        </button>
      </section>

      <section className="settings-section">
        <div className="settings-card">
          <button type="button" className="setting-nav-row" onClick={() => setScreen('help')}>
            <span className="setting-row-title">How to modify my album</span>
            <span className="setting-nav-chevron" aria-hidden="true">›</span>
          </button>
          <button type="button" className="setting-nav-row" onClick={() => setScreen('about')}>
            <span className="setting-row-title">About</span>
            <span className="setting-nav-chevron" aria-hidden="true">›</span>
          </button>
        </div>
      </section>
    </div>
  );
}
```

- [ ] **Step 3: Append styles to `src/styles.css`**

Add at the end of the file:

```css
/* ---------- Settings tab (full-screen view) ---------- */
.settings-title {
  margin: 4px 0 16px;
  font-size: 20px;
  font-weight: 800;
}
.settings-back {
  margin: 0 0 4px -4px;
  padding: 4px;
  border: none;
  background: none;
  color: var(--text-dim);
  font: inherit;
  font-size: 15px;
  font-weight: 600;
  cursor: pointer;
}
.settings-back:hover {
  color: var(--text);
}
/* Tappable drill-down rows inside a .settings-card (How to modify / About) */
.setting-nav-row {
  display: flex;
  align-items: center;
  gap: 12px;
  width: 100%;
  padding: 14px;
  border: none;
  background: none;
  color: var(--text);
  font: inherit;
  text-align: left;
  cursor: pointer;
}
.setting-nav-row + .setting-nav-row {
  border-top: 1px solid var(--border);
}
.setting-nav-row:hover {
  background: var(--bg-elev);
}
.setting-nav-chevron {
  margin-left: auto;
  flex: none;
  color: var(--text-dim);
  font-size: 20px;
  line-height: 1;
}
/* Right-aligned value column for the About rows */
.setting-row-value {
  margin-left: auto;
  color: var(--text-dim);
  font-size: 13px;
  font-variant-numeric: tabular-nums;
}
```

- [ ] **Step 4: Typecheck + build**

Run: `npm run build`
Expected: compiles clean. `SettingsView` imports resolve (`APP_VERSION`/`APP_COMMIT`/`BUILD_TIME_LABEL`, `useCollection`, `AlbumHelpSteps`); it is unimported for now, which is fine.

- [ ] **Step 5: Commit**

```bash
git add src/version.ts src/components/SettingsView.tsx src/styles.css
git commit -m "feat(settings): SettingsView tab (appearance + help + about)"
```

---

## Task 3: Wire the tab into `TabBar` and `App`

Make the tab reachable: add it to the tab bar and render it. This is the user-testable deliverable.

**Files:**
- Modify: `src/components/TabBar.tsx`
- Modify: `src/App.tsx`

**Interfaces:**
- Consumes: `SettingsView` (Task 2); `Tab` type (extended here).
- Produces: `Tab` union now includes `'settings'`.

- [ ] **Step 1: Extend `TabBar.tsx`**

Change the `Tab` type (line 1) and add the tab to the `TABS` array (after `stats`):

```tsx
export type Tab = 'album' | 'swaps' | 'stats' | 'settings';
```

```tsx
const TABS: { key: Tab; icon: string; label: string }[] = [
  { key: 'album', icon: '📖', label: 'Album' },
  { key: 'swaps', icon: '🔄', label: 'Swaps' },
  { key: 'stats', icon: '📊', label: 'Stats' },
  { key: 'settings', icon: '⚙️', label: 'Settings' },
];
```

(The component already maps over `TABS`, so the 4th button renders automatically. No other change needed.)

- [ ] **Step 2: Render `SettingsView` in `App.tsx`**

Add the import alongside the other view imports (near `import StatsView from './components/StatsView';`):

```tsx
import SettingsView from './components/SettingsView';
```

Add the render line directly after the `stats` line inside `<main>`:

```tsx
        {tab === 'stats' && <StatsView />}
        {tab === 'settings' && <SettingsView />}
```

- [ ] **Step 3: Typecheck + build**

Run: `npm run build`
Expected: compiles clean; no unused imports; `Tab` union exhaustively used via `&&` conditionals (no switch to update).

- [ ] **Step 4: Regression tests**

Run: `npm test`
Expected: all tests PASS.

- [ ] **Step 5: Manual verification**

Run: `npm run dev` and open the served URL. Confirm:
- A 4th **⚙️ Settings** tab appears in the bottom bar; tapping it shows the **Settings** root screen.
- **Appearance**: the Dark/Light toggle flips the whole app theme; the label switches between "🌙 Dark mode" and "☀️ Light mode"; the choice persists across a page reload.
- **How to modify my album ›** pushes the sub-screen (with a working `‹ Back`); the three gesture demos render; there is **no** version/build text on this screen.
- **About ›** pushes the sub-screen; **Version / Build / Built / Developer** each appear on their own row; **Developer = Alex Basurto**; `‹ Back` returns to the root.
- Switching to another tab and back returns to the Settings **root** screen.
- No point-1 regression: the header still shows only the album switcher + 🔒 lock + ↗ share.

- [ ] **Step 6: Commit**

```bash
git add src/components/TabBar.tsx src/App.tsx
git commit -m "feat(settings): add ⚙️ Settings tab to the tab bar"
```

---

## Self-Review

**Spec coverage (against `2026-07-20-settings-tab-design.md`):**
- Screen A root (Settings title, Appearance toggle → `toggleTheme`, two nav rows) → Task 2 Step 2.
- Screen B "How to modify my album" (back header, `AlbumHelpSteps`, no version footer) → Task 1 (extraction) + Task 2 Step 2.
- Screen C About (Version / Build / Built / Developer rows; Developer = Alex Basurto) → Task 2 Step 2 (+ `BUILD_TIME_LABEL` in Step 1).
- Wiring (TabBar 4th `⚙️ Settings` tab; App renders `SettingsView`) → Task 3.
- Cleanup (retire `HelpDialog`, extract steps) → Task 1.
- CSS additions (`.settings-title`, `.settings-back`, `.setting-nav-row`(+chevron), `.setting-row-value`) → Task 2 Step 3.
- No new persisted state; strict/`noUnusedLocals` build gate; no RTL → Global Constraints, enforced by `npm run build` steps.

**Placeholder scan:** No TBD/TODO. Every code step shows complete code; every command has an expected result.

**Type consistency:** `SettingsView`/`AlbumHelpSteps` are default exports with no props at both definition and use sites. `BUILD_TIME_LABEL` is defined in Task 2 Step 1 and consumed in Step 2. `Tab` gains `'settings'` in Task 3 Step 1 and is the discriminant used by the `tab === 'settings'` render in Step 2. Store selectors `theme`/`toggleTheme` match the store's existing signatures (`theme: Theme`, `toggleTheme: () => void`). `APP_VERSION`/`APP_COMMIT` are pre-existing `version.ts` exports consumed unchanged.
