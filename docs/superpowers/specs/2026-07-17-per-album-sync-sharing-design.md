# Per-album sync & sharing — design

**Date:** 2026-07-17
**Status:** Approved design, ready for implementation planning

## Summary

Today sync is **whole-collection, single-link**: one sync code mirrors the *entire*
collection (all albums + globals) into one Supabase row, resolved by whole-document
last-write-wins ([src/sync/engine.ts](../../../src/sync/engine.ts),
[src/store/syncStore.ts](../../../src/store/syncStore.ts)). That assumes "one person across
two devices."

This feature makes the **album** the unit of sync. Each album is independently **Local**
(this device only), **Cloud** (synced across your own devices), or **Shared** (its own code,
shared with another person — read-only or collaborative). Two people can co-edit one shared
album while keeping their other albums private. Collaborative editing merges intelligently
so independent edits never clobber each other.

**No backend/SQL changes.** The `collections` table and its two RPCs are unchanged; merging
is client-side, guarded by the existing `version` optimistic-concurrency check.

## Goals

- Per-album sync mode: **Local / Cloud / Shared**, chosen per album.
- **Shared** albums carry an owner-set **access level**: **Read-only** (joiners view only) or
  **Collaborative** (joiners fully edit).
- Collaborative edits **merge** (a 3-way merge against a saved base) so two people's
  independent changes both survive; only a true same-key collision resolves by a
  deterministic rule.
- Keep the existing **whole-collection** convenience (now the "Cloud" channel) for your own
  devices; each album lives in exactly one channel.
- A joiner can set a **local display name** for a shared album (never synced).
- **Revocation:** a joiner can leave; an owner can stop sharing and the joiner is notified.
- Preserve today's offline-first behavior and the no-accounts, code-as-capability model.

## Non-goals

- User accounts, auth, or server-enforced permissions (see **Future work**).
- Hard server-side revocation (delete row / code rotation) — explicitly deferred.
- Selective per-joiner revocation.
- Remote-wiping a joiner's local data. Revocation ends the live link only.

---

## Terminology & the channel model

The unit of sync is the album. Every album on a device is in exactly **one** mode. The mode
is **link metadata stored locally** — it never travels inside the synced album blob (the
existing principle that link identity stays on-device).

| Mode (user-facing) | Sub-label | Audience | Cloud row |
|---|---|---|---|
| **Local** | "This device only" | just this device | none |
| **Cloud** | "Synced across your own devices" | all your devices | the one Cloud row |
| **Shared** | "Collaborate with someone via a code" | you + whoever holds the code | its own album row |

Rules:

- **Exactly one channel per album.** The Cloud row carries only Cloud-mode albums; Shared and
  Local albums are stripped from it. No album is ever double-synced.
- The **Cloud channel** is always your-own-devices, full read-write. Access levels do not
  apply to it.
- **Access level** is a property of an individual Shared album, authored by the owner:
  - **Read-only** → joiners get a **pull-only** channel; their album is force-locked (header
    🔒 closed + disabled, Swaps tab view-only).
  - **Collaborative** → joiners get full read-write, via the merge engine.
- **Role** is local: **owner** (created the share; always read-write; controls the access
  level) or **joiner** (joined someone's code).
- **Joining** a shared album's code adds a *new* album to your collection in Shared/joiner
  mode, then merges.

### Internal note

Code and docs may call the whole-collection channel the "Cloud channel" (user-facing) or
keep the internal identifier `collection`. Either is fine; the two refer to the same thing.

---

## Data model

### Sync metadata store (`figuritas-sync-v1` → **v2**)

`useSyncMeta` moves from a single link to a set of channels:

```ts
type SyncStatus = 'unlinked' | 'syncing' | 'synced' | 'offline' | 'error';

interface LinkMeta {
  code: string;          // raw sync code — LOCAL ONLY, never synced
  codeHash: string;      // SHA-256; keys the server row
  writerId: string;      // per-device id, to ignore our own echoed writes
  lastVersion: number;   // last applied/written server version (optimistic concurrency)
  lastSyncedAt: number | null;
  status: SyncStatus;
}

interface AlbumLink extends LinkMeta {
  albumId: string;                          // local album this channel syncs
  role: 'owner' | 'joiner';
  access: 'collaborative' | 'read-only';    // owner-authored; joiner reads it from the row
}

interface SyncMetaState {
  collection: LinkMeta | null;                 // the Cloud channel (your own devices)
  albumLinks: Record<string, AlbumLink>;       // albumId -> its Shared channel
  privateAlbumIds: string[];                   // Local albums (carved out of Cloud sync)
  localAlbumNames: Record<string, string>;     // albumId -> per-device display alias (never synced)
  bases: Record<string, ChannelPayload>;       // channelKey -> saved base for 3-way merge
}
```

- A channel's key is `'collection'` for the Cloud channel, or the `albumId` for a Shared
  album channel.
- An album's mode is **derived**: in `albumLinks` → Shared; in `privateAlbumIds` → Local;
  otherwise → Cloud. The `AlbumSnapshot` type is unchanged, so the synced blob never carries
  channel identity.
- `bases` persist across reloads so offline edits still merge correctly after a restart.

### Two name layers

- **Album name** — the synced `albumName` inside the `AlbumSnapshot`. Merges normally. A
  read-only joiner cannot change it (write-access gated).
- **Display name on this device** — an optional local alias in `localAlbumNames`, overriding
  the shown name on this device only; never pushed. Editable by anyone (including a read-only
  joiner). Cleared → falls back to the shared name.
- Everywhere a name renders (header, album selector, delete confirm), resolve
  `localAlbumNames[id] ?? snapshot.albumName`.

### Cloud row payloads

Rows gain a small header so a joiner peeking a code knows what it is and how to apply it:

```ts
// Shared album row:
interface AlbumPayload {
  kind: 'album';
  v: 1;
  access: 'collaborative' | 'read-only';
  sharingEndedAt?: number;   // owner soft-revoke marker (see Revocation)
  album: AlbumSnapshot;
}

// Cloud (whole-collection) row:
interface CollectionPayload {
  kind: 'collection';
  v: 1;
  albums: AlbumSnapshot[];        // Cloud-mode albums only
  deletedAlbumIds?: Record<string, number>;  // tombstones: albumId -> deletedAt
  // globals theme / activeAlbumId / importSeq are NOT synced (see below)
}

type ChannelPayload = AlbumPayload | CollectionPayload;
```

- Rows written before this feature lack `kind`; `sanitizeRemote` / peek treat a header-less
  row as `kind: 'collection'` (back-compat). The header is added on the next push.
- **`theme`, `activeAlbumId`, `importSeq` become device-local and are not merged** — a
  deliberate change from today (they currently sync). Appearance and "which album am I
  viewing" are per-device.

---

## The merge engine

A **pure function** `merge3(base, local, remote) → merged` over a `ChannelPayload`. `base` is
the last snapshot this device agreed on for the channel (from `bases`); `local` is its
current state; `remote` is what it just pulled. Pure ⇒ unit-testable with no network.

**Governing principle:** an edit only *one* side made always survives. A tie-break only ever
decides the case where *both* sides changed the *same* key, and every tie-break is
**deterministic and commutative** (independent of which device runs the merge) so all devices
converge to identical state — no ping-pong.

### Per-field rules for an `AlbumSnapshot`

| Field | Merge rule | Same-key collision tie-break |
|---|---|---|
| `counts` (per stickerId) | 3-way per sticker: the side that differs from base wins | `max(local, remote)` — biases toward not losing owned/spares; commutative → converges |
| `swaps` (per swap id) | 3-way per swap vs. base set: add on one side kept; edit kept; delete honored (base distinguishes add-vs-delete, so **no tombstones**) | edit vs. edit → later `closedAt ?? createdAt`, then id; edit vs. delete → keep (favor no data loss) |
| `activityDays` | set **union** (monotonic; base not needed) | n/a |
| `unlockedAchievements` | union by key | keep **earliest** timestamp |
| `firstStickerAt` | **min** of defined values | n/a |
| `completedOn` | earliest non-null | n/a |
| `albumName`, `edition`, `trackCC`, `locked` | 3-way scalar: side that differs from base wins | both changed → a fixed comparator on the two candidate *values* (e.g. lexical) so every device picks the same winner without needing per-field authorship; collisions here are very rare |

> Note on `locked`: it still lives in the `AlbumSnapshot` and merges normally, but a
> read-only joiner's *effective* lock is forced true regardless (see enforcement below).

### Collection-channel merge

- `albums`: **union by album id**; ids present on both sides get the per-album `merge3` above.
- **Carve-out ≠ deletion.** The Cloud merge only *manages* albums this device marks
  Cloud-mode. Albums it does not manage are **left in the row untouched** — never adopted
  locally, never deleted on mere absence. This lets device A move album X to Shared without
  device B (still Cloud-mode for X) reading the absence as a delete.
- **Genuine deletions** travel as explicit `deletedAlbumIds` tombstones (albumId → deletedAt).
  A tombstone removes the album from the row on all devices; a plain absence does not.
- Globals (`theme`, `activeAlbumId`, `importSeq`) are not part of the merge.

### First-join behavior

At first join the base is empty, so every key is an "add" from both sides — i.e. a **union**.
This applies to **both** channel kinds: joining a collaborative album combines both people's
progress, and joining a Cloud code combines both devices' albums. Because a union loses
nothing, it **replaces** today's "keep mine *or* theirs" direction prompt
([peekRemote / linkWithLocal / linkWithRemote](../../../src/sync/engine.ts)) with a
non-destructive merge. (A read-only album join is one-way — the joiner simply adopts the
owner's copy.)

---

## The multi-channel sync engine

`engine.ts` moves from a singleton (one timer/poll/subscription/writerId) to a manager over
the set of active channels — the Cloud link plus each album link.

- **On store change** → for each *writable* channel whose slice changed, schedule a debounced
  push. Read-only-joiner channels are **pull-only** and skipped.
- **Push (per channel):** pull remote → `merged = merge3(base, localSlice, remote)` → if
  `merged ≠ remote`, `sync_push(merged, base_version = remote.version)` → on success save
  `base = merged`, apply merged locally, record the version. On a lost optimistic-concurrency
  race the RPC returns current truth → re-merge and retry.
- **Pull (poll + focus/visibility):** each channel pulls and merges its slice; a per-channel
  `applyingRemote` guard stops the echo loop.
- Each channel keeps its own `writerId` and `lastVersion`. The "slice" is the collection
  payload (Cloud channel) or the single `AlbumSnapshot` (album channel).
- **Read-only joiner channel:** pull-only. Applies the owner's truth; never pushes.
- **Read-only owner channel:** owner is authoritative and does **not** merge in others'
  writes; a lost race re-asserts (overwrites with) owner state. So any stray write is
  transient ("owner's next push wins").

Per-channel debounce timers; concurrency across channels is independent. Offline pushes fire
on the `online` event; pulls on focus/visibility — today's behavior, now per-channel.

---

## Read-only enforcement (client-side)

For an album whose channel is a **read-only Shared album where my role is joiner**, the
effective state is locked regardless of the synced `locked` field:

```
effectiveReadOnly(albumId) = album.locked
  || (link.role === 'joiner' && link.access === 'read-only')
```

- **Engine:** never pushes that channel (pull-only).
- **Header 🔒:** rendered closed, toggle **disabled**, with a hint ("Read-only shared album").
- **Album tab:** sticker cells ignore taps (reuses the existing `locked` path).
- **Swaps tab:** create/edit/close/delete **disabled** — new gating, since `locked` doesn't
  currently touch swaps. A small "Read-only — shared by code owner" badge explains why.

### Security note (deliberate, honest)

Read-only is enforced **client-side only**. There are no accounts and no server-side
authorization: `sync_push` is granted to the anonymous role and checks only the `version`
guard, and the sync code is a bearer capability the joiner already holds (the anon key ships
in the web app). A determined joiner could bypass the UI (dev tools, or calling the RPC
directly) and write to the row. This matches the app's **existing trust model** — today,
whoever holds a code already has full read/write access — and you only hand a read-only code
to someone you'd trust with a code at all. Truly enforcing read-only against a hostile holder
requires accounts + row-level auth (see **Future work**), at which point read-only becomes
server-enforceable and this caveat disappears. Revocation, likewise, terminates *future*
access and notifies; it cannot erase a copy already downloaded to a joiner's device (no
architecture can).

---

## UI / UX

### Settings → Album section (in [EditionDialog.tsx](../../../src/components/EditionDialog.tsx))

Add a **Sharing** control for the current album — a selector **Local · Cloud · Shared**:

- **Cloud** → needs a Cloud code; if none exists, offer to set one up (today's whole-collection
  flow). Carries this album in the Cloud channel.
- **Shared** → pick **access level (Read-only / Collaborative)**, then Create code → shows
  code + QR (reuses [SyncDialog](../../../src/components/SyncDialog.tsx)'s create view). Owner
  can later flip the access level or **Stop sharing**. A per-album status chip
  (Synced / Syncing / Offline) shows here.
- **Local** → carves the album out of Cloud sync entirely.
- Two name fields (from the data model): **Album name** (synced; disabled for read-only
  joiners) and **Display name on this device** (local alias, always editable).

### Settings → Sync section (from [SyncSection.tsx](../../../src/components/SyncSection.tsx))

Reframed to manage only the **Cloud** channel (create/join the Cloud code, status, unlink) —
essentially today's section, lightly adapted.

### Joining a code

One "Enter a code" entry. Peek the row → read `kind`:

- `kind: 'collection'` → today's Cloud-join flow.
- `kind: 'album'` → add a **new** album (role = joiner), apply its access level (force-locked
  if read-only), and merge (combines progress for collaborative).

Codes are visually identical, so the `kind` header — not the code string — decides the flow.

### Album identity across people

The *channel (code)* identifies a shared album, not `album.id`. On join, the joiner adopts the
album under a locally-unique id (reassigned if it collides with an existing local id); the
`code ↔ localAlbumId` mapping lives in the `AlbumLink`. Merge always operates on the channel's
single album.

---

## Revocation (soft only — no backend change)

### Joiner leaves ("Leave shared album")

Purely local: drop the album's `AlbumLink`, stop pushing/pulling. Offer a choice:

- **Keep a copy** → the album converts to a **Local** album (a private fork of where it was), or
- **Leave and delete** → remove it entirely.

Always works; no server coordination.

### Owner stops sharing ("Stop sharing")

- The owner pushes a final payload with `sharingEndedAt` set, then unlinks locally (their
  album reverts to **Local**, or **Cloud** if they choose).
- On the joiner's next pull, seeing `sharingEndedAt`, their app: (1) **notifies** them ("The
  owner stopped sharing '<album>'"), (2) stops syncing that channel, (3) converts their copy
  to a **Local** album.
- Revocation **never** remote-wipes the joiner's local collection — it ends the live link
  only. It cannot un-download a copy already on the joiner's device (fundamental, not a
  limitation of this design).
- Delivery is eventual: a joiner who never reopens the app simply receives no further updates.

---

## Migration

Zustand persist bump `figuritas-sync-v1` v1 → **v2** with a `migrate`:

- The old single link `{ code, codeHash, writerId, lastVersion, lastSyncedAt }` moves into
  `collection` (the Cloud channel).
- `albumLinks`, `privateAlbumIds`, `localAlbumNames`, `bases` start empty; the base re-seeds
  on the next sync.
- Cloud rows written before this feature lack `kind` → treated as `kind: 'collection'` in
  `sanitizeRemote` / peek; the header is added on the next push.
- **No data loss:** today's whole-collection sync keeps working as the Cloud channel.

---

## Edge cases & failure handling

- **Carve-out vs. deletion** — handled by "Cloud merge manages only this device's Cloud-mode
  albums + explicit `deletedAlbumIds` tombstones" (see merge engine). Carve-outs, Local-moves,
  and real deletes are cleanly distinguished.
- **Delete a shared album locally** → unlinks that channel here; the cloud row and other
  participants are unaffected (no accounts to revoke).
- **Owner deletes an album they share** → same as Stop sharing (joiners keep their copies).
- **Read-only joiner edits anyway** (modified client) → owner's next push wins; a stray write
  is transient. Honest residue: between owner pushes, a tampered value could briefly be
  visible to other read-only viewers.
- **Read-only share + the owner's own second device** → a read-only share has a single writer
  (the device that created it). If the owner's *other* device joins the code, it joins as a
  read-only viewer like anyone else (role is set at join). So a read-only-shared album is
  edited from the owner device only. To edit the same album from several of your own devices,
  keep it **Cloud** (own devices, not shared) or share it **Collaborative**. A future accounts
  model resolves this via identity (see Future work).
- **Mode switches** (Cloud→Shared, Cloud→Local, Shared→Cloud, etc.) are metadata changes plus
  a re-seed of the target channel; other channels/rows stay intact.
- **Same code entered twice / already linked** → idempotent no-op.
- **Offline** → per-channel debounced pushes fire on `online`; pulls on focus/visibility.

---

## Testing

- **Pure `merge3` unit tests (the bulk):** counts independent adds / same-key collision /
  removal-vs-base; swaps add-edit-delete; `activityDays` union; achievements earliest;
  scalar convergence; Cloud album-set union; carve-out-not-deleted; tombstone deletion;
  first-join union. Fits the existing [scripts/test-logic.ts](../../../scripts/test-logic.ts)
  + vitest.
- **Payload `sanitize` / `kind` back-compat** (header-less row → collection).
- **Migration v1 → v2** test.
- The networked engine keeps light manual/integration coverage — logic lives in the pure
  functions, matching the repo's current "no component test runner" reality.

---

## Scope

One cohesive feature, but a substantial plan — likely multi-stage:

1. Pure merge engine (`merge3` + slice selection) — pure, fully unit-tested.
2. Payload types + `kind`/back-compat + sanitize.
3. `useSyncMeta` v2 (multi-channel) + migration.
4. Multi-channel engine refactor (per-channel push/pull/merge, read-only pull-only).
5. Per-album sharing UI (mode selector, access level, join disambiguation, two name fields).
6. Read-only gating (Album + Swaps tabs, header lock).
7. Revocation (joiner leave, owner stop-sharing + notification).

**No backend/SQL changes.**

---

## Future work: accounts, auth & IAP

A planned **in-app purchase** mechanism will, in practice, require **user accounts +
row-level auth** — IAP needs a tamper-resistant, restorable, cross-device entitlement tied to
an identity, which means an account plus server-side verification (Supabase RLS keyed on
`auth.uid()`). This is a **separate future spec**, not part of this work.

This design is deliberately **auth-ready** and should stay that way:

- The sync model is a **capability / bearer-token** model (the code grants access to a row).
  Accounts coexist with it or re-back it — they don't invalidate it.
- Rows keyed by `code_hash` can later gain an `owner_uid` column + RLS policies without a
  schema fight; payloads are **versioned** (`kind`, `v`) so new fields slot in.
- `role: owner|joiner` and per-device `writerId` map onto a future `auth.uid()`.
- Supabase Auth is already in-stack (no new vendor).

When auth lands, two limitations of *this* spec resolve naturally: read-only shares become
**server-enforceable** (joiners get SELECT-only), and **selective, enforceable per-joiner
revocation** (plus hard delete / code rotation) becomes possible. Until then this spec
deliberately ships soft, client-enforced equivalents.
