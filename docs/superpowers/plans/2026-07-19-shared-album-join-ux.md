# Shared-album Join UX Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give *joining* a shared album a first-class, discoverable home in the Library — the joiner pastes a code and names the album themselves — and remove the backwards "convert this album to shared" join path from album Settings.

**Architecture:** Follow the codebase's existing pure-logic-plus-thin-UI split (`albumMode.ts` + `useAlbumMode.ts` + component). Extract the join *decision* logic (code-peek result → error message, plus the default name) into a new pure, node-testable module `src/sync/joinAlbum.ts`, and unit-test it. Build a self-contained `JoinAlbumDialog` component over the existing, unchanged engine contracts (`peekRemote`, `joinAlbumCode`), wire it into `LibrarySheet`, and delete the join sub-flow from `AlbumSharing`.

**Tech Stack:** React + TypeScript, Zustand stores, Vitest (node environment — no React Testing Library / jsdom in this repo). Vite PWA. Supabase-backed sync engine.

## Global Constraints

- **Test environment is node-only.** Vitest runs `environment: 'node'`; every test targets pure functions. Do **not** add React Testing Library, jsdom, or component rendering tests. Test the extracted pure logic; verify components with `npm run build` (typecheck) + `npm test`.
- **User-facing copy is verbatim.** The error/helper strings below use curly apostrophes (`’`) and em dashes (`—`). Copy them exactly, character for character.
- **Name is required and defaults to `"Shared album"`.** The name field prefills `"Shared album"`, is editable, and cannot be empty. A non-empty `displayName` is always passed to `joinAlbumCode` so the owner's name can never surface via the `resolveAlbumName` fallback.
- **The owner's album name is never shown to the joiner.** The dialog renders no album preview and never reads `peek.album.albumName`.
- **The Join entry point is gated on `isSyncConfigured`.** When sync is not configured, the button is omitted.
- **Engine contracts are reused unchanged:** `peekRemote(code): Promise<PeekResult>`, `joinAlbumCode(peek: AlbumPeekOk, opts?: { displayName?: string }): Promise<void>` (already switches the active album to the joined one, and de-dupes a re-entered code), `formatSyncCode`. Do not modify `src/sync/engine.ts` or `src/lib/syncCode.ts`.
- **Commit trailer:** every commit message ends with
  `Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>`

---

## File Structure

- **Create** `src/sync/joinAlbum.ts` — pure, node-safe join-decision logic: `joinErrorMessage(peek)` and `DEFAULT_JOIN_NAME`. Type-only import of `PeekResult` from `./engine` (erased at compile — keeps the module free of the engine's Supabase runtime, like `albumMode.ts`).
- **Create** `src/sync/joinAlbum.test.ts` — Vitest unit tests for the module (node env).
- **Create** `src/components/JoinAlbumDialog.tsx` — the modal: code field + joiner-named field, wiring peek → decide → join. No unit test (no component-test harness in this repo).
- **Modify** `src/components/LibrarySheet.tsx` — replace the disabled "👥 Groups" button with "📥 Join a shared album" (gated on `isSyncConfigured`); add `joining` state; render `JoinAlbumDialog`; close the sheet on success.
- **Modify** `src/components/AlbumSharing.tsx` — delete the `'choose'` and `'join'` sub-panels, their state, the `join()` handler, and now-unused imports; tapping **👥 Shared** advances straight to the `'access'` panel.

---

## Task 1: Pure join-decision module (`src/sync/joinAlbum.ts`)

**Files:**
- Create: `src/sync/joinAlbum.ts`
- Test: `src/sync/joinAlbum.test.ts`

**Interfaces:**
- Consumes: `PeekResult` (type only) from `src/sync/engine.ts` — a union of `PeekOk` (`ok: true, kind: 'collection'`), `AlbumPeekOk` (`ok: true, kind: 'album'`), and `{ ok: false; reason: 'invalid' | 'not-found' | 'network' | 'unconfigured' }`.
- Produces:
  - `joinErrorMessage(peek: PeekResult): string | null` — the message to show when a code can't be joined, or `null` when `peek` is a joinable album share (`ok && kind === 'album'`).
  - `DEFAULT_JOIN_NAME: string` — the constant `"Shared album"`.

- [ ] **Step 1: Write the failing test**

Create `src/sync/joinAlbum.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { joinErrorMessage, DEFAULT_JOIN_NAME } from './joinAlbum';
import type { PeekResult } from './engine';

// joinErrorMessage only reads `ok`, `kind`, and `reason`, so minimal shapes cast to
// PeekResult are enough to exercise every branch without a full AlbumSnapshot.
const album = { ok: true, kind: 'album' } as PeekResult;
const collection = { ok: true, kind: 'collection' } as PeekResult;
const fail = (reason: 'invalid' | 'not-found' | 'network' | 'unconfigured'): PeekResult =>
  ({ ok: false, reason });

describe('DEFAULT_JOIN_NAME', () => {
  it('is "Shared album"', () => {
    expect(DEFAULT_JOIN_NAME).toBe('Shared album');
  });
});

describe('joinErrorMessage', () => {
  it('returns null for a joinable album share', () => {
    expect(joinErrorMessage(album)).toBeNull();
  });
  it('rejects a Cloud (collection) code with the Cloud-code message', () => {
    expect(joinErrorMessage(collection)).toBe(
      'That’s a Cloud code (for syncing your own devices), not a shared-album code. Use the Cloud option for that.',
    );
  });
  it('maps invalid to the format hint', () => {
    expect(joinErrorMessage(fail('invalid'))).toBe(
      'That code doesn’t look right — it should be 12 letters/numbers.',
    );
  });
  it('maps not-found to the double-check message', () => {
    expect(joinErrorMessage(fail('not-found'))).toBe(
      'No shared album found for that code. Double-check it with the person who shared it.',
    );
  });
  it('maps network and unconfigured to the connectivity message', () => {
    const connectivity = 'Couldn’t reach sync. Check your connection and try again.';
    expect(joinErrorMessage(fail('network'))).toBe(connectivity);
    expect(joinErrorMessage(fail('unconfigured'))).toBe(connectivity);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm test -- src/sync/joinAlbum.test.ts`
Expected: FAIL — `Failed to resolve import "./joinAlbum"` (module does not exist yet).

- [ ] **Step 3: Write the minimal implementation**

Create `src/sync/joinAlbum.ts`:

```ts
// Pure, node-safe join-decision logic. A type-only import of PeekResult keeps this module free of
// the engine's Supabase runtime (mirrors albumMode.ts), so it and its tests run in the node Vitest env.
import type { PeekResult } from './engine';

/** The name a joined album gets on this device by default; the joiner can rename it in the dialog
 *  and later in the album's Settings. Kept non-empty so the owner's name never surfaces. */
export const DEFAULT_JOIN_NAME = 'Shared album';

/**
 * The message to show for a peeked code that can't be joined, or `null` when the code is a joinable
 * album share (`ok && kind === 'album'`). Centralises the copy so the dialog and its tests share one
 * source of truth.
 */
export function joinErrorMessage(peek: PeekResult): string | null {
  if (peek.ok) {
    if (peek.kind === 'album') return null;
    return 'That’s a Cloud code (for syncing your own devices), not a shared-album code. Use the Cloud option for that.';
  }
  switch (peek.reason) {
    case 'invalid':
      return 'That code doesn’t look right — it should be 12 letters/numbers.';
    case 'not-found':
      return 'No shared album found for that code. Double-check it with the person who shared it.';
    default: // 'network' | 'unconfigured'
      return 'Couldn’t reach sync. Check your connection and try again.';
  }
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npm test -- src/sync/joinAlbum.test.ts`
Expected: PASS — all cases green.

- [ ] **Step 5: Commit**

```bash
git add src/sync/joinAlbum.ts src/sync/joinAlbum.test.ts
git commit -m "$(cat <<'EOF'
feat(sync): pure join-decision module (joinErrorMessage, DEFAULT_JOIN_NAME)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 2: `JoinAlbumDialog` component + Library entry point

**Files:**
- Create: `src/components/JoinAlbumDialog.tsx`
- Modify: `src/components/LibrarySheet.tsx`

**Interfaces:**
- Consumes: `joinErrorMessage`, `DEFAULT_JOIN_NAME` from `src/sync/joinAlbum.ts`; `peekRemote`, `joinAlbumCode` from `src/sync/engine.ts`; `formatSyncCode` from `src/lib/syncCode.ts`; `isSyncConfigured` from `src/lib/supabase.ts`.
- Produces: `JoinAlbumDialog` (default export) — props `{ onClose: () => void; onJoined: () => void }`.

**Why no unit test:** this repo has no React component-test harness (node Vitest env, no RTL/jsdom), and no existing component is unit-tested. The join *decision* logic is covered by Task 1; this task is thin wiring over tested logic and unchanged engine contracts, verified by `npm run build` (typecheck of the JSX/props/narrowing) + `npm test` (pure tests stay green) + an optional manual smoke test.

- [ ] **Step 1: Create the dialog component**

Create `src/components/JoinAlbumDialog.tsx`:

```tsx
import { useState } from 'react';
import { formatSyncCode } from '../lib/syncCode';
import { peekRemote, joinAlbumCode } from '../sync/engine';
import { joinErrorMessage, DEFAULT_JOIN_NAME } from '../sync/joinAlbum';

interface Props {
  onClose: () => void;   // cancel — dismiss the dialog, stay in the Library
  onJoined: () => void;  // success — album already switched; close dialog + Library
}

/**
 * Join an album someone shared with you, from a pasted code. The joiner names the album on their own
 * device (default "Shared album"); the owner's name is never shown. On success `joinAlbumCode` has
 * already adopted and switched to the new album, so the parent just closes.
 */
export default function JoinAlbumDialog({ onClose, onJoined }: Props) {
  const [code, setCode] = useState('');
  const [name, setName] = useState(DEFAULT_JOIN_NAME);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const canJoin = code.trim() !== '' && name.trim() !== '' && !busy;

  async function join() {
    setBusy(true);
    setError('');
    const peek = await peekRemote(code);
    const msg = joinErrorMessage(peek);
    if (msg) {
      setError(msg);
      setBusy(false);
      return;
    }
    // msg === null guarantees a joinable album; re-check narrows the type for joinAlbumCode.
    if (peek.ok && peek.kind === 'album') {
      await joinAlbumCode(peek, { displayName: name.trim() });
      onJoined();
    }
  }

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <h2>Join a shared album</h2>
        <p className="modal-sub">Enter the code someone shared with you.</p>

        <div className="settings-field">
          <label htmlFor="join-code-input" className="settings-field-label">Share code</label>
          <input
            id="join-code-input"
            type="text"
            className="settings-input"
            placeholder="XXXX-XXXX-XXXX"
            autoCapitalize="characters"
            autoCorrect="off"
            spellCheck={false}
            autoFocus
            value={code}
            onChange={(e) => setCode(formatSyncCode(e.target.value))}
          />
        </div>

        <div className="settings-field" style={{ marginTop: 10 }}>
          <label htmlFor="join-name-input" className="settings-field-label">Name this album</label>
          <input
            id="join-name-input"
            type="text"
            className="settings-input"
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
          <p className="modal-sub" style={{ margin: '6px 0 0', fontSize: '0.82rem' }}>
            Shown only on your device — you can rename it anytime.
          </p>
        </div>

        {error && <p className="sync-error">{error}</p>}

        <div className="btn-row" style={{ marginTop: 12 }}>
          <button type="button" className="btn full" disabled={busy} onClick={onClose}>
            Cancel
          </button>
          <button type="button" className="btn primary full" disabled={!canJoin} onClick={join}>
            {busy ? 'Joining…' : 'Join album'}
          </button>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Add the import and `isSyncConfigured` to `LibrarySheet.tsx`**

In `src/components/LibrarySheet.tsx`, add these imports after the existing `AlbumCard` import (around line 4):

```tsx
import { isSyncConfigured } from '../lib/supabase';
import JoinAlbumDialog from './JoinAlbumDialog';
```

- [ ] **Step 3: Add the `joining` state**

In `LibrarySheet`, alongside the existing `naming` / `draft` / `justCreated` state (around line 25), add:

```tsx
  const [joining, setJoining] = useState(false);
```

- [ ] **Step 4: Replace the disabled "Groups" button with the Join button**

Find this line (around line 72):

```tsx
          <button type="button" className="btn full" disabled title="Coming soon">👥 Groups</button>
```

Replace it with:

```tsx
          {isSyncConfigured && (
            <button
              type="button"
              className="btn full"
              onClick={() => { setJustCreated(null); setJoining(true); }}
            >
              📥 Join a shared album
            </button>
          )}
```

- [ ] **Step 5: Render the dialog**

In `LibrarySheet`, immediately after the `{naming && ( … )}` sub-modal block (just before the component's final closing `</div>`), add:

```tsx
      {joining && (
        <JoinAlbumDialog
          onClose={() => setJoining(false)}
          onJoined={() => { setJoining(false); onClose(); }}
        />
      )}
```

- [ ] **Step 6: Typecheck and run the full test suite**

Run: `npm run build`
Expected: PASS — `tsc -b` reports no type errors (props, the `peek.ok && peek.kind === 'album'` narrowing, and imports all resolve) and `vite build` completes.

Run: `npm test`
Expected: PASS — all suites green, including `src/sync/joinAlbum.test.ts`.

- [ ] **Step 7: Optional manual smoke test (only if a Supabase env + a real share code are available)**

Run `npm run dev`, open the Library ("Your albums"), tap **📥 Join a shared album**. Verify: (a) the name field is prefilled `Shared album`; (b) **Join album** is disabled if the code or name is empty; (c) a bad code shows the format/not-found message; (d) a valid share code joins, the sheet closes, and the new album appears named by *your* chosen name — not the owner's.

- [ ] **Step 8: Commit**

```bash
git add src/components/JoinAlbumDialog.tsx src/components/LibrarySheet.tsx
git commit -m "$(cat <<'EOF'
feat(library): first-class "Join a shared album" entry point

Add JoinAlbumDialog (paste code + name it yourself, owner name never shown)
and surface it in the Library in place of the disabled Groups button. On a
successful join the active album is already switched, so the sheet closes.

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 3: Remove the buried join path from `AlbumSharing`

**Files:**
- Modify: `src/components/AlbumSharing.tsx`

**Interfaces:**
- Consumes: nothing new. This task *removes* code and leaves album Settings → Sharing purely about sharing the current album.
- Produces: no new exports. Tapping **👥 Shared** on a non-shared album now advances directly to the `'access'` panel ("Who can edit?").

**Why no unit test:** `AlbumSharing` has no existing unit test (no component-test harness), and this task only deletes a sub-flow. Verified by `npm run build` (the strict config flags any leftover unused symbol) + `npm test`.

- [ ] **Step 1: Trim the engine import**

In `src/components/AlbumSharing.tsx`, change the engine import (around lines 7–10) from:

```tsx
import {
  createAlbumShare, setAlbumMode, setShareAccess, stopSharing, leaveAlbumShare,
  peekRemote, joinAlbumCode,
} from '../sync/engine';
```

to:

```tsx
import {
  createAlbumShare, setAlbumMode, setShareAccess, stopSharing, leaveAlbumShare,
} from '../sync/engine';
```

- [ ] **Step 2: Remove the now-unused `formatSyncCode` import**

Delete this line (around line 11):

```tsx
import { formatSyncCode } from '../lib/syncCode';
```

- [ ] **Step 3: Narrow the `panel` state and drop the join state**

Change the panel comment + state (around lines 30–34) from:

```tsx
  // Shared sub-panel: choose (share vs join) -> access (owner picks level) | join (paste a code).
  const [panel, setPanel] = useState<'closed' | 'choose' | 'access' | 'join'>('closed');
  const [joinCode, setJoinCode] = useState('');
  const [joinError, setJoinError] = useState('');
  const [code, setCode] = useState('');
```

to:

```tsx
  // Shared sub-panel: access (owner picks the access level, then a code is created).
  const [panel, setPanel] = useState<'closed' | 'access'>('closed');
  const [code, setCode] = useState('');
```

- [ ] **Step 4: Delete the `join()` handler**

Remove the entire `join()` function (the block starting with the comment `/** Join an album someone shared with you, from a pasted code. … */` and the `async function join() { … }` through its closing brace — originally lines 60–83).

- [ ] **Step 5: Send the "Shared" button straight to the access panel**

Find the Shared mode button's handler (around line 141):

```tsx
          onClick={() => { if (mode !== 'shared') setPanel('choose'); }}
```

Change it to:

```tsx
          onClick={() => { if (mode !== 'shared') setPanel('access'); }}
```

- [ ] **Step 6: Delete the `'choose'` sub-panel**

Remove the entire `{panel === 'choose' && ( … )}` block (originally lines 160–176 — the "Share this album, or join one shared with you?" panel with its three buttons).

- [ ] **Step 7: Fix the access panel's "Back" target**

Within the `{panel === 'access' && ( … )}` block, find the Back button (around line 189):

```tsx
            <button type="button" className="btn full" disabled={busy} onClick={() => setPanel('choose')}>
              Back
            </button>
```

Change its handler to `setPanel('closed')`:

```tsx
            <button type="button" className="btn full" disabled={busy} onClick={() => setPanel('closed')}>
              Back
            </button>
```

- [ ] **Step 8: Delete the `'join'` sub-panel**

Remove the entire `{panel === 'join' && ( … )}` block (originally lines 196–220 — the "Enter the code someone shared with you." panel with the code input, `joinError`, Back, and "Join album" buttons).

- [ ] **Step 9: Typecheck and run the full test suite**

Run: `npm run build`
Expected: PASS — no type errors and, in particular, **no "declared but never read"** errors, confirming every removed symbol (`peekRemote`, `joinAlbumCode`, `formatSyncCode`, `joinCode`, `joinError`, the `'choose'`/`'join'` panel literals) is fully gone.

Run: `npm test`
Expected: PASS — all suites green.

- [ ] **Step 10: Optional manual smoke test (if running `npm run dev`)**

Open a Local or Cloud album's Settings → Sharing, tap **👥 Shared**: it now goes straight to **"Who can edit?"** (no share-vs-join step). Picking an access level still creates and shows the share code; **Back** returns to the mode selector. No "enter a code to join" UI remains here.

- [ ] **Step 11: Commit**

```bash
git add src/components/AlbumSharing.tsx
git commit -m "$(cat <<'EOF'
refactor(sharing): remove buried join path from album Settings

Joining now lives in the Library (JoinAlbumDialog). Album Settings → Shared
is purely about sharing THIS album: tapping Shared goes straight to the
access-level choice. Drops the choose/join sub-panels and dead state.

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Self-Review

**1. Spec coverage** — every spec section maps to a task:
- Spec §1 (Library entry point, `isSyncConfigured` gate, close-on-join) → Task 2 Steps 2–5.
- Spec §2 (code + required name defaulting to "Shared album", error messages, owner name hidden) → Task 1 (messages + default) and Task 2 Step 1 (dialog, `canJoin` gating, no album-name render).
- Spec §3 (remove buried path; Shared → access directly) → Task 3.
- Spec §4 (edge cases: re-entered code, brand-new user, sync-not-configured, owner name never shown) → handled by unchanged `joinAlbumCode` de-dupe, the always-reachable Library, the `isSyncConfigured` gate (Task 2 Step 4), and the required non-empty name (Task 1 + Task 2 Step 1).
- Spec §5 (testing) → Task 1 tests cover the decision logic and default; component wiring is verified by build + optional smoke, per the node-only constraint.

**2. Placeholder scan** — no TBD/TODO/"handle edge cases"/"add validation"; every code step shows complete code, every run step shows the exact command and expected result.

**3. Type consistency** — names align across tasks: `joinErrorMessage` and `DEFAULT_JOIN_NAME` are defined in Task 1 and imported unchanged in Task 2; `JoinAlbumDialog` props `{ onClose, onJoined }` are defined in Task 2 Step 1 and used identically in Task 2 Step 5; `peekRemote`/`joinAlbumCode`/`formatSyncCode`/`isSyncConfigured` match their real exports verified in `engine.ts`, `syncCode.ts`, and `supabase.ts`; the `panel` union is narrowed consistently to `'closed' | 'access'` across all of Task 3.
