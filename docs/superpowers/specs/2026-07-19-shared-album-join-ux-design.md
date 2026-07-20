# Shared-album join UX — design

**Date:** 2026-07-19
**Status:** Approved (pending spec review)
**Scope:** Make *joining* a shared album easy and intuitive, without changing how an owner shares.

## Problem

Sharing is intuitive for the **owner**: open an album's Settings → Sharing → **👥 Shared** → pick an
access level → hand out the generated code/QR.

**Joining is not.** Today the joiner must:

1. Already have an album open (Settings is album-scoped).
2. Open that album's **Settings → Sharing**.
3. Tap **👥 Shared** — which *reads as* "convert my current album to shared."
4. Choose **"Enter a code to join a shared album."**
5. Paste a 12-character code.

The framing is backwards: the UI presents joining as flipping an *existing* album's mode, but
`joinAlbumCode` actually **creates a brand-new album**. And the natural place a joiner would look —
the **"Your albums" Library sheet**, where you add albums — has **➕ New album**, **👥 Groups (Coming
soon)**, and **☁️ Cloud sync**, but *no* way to join a share.

## Goals

- Give joining a first-class, discoverable home in the Library, framed as **adding a new album**.
- Let the joiner **name the album themselves**; never show them the owner's album name.
- Remove the backwards "convert this album to shared" join path from album Settings.

## Non-goals (explicitly deferred)

- **Tappable share links / deep-linking** (`.../#/join/<code>`) and **scannable QR that opens the app**.
  The app is a PWA on GitHub Pages at a stable URL, so this is feasible later, but this iteration
  keeps the joiner typing a code. Structuring the join UI as a reusable component (below) leaves a
  clean seam for that follow-up.
- **In-app camera QR scanner** (native camera scanning would cover the in-person case once the QR
  encodes an https deep-link — a concern of the deferred link/QR work, not this one).
- Any change to the owner's sharing flow beyond removing the join branch.

## Approach

Extract a small, self-contained **`JoinAlbumDialog`** component that owns the entire join
interaction (code input, joiner-chosen name, `peekRemote` → `joinAlbumCode`, error display).
`LibrarySheet` gains a button that opens it; `AlbumSharing` loses its join code entirely.

Rationale over the alternatives: inlining the flow in `LibrarySheet` bloats an already-sizable
component and isn't reusable for the future deep-link prompt; a separate hook adds indirection with
no benefit at this size. A dedicated dialog is the cleanest isolation and is independently testable.

## Reused engine contracts (unchanged)

- `peekRemote(code): Promise<PeekResult>` — looks up a code without mutating local state. Returns an
  `AlbumPeekOk` (`kind:'album'`), a `PeekOk` (`kind:'collection'` — a Cloud code, not a share), or
  `{ ok:false, reason:'invalid' | 'not-found' | 'network' | 'unconfigured' }`.
- `joinAlbumCode(peek: AlbumPeekOk, opts?: { displayName?: string }): Promise<void>` — adopts the
  album under a locally-unique id, records a joiner link, sets the local alias when `displayName` is
  given, and **switches the active album to the joined one**. If the same code was already joined, it
  just switches to that existing album (no duplicate, existing name kept).
- `formatSyncCode` — the `XXXX-XXXX-XXXX` input formatting already used by the join field today.
- `resolveAlbumName(albumId, snapshotName, localAlbumNames)` — returns the local alias if set, else
  the synced snapshot name. Setting a non-empty alias on join is what keeps the owner's name hidden.

## Design

### 1. Entry point — `LibrarySheet`

- Add a **📥 Join a shared album** button directly beneath **➕ New album**.
- Render it only when `isSyncConfigured` is true (joining is impossible otherwise).
- It opens `JoinAlbumDialog` as a sub-modal, mirroring how **➕ New album** opens its naming
  sub-modal.
- On a successful join, `joinAlbumCode` has already switched the active album, so the dialog closes
  **and the Library sheet closes**, landing the user on the newly-joined album.

### 2. `JoinAlbumDialog` — code + joiner-chosen name

Two fields in one modal:

1. **Share code** — `XXXX-XXXX-XXXX`, formatted via `formatSyncCode` (same input UX as today:
   `autoCapitalize="characters"`, `autoCorrect="off"`, `spellCheck={false}`).
2. **Name this album** — helper text: *"Shown only on your device — you can rename it anytime."*
   **Required.** The owner's album name is never fetched into view or used to prefill this field.

Behavior:

- **Join** is disabled until *both* fields are non-empty (and while busy).
- On submit → `peekRemote(code)`:
  - `ok && kind:'album'` → `joinAlbumCode(peek, { displayName: name.trim() })` → close dialog + sheet.
  - `ok && kind:'collection'` → error: *"That's a Cloud code (for syncing your own devices), not a
    shared-album code. Use the Cloud option for that."*
  - `!ok` → reuse today's messages by `reason`:
    - `invalid` → *"That code doesn't look right — it should be 12 letters/numbers."*
    - `not-found` → *"No shared album found for that code. Double-check it with the person who shared
      it."*
    - `network` / `unconfigured` → *"Couldn't reach sync. Check your connection and try again."*

Because a non-empty `displayName` is **always** passed on a fresh join, `resolveAlbumName` returns the
joiner's chosen name everywhere it appears (album card, header), so the owner's name never surfaces.
The joiner can change this name later via the existing **"Display name on this device"** field in the
album's Settings (joiner view).

### 3. Remove the buried path — `AlbumSharing`

- Delete the join sub-flow: the `'choose'` panel (share-vs-join) and the `'join'` panel.
- Remove the now-unused state (`joinCode`, `joinError`), the `join()` handler, and imports that become
  unused here (`peekRemote`, `joinAlbumCode`, and `formatSyncCode` if unused elsewhere in the file).
- Tapping **👥 Shared** on a Local/Cloud album now goes **straight to the `'access'` panel** ("Who can
  edit?"), since joining no longer lives here. Album Settings → Shared is purely about sharing *this*
  album.
- The owner-manage view and joiner view (status, access toggle, code/QR, stop/leave, per-device
  display name) are unchanged.

### 4. Edge cases

- **Re-entering an already-joined code:** `joinAlbumCode` switches to the existing album and keeps its
  prior name; dialog + sheet close; no duplicate album created.
- **Brand-new user whose first action is joining:** the default album always exists, so the Library
  is reachable and the entry point works with no prior shares.
- **Sync not configured:** the **📥 Join a shared album** button is not rendered.
- **Owner name must never appear:** the dialog shows no album preview and never renders
  `peek.album.albumName`; the required joiner name guarantees the `resolveAlbumName` fallback to the
  owner's snapshot name can't trigger.

### 5. Testing

- **`JoinAlbumDialog`:**
  - Join disabled until both code and name are present.
  - Each `peekRemote` failure `reason` renders its matching message.
  - A `kind:'collection'` peek renders the "Cloud code, not a share" message.
  - A successful `kind:'album'` peek calls `joinAlbumCode` with `{ displayName }` equal to the trimmed
    name.
- **Name/owner-hiding guard:** after a join, the album resolves to the joiner's chosen name (assert
  the owner's snapshot name is not shown) — protects the core new requirement.
- **`AlbumSharing`:** tapping **👥 Shared** on a non-shared album advances to the access-level choice
  (no share-vs-join intermediary); no join UI remains in this component.

## UX sketch

```
Your albums
┌────────────────────┐
│ [ album cards … ]  │
└────────────────────┘
 [ ➕ New album ]
 [ 📥 Join a shared album ]   ← new
 [ 👥 Groups (Coming soon) ]
 [ ☁️ Cloud sync ]            (only if a Cloud link exists)

Join dialog
┌──────────────────────────────┐
│ Join a shared album          │
│ Share code                   │
│ [ XXXX-XXXX-XXXX ]           │
│ Name this album              │
│ [ ____________ ]             │
│ Shown only on your device —  │
│ you can rename it anytime.   │
│      [ Cancel ]  [ Join ]    │
└──────────────────────────────┘
```
