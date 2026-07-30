# Follow-ups

Known issues deliberately deferred, with enough context to pick up cold. Each entry says what
is wrong, how it bites, and the smallest safe fix. Delete an entry when it lands.

---

## 1. A concluded combined swap does not count toward the "closed swaps" achievements

**Severity:** cosmetic/gamification only — no count is wrong.

**Where:** [AchievementToaster.tsx:54](../src/components/AchievementToaster.tsx#L54) and
[StatsView.tsx](../src/components/StatsView.tsx), both of which derive `closedSwaps` from the
top-level `swaps` array.

`closedSwaps = swaps.filter((s) => s.status === 'closed').length` only ever sees the **active
album's own solo swaps**. Combined swaps live on the group (`groups[].swaps`), so concluding one
never advances a swap-count achievement, however many stickers actually changed hands.

Noticed while fixing the sibling bug that `closeCombinedSwap` did not extend the activity
streak (that one landed — it now calls `withActivity` when the active album gains a copy).

**Minimal fix:** fold in the group's closed swaps that involve the active album. Note the
double-count risk: a combined swap is a swap of the *group*, not of each member, so counting it
once per participating album would inflate the total on a device holding several members.

---

## 2. Activity is credited only to the active album on a combined settlement

**Where:** [collectionStore.ts:`closeCombinedSwap`](../src/store/collectionStore.ts).

`withActivity` reads and writes the *top-level* activity fields, which belong to the active
album, and measures completion against the module-level `album` layout — the active album's.
So when a combined swap routes a received copy into a **parked** album, that album's own
`activityDays` / `firstStickerAt` / `completedOn` are untouched: its streak does not grow and
its completion date can be missed.

Deliberately left alone rather than guessed at: crediting a parked album needs completion
measured against *that* album's type/edition/CC layout, not the active one's, or the wrong
album gets stamped "completed".

**Minimal fix:** make `withActivity` take the album layout it should measure against, then apply
it per touched album inside `applyAlbumDeltas`'s parked branch.

---

## 3. The sync payload drops the active album's collection type

**Severity:** latent — only one collection type is registered today (`2026-fwc`), so the
fallback happens to pick the right one. It bites the day a second type ships.

**Where:** [serialize.ts:`reconstructActive`](../src/sync/serialize.ts) and the `SliceState`
type above it — neither carries `albumTypeId`.

`reconstructActive` rebuilds the active album from the live top-level fields for `allAlbums`,
which feeds every outgoing payload. It copies twelve fields but not `albumTypeId`, so the
active album always syncs with its type undefined. On the receiving device both
`loadSnapshot` and `onRehydrateStorage` backfill `?? ACTIVE_ALBUM_TYPE_ID` — meaning an
active album of any non-default collection silently comes back as the default one, and its
sticker layout with it. Parked albums are unaffected: they ship their stored snapshot whole.

Found while tracing why the library card of the current album showed pre-swap progress
(fixed via `liveAlbums`, which is the store-side equivalent and does carry `albumTypeId`).

**Minimal fix:** add `albumTypeId` to `SliceState` and to the object `reconstructActive`
returns. Consider folding the two reconstructions together so they cannot drift again —
`snapshotActive` in the store is now the more complete of the two.
