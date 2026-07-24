# Album Groups & Combined Swaps — HANDOFF (resume here)

**Worktree:** `.claude/worktrees/album-group-combined-swaps` · **branch:** `worktree-album-group-combined-swaps`
**Run all commands from the worktree.** `npm install` already done. `npm test` and `npx tsc -b` are green.

## Status: Stages 1–3 DONE (committed), Stage 4 (UI) REMAINING

| Stage | Scope | State |
|---|---|---|
| 1 | `src/utils/groupSwap.ts` — `GroupMember`, `computeGroupPool` (netting + internal moves + view-only), `computeGroupCandidates`, `routeReceived`, `routeGiven` | ✅ 20 tests |
| 2 | `src/store/collectionStore.ts` — `groups` state; group CRUD; `applyAlbumDeltas` (active-or-parked write helper); `applyInternalMove`; combined-swap CRUD; `closeCombinedSwap`/`rollbackCombinedSwap`; `deleteAlbum` pruning/auto-disband | ✅ 10 tests |
| 3 | sync — `CollectionPayload.groups`; `mergeGroups`/`mergeGroup` in `merge.ts`; `sliceCloudPayload` carries groups; `applyMergedCollection` adopts them | ✅ 9 tests |

**Full suite: 256 tests, tsc clean.** Types added in `src/types.ts`: `AlbumGroup`, `Swap.receivingQty`, `Swap.settledByAlbum`.

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
- Resume by invoking `superpowers:writing-plans` for the Stage 4 plan, then `superpowers:executing-plans`, then run the §G smoke test with `npm run dev`.
