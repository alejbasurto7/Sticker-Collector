# Album Groups & Combined Swaps — HANDOFF (resume here)

**Worktree:** `.claude/worktrees/album-group-combined-swaps` · **branch:** `worktree-album-group-combined-swaps`
**Run all commands from the worktree.** `npm install` already done. `npm test` and `npx tsc -b` are green.

## Status: Stages 1–4 DONE (committed) — feature complete, §G smoke test passed

| Stage | Scope | State |
|---|---|---|
| 1 | `src/utils/groupSwap.ts` — `GroupMember`, `computeGroupPool` (netting + internal moves + view-only), `computeGroupCandidates`, `routeReceived`, `routeGiven` | ✅ 20 tests |
| 2 | `src/store/collectionStore.ts` — `groups` state; group CRUD; `applyAlbumDeltas` (active-or-parked write helper); `applyInternalMove`; combined-swap CRUD; `closeCombinedSwap`/`rollbackCombinedSwap`; `deleteAlbum` pruning/auto-disband | ✅ 10 tests |
| 3 | sync — `CollectionPayload.groups`; `mergeGroups`/`mergeGroup` in `merge.ts`; `sliceCloudPayload` carries groups; `applyMergedCollection` adopts them | ✅ 9 tests |
| 4 | UI — `buildGroupMembers` seam + `useGroupMembers`; `buildGroupListExport`; `AlbumGroupsSheet` (+ `👥 Groups` Library entry); `SwapsView` combined lens + `InternalMovesPanel`; `NewSwapDialog`/`SwapDetail`/`SwapClose` group mode; CSS | ✅ 8 new unit tests + browser-verified |

**Full suite: 264 tests, tsc clean, production build (`vite build`) green.** Types added in `src/types.ts`: `AlbumGroup`, `Swap.receivingQty`, `Swap.settledByAlbum`.

### Stage 4 plan & commits
Plan: `docs/superpowers/plans/2026-07-24-album-group-combined-swaps-stage4-ui.md`. Commits: `buildGroupMembers seam` → `buildGroupListExport` → `Album Groups management sheet` → `NewSwapDialog group mode` → `settlement routing` → `combined lens` → `CSS`.

**Spec correction discovered during Stage 4:** the `👥 Groups` entry was **not** actually reserved in `LibrarySheet.tsx` (spec/handoff said it was) — Stage 4 added it fresh. Store hooks are `useCollection`/`useSyncMeta`; `SwapsView` takes no props; `computeStatsFor`/`displayPct` both come from `src/utils/stats`.

### §G smoke test result (run 2026-07-24 via `npm run dev` + Playwright)
Single-device scenarios **passed**: 1 (internal move + Apply → Leo×1/Kai×1), 2 (get ×2), 5 (both-need 1 copy → auto-Leo with `[change ▾]`, override → Kai), 6 (two copies → +1 each), 7 (give auto → decrements holder Leo, Kai's floor protected, no override), 9 (rollback reverses `settledByAlbum`), 12 (delete Kai → pruned + group auto-disbands), and the regression (ungrouped album shows no lens toggle). Group creation UI + writable-≥2 gating verified. **Zero console errors.**

Scenarios 3, 4, 8 rest on Stage-1 unit-tested pool math (surplus+internal, mixed-CC target, reservation roll-up) and were not separately driven in the browser. **Manually deferred (need two browser profiles sharing a Cloud/Shared code):** 10 (collaborative member propagation), 11 (view-only member `🤝 give to owner`), 13 (cross-device group).

## Docs to read first
- Spec: `docs/superpowers/specs/2026-07-17-album-group-combined-swaps-design.md` (see §B math, §D settlement, **§E UI**, **§G manual smoke test**).
- Plans: `…-stage1-pool-logic.md`, `…-stage2-store.md`, `…-stage3-sync.md` (this dir).

## Stage 4 (UI) — to build (browser-verified via §G; no component test runner)
1. **`groupMembers` selector/hook** — the seam: join `collectionStore` albums with `syncStore` link metadata to build `GroupMember[]`. `writable = !forcedReadOnly(link)` (from `src/sync/albumMode.ts`); `name` via `resolveAlbumName`. Read-only joined = view-only member (`writable:false`).
2. **Library `👥 Groups` screen** — entry already reserved in `src/components/LibrarySheet.tsx`. Create/name/pick members (writable + read-only-as-view-only, badged)/disband. Member picker excludes nothing but marks read-only as view-only; needs ≥2 writable to run a swap.
3. **SwapsView combined lens** (`src/components/SwapsView.tsx`) — segmented `[ Album | Group(both) ]` toggle shown when active album is a resolvable group member; combined swaps list + New/close + **Internal moves panel** (`computeGroupPool().internalMoves` → `applyInternalMove`).
4. **NewSwapDialog group mode** — `computeGroupCandidates(members, parsed, reservations)`; two-sided quantities; reservations roll up group combined swaps + each member's solo swaps (`computeReservations` over concatenated swaps). Persist via `createCombinedSwap` (`receivingQty`).
5. **SwapClose group mode** — build `settledByAlbum` from `routeReceived`/`routeGiven`; show `[change ▾]` for ambiguous receives and `🤝 give to <owner> — not recorded` for view-only hand-offs; call `closeCombinedSwap`.
6. **Combined export** — build the "I need / To swap" list from the pool (`computeGroupPool` get/give) reusing `listExport`/qr path.
7. **CSS** for the new surfaces.

## Key context / gotchas
- Two features already landed and are accounted for: **per-album sync/sharing** (Local/Cloud/Shared, 3-way merge) and the **Settings/Library reorg** (album switcher → LibrarySheet → AlbumDetailView; bottom bar is `Album·Swaps·Stats·Settings` — **no Trade tab**, so combined pool is a lens, not a tab).
- **Cross-album writes** must go through `applyAlbumDeltas` (handles active-top-level vs parked). Settlement routing is pure (Stage 1) → UI computes `settledByAlbum` → store applies.
- **View-only decision:** read-only joined shares are group members that contribute needs to the combined view but are never written / never give / never a settlement target.
- Groups sync only via the **Cloud channel** (your own devices); members resolve per-device (Cloud members carry same id everywhere; Local/joined may resolve-out → group inert if <2 resolvable).
- ~~Resume by invoking `superpowers:writing-plans` for the Stage 4 plan, then `superpowers:executing-plans`, then run the §G smoke test with `npm run dev`.~~ **DONE.** Remaining follow-up: run multi-device §G scenarios 10/11/13 with two browser profiles when convenient; then integrate the branch (`superpowers:finishing-a-development-branch`).
