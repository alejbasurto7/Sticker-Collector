# Follow-ups

Known issues deliberately deferred, with enough context to pick up cold. Each entry says what
is wrong, how it bites, and the smallest safe fix. Delete an entry when it lands.

---

_Nothing open._ The last entry — an album finished by an internal move was never stamped
complete — landed: `completionStamp` is now split out of `withActivity`, so
`applyInternalMove` can owe the completion date without falsely logging a collecting day.
