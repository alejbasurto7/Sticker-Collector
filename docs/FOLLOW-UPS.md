# Follow-ups

Known issues deliberately deferred, with enough context to pick up cold. Each entry says what
is wrong, how it bites, and the smallest safe fix. Delete an entry when it lands.

---

## 1. An album completed by an internal move is never stamped complete

**Severity:** cosmetic/gamification only — the album really is complete, it just isn't dated.

**Where:** [collectionStore.ts:`applyInternalMove`](../src/store/collectionStore.ts).

`completedOn` is only ever evaluated inside `withActivity`, whose callers are the count-editing
actions and the two settlement paths. An internal move hands a copy from one group member to
another through `applyAlbumDeltas` alone, so the album that receives the copy — possibly its
last missing sticker — is never checked for completion. Its `completedOn` stays null until it
next gains a sticker some other way, and "days collecting", which freezes on that date, keeps
counting past the day the album was actually finished.

Deliberately left alone rather than bolted on: an internal move is not *collecting* (no new
sticker entered the household), so it must not log an activity day or extend a streak. Only the
completion stamp is arguably owed, and `withActivity` currently does both jobs in one call.

**Minimal fix:** split the completion stamp out of `withActivity` and call just that part for
the receiving album in `applyInternalMove`, measured against that album's own layout
(`buildAlbumFor`), the way `closeCombinedSwap` now measures each album it credits.

Noticed while fixing the sibling bug that a combined settlement credited activity only to the
active album (that one landed).
