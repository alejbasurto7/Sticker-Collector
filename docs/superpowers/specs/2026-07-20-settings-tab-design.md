# Settings Tab Design

**Goal:** Add a fourth bottom-tab, **⚙️ Settings**, that houses the app-appearance
toggle and two informational drill-down screens ("How to modify my album" and
"About"). This gives the Dark/Light theme control and the gesture help a home after
they were removed from the app header, and adds an About screen with build metadata
and the developer credit.

**Context (post point-1 state):** The header previously carried four round buttons.
Point 1 removed the theme (🌙/☀️) and help (`?`) buttons so the album name gets its
width back, leaving only 🔒 lock and ↗ share. As a side effect:

- The theme toggle no longer exists anywhere in the UI (the `theme` store field and
  `toggleTheme()` action still exist and still drive `data-theme` on the document).
- [HelpDialog.tsx](../../../src/components/HelpDialog.tsx) is now dead code — its only
  trigger was the removed `?` button; nothing imports it anymore.

This feature restores both, in a dedicated tab.

**Tech stack:** React 18, Zustand 4, TypeScript 5 (strict, `noUnusedLocals`), Vite 5,
Vitest 4.

---

## Global Constraints

- **No new persisted state.** `theme` already lives in the store. About data comes
  from build-time constants in [version.ts](../../../src/version.ts). Do not add
  fields to the store or the sync payload.
- **Reuse existing conventions:** className strings + CSS custom properties
  (`var(--bg-elev)`, `var(--border)`, `var(--text)`, `var(--text-dim)`,
  `var(--green-bright)`), `useCollection` selectors, existing settings classes
  (`.settings-section`, `.settings-heading`, `.setting-row`, `.setting-row-text`,
  `.setting-row-title`, `.setting-toggle`, `.switch`/`.knob`, `.settings-version`).
- **The Settings tab is a full-screen view**, rendered in `<main className="content">`
  like `AlbumView`/`SwapsView`/`StatsView` — not a modal. The two informational
  screens are **in-tab sub-screens** (local navigation state + a back arrow), not
  modals and not a router.
- **Testing pattern:** the repo unit-tests **pure logic only** with Vitest; there is
  **no component-test harness — do not add React Testing Library.** UI is gated by
  `npm run build` (`tsc -b`) + `npm test` (regression) + a manual checklist.

---

## Architecture & Component Structure

One new view component owns the tab and its internal navigation; the reusable help
content is extracted so nothing is duplicated.

**New files**
- `src/components/SettingsView.tsx` — the tab. Holds `screen` nav state
  (`'root' | 'help' | 'about'`) and renders the root list or a sub-screen.
- `src/components/AlbumHelpSteps.tsx` — the three tap / tap-again / long-press gesture
  demos (the `DemoCell` + `Arrow` illustration), extracted from `HelpDialog.tsx`, with
  device-aware labels (`isDesktop()`). Pure presentational, no props.

**Modified files**
- `src/components/TabBar.tsx` — `Tab` type gains `'settings'`; add the 4th tab entry.
- `src/App.tsx` — render `{tab === 'settings' && <SettingsView />}`.
- `src/styles.css` — small additions for the sub-screen back header, tappable nav
  rows + chevron, and the About value column.

**Deleted files**
- `src/components/HelpDialog.tsx` — retired. Its reusable steps move to
  `AlbumHelpSteps`; its version footer moves (restructured) into the About screen.

---

## Screen A — Root (`screen === 'root'`)

```
Settings
────────────────────────────
 Appearance
  ┌────────────────────────┐
  │ 🌙 Dark mode      [ ●] │   ← .setting-toggle + .switch/.knob
  └────────────────────────┘

  ┌────────────────────────┐
  │ How to modify my album ›│  ← tappable nav row
  ├────────────────────────┤
  │ About                  ›│
  └────────────────────────┘
```

- Heading **Settings** (`.settings-heading` or the section pattern).
- **Appearance** section: a single row using the existing `.setting-toggle` markup
  (as used by Coca-Cola tracking), `role="switch"`, `aria-checked={theme === 'dark'}`.
  - Label: `🌙 Dark mode` when dark is active, `☀️ Light mode` when light is active.
  - `onClick` → `toggleTheme()` (store already provides it; also drives `data-theme`).
- Two nav rows, each a `<button>` styled as a `.setting-row` with a right-aligned
  chevron (`›`), `aria-label` describing the destination:
  - **How to modify my album** → `setScreen('help')`
  - **About** → `setScreen('about')`

## Screen B — How to modify my album (`screen === 'help'`)

```
‹ Back
How to modify my album
────────────────────────────
 Tap to add it to your collection
   [1] → [1]✓
 Tap it again to mark it as a swap
   [1]✓ → [1]✓ +1
 Long press to remove it
   [1]✓ +1 → [1]✓
```

- Back header: a `‹ Back` button → `setScreen('root')`, then the title
  "How to modify my album".
- Body: `<AlbumHelpSteps />` — the identical three gesture demos from the old Help
  modal. **No version footer** (that content now lives in About).
- Device-aware copy ("Tap"/"Click", "Long press"/"Right-click") is preserved by
  moving `isDesktop()` into `AlbumHelpSteps`.

## Screen C — About (`screen === 'about'`)

```
‹ Back
About
────────────────────────────
 Version      v1.0.0
 Build        a1b3c9d
 Built        2026-06-18 14:32 UTC
 Developer    Alex Basurto
```

- Back header → `setScreen('root')`, title "About".
- One `.setting-row` per fact, label on the left (`.setting-row-title`) and value on
  the right (new `.setting-row-value`, `margin-left:auto`, dimmed, tabular):
  - **Version** — `v${APP_VERSION}`
  - **Build** — `APP_COMMIT` (the commit hash that uniquely identifies the deploy)
  - **Built** — formatted `APP_BUILD_TIME` (reuse the `formatBuildTime` output, e.g.
    `2026-06-18 14:32 UTC`)
  - **Developer** — `Alex Basurto`
- To feed the rows individually (rather than the single joined `VERSION_LABEL`
  string), `version.ts` will also export the formatted build time. Add:
  `export const BUILD_TIME_LABEL = formatBuildTime(APP_BUILD_TIME);`. `APP_VERSION` and
  `APP_COMMIT` are already exported and are consumed directly by the About rows.
  `VERSION_LABEL` becomes unreferenced once `HelpDialog` is gone — leave it exported.
  `noUnusedLocals` only flags unused *locals*, never unused exports, so an unreferenced
  exported `const` does not fail the build.

---

## Wiring

**TabBar** — extend the union and the list:

```ts
export type Tab = 'album' | 'swaps' | 'stats' | 'settings';
// TABS:
{ key: 'settings', icon: '⚙️', label: 'Settings' },
```

The tab bar already maps over `TABS`, so the 4th button renders automatically. Four
tabs still fit the `flex: 1` layout.

**App.tsx** — add the render line alongside the other tabs:

```tsx
{tab === 'settings' && <SettingsView />}
```

`<main>` is keyed by `${activeAlbumId}-${edition}-${trackCC}`. `SettingsView` doesn't
depend on those, so a remount on album switch is harmless (it just resets the
sub-screen to root — acceptable and rare).

---

## CSS additions (small)

Reuse existing classes where possible. New rules (names indicative):

- `.settings-subhead` — the sub-screen back header row (flex, back button + title).
- `.settings-back` — the `‹ Back` button (borderless, dimmed, tappable).
- `.setting-nav-row` — a `.setting-row` variant that is a full-width tappable button
  with a right chevron (`.setting-nav-chevron`).
- `.setting-row-value` — right-aligned, dimmed value for the About rows
  (`margin-left:auto; color: var(--text-dim); font-variant-numeric: tabular-nums;`).

Cards wrap in the existing `.settings-card`/`.settings-section` containers for visual
consistency with the album detail screen.

---

## Error handling / edge cases

- **No network, no async** — every screen is static or reads store/build constants.
  Nothing to fail.
- **Theme persistence** — `toggleTheme` already persists via the store's existing
  persistence; the tab adds no new persistence path.
- **Missing/invalid build time** — `formatBuildTime` already returns the raw ISO
  string if the date is unparseable; About inherits that fallback.

---

## Testing

- **No new pure logic** beyond a one-line `BUILD_TIME_LABEL` export → no new unit
  tests required. `npm test` must still pass (regression).
- **Build gate:** `npm run build` (`tsc -b`) must compile clean under strict +
  `noUnusedLocals` (retiring `HelpDialog` must not leave dangling imports).
- **Manual checklist:**
  - A 4th ⚙️ **Settings** tab appears; tapping it shows the root screen.
  - The Dark mode toggle flips the whole app theme and the label updates; the choice
    persists across reload.
  - **How to modify my album ›** pushes the sub-screen with a working `‹ Back`; the
    three gesture demos render; there is **no** version text on this screen.
  - **About ›** pushes the sub-screen; Version / Build / Built / Developer each show on
    their own row; **Developer = Alex Basurto**; `‹ Back` returns to root.
  - Switching to another tab and back returns to the Settings **root** screen.
  - The header still shows only the album switcher + 🔒 + ↗ (no regression from
    point 1).

---

## Out of scope

- Any settings beyond appearance + the two info screens (cloud/account/notifications).
  Cloud sync remains where it is (the Library-sheet `SettingsDialog`).
- Renaming the existing `SettingsDialog` (the Cloud-sync manager). It keeps its name
  and entry point; only naming overlap, no functional conflict with the new tab.
- Reordering or restyling the existing three tabs.
