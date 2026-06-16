# Sticker Swap — Design Specification

**Date:** 2026-06-13
**Status:** Final — ready for implementation planning
**Author:** Alejandro (with Claude)

This document is the authoritative design for the Sticker Swap MVP. It is written
to be decomposed directly into an implementation plan: every entity lists its
fields and constraints, every mechanic states its server-side rule, and the build
is already split into independently shippable phases (§15).

---

## 1. Overview

Sticker Swap is a mobile-first web app for collectors of Panini-style sticker
albums. A user tracks which stickers they own, which they are missing, and which
duplicates ("spares") they hold, then finds and negotiates swaps with other users
to complete their album.

The MVP targets the **Panini FIFA World Cup 2026** album (994 stickers) but is
built **album-ready**: a top-level `Album` entity scopes all data, so future
events (a different tournament or year) are added as data, not code.

**Primary goal:** make completing an album fast and social — frictionless
collection tracking, local (proximity-based) discovery, a Numista-style swap
workflow, and a low-friction share loop so collections spread through
WhatsApp/Instagram.

**Non-goals (MVP):** payments/shipping logistics, real-time chat, native mobile
apps, sticker image hosting, anonymous *swapping* (a read-only public collection
page exists, but proposing and seeing contact details require an account).

---

## 2. Key Decisions

| Area | Decision |
|------|----------|
| Stack | **Next.js 16 (App Router, TypeScript) + Prisma + PostgreSQL**, single app |
| Hosting | **Render** — one Web Service + managed Postgres + release seed + one Cron Job (digests, rating reveal, future matview refresh) |
| Email | **Resend** transactional email; high-volume "nearby" alerts are batched into a **daily digest** to respect the free-tier 100/day cap |
| Auth | **Better Auth (v1.6)** — email+password, **server-side sessions in Postgres**, role `USER` / `MASTER`; password hashing configured to **Argon2id** |
| Roles | **Master = admin + featured swap partner**, designated by `MASTER_EMAIL` |
| Device | **Mobile-first, responsive, installable PWA** |
| Sticker visuals | **Numbered tiles**, image-ready (`imageUrl` nullable); `isSpecial` flag for "difíciles" / special editions |
| Visibility | Collections **visible to logged-in users**; **opt-in public read-only page** for sharing; contact revealed only inside a proposal |
| Albums | **Multi-album from day one**; everything scoped by `albumId` |
| Import | **Pluggable format adapters** (Figuritas is the first built-in); a new format = one adapter file + a registry entry. Import is also the onboarding fast-path. |
| Location | **`latitude` / `longitude` columns + Haversine** radius search with a bounding-box prefilter (btree-indexed). Coordinates stored privately; others see only a **bucketed distance + coarse area**. |
| Geocoder | **LocationIQ** default (ToS permits indefinite storage; 5,000 req/day free). Geoapify/Mapbox alternates behind a provider abstraction. **Google excluded** (permits only 30-day caching per end user, not the permanent storage this app needs); **Nominatim** not for production. |
| Trust & safety | **MVP-core**: post-swap **double-blind ratings (1–5 + comment)**, **report** + **block**, **suspend/ban with server-side session revocation**, completed-swap count, safe-meetup guidance including a counterfeit check. Strangers meet in person — this is foundational. |
| Inventory integrity | Spares are **reserved** while committed to active proposals; **all `quantity` mutations are atomic and floored at `1 + committed`** server-side (no double-promising or deleting a committed spare). |
| Discovery & growth | **Want-list priority**, **cold-start onboarding**, and an **opt-in public collection page** are MVP — adoption depends on them. |
| i18n | **English and Spanish both ship at MVP**; no hard-coded UI copy, locale is data. Default locale is `es` (target market). Further locales are translated catalogs. |

---

## 3. Domain Model

### 3.1 Canonical sticker identity

From the source data, **`(shortName, number)` is globally unique within an
album**, because numbers never repeat under a short name (e.g. `FWC` runs
`00,1–19` across its three emoji sub-sections; each country runs `1–20`; `CC`
runs `1–14`). This yields a canonical **code** per sticker: `FWC-00`, `MEX-5`,
`CC-14`. The code is the join key for imports, matching, and swaps.

> A section's emoji is **display metadata**, not identity. `FWC` is three
> `Section` rows (🏆/🌎/📜) sharing a short name; numbers disambiguate which one a
> code belongs to.

### 3.2 Collection state — one integer

A user's relationship to a sticker is a single `quantity`:

| quantity | meaning | UI |
|---|---|---|
| (no row) / 0 | missing | dashed gray tile |
| 1 | owned, no spare | green tile ✓ |
| 2 | owned + 1 spare | blue tile, badge `+1` |
| n | owned + (n−1) spares | blue tile, badge `+(n−1)` |

**Spares held = `quantity − 1`.** Missing is the **absence** of a row (no zero
rows stored).

**Spares available to offer = `quantity − 1 − committed`**, where `committed` is
the number of copies of that sticker the user has already promised in **active
proposals** (`PROPOSED` or `ACCEPTED`) — see §7.0. This prevents the same
physical spare from being promised in two swaps at once.

**All quantity mutations are atomic and reservation-aware.** Each runs as a
single server-side SQL statement inside a transaction — never read-modify-write —
so concurrent batches (§4) and completion auto-decrements (§7) cannot race or
under-flow:

- **Increment:** `UPDATE … SET quantity = quantity + :delta`.
- **Decrement:** `SET quantity = GREATEST(quantity + :delta, 1 + :committed)`,
  where `:committed` is computed in the same transaction (sum of the user's
  active-proposal `SwapItem` quantities for that sticker). When `committed = 0`
  the floor is 0 and the row is deleted at 0. **A committed spare can never be
  decremented away.** The endpoint returns the *actual applied quantity* so the
  optimistic client (§4) can reconcile if a decrement was clamped.

### 3.3 Entities

15 tables: **12 domain models** plus **Better Auth's `session`, `account`, and
`verification`** tables. Better Auth's `user` table **is** the `User` model
below, extended with the profile/location/trust fields; credentials (the Argon2id
hash) live in Better Auth's `account` table.

```
Album ─1:N─ Section ─1:N─ Sticker ─1:N─ CollectionEntry ─N:1─ User
                            │
                            └─1:N─ SwapItem ─N:1─ SwapProposal ─N:1─ User (initiator/responder)
                                                       ├─1:N─ SwapMessage
                                                       └─1:N─ SwapRating ─N:1─ User (rater/ratee)

User ─1:N─ Notification
User ─1:N─ UserBlock   (blocker / blocked)
User ─1:N─ Report      (reporter; targets a user / proposal / message)
User ─1:N─ session · account · verification   (Better Auth)
```

**Album** — `id`, `slug`, `name`, `year`, `emoji`, `isActive`, `orderIndex`.

**Section** — `id`, `albumId`, `shortName`, `emoji`, `displayName`, `orderIndex`.
Unique `(albumId, shortName, emoji)`.

**Sticker** — `id`, `sectionId`, `albumId` (denormalized for fast scoped
queries), `number` (string, preserves `"00"`), `code` (`"MEX-5"`), `orderIndex`,
`imageUrl?`, `represents?`, `isSpecial` (bool, default false — "difícil" /
special-edition flag, seeded from album data), `variant?` (display metadata,
e.g. `"foil"`; `null` = base). Unique `(albumId, code)` and `(sectionId, number)`.

> **Parallels are out of MVP scope** (orange-border / gold-flood editions live
> outside standard packs). They are a *distinct collectible sharing a number*,
> which `(shortName, number)` identity cannot represent — so when added they
> become a **variant dimension** on the code (e.g. `MEX-5#gold`), not a schema
> change. `variant` is reserved for that path. `isSpecial` is an orthogonal
> *display/economy* flag on the base sticker.

**User** (Better Auth `user`, extended) — `id`, `email` (unique),
`emailVerified?`, `displayName`, `username?` (unique slug for the public URL, set
on first share), `country?`, `role` (`USER`|`MASTER`), `contactInfo?`,
`contactType?`, `isDiscoverable` (default true), `publicPageEnabled`
(default false — opt-in read-only page, §6.4), `createdAt`. **Location** (§3.4):
`latitude` (float8?), `longitude` (float8?), `locationLabel?` (coarse display
string, e.g. "Midtown, Atlanta"), `searchRadiusMeters` (default ≈ 8047 / 5 mi),
`locationUpdatedAt?`. **Trust** (§8): `completedSwapCount` (denormalized),
`ratingAverage?`, `ratingCount` (maintained from *visible* `SwapRating`s),
`bannedAt?`, `suspendedUntil?` (Master moderation, enforced per request, §13).
**Preferences & lifecycle**: `locale` (default `es`), `emailPrefs` (Json —
per-type toggles, §13), `unsubscribedAt?`, `deletedAt?` (soft-delete /
anonymization, §13).

**CollectionEntry** — `id`, `userId`, `stickerId`, `quantity` (≥1),
`wantPriority` (int, default 0; `1` = "most wanted", biases matching & alerts,
§6.1/§6.3). Unique `(userId, stickerId)`. Indexed on `(stickerId)` for matching
and `(userId, wantPriority)` for the want-list view.

**SwapProposal** — `id`, `albumId`, `initiatorId`, `responderId`,
`status` (`PROPOSED`|`ACCEPTED`|`DECLINED`|`CANCELLED`|`COMPLETED`),
`initiatorConfirmed` (bool), `responderConfirmed` (bool), `createdAt`,
`updatedAt`.

**SwapItem** — `id`, `proposalId`, `stickerId`,
`direction` (`INITIATOR_GIVES`|`RESPONDER_GIVES`), `quantity` (default 1).

**SwapMessage** — `id`, `proposalId`, `senderId`, `body`, `createdAt`.

**Notification** — `id`, `userId`, `type`, `proposalId?`, `stickerId?` (for
`STICKER_AVAILABLE_NEARBY`, §6.3), `readAt?`, `emailedAt?`, `createdAt`. Mirrored
to email via Resend subject to `emailPrefs` and the digest policy (§13).

**SwapRating** — `id`, `proposalId`, `raterId`, `rateeId`, `score` (1–5),
`comment?`, `createdAt`, `visibleAt?` (double-blind reveal, §8.2 — hidden until
both parties rate or 14 days pass; only ratings with `visibleAt ≤ now` count
toward rollups and appear on profiles). Unique `(proposalId, raterId)`.

**UserBlock** — `id`, `blockerId`, `blockedId`, `createdAt`. Unique
`(blockerId, blockedId)`. A block hides both users from each other's
discovery/matching/public pages and prevents new proposals.

**Report** — `id`, `reporterId`, `reportedUserId?`, `proposalId?`, `messageId?`,
`reason` (enum: no-show, abusive, scam/never-sent, spam, counterfeit, other),
`details?`, `status` (`OPEN`|`REVIEWED`|`ACTIONED`|`DISMISSED`), `createdAt`.
Reviewed by the Master.

### 3.4 User location (proximity, privacy-preserving)

Precise coordinates are **stored privately** (`latitude` / `longitude` float
columns) and are **never exposed** to other users. A user sets location two ways:
**"use my current location"** (browser geolocation) **or** typing a **city /
postal code** the server geocodes (LocationIQ, §12).

What others see is derived through two privacy steps:

1. **Grid-snapped public point.** Any distance another user sees is computed from
   a **coarse grid-snapped** version of the target's coordinates (≈1 km cells,
   deterministic per user). The owner's own radius searches use precise
   coordinates; everyone else only resolves a target to its ~1 km cell.
2. **Bucketed display.** The figure shown is a **bucket**, never a precise
   decimal: `<1 mi`, `1–3 mi`, `3–5 mi`, `5–10 mi`, `10–25 mi`, `25 mi+`, plus
   the coarse `locationLabel`.

> Showing a precise "2.3 mi away" that shifts as a viewer moves would let a
> malicious user **trilaterate** a target's home (the well-known dating-app
> leak). Grid-snapping plus bucketing bounds the worst-case leak to a ~1 km cell
> — appropriate for an app that pairs strangers for in-person meetups.

Users with **no location** are placed in the **"Anywhere"** bucket so the app is
useful before a location exists.

---

## 4. Collection Mechanics (manual method)

State machine over `quantity`, one source of truth:

```
        tap            tap            tap
MISSING ───► OWNED ───► OWNED+1 ───► OWNED+2 ───► …
 (none)      (qty 1)    (qty 2)      (qty 3)
   ▲           │            │            │
   └──────── press & hold (qty − 1, floors at MISSING or 1+committed) ────┘
```

- **Tap** → `quantity += 1`.
- **Press & hold** (~450 ms long-press; right-click on desktop) → `quantity − 1`,
  stopping at **missing** (row deleted at 0) **or at `1 + committed`** if copies
  are reserved in active proposals (§3.2) — a promised spare can't be deleted.
- **Discoverable decrement affordance** — long-press/right-click is not
  self-evident, so the grid also has a toggleable **edit mode** with explicit
  `+` / `−` controls per tile. Both paths hit the same API.
- **Mark "most wanted"** — long-press menu (or edit mode) on a *missing* tile
  toggles `wantPriority`; a ★ marks prioritized needs. Feeds matching (§6.1) and
  nearby alerts (§6.3).
- **Optimistic UI** — the tile updates instantly; taps are **debounced and
  batched** into one `PATCH /api/collection` carrying `{ stickerId, delta }[]`.
  The response returns the **applied quantities**; if a decrement was clamped at
  `1 + committed`, the tile reconciles to the server value. Failed sync rolls the
  tile back.

**Accessibility (state must not be color-only — WCAG 1.4.1):** each tile carries
a **non-color indicator** as well as color — missing = dashed border + empty;
owned = solid border + **✓ glyph**; spare = solid border + **`+N` badge**;
most-wanted = **★**. The grid is keyboard-navigable; tiles are labelled for
screen readers (`"MEX-5, owned, 1 spare, most wanted"`); the long-press action
has an accessible-name equivalent via the edit-mode `−` control.

**Offline-first:** collection editing is the canonical offline use case (a
crowded swap meet / kiosko with poor signal). The PWA service worker **queues
unsynced deltas** in IndexedDB and flushes them via Background Sync when
connectivity returns; tiles reflect the locally-applied state meanwhile. Writes
are commutative deltas, so replay needs no server-side reconciliation — the
server still applies the `1 + committed` floor on flush and the client reconciles
from the response.

---

## 5. Import (text method) — pluggable adapters & onboarding fast-path

Import is an **adapter (strategy) layer** so new source formats can be added
without touching the apply pipeline:

```
raw text ──► FormatParser (chosen from registry) ──► ParseResult ──► shared Applier
             e.g. "figuritas"                          (normalized)      │
                                                                  preview → confirm → apply
```

- **`FormatParser` interface** — `parse(text, mode) → ParseResult`. Each format
  registers under an id; the import wizard shows a **"Source format" picker**
  above the mode selector. Adding a format = one adapter file + a registry entry;
  preview, skip-report, confirm, and apply never change.
- **Normalized `ParseResult`** — `{ entries: [{ shortName, number, copies,
  intent }], skipped: string[], warnings: string[] }`, where
  `intent ∈ { own, need, swap }`.
- **Identity mapping** — each adapter may carry an optional mapping to our
  canonical `SHORTNAME-number` codes; anything unmappable lands in `skipped[]`.
- The **Applier** is format-agnostic: it targets the **currently selected album**
  and shows a **preview diff** before committing.

### 5.1 First built-in adapter — Figuritas

Consumes the line format `SHORTNAME EMOJI: n, n (×M), …`. The emoji is ignored on
input (it matches by `shortName` + `number`); `(×M)` sets copies, absent `×M`
means one.

| Mode | Each listed sticker | Unlisted stickers |
|------|---------------------|-------------------|
| **Own** | `quantity = max(current, 1)`; `(×M)` → `1+M` | unchanged |
| **Need** | set to **missing** | **set to owned (qty 1)** — "own everything except these" |
| **Swap** | `quantity = 1 + M` (owned + M spares) | unchanged |
| **Combined** | a `Swaps` header line splits the paste: Need/Own above, Swap below | — |

**Safety rails (apply pipeline, all adapters):**
1. **Need is destructive** (it marks all unlisted stickers owned). The wizard
   shows an explicit confirmation with a preview diff ("this marks N stickers as
   owned").
2. **Unknown / unmappable codes** are collected and reported back as skipped
   lines — never silently applied.

### 5.2 Onboarding fast-path

Import is surfaced as **step 2 of onboarding** ("Already have a list in WhatsApp?
Paste it here") via the Figuritas adapter — zero to a populated collection in
about 30 seconds. See §6.5 for the full cold-start flow.

---

## 6. Matching ("Find swaps")

### 6.1 Sticker overlap

For the current user vs. each other **discoverable, non-blocked** user in the
**same album** (`UserBlock` in either direction excludes the pair):

- **They give you** = `your_missing ∩ their_offerable_spares`
- **You give them** = `your_offerable_spares ∩ their_missing`
- **`offerable_spares`** excludes copies committed to active proposals (§3.2 /
  §7.0), so matches only show spares actually available.
- **Score** ranks matches: weights **mutual** (two-way) swaps highest;
  **multiplies the contribution of a sticker you've flagged `wantPriority`**
  (×1.5) so partners who can complete your most-wanted needs surface first; and
  adds a secondary nudge from the partner's **rating / completed-swap count**
  (§8.2). New (unrated) users are not penalized.
- The **Master** is surfaced as a **featured** partner.

Implemented as indexed SQL joins at MVP scale. Scale path: precompute
`user_spares` / `user_needs` as a nightly **materialized view** refreshed by the
Cron Job (§12) — no schema change required.

### 6.2 Proximity filter (Haversine)

Discovery is **local-first**. "Find swaps" carries a **radius control** —
**1 / 5 / 10 / 25 / 50 mi / Anywhere** — defaulting to the user's
`searchRadiusMeters` (5 mi). Distance uses a **bounding-box prefilter plus exact
Haversine**:

1. Compute a lat/lng bounding box from the center and radius
   (`Δlat = r/111320`, `Δlng = r/(111320·cos(lat))`), filtered against a **btree
   composite index** on `(latitude, longitude)` — this cheaply eliminates almost
   everyone.
2. Compute exact great-circle distance (Haversine) for the survivors and keep
   those `≤ r`, ordered by distance.

Runs via `prisma.$queryRaw` with a `Prisma.sql` template (cast inputs to
`::float8`). At realistic MVP scale (hundreds to low thousands of located users)
this is comfortably within budget on any Postgres, with no extensions required.

- Match cards show **bucketed distance + coarse area** (§3.4), never a precise
  figure.
- Within the radius, results rank by overlap **score**, with a **"sort by
  distance"** toggle (sort uses the precise stored distance server-side; only the
  *display* is bucketed).
- **Auto-widen:** if a search returns **0 results inside the chosen radius**, the
  app silently re-runs at "Anywhere" and shows a banner ("No swaps within X mi —
  showing everyone. Widen your radius in Settings."). Users with no location are
  always in the "Anywhere" bucket.

All spatial logic lives behind `src/server/geo/`, so a future migration to
PostGIS for large-scale proximity (Appendix B) is a localized change.

### 6.3 "Needed sticker nearby" alerts

A high-retention loop built from pieces the app already has (matching +
`Notification` + Resend). **It does not run on the collection write path** — §4
is the hot, offline-batched path, and a reverse-geo fan-out there would slow every
tap and risk email spam. Instead:

- A **scheduled job** (Cron, §12) scans recently-gained spares against
  discoverable users whose **own search radius** covers the spare-holder and who
  are **missing** that sticker, emitting `STICKER_AVAILABLE_NEARBY` notifications.
  **`wantPriority` needs are prioritized** in the scan and the copy.
- In-app notifications appear on next poll; **email is delivered as a daily
  digest** ("3 stickers you need are now available nearby"), honoring
  `emailPrefs` and backing off the Resend 100/day cap (§13). De-duped and
  throttled per user/sticker.
- At scale this batches off the same nightly materialized view (§6.1).

### 6.4 Public collection / swap-list page (opt-in)

A **read-only** page at `/u/[username]/[albumSlug]` renders a user's **missing**
and **offerable-spare** lists for an album, plus album progress, with a **"Join to
swap"** CTA. Purpose: a shareable link a collector can drop into a WhatsApp group
or Instagram story — every share is an acquisition funnel.

- **Opt-in:** gated by `publicPageEnabled` (default false) and a set `username`. A
  blocked viewer (if logged in) is excluded as elsewhere.
- **No contact info, no proposals** from this page — those require an account and
  an active proposal (§7.1). The page is **`noindex`** (link-shareable, not
  search-indexed) so usernames aren't exposed via SEO.
- Rendered as a cached snapshot, regenerated on collection change.

### 6.5 Cold-start onboarding

A new user otherwise faces an empty 994-tile grid and zero local matches.
Onboarding delivers first value fast:

1. **"How do you want to start?"**
   - **Paste my list** → Import fast-path (§5.2), Figuritas adapter.
   - **I have most of the album** → applies Figuritas **Need mode with an empty
     list** ("everything owned"), then the user removes what they're missing.
   - **I'm just starting** → default empty grid; tap stickers in as you stick
     them.
2. **Set location** (optional, skippable) — drives proximity; if skipped, the
   user lives in the "Anywhere" bucket.
3. **Auto-widen on zero matches** (§6.2) so the Swaps tab is never empty when
   partners exist anywhere.
4. **Seeded Master spares** (operational, not code) — the featured Master account
   carries a broad spread of spares so early users always have at least one match.

---

## 7. Swap Lifecycle

```
PROPOSED ──accept──► ACCEPTED ──both confirm received──► COMPLETED
   │                    │
 decline/             cancel
 counter                │
   ▼                    ▼
DECLINED            CANCELLED
```

### 7.0 Spare reservation (inventory integrity)

A `SwapItem` on an **active proposal** (`PROPOSED` or `ACCEPTED`) **reserves** the
giver's copies. `committed` (§3.2) is exactly the sum of a user's active-proposal
`SwapItem` quantities for that sticker, so:

- A proposal can only be **created/accepted** if, in a transaction, every
  `INITIATOR_GIVES` / `RESPONDER_GIVES` item still has
  `quantity − 1 − committed ≥ item.quantity` for its giver. Otherwise it is
  rejected with "that spare is no longer available."
- Reaching `DECLINED` / `CANCELLED` **releases** the reservation. `COMPLETED`
  consumes it via the decrement below.
- **Manual collection decrements respect the same reservation** (§3.2 floor at
  `1 + committed`), so a promised spare can't be deleted out from under a swap.

### 7.1 Flow

1. **Initiator** builds two baskets (pre-filled from the intersections, both
   adjustable) and sends → `PROPOSED`, subject to the **open-proposal cap** (§8.5)
   and the reservation check (§7.0). A **swap-equity bar** (§7.2) shows the
   give/receive balance. The responder gets an in-app notification + email.
2. Either party posts **comments** and may **edit items** (counter-offer) until
   someone **Accepts** → `ACCEPTED`. Item edits re-run the reservation check.
3. On physical exchange, **both** mark "received" → `COMPLETED`. On completion the
   app **atomically decrements both sides' `quantity`** for the traded stickers
   (single floored SQL transaction, §3.2) and bumps each `completedSwapCount`.
   Either side may **Cancel/Decline** before completion.
4. **Contact info** is revealed only **inside an active proposal**; the first
   reveal shows the **safe-meetup panel** (§8.4).
5. After `COMPLETED`, each party is prompted to **rate** the other (1–5 + optional
   comment, §8.2). **Double-blind:** neither rating is visible until both submit or
   14 days pass.

### 7.2 Swap-equity display

The proposal builder and proposal view show a prominent **"You send N · You
receive M"** bar. Imbalanced offers (e.g. 4:1) are **visually flagged but not
blocked** — collectors legitimately trade rare-for-common. This surfaces the
community 1:1 norm without platform enforcement. UI-only; uses existing `SwapItem`
quantity/direction.

---

## 8. Roles, Permissions & Trust

### 8.1 Roles

- **USER** — manage own collection; discover, propose, and complete swaps;
  rate/report/block; edit own profile/visibility; opt into a public page.
- **MASTER** (single account where `email === MASTER_EMAIL`) — everything a USER
  can do, **plus**: manage the universe (create/edit `Album`, `Section`,
  `Sticker`; set `isSpecial`); **review the report queue** and act on abuse
  (warn / **suspend** / **ban**); shown as a **featured** partner. Set
  automatically at registration by comparing to `MASTER_EMAIL`.

> This app pairs strangers by approximate location and reveals contact info for
> in-person meetups. Trust & safety is **MVP-core**, modelled on Numista's public
> swap-rating system.

### 8.2 Ratings & reputation (double-blind)

After a swap reaches `COMPLETED`, **each party may rate the other once**
(`SwapRating`, 1–5 + optional comment). Ratings are **double-blind**: a rating's
`visibleAt` is set when **the counterparty also rates** or **14 days** elapse,
whichever comes first (the Cron Job, §12, flips time-expired ones). Only
**visible** ratings appear on profiles and roll up into `ratingAverage` /
`ratingCount`. New users start unrated ("New collector"), not penalized. Visible
ratings **weight match ranking** (§6.1).

### 8.3 Report, block, suspend & ban

- **Report** — on any profile, proposal, or message. Predefined reasons (no-show,
  abusive, scam/never-sent, spam, counterfeit, other) + free-text → a `Report`
  row in the Master's queue. Allowed regardless of swap state.
- **Block** — hides both users from each other's discovery/matching/public pages
  and prevents new proposals or messages. Mutual and immediate.
- **Suspend / ban** (Master) — sets `suspendedUntil` or `bannedAt` on the `User`.
  **Enforced immediately**: the action calls Better Auth's
  `revokeAllUserSessions(userId)` (kills active sessions instantly) and every
  authenticated request checks `bannedAt` / `suspendedUntil` (§13), so there is
  **no session-lifetime bypass window**.

### 8.4 Safe-meetup guidance

The first time contact info is revealed inside a proposal (§7.1), a **dismissible
safe-meetup panel** shows: meet in a public place, bring a friend, **verify
stickers before handing yours over** — *genuine Panini stickers have a matte
printed back; many fakes have glossy backs or misaligned borders* — and never
share home address or payment details. Static copy, localized like all UI strings.

### 8.5 Trust signals & abuse limits

- **`completedSwapCount`** and **rating** surface on match cards and profiles as
  lightweight trust signals.
- **Open-proposal cap** — at most **N active outgoing proposals** (`PROPOSED` +
  `ACCEPTED`) at once (default **10**, configurable via `OPEN_PROPOSAL_CAP`).
- **Rate limits** on proposal creation, messaging, reports, and ratings (§13).

---

## 9. UI Architecture

**Shell:** mobile-first PWA with a 5-tab bottom nav: **Album · Swaps · Import ·
Inbox · Me**. An **album switcher** sits at the top of the Album tab; progress,
import, and matching all read the selected album. First run shows the **cold-start
onboarding wizard** (§6.5).

**Screens:**
- **Album** — overall progress bar **with a "Share" button** (copies the public
  link + a pre-written WhatsApp/IG message, e.g. "73% done — here's what I need:
  …"); per-section cards of numbered tiles with **color + non-color**
  missing/owned/spare/most-wanted states (§4); tap/hold **and** edit-mode `±`;
  **most-wanted ★ toggle**; section progress + spare count; an **offline/sync
  indicator** when deltas are queued.
- **Import** — **source-format picker** + mode selector (own/need/swap/combined),
  paste box, preview diff, skipped-codes report, confirm. Also the onboarding
  fast-path entry.
- **Swaps** — **radius control** + sort toggle (best match / distance); ranked
  match list (avatar, name, **bucketed distance + area**, "N you need / N they
  need", score, **rating + completed-swap count**, ★ if it completes a
  most-wanted, featured Master); tap → **proposal view** with both baskets,
  **swap-equity bar**, comment thread, status pill, contextual actions, **revealed
  contact + safe-meetup panel**, **report/block**, and a **rate-partner** prompt
  on completion. The empty/zero-match state explains auto-widen.
- **Public page** (`/u/[username]/[album]`, logged-out OK) — read-only
  needs/spares + progress + "Join to swap" CTA (§6.4).
- **Profile** (any user) — display name, country, **rating average + count,
  completed swaps**, visible rating comments; **report** / **block**.
- **Inbox** — notifications (swap proposed/accepted/message/completed,
  **sticker-available-nearby**).
- **Me** — profile (display name, **username**, country, contact + type),
  **location** ("use my location" / city or postal code, preferred radius),
  visibility toggle, **public-page toggle**, **language/locale**, **notification
  preferences** (per-type email toggles + global unsubscribe), **account**
  (password, **export my data**, **delete account**), sign out.
- **Admin → Universe** (MASTER only) — manage albums, sections, stickers,
  `isSpecial`.
- **Admin → Reports** (MASTER only) — review the `Report` queue; warn / suspend /
  ban; resolve items.

**Rendering:** Server Components for data-heavy pages; Client Components for the
interactive album grid, import wizard, proposal view, and onboarding wizard. The
batch collection endpoint is a **route handler** (not a Server Action) so the
offline Background Sync queue can replay it via `fetch` (§12).

**i18n:** all UI copy comes from a **locale message catalog** (no hard-coded
strings); the active locale is read from `User.locale`. **English and Spanish both
ship at MVP.**

---

## 10. API Surface (representative)

- `POST /api/auth/*` — Better Auth handlers (register, login, logout, verify,
  reset).
- `PATCH /api/collection` — batched `{ stickerId, delta }[]` updates; returns
  applied quantities (reservation-clamped, §3.2). Route handler (offline-replay).
- `PATCH /api/collection/priority` — set/clear `wantPriority` for stickers.
- `POST /api/import` — `{ albumId, format, mode, text }` → preview;
  `commit=true` applies. `GET /api/import/formats` — list adapters.
- `GET  /api/matches?albumId=&radius=&sort=` — ranked matches within radius
  (auto-widen on empty); distances bucketed in the response.
- `PUT  /api/me/location` — `{ lat,lng }` or `{ query }` (geocoded) → store point
  + `locationLabel`; `searchRadiusMeters` update.
- `POST /api/swaps` — create proposal (open-proposal cap §8.5 + reservation §7.0);
  `GET /api/swaps` — list mine.
- `PATCH /api/swaps/:id` — status transitions, item edits (re-runs reservation
  check), confirm-received (atomic decrement on completion).
- `POST /api/swaps/:id/messages` — add comment.
- `POST /api/swaps/:id/rating` — rate the other party after `COMPLETED`
  (double-blind, §8.2).
- `GET  /api/users/:id` — public profile (display name, country, **visible**
  rating avg/count, completed swaps, visible comments).
- `GET  /u/:username/:albumSlug` — **public read-only** collection page (§6.4), no
  auth, `noindex`.
- `POST /api/reports` — report a user/proposal/message.
- `POST /api/blocks` — block; `DELETE /api/blocks/:id` — unblock.
- `GET/PATCH /api/notifications` — list / mark read.
- `GET/PUT  /api/me/preferences` — locale, per-type `emailPrefs`, global
  unsubscribe, `publicPageEnabled`, `username`.
- `GET  /api/me/export` — download all my data (GDPR portability).
- `DELETE /api/me` — delete/anonymize (GDPR erasure; sets `deletedAt`, scrubs PII,
  retains anonymized swap/rating history for counterparties).
- Admin: `POST/PATCH /api/admin/albums|sections|stickers` (incl. `isSpecial`);
  `GET/PATCH /api/admin/reports` — review queue, act on abuse (revokes sessions,
  §8.3). MASTER only.

All mutations validated with **Zod v4**; role/ownership guarded server-side.
**Rate-limited:** auth, import, geocode, proposal creation, messaging, reports,
and ratings (§13).

---

## 11. File Structure

```
sticker-swap/
├─ render.yaml                # web service + Postgres + release seed + cron job (§12)
├─ prisma/
│  ├─ schema.prisma           # 12 domain models + Better Auth tables; lat/lng float columns
│  ├─ migrations/
│  └─ seed.ts                 # parses data/albums/*.txt → idempotent upsert (incl. isSpecial)
├─ data/albums/
│  └─ world-cup-2026.txt      # canonical universe (994 stickers, incl. CC 🥤; specials flagged)
├─ public/manifest.webmanifest, icons/
├─ src/
│  ├─ app/
│  │  ├─ (auth)/  login · register · reset
│  │  ├─ (app)/   onboarding · album · import · swaps/[id] · inbox · me
│  │  ├─ u/[username]/[albumSlug]/   # public read-only collection page (noindex)
│  │  ├─ admin/   universe/ · reports/
│  │  └─ api/     auth/[...all] · collection · import · matches · swaps/[id]/messages · …
│  ├─ proxy.ts                # Next 16 edge middleware: session + ban/suspend guard
│  ├─ server/                 # framework-agnostic, unit-tested domain layer
│  │  ├─ import/
│  │  │  ├─ types.ts          # FormatParser interface + ParseResult contract
│  │  │  ├─ registry.ts       # id → adapter map (the only file new formats touch)
│  │  │  ├─ apply.ts          # PURE format-agnostic applier (own/need/swap)
│  │  │  └─ adapters/figuritas.ts
│  │  ├─ matching/            # overlap query + scoring (wantPriority) + Haversine radius + nearby-alert scan
│  │  ├─ geo/                 # haversine + bounding-box + grid-snap/fuzzing + bucketing (PostGIS drop-in point)
│  │  ├─ swaps/               # state machine + reservation + atomic floored decrement + equity calc
│  │  ├─ collection/          # quantity service (atomic deltas, 1+committed floor)
│  │  ├─ trust/               # double-blind ratings, reports, blocks, ban/suspend, abuse limits
│  │  ├─ auth/                # Better Auth config + role guard + ban enforcement
│  │  ├─ notifications/       # in-app + Resend; per-event (transactional) vs daily digest
│  │  └─ jobs/                # cron worker: digest send, rating-reveal sweep, (scale) matview refresh
│  ├─ i18n/                   # locale message catalogs (en + es)
│  ├─ components/             # AlbumGrid, StickerTile, ImportWizard, OnboardingWizard, MatchCard, ProposalView, SwapEquityBar, RadiusControl, LocationPicker, RatingWidget, ReportDialog, BlockButton, SafeMeetupPanel, NotificationPrefs, SyncIndicator, ShareButton, PublicCollectionPage, WantPriorityToggle
│  ├─ lib/                    # prisma client, zod schemas, utils
│  └─ types/
└─ tests/
   ├─ unit/                   # adapters, applier, matching+scoring, swap state machine, geo (haversine/bucketing), reservation floor
   └─ e2e/                    # Playwright golden path (MVP+)
```

The `src/server/*` domain layer is deliberately framework-free so each unit is
testable in isolation and could later be extracted into its own service. Spatial
and reservation logic have dedicated unit tests; spatial/reservation integration
tests run against a real Postgres (Testcontainers / CI Postgres service), since
Haversine SQL and transactional floors can't be meaningfully mocked.

---

## 12. Deployment — Render

- **`render.yaml` blueprint**: one **Web Service** (`next build` / `next start`,
  Node 20+), one **managed Postgres**, a **release command**
  (`prisma migrate deploy && prisma db seed`, idempotent), and **one Cron Job**
  running the jobs worker (§11 `server/jobs`): **notification digest send**,
  **rating-reveal sweep** (flip `visibleAt`, recompute rollups), and — at scale —
  the **materialized-view refresh** (§6.1). Runs daily at minimum; digest cadence
  honors the Resend cap.
- **Location storage**: two `float8` columns (`latitude`, `longitude`) with a
  **btree composite index on `(latitude, longitude)`**; proximity is
  bounding-box + Haversine via `$queryRaw` (`::float8` casts). No database
  extensions required.
- **Auth (Better Auth)**: sessions and credentials in Postgres; password hashing
  configured to **Argon2id**; `BETTER_AUTH_SECRET` signs/encrypts. Server-side
  session revocation backs ban/suspend (§8.3).
- **Next.js 16 notes**: middleware is **`proxy.ts`**; `cookies()` / `headers()` /
  `params` are **async**; caching is **opt-in** (`"use cache"`) — fine, this app
  is almost entirely dynamic. Verify **serwist/next-pwa** compatibility with
  Next 16 + Turbopack **before Phase 2** (service-worker injection).
- **Env vars**: `DATABASE_URL`, `BETTER_AUTH_SECRET`, `APP_URL`, `MASTER_EMAIL`,
  `RESEND_API_KEY`, `EMAIL_FROM`,
  `GEOCODER_PROVIDER` (default `locationiq`; options `locationiq` | `geoapify` |
  `mapbox` | `nominatim` — Nominatim not for production; **Google excluded**),
  `GEOCODER_API_KEY`, `OPEN_PROPOSAL_CAP` (default 10).
- **Pre-deploy prerequisite**: **verify the Resend sender domain** (DKIM/SPF DNS)
  before first deploy — the app cannot send email until then. Free tier:
  3,000/mo, **100/day**, 1 domain (the daily cap is why high-volume "nearby"
  alerts are batched into a digest, §6.3/§13; first paid step is Resend Pro,
  50k/mo, no daily cap).
- **Scale path**: stateless web tier → horizontal scaling. Render Postgres has
  **no built-in pooler** — add **PgBouncer in session mode** as a Render private
  service when scaling beyond one instance (session mode preserves Prisma's
  prepared statements; Prisma Accelerate is for serverless, not this
  architecture). Matching → materialized view; proximity → PostGIS (Appendix B).

---

## 13. Security Baseline

- **Better Auth** sessions: httpOnly + SameSite cookies, server-side session
  records in Postgres, **Argon2id** password hashing, built-in CSRF and session
  rotation, rolling TTL (~7 days). **Sessions are revocable** — ban/suspend
  (§8.3) calls `revokeAllUserSessions` and every request additionally checks
  `bannedAt` / `suspendedUntil` (one indexed read in `proxy.ts`), so there is no
  ban-bypass window.
- Zod v4 validation on every mutation; server-side role/ownership checks.
- **Rate limiting** on auth, import, geocode, proposal creation, messaging,
  reports, and ratings.
- **Trust & safety**: report queue + block enforcement; blocked pairs excluded
  from discovery, matching, **public pages**, proposals, and messaging.
- Contact info disclosed only within an active proposal.
- **Location privacy**: precise coordinates stored privately, never returned;
  others see only a **grid-snapped, bucketed distance + coarse label** (§3.4),
  blocking trilateration.
- **Email consent**: per-type `emailPrefs` + a one-click **unsubscribe** link in
  every email; transactional sends honor both. High-volume nearby alerts are
  **batched into a daily digest** to respect the Resend 100/day cap.
- **GDPR**: `GET /api/me/export` (portability) and `DELETE /api/me` (erasure —
  sets `deletedAt`, scrubs PII to a tombstone, retains anonymized swap/rating
  history so counterparties' records stay intact).

---

## 14. Scalability Notes

- **Multi-album** baked in → new events are data (`Album` row + text file).
- **Pluggable import adapters** → new source formats are one adapter + registry
  entry, no change to the apply pipeline.
- **Public page + share loop** is the organic growth channel; cached snapshots
  keep it cheap.
- **Stateless app tier** scales horizontally on Render; add **PgBouncer (session
  mode)** once web replicas exceed one. Server-side sessions live in Postgres
  (read-through; cache later if needed).
- **Matching** graduates from live SQL to a nightly **materialized view** (Cron
  Job). **Proximity** graduates from Haversine-over-btree to **PostGIS
  `ST_DWithin` over a GiST index** (Appendix B) — a change localized to
  `src/server/geo/`.
- The **nearby-alert** scan and **digest/reveal** sweeps run in the same Cron
  worker; split into a queue later if volume warrants.
- Domain logic isolated from framework → modules can become services if needed.

---

## 15. MVP Build Phasing

| Phase | Delivers |
|---|---|
| **0 — Scaffold** | Next.js 16 + Prisma + Tailwind, **12 domain models + Better Auth tables**, lat/lng + btree geo index, **i18n catalog scaffold (en + es)**, seed from `world-cup-2026.txt` (incl. `isSpecial`), `render.yaml` (web + Postgres + cron), CI (with Postgres service) |
| **1 — Auth & shell** | **Better Auth** register/login/reset + email verify, `MASTER` role, ban/suspend enforcement in `proxy.ts`, PWA bottom-tab shell (i18n-ready), album switcher, **cold-start onboarding wizard** |
| **2 — Album** | grid + tap/hold **and edit-mode `±`** quantity API (**atomic deltas, `1+committed` floor**), **most-wanted ★ (`wantPriority`)**, **accessible non-color tile states**, **offline write queue / background sync** (verify serwist + Next 16 first) |
| **3 — Import** | adapter layer (registry + applier) + **Figuritas** adapter, format/mode wizard, preview/confirm + skip report, **import-as-onboarding fast-path** |
| **4 — Matching + location** | lat/lng location picker (LocationIQ geocode / geolocate, grid-snap + bucketing), **Haversine** "Find swaps" with radius + distance ranking + **auto-widen**, **wantPriority weighting**, **block** (matching + public-page exclude blocked pairs) |
| **5 — Swaps** | proposals + baskets + **swap-equity bar** + comment thread + state machine, **spare reservation**, **atomic floored auto-decrement**, **open-proposal cap**, **post-completion double-blind ratings** |
| **6 — Notify, trust & admin** | in-app inbox + Resend email (**honors `emailPrefs`**), **Cron worker** (digest + rating reveal), **"sticker nearby" alerts (off-path, digest)**, **notification preferences**, **report + Master report queue + suspend/ban**, **safe-meetup panel (incl. counterfeit)**, Master universe editor (incl. `isSpecial`) |
| **7 — Share, polish & compliance** | **public collection page + Share button**, **Spanish translation finalized & bundled**, completion celebration, **GDPR export/delete**, profile + trust display polish, E2E tests, production deploy |

Each phase is independently shippable and testable.

---

## 16. Out of Scope / Future

**Fast-follow (near-term, schema-ready):**
- **`isSpecial` UI + matching nuance** — the column is seeded at MVP; surfacing
  the "difícil" badge on tiles/match cards and letting it inform offers is the
  first fast-follow.
- **Juntada / swap-day events** — dated location pins + RSVP that replace the
  WhatsApp "juntada" announcement (the cultural in-person swap venue).
- **Completion social mechanics** — beyond the MVP share button: badges and
  milestone celebrations. (Leaderboards deferred — they penalize new users and can
  incentivize hoarding over swapping.)
- **Additional import adapters** — each a small, isolated registry add.
- **Further translations** beyond en/es.

**Later:**
- **Web push notifications** — viable for installed PWAs (iOS 16.4+ home-screen,
  Android); adds VAPID keys + a service-worker push handler. The `Notification`
  model already supports it.
- **PostGIS migration** for proximity at scale (Appendix B) — a drop-in behind
  `src/server/geo/`.
- **Photo / barcode sticker recognition** for bulk entry; **AI counterfeit
  detection** (market not mature enough for reliable automated authentication).
- **Parallels & variants** (orange-border / gold-flood editions) via the
  `variant` code dimension (§3.3) — schema-ready.
- Real sticker images (`imageUrl` ready).
- Payments, shipping, or postage logistics.
- Real-time chat (current: posted comments + email).
- **Multi-party swap circles** — intentionally not built: 3-way chains are
  operationally fragile for in-person/mail swaps (one defection breaks the chain);
  the Juntada "bring your box" dynamic serves the real need.
- Native apps; advanced search; km/mi preference.

---

## Appendix A — Canonical Universe (World Cup 2026)

`SHORTNAME EMOJI: numbers` — 52 sections (3 FWC + 48 countries + CC), 994
stickers. Source of truth for `data/albums/world-cup-2026.txt`.

```
FWC 🏆: 00, 1, 2, 3, 4
FWC 🌎: 5, 6, 7, 8
FWC 📜: 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19
MEX 🇲🇽: 1..20      RSA 🇿🇦: 1..20      KOR 🇰🇷: 1..20      CZE 🇨🇿: 1..20
CAN 🇨🇦: 1..20      BIH 🇧🇦: 1..20      QAT 🇶🇦: 1..20      SUI 🇨🇭: 1..20
BRA 🇧🇷: 1..20      MAR 🇲🇦: 1..20      HAI 🇭🇹: 1..20      SCO 🏴: 1..20
USA 🇺🇸: 1..20      PAR 🇵🇾: 1..20      AUS 🇦🇺: 1..20      TUR 🇹🇷: 1..20
GER 🇩🇪: 1..20      CUW 🇨🇼: 1..20      CIV 🇨🇮: 1..20      ECU 🇪🇨: 1..20
NED 🇳🇱: 1..20      JPN 🇯🇵: 1..20      SWE 🇸🇪: 1..20      TUN 🇹🇳: 1..20
BEL 🇧🇪: 1..20      EGY 🇪🇬: 1..20      IRN 🇮🇷: 1..20      NZL 🇳🇿: 1..20
ESP 🇪🇸: 1..20      CPV 🇨🇻: 1..20      KSA 🇸🇦: 1..20      URU 🇺🇾: 1..20
FRA 🇫🇷: 1..20      SEN 🇸🇳: 1..20      IRQ 🇮🇶: 1..20      NOR 🇳🇴: 1..20
ARG 🇦🇷: 1..20      ALG 🇩🇿: 1..20      AUT 🇦🇹: 1..20      JOR 🇯🇴: 1..20
POR 🇵🇹: 1..20      COD 🇨🇩: 1..20      UZB 🇺🇿: 1..20      COL 🇨🇴: 1..20
ENG 🏴: 1..20       CRO 🇭🇷: 1..20      GHA 🇬🇭: 1..20      PAN 🇵🇦: 1..20
CC 🥤: 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14
```

> The 48 country sections each contain numbers 1–20 (written `1..20` for brevity;
> the seed file lists them explicitly). Totals: 20 (FWC) + 48×20 (960) + 14 (CC) =
> **994**.

> **Open data task:** the **`isSpecial` flag** needs the special-edition stickers
> (e.g. foil "shiny" team logos and tournament specials) identified in this file
> before seeding can populate it. Until then `isSpecial` defaults false everywhere
> — harmless, since its UI/matching use is fast-follow (§16).

---

## Appendix B — PostGIS scale path (future)

Proximity at MVP is `latitude`/`longitude` + Haversine over a btree bounding box
(§6.2), which needs no database extensions. When located users grow past what that
serves comfortably, swap the `src/server/geo/` distance implementation for PostGIS:

- Add a `location geography(Point,4326)` column. Prisma has no native geography
  type, so declare it `Unsupported("geography(Point,4326)")` and backfill from
  `latitude` / `longitude`.
- The `postgresqlExtensions` preview feature is deprecated (Prisma v6.16.0).
  Instead generate the migration with `--create-only` and **hand-edit it to
  prepend `CREATE EXTENSION IF NOT EXISTS postgis;`** before the DDL. Bootstrap
  order: create DB → confirm PostGIS available → `--create-only` → prepend
  extension → `prisma migrate deploy` (never `db push` against PostGIS — false
  drift).
- Run `ST_DWithin` / `ST_Distance` via `prisma.$queryRaw` with `Prisma.sql`,
  casting lat/lng to `::float8`. Add a **GiST index** on the geography column.

Because all spatial logic is already isolated behind `src/server/geo/`, this is a
localized change: add the column, backfill, swap the query implementation, drop the
btree-bounding-box path. No domain or API changes.
