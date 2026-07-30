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
