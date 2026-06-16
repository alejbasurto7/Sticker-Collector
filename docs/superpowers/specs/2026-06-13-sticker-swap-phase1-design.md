# Sticker Swap — Phase 1 Design Specification ("Master Swap Diff Tool")

**Date:** 2026-06-13
**Status:** Final — ready for implementation planning
**Author:** Alejandro (with Claude)
**Parent design:** [`2026-06-13-sticker-swap-design.md`](./2026-06-13-sticker-swap-design.md) (the full multi-user MVP; this Phase 1 is a strict, reusable subset of it)

This document specifies a **minimal, single-operator** first product. It is a true
slice of the full app — the schema subset, the seed, the Figuritas import adapter,
and the `src/server/` domain layer are the **real foundation** that later full-spec
phases extend; nothing here is throwaway except the single-password access gate
(replaced by Better Auth later). It is written to decompose directly into an
implementation plan: every entity lists its fields, every mechanic states its
server-side rule, and the build is split into independently shippable sub-phases (§14).

---

## 1. Overview

A web app, **live on Render and used from the operator's phone browser**, that lets
**one person — the Master (Alejandro)** — run sticker swaps against anyone who posts
their collection in the Argentine **"Figuritas"** text format (faltan / cambio).

The Master maintains **his own** Panini **FIFA World Cup 2026** collection (994
stickers) inside the app. For each person he wants to swap with, he **pastes their
Figuritas-format missing/swaps list**, and the app computes the **two-way overlap**:

- **What I can give them** — my spares that they're missing.
- **What they can give me** — their spares that I'm missing.

The Master runs **multiple swaps at once**, so the app enforces two safeguards via a
lightweight **reservation** model: a spare promised to one person never appears as
available to another, and a sticker he's already lined up to receive never appears as
something to ask a second person for. Completing a swap **updates his collection**
automatically.

**Primary goal:** turn "what do you have that I need, and vice-versa?" — today a manual
eyeball comparison of two text lists — into an instant, reservation-safe diff the
Master can copy into a Facebook group.

---

## 2. Scope

**In scope:**

- Seeded 994-sticker **World Cup 2026** universe.
- The Master's own collection as the real `CollectionEntry` quantity model, managed
  through an **interactive album grid** (tap/hold) **and** a **bulk paste import**
  (Figuritas adapter) for fast seeding.
- **Saved, named counterparties** — paste their Figuritas list once; revisit, edit,
  re-diff.
- **Reservation-aware two-way diff** per counterparty.
- **Swap commitments** (reserve a give/get across all deals) and **atomic completion**
  that mutates the collection.
- **On-screen grouped output + plain-text copy** (English).
- **Minimal single-password access gate.**
- **Render + managed Postgres** deployment.

**Out of scope (deferred to the full-spec phases — see parent §15/§16):**
Better Auth & real user accounts · other people having app access · proximity/location
& geocoding · formal swap proposals/negotiation/messaging · ratings, reports, blocks,
suspend/ban · notifications & email/Resend · public share pages · i18n/Spanish ·
offline/PWA/background-sync · `wantPriority`/most-wanted · `isSpecial`/variants/images.

**Relationship to the full spec (continuity, not rework):**

| Phase 1 artifact | Becomes, in the full app |
|---|---|
| `Album`/`Section`/`Sticker` schema + seed | Identical — reused unchanged |
| `CollectionEntry` (no `userId`) | Gains `userId`; the single collection is assigned to the Master user |
| Figuritas adapter + `src/server/import/` | Identical adapter/registry/applier |
| Album grid + atomic delta API (`1 + committed` floor) | Identical (offline/`wantPriority` added later) |
| `SwapCommitment` (informal) | Maps onto `SwapProposal` + `SwapItem` once counterparties are real users |
| `src/server/diff/` (overlap) | Grows into `src/server/matching/` (adds scoring/proximity) |
| Single-password gate (`proxy.ts`) | Replaced by Better Auth sessions + ban/suspend |

---

## 3. Key Decisions

| Area | Decision |
|------|----------|
| Stack | **Next.js 16 (App Router, TypeScript) + Prisma + PostgreSQL**, single app |
| Hosting | **Render** — one Web Service + one managed Postgres + release seed. **No cron** (no digests/reveals in Phase 1) |
| Access | **Single shared password** (`APP_PASSWORD`), validated at `/login`, carried in a **signed httpOnly cookie**, enforced in middleware. **Not Better Auth** — no user accounts |
| Users | **Single operator (Master).** Counterparties are **stored text snapshots**, not accounts |
| Device | **Mobile-first responsive web.** **No PWA/offline** in Phase 1 (online-only) |
| Albums | **Single album** (World Cup 2026); the `Album` entity is retained for full-spec continuity |
| Collection | Real **`CollectionEntry` quantity model**, managed via **interactive grid** (tap/hold) **+ bulk paste import** |
| Import | **Figuritas adapter** (combined mode), reused from full spec §5.1; used to seed the Master and to parse counterparties |
| Diff | **Reservation-aware two-way overlap**; spares vs. missing, both directions |
| Reservations | **`SwapCommitment`** (`GIVE`/`GET`, `PENDING`/`DONE`/`CANCELLED`); committed copies excluded from every diff; **atomic completion mutates the collection** |
| Inventory integrity | All `quantity` mutations are **atomic, single-statement, and floored at `1 + committed`** server-side (no double-promising; a promised spare can't be tapped, re-pasted, or completed away) |
| Output | On-screen lists grouped by section **+ a plain-text Copy button** (English, paste anywhere — e.g. Facebook groups) |
| i18n | **English only** |

---

## 4. Domain Model

**Six tables.** `Album ─1:N─ Section ─1:N─ Sticker`, with `CollectionEntry` and
`SwapCommitment` referencing `Sticker`, and `Counterparty` holding pasted text.

```
Album ─1:N─ Section ─1:N─ Sticker ─1:N─ CollectionEntry
                            │
                            └─1:N─ SwapCommitment ─N:1─ Counterparty
```

**Album** — `id`, `slug`, `name`, `year`, `emoji`, `orderIndex`. One row (World Cup
2026).

**Section** — `id`, `albumId`, `shortName`, `emoji`, `displayName`, `orderIndex`.
Unique `(albumId, shortName, emoji)`. (`FWC` is three rows 🏆/🌎/📜 sharing a short
name; numbers disambiguate — parent §3.1.)

**Sticker** — `id`, `sectionId`, `albumId` (denormalized for fast scoped queries),
`number` (string, preserves `"00"`), `code` (`"MEX-5"`), `orderIndex`. Unique
`(albumId, code)` and `(sectionId, number)`. The **`code`** is the join key for
import, diff, and commitments. (`imageUrl`/`isSpecial`/`variant` omitted — addable as
nullable columns later without migration of existing data.)

**CollectionEntry** — `id`, `stickerId`, `quantity` (≥ 1). Unique `(stickerId)`. **The
Master's collection only — no `userId`** (single implicit owner; full spec adds it).
Semantics (parent §3.2): **missing = no row**; **owned = qty 1**; **spares held =
qty − 1**. No `wantPriority`/reservation columns — reservations live in
`SwapCommitment` and are joined at query time.

**Counterparty** — `id`, `name` (the Master's label, e.g. "Primo Mateo", "Kiosco
Juan"), `rawText` (their pasted Figuritas list, faltan + cambio), `createdAt`,
`updatedAt`. Their missing/spares sets are **parsed from `rawText` on read** (data is
tiny; parse is instant). Editing their list = update `rawText`.

**SwapCommitment** — `id`, `counterpartyId`, `stickerId`, `direction`
(`GIVE` | `GET`), `quantity` (default 1), `status` (`PENDING` | `DONE` | `CANCELLED`),
`createdAt`, `updatedAt`. The set of a counterparty's commitments **is** the "deal"
with them.
- **`GIVE`** = a spare of mine earmarked for this counterparty (reserves a copy).
- **`GET`** = a sticker this counterparty will give me (reserves that need).
- Indexed on `(stickerId, status, direction)` for the global reservation rollups (§6)
  and `(counterpartyId, status)` for per-deal views.

---

## 5. Collection Mechanics (album grid + bulk import)

The **Album** screen is the Master's primary collection surface — the real interactive
grid from parent §4, online-only.

### 5.1 Grid states & gestures

Per-section grids of numbered tiles. One integer (`quantity`) is the source of truth:

| quantity | meaning | tile |
|---|---|---|
| (no row) | missing | dashed border, empty |
| 1 | owned, no spare | solid border, **✓** |
| n ≥ 2 | owned + (n−1) spares | solid border, **`+(n−1)`** badge |

- **Tap** → `quantity += 1`.
- **Edit-mode `−`** (explicit per-tile control) **and long-press** → `quantity − 1`,
  stopping at **missing** (row deleted at 0) **or at `1 + committed`** if copies are
  reserved (§6) — a promised spare can't be removed. Both paths hit the same API.
- **Non-color indicators** accompany color (WCAG 1.4.1): dashed/✓/`+N`. Tiles are
  keyboard-reachable and screen-reader labelled (e.g. `"MEX-5, owned, 1 spare"`).

### 5.2 Atomic, reservation-aware writes

All quantity mutations run as a **single server-side SQL statement inside a
transaction** (never read-modify-write), so concurrent taps and completion
auto-decrements (§7) cannot race or under-flow (parent §3.2):

- **Increment:** `UPDATE … SET quantity = quantity + :delta` (insert at 1 if absent).
- **Decrement:** `SET quantity = GREATEST(quantity + :delta, 1 + :committed)`, where
  `:committed` (= `committedGive`, §6) is computed in the same transaction; the row is
  deleted only when the floored result is 0 **and** `committed = 0`.

**Optimistic UI:** the tile updates instantly; taps are debounced and **batched** into
one `PATCH /api/collection` carrying `{ stickerId, delta }[]`. The response returns the
**applied quantities**; a decrement clamped at `1 + committed` reconciles the tile.
Failed sync rolls the tile back. (No offline queue/Background Sync in Phase 1.)

### 5.3 Bulk import (Figuritas seed)

A **"Bulk import"** action on the Album screen opens the import dialog so the Master
doesn't tap in 994 tiles by hand. It uses the same **Figuritas adapter** as
counterparties (§6.1), in **combined mode** (parent §5.1): faltan above a `Swaps`
header line are marked missing and **everything unlisted is owned (qty 1)**; cambio
below set `quantity = 1 + M`. The dialog shows a **preview diff** and a
**skipped-codes report** (unknown/typo codes are never silently applied).

**Import respects reservations:** applying the parsed collection floors each sticker at
`max(parsedQuantity, 1 + committedGive)` and **reports any clamped stickers** — so a
re-paste can't silently drop a spare already promised in a deal.

---

## 6. Import Adapter & Counterparties

### 6.1 Figuritas adapter (reused, parent §5.1)

Consumes lines `SHORTNAME EMOJI: n, n (×M), …`. The emoji is **ignored** for matching
(identity is `shortName` + `number`); `(×M)` sets copies, absent `×M` means one. A
`Swaps` header line splits **faltan (above)** from **cambio (below)** in combined mode.
The adapter lives behind the full-spec `FormatParser` interface + registry
(`src/server/import/`), so additional formats remain a one-file add later.

For a **counterparty**, parsing yields their **missing set** (faltan codes) and
**spares set** (cambio codes with copies). We do **not** infer their full owned set —
it's irrelevant to the diff. Unmappable codes are surfaced (not stored as entries).

### 6.2 Counterparty lifecycle

- **Create:** Master enters a `name` + pastes their list → stored as `rawText`.
- **View:** the stored `rawText` is parsed and the **reservation-aware diff** (§7) is
  rendered, grouped by section, with a **Copy** button.
- **Edit:** update `name` and/or re-paste `rawText`.
- **Delete:** removes the counterparty; its `PENDING` commitments are released first
  (so their reserved copies return to the available pool).

---

## 7. The Diff & Reservations (core logic)

All diff math is a **pure, unit-tested function** in `src/server/diff/` that reads the
Master's `CollectionEntry` rows and **all `PENDING` `SwapCommitment` rows across every
counterparty**. Notation for a sticker `X`:

- `q(X)` = Master's quantity (0 if no row); `spareCount(X) = max(q(X) − 1, 0)`.
- `committedGive(X)` = Σ `quantity` of **`PENDING` `GIVE`** commitments for `X`
  (**all** counterparties).
- `offerable(X) = spareCount(X) − committedGive(X)` (invariant: **≥ 0**).
- `committedGet(X)` = a **`PENDING` `GET`** commitment for `X` exists (any
  counterparty). A `GET` is always `quantity` 1 (you need one copy of a missing
  sticker).
- `effectiveMissing(X)` ⇔ `q(X) = 0` **and** not `committedGet(X)`.

For a counterparty `C` with parsed missing set `M_C` and spares set `S_C`:

- **I give them (available)** = `{ X ∈ M_C : offerable(X) ≥ 1 and no PENDING GIVE to C for X }`
- **They give me (available)** = `{ X ∈ S_C : effectiveMissing(X) and no PENDING GET from C for X }`
- **Committed with C** = C's own `PENDING` `GIVE` and `GET` commitments, shown in a
  separate "Committed with [name]" group.

**The two safeguards fall out directly:**
1. Committing MEX-5 as a `GIVE` to *Mateo* lowers `offerable(MEX-5)`, so it leaves
   *Juan's* "I give them" list → **a spare is never double-promised.**
2. Committing BRA-12 as a `GET` from *Mateo* makes `effectiveMissing(BRA-12)` false, so
   it leaves *Juan's* "they give me" list → **you never chase a sticker you're already
   getting.**

### 7.1 Commitment operations (`src/server/swaps/`)

- **Create** `POST /api/counterparties/:id/commitments` `{ stickerId, direction }`.
  Validated **in a transaction** against the live rollups: a `GIVE` requires
  `offerable(X) ≥ 1`; a `GET` requires `effectiveMissing(X)` **and** `X ∈ S_C`.
  Otherwise rejected ("no longer available").
- **Cancel** `DELETE /api/commitments/:id` → `status = CANCELLED`, releasing the
  reservation (the copy/need returns to the pool everywhere).

### 7.2 Completion (atomic, mutates the collection)

**"Complete swap with [name]"** (`POST /api/counterparties/:id/complete`) runs **one
transaction** over all of `C`'s `PENDING` commitments:

- Each **`GIVE`**: `q(X) ← q(X) − quantity` (the spare physically leaves; since a
  `GIVE` was only allowed from spares, `q` stays ≥ 1 — a give never empties a sticker).
- Each **`GET`**: `q(X) ← q(X) + 1` (missing → owned; creates the row if absent).
  Idempotent if already owned (no-op).
- All those commitments → `status = DONE`.

After completion the collection itself reflects the trade, so the now-`DONE`
commitments no longer reserve anything. The Master's grid and **every other
counterparty's diff** update accordingly.

---

## 8. UI (mobile-first, used from the phone)

Responsive web; a simple top nav across **Album · Counterparties · Active Swaps**.
First load (no password cookie) redirects to `/login`.

- **/login** — single password field → `POST /api/login`; on success sets the signed
  httpOnly cookie and redirects.
- **/ (Album)** — the interactive **grid** (§5): per-section tiles with
  missing/owned/spare states + non-color indicators, tap / edit-mode `±`, a header
  **progress + spare summary** (owned / spares / missing counts, % complete), and a
  **Bulk import** button (§5.3).
- **/counterparties** — list of saved people, each showing **lined-up counts** (e.g.
  "give 3 · get 2"); **"Add person"** (name + paste).
- **/counterparties/[id]** — their name, an **editable paste box** for their list, and
  the **reservation-aware diff** grouped by section: **I give them (available)**,
  **They give me (available)**, and **Committed with [name]** (with cancel controls).
  Per available line: a **Commit** toggle. A **"Complete swap"** button. A **Copy**
  button producing plain text, e.g.
  `I GIVE (12): MEX-5, BRA-12, … · I GET (8): ARG-3, FWC-00, …`.
- **/swaps (Active Swaps)** — overview of every counterparty with `PENDING`
  commitments and their give/get counts; quick links to complete or open each deal.

**Rendering:** Server Components for data-heavy pages (album, lists, diff); Client
Components for the interactive grid, import dialog, and commit toggles. The batch
collection endpoint is a **route handler** (not a Server Action) for a clean
optimistic `fetch`.

---

## 9. API Surface

All behind the password gate (§11). All mutations validated with **Zod**.

- `POST /api/login` — `{ password }` → set signed cookie. `POST /api/logout`.
- `PATCH /api/collection` — batched `{ stickerId, delta }[]`; returns applied
  quantities (reservation-clamped, §5.2). Route handler.
- `POST /api/collection/import` — `{ text }` → preview; `{ text, commit:true }` →
  apply (floored), returns `{ skipped[], clamped[] }`.
- `GET /api/collection` — progress/spare summary.
- `GET /api/counterparties` · `POST /api/counterparties` `{ name, rawText }`.
- `GET /api/counterparties/:id` — counterparty + computed diff ·
  `PATCH` `{ name?, rawText? }` · `DELETE` (releases its `PENDING` commitments first).
- `POST /api/counterparties/:id/commitments` `{ stickerId, direction }` — create
  `PENDING` (validated, §7.1).
- `DELETE /api/commitments/:id` — cancel/release.
- `POST /api/counterparties/:id/complete` — atomic completion (§7.2).
- `GET /api/swaps/active` — counterparties with `PENDING` commitments + counts.

---

## 10. File Structure

```
sticker-swap/
├─ render.yaml                # web service + Postgres + release seed (§11)
├─ prisma/
│  ├─ schema.prisma           # 6 models
│  ├─ migrations/
│  └─ seed.ts                 # parses data/albums/world-cup-2026.txt → idempotent upsert
├─ data/albums/
│  └─ world-cup-2026.txt      # canonical universe (994 stickers) — parent Appendix A
├─ src/
│  ├─ app/
│  │  ├─ login/
│  │  ├─ (app)/   album · counterparties/[id] · swaps      # Active Swaps overview
│  │  └─ api/     login · collection · collection/import · counterparties/[id]/commitments · counterparties/[id]/complete · commitments/[id] · swaps/active
│  ├─ proxy.ts                # Next 16 middleware: password-cookie gate
│  ├─ server/                 # framework-agnostic, unit-tested domain layer
│  │  ├─ import/              # FormatParser interface + registry + applier + adapters/figuritas
│  │  ├─ collection/          # quantity service (atomic deltas, 1+committed floor)
│  │  ├─ diff/                # reservation-aware overlap (pure)
│  │  ├─ swaps/               # commitment reservation + atomic completion
│  │  └─ auth/                # password verify + signed-cookie helpers
│  ├─ components/             # AlbumGrid, StickerTile, ImportDialog, DiffView, CommitToggle, ActiveSwapsList, CopyButton
│  ├─ lib/                    # prisma client, zod schemas, utils
│  └─ types/
└─ tests/
   ├─ unit/                   # figuritas adapter, applier, reservation-aware diff, completion/floor
   └─ e2e/                    # Playwright golden path (optional)
```

The `src/server/*` layer is deliberately framework-free so each unit is testable in
isolation and is reused wholesale by the full app. Reservation/floor logic has
dedicated unit tests; the atomic SQL floors are integration-tested against a real
Postgres (Testcontainers / CI Postgres service), since they can't be meaningfully
mocked.

---

## 11. Deployment — Render

- **`render.yaml` blueprint:** one **Web Service** (`next build` / `next start`,
  Node 20+), one **managed Postgres**, and a **release command**
  (`prisma migrate deploy && prisma db seed`, idempotent). **No Cron Job** (Phase 1 has
  no digests/reveals).
- **Access gate:** `proxy.ts` middleware checks a **signed httpOnly cookie**; absent →
  redirect to `/login`, which compares the submitted password to `APP_PASSWORD` and, on
  match, sets the cookie (signed with `COOKIE_SECRET`). One shared secret, no user
  table. (Replaced by Better Auth in the full app.)
- **Phone use:** open the Render URL in the phone browser; responsive UI, no install.
- **Next.js 16 notes:** middleware is **`proxy.ts`**; `cookies()` / `headers()` /
  `params` are **async**; caching is opt-in — fine, this app is dynamic.
- **Env vars:** `DATABASE_URL`, `APP_PASSWORD`, `COOKIE_SECRET`, `APP_URL`.

---

## 12. Security Baseline

- **Access gate:** signed httpOnly + SameSite cookie; middleware-enforced on every
  route except `/login` and static assets. `APP_PASSWORD` and `COOKIE_SECRET` are
  env-only.
- **Zod** validation on every mutation; server-side checks on all writes.
- **Inventory integrity is a safety property:** the `1 + committed` floor and the
  transactional commitment validation make double-promising a spare or double-chasing a
  need **structurally impossible**, not merely UI-discouraged.
- **Minimal PII:** the only personal data stored is **counterparty names** the Master
  types as labels, plus their pasted public swap lists. No third-party accounts, no
  contact info, no location.

---

## 13. Testing

- **Unit (pure domain):** Figuritas adapter (emoji-ignore, `(×M)`, `Swaps` split,
  skipped codes); combined-mode applier (unlisted-owned, copies); **reservation-aware
  diff** (both safeguards, committed exclusion); completion math (give decrement, get
  increment, idempotent get).
- **Integration (real Postgres):** atomic delta floor (`1 + committed`), import
  re-paste clamp, transactional commitment validation, atomic completion.
- **E2E (optional, Playwright):** golden path — seed via bulk import → add counterparty
  → commit a give and a get → verify they vanish from a second counterparty's diff →
  complete → verify collection updated.

---

## 14. Build Sub-Phases

| Sub-phase | Delivers |
|---|---|
| **P1.0 — Scaffold & seed** | Next.js 16 + Prisma + Tailwind, **6-model schema**, seed from `world-cup-2026.txt`, `render.yaml` (web + Postgres + release seed), **password gate** (`/login` + `proxy.ts`), CI with Postgres service |
| **P1.1 — Collection** | **Album grid** (tap/hold + edit-mode `±`, non-color states), **atomic delta API** (`1 + committed` floor, optimistic UI), progress/spare summary, **Bulk-import** dialog (Figuritas combined, preview + skip report + clamp report) |
| **P1.2 — Counterparties & diff** | Counterparty CRUD (name + paste), **reservation-aware diff** rendered grouped by section, **Copy** button |
| **P1.3 — Commitments & completion** | Commit/cancel toggles + "Committed with…" groups, transactional commitment validation, **atomic "Complete swap"** (collection mutation), **Active Swaps** overview |

Each sub-phase is independently shippable and testable.

---

## 15. Out of Scope / Path to the Full App

Everything in the parent design's §15 phases beyond this slice is deferred. The clean
upgrade path (no rework of Phase 1 data or domain code):

- **Accounts:** add Better Auth; add `userId` to `CollectionEntry`; assign the existing
  rows to the Master user; replace the password gate.
- **Real swaps:** promote `SwapCommitment` to `SwapProposal` + `SwapItem` with the full
  state machine, equity bar, messaging, and double-blind ratings; counterparties become
  real users (their pasted `rawText` becomes their live collection).
- **Discovery:** add location columns + Haversine and grow `src/server/diff/` into
  `src/server/matching/` with scoring; add `wantPriority`.
- **Reach:** notifications/email (Cron), public share pages, Spanish, PWA/offline,
  `isSpecial`/variants/images.

The canonical 994-sticker universe (parent **Appendix A**) and the Figuritas format
(parent **§5.1**) are the shared contracts across both documents.
