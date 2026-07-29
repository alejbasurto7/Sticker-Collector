import { useEffect, useMemo, useRef, useState } from 'react';
import type { Swap } from '../types';
import { useCollection } from '../store/collectionStore';
import { useForcedReadOnly } from '../sync/useAlbumMode';
import { computeConflicts, giveQtyOf } from '../utils/swap';
import { isDesktop } from '../utils/device';
import { buildSwapExport } from '../utils/listExport';
import { copyToClipboard } from '../utils/share';
import type { GroupSwapCtx } from '../sync/groupMembers';
import { swapRoutingInput } from '../utils/groupSwap';
import { useGroupBadges } from './useGroupBadges';
import GroupLegend from './GroupLegend';
import StickerChips from './StickerChips';
import SwapClose from './SwapClose';
import NewSwapDialog from './NewSwapDialog';
import EditSwapDetails from './EditSwapDetails';

/** Same membership, order-independent — used to tell saved state from edited state. */
const sameMembers = (set: Set<string>, arr: string[]) =>
  set.size === arr.length && arr.every((id) => set.has(id));

/** Empty conflict shape for combined swaps (per-album conflict math is out of Stage-4 scope). */
const NO_CONFLICTS = {
  giving: new Set<string>(),
  receiving: new Set<string>(),
  giveSwapCounts: new Map<string, number>(),
  recvSwapCounts: new Map<string, number>(),
};

interface Props {
  swap: Swap;
  onClose: () => void;
  /** When set, this is a combined swap: rollback/delete/close use the group store actions. */
  groupCtx?: GroupSwapCtx;
}

export default function SwapDetail({ swap, onClose, groupCtx }: Props) {
  const swaps = useCollection((s) => s.swaps);
  const counts = useCollection((s) => s.counts);
  const deleteSwap = useCollection((s) => s.deleteSwap);
  const rollbackSwap = useCollection((s) => s.rollbackSwap);
  const updateSwap = useCollection((s) => s.updateSwap);
  const deleteCombinedSwap = useCollection((s) => s.deleteCombinedSwap);
  const rollbackCombinedSwap = useCollection((s) => s.rollbackCombinedSwap);
  const updateCombinedSwap = useCollection((s) => s.updateCombinedSwap);
  const readOnly = useForcedReadOnly();
  const [closing, setClosing] = useState(false);
  const [editing, setEditing] = useState(false);
  const [editingDetails, setEditingDetails] = useState(false);
  // Seed from what's already saved so reopening shows prior edits.
  const [deselectedGiving, setDeselectedGiving] = useState(() => new Set(swap.deselectedGiving ?? []));
  const [deselectedReceiving, setDeselectedReceiving] = useState(() => new Set(swap.deselectedReceiving ?? []));
  const [justSaved, setJustSaved] = useState(false);
  const [justCopied, setJustCopied] = useState(false);
  const savedTimer = useRef<number | null>(null);
  const copiedTimer = useRef<number | null>(null);
  useEffect(
    () => () => {
      if (savedTimer.current) clearTimeout(savedTimer.current);
      if (copiedTimer.current) clearTimeout(copiedTimer.current);
    },
    [],
  );

  const isOpen = swap.status === 'open';

  // True when the live selection differs from what's persisted on the swap.
  const dirty =
    !sameMembers(deselectedGiving, swap.deselectedGiving ?? []) ||
    !sameMembers(deselectedReceiving, swap.deselectedReceiving ?? []);

  const conflicts = useMemo(
    () => (groupCtx ? NO_CONFLICTS : computeConflicts(swaps, counts)),
    [groupCtx, swaps, counts],
  );

  // Build per-sticker tooltip maps for conflicted chips.
  const giveConflicts = useMemo(() => {
    const map = new Map<string, string>();
    for (const id of swap.giving) {
      if (conflicts.giving.has(id)) {
        const spares = Math.max(0, (counts[id] ?? 0) - 1);
        // giveSwapCounts sums promised copies across open swaps (a swap may want several).
        const n = conflicts.giveSwapCounts.get(id) ?? 0;
        map.set(id, `${n} cop${n !== 1 ? 'ies' : 'y'} promised · ${spares} spare${spares !== 1 ? 's' : ''} available`);
      }
    }
    return map;
  }, [swap.giving, conflicts, counts]);

  const recvConflicts = useMemo(() => {
    const map = new Map<string, string>();
    for (const id of swap.receiving) {
      if (conflicts.receiving.has(id)) {
        const n = conflicts.recvSwapCounts.get(id) ?? 0;
        map.set(id, `Missing sticker expected from ${n} swap${n !== 1 ? 's' : ''} · you only need one`);
      }
    }
    return map;
  }, [swap.receiving, conflicts]);

  const conflictCount = giveConflicts.size + recvConflicts.size;

  // Group mode: which album each promised copy leaves from / lands in. Derived live
  // from current counts every render — preview only, nothing persisted.
  // Marks describe routing derived from CURRENT counts, which is only meaningful while the
  // swap is still open. A concluded swap has already been settled, so recomputing would
  // describe the post-settlement world and contradict what was actually written
  // (swap.settledByAlbum holds that truth). Show no marks rather than wrong ones.
  const routingInput = swapRoutingInput(swap);
  const badges = useGroupBadges(isOpen ? groupCtx : undefined, routingInput.giving, routingInput.receiving);

  const giving = new Set(swap.giving.filter((id) => !deselectedGiving.has(id)));
  const receiving = new Set(swap.receiving.filter((id) => !deselectedReceiving.has(id)));
  // Copies (not distinct stickers) actively promised to give, and a lookup for chips.
  const giveQty = new Map(swap.giving.map((id) => [id, giveQtyOf(swap, id)]));
  const giveCopies = [...giving].reduce((n, id) => n + giveQtyOf(swap, id), 0);
  // Combined swaps can receive ×N of one id; show that on the get chips + count.
  const receiveQty = new Map(swap.receiving.map((id) => [id, Math.max(1, swap.receivingQty?.[id] ?? 1)]));
  const receiveCopies = [...receiving].reduce((n, id) => n + (receiveQty.get(id) ?? 1), 0);

  const toggleGiving = (id: string) => {
    setJustSaved(false);
    setDeselectedGiving((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };
  const toggleReceiving = (id: string) => {
    setJustSaved(false);
    setDeselectedReceiving((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const save = () => {
    const patch = {
      deselectedGiving: [...deselectedGiving],
      deselectedReceiving: [...deselectedReceiving],
    };
    if (groupCtx) updateCombinedSwap(groupCtx.groupId, swap.id, patch);
    else updateSwap(swap.id, patch);
    setJustSaved(true);
    if (savedTimer.current) clearTimeout(savedTimer.current);
    savedTimer.current = window.setTimeout(() => setJustSaved(false), 1500);
  };

  const exportList = async () => {
    const text = buildSwapExport([...giving], [...receiving], swap.givingQty);
    const ok = await copyToClipboard(text);
    if (!ok) return;
    setJustCopied(true);
    if (copiedTimer.current) clearTimeout(copiedTimer.current);
    copiedTimer.current = window.setTimeout(() => setJustCopied(false), 1500);
  };

  const remove = () => {
    if (confirm(`Delete swap “${swap.name}”? This won't change your collection.`)) {
      if (groupCtx) deleteCombinedSwap(groupCtx.groupId, swap.id);
      else deleteSwap(swap.id);
      onClose();
    }
  };

  const rollback = () => {
    if (
      confirm(
        `Roll back “${swap.name}”? Your collection counts will be restored and the swap reopened.`,
      )
    ) {
      if (groupCtx) rollbackCombinedSwap(groupCtx.groupId, swap.id);
      else rollbackSwap(swap.id);
      onClose();
    }
  };

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <h2>{swap.name}</h2>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span className={`pill ${swap.status}`}>{swap.status}</span>
            <button className="modal-close-btn" onClick={onClose} aria-label="Close">✕</button>
          </div>
        </div>
        <p className="modal-sub">
          {isOpen
            ? isDesktop()
              ? 'Click a sticker to unselect it. Click again to add it back.'
              : 'Tap a sticker to unselect it. Tap again to add it back.'
            : 'This swap is concluded. Counts were updated when it closed.'}
        </p>

        {conflictCount > 0 && (
          <div className="conflict-banner">
            ⚠️ {conflictCount} sticker{conflictCount > 1 ? 's' : ''} here{' '}
            {conflictCount > 1 ? 'are' : 'is'} also promised in another open swap.
          </div>
        )}

        {swap.notes && (
          <>
            <div className="section-title">Notes</div>
            <p className="swap-notes">{swap.notes}</p>
          </>
        )}

        {badges && <GroupLegend members={badges.members} />}

        <div className="section-title">You give ({giveCopies})</div>
        <StickerChips
          ids={swap.giving}
          selected={giving}
          conflicts={giveConflicts}
          quantities={giveQty}
          badges={badges?.give}
          onToggle={toggleGiving}
          readOnly={!isOpen || readOnly}
        />

        <div className="section-title">You get ({groupCtx ? receiveCopies : receiving.size})</div>
        <StickerChips
          ids={swap.receiving}
          selected={receiving}
          conflicts={recvConflicts}
          quantities={groupCtx ? receiveQty : undefined}
          badges={badges?.get}
          onToggle={toggleReceiving}
          readOnly={!isOpen || readOnly}
        />

        {badges && [...badges.get.values()].some((b) => b.ambiguous) && (
          <p className="modal-sub" style={{ margin: '10px 0 0' }}>
            <span className="amark ghost" style={{ verticalAlign: '-3px' }}>?</span>{' '}
            = more albums need this than there are copies coming. Where there is a single copy
            to place, you choose at close.
          </p>
        )}

        <button
          className={`btn full ${justCopied ? 'success' : ''}`}
          style={{ marginTop: 14 }}
          onClick={exportList}
        >
          {justCopied ? '✓ Copied to clipboard' : 'Export'}
        </button>

        {isOpen && !readOnly && (
          <button
            className={`btn full ${justSaved ? 'success' : 'primary'}`}
            style={{ marginTop: 10 }}
            onClick={save}
            disabled={!dirty && !justSaved}
          >
            {justSaved ? '✓ Saved' : 'Save changes'}
          </button>
        )}

        <div className="btn-row">
          {!readOnly && (
            <button className="btn danger" onClick={remove}>
              Delete
            </button>
          )}
          {!isOpen && !readOnly && (
            <button className="btn" onClick={rollback}>
              ↩ Rollback
            </button>
          )}
          {!isOpen && !readOnly && !groupCtx && (
            <button className="btn" onClick={() => setEditingDetails(true)}>
              ✎ Edit details
            </button>
          )}
          {isOpen && !readOnly && (
            <button className="btn" onClick={() => setEditing(true)}>
              ✎ Edit
            </button>
          )}
          <button className="btn" onClick={onClose}>
            Close
          </button>
          {isOpen && !readOnly && (
            <button className="btn primary full" onClick={() => setClosing(true)}>
              🤝 Mark as swapped
            </button>
          )}
        </div>

        {readOnly && (
          <p className="modal-sub" style={{ margin: '8px 0 0' }}>
            🔒 Read-only — shared by the code owner. You can view this swap but not change it.
          </p>
        )}

        {closing && (
          <SwapClose
            swap={swap}
            groupCtx={groupCtx}
            onClose={() => {
              setClosing(false);
              onClose();
            }}
          />
        )}

        {editing && <NewSwapDialog editSwap={swap} groupCtx={groupCtx} onClose={() => setEditing(false)} />}

        {editingDetails && (
          <EditSwapDetails swap={swap} onClose={() => setEditingDetails(false)} />
        )}
      </div>
    </div>
  );
}
