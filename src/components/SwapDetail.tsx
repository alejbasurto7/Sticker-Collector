import { useEffect, useMemo, useRef, useState } from 'react';
import type { Swap } from '../types';
import { useCollection } from '../store/collectionStore';
import { computeConflicts } from '../utils/swap';
import { buildSwapExport } from '../utils/listExport';
import { copyToClipboard } from '../utils/share';
import StickerChips from './StickerChips';
import SwapClose from './SwapClose';
import NewSwapDialog from './NewSwapDialog';

/** Same membership, order-independent — used to tell saved state from edited state. */
const sameMembers = (set: Set<string>, arr: string[]) =>
  set.size === arr.length && arr.every((id) => set.has(id));

interface Props {
  swap: Swap;
  onClose: () => void;
}

export default function SwapDetail({ swap, onClose }: Props) {
  const swaps = useCollection((s) => s.swaps);
  const counts = useCollection((s) => s.counts);
  const deleteSwap = useCollection((s) => s.deleteSwap);
  const rollbackSwap = useCollection((s) => s.rollbackSwap);
  const updateSwap = useCollection((s) => s.updateSwap);
  const [closing, setClosing] = useState(false);
  const [editing, setEditing] = useState(false);
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

  const conflicts = useMemo(() => computeConflicts(swaps, counts), [swaps, counts]);

  // Build per-sticker tooltip maps for conflicted chips.
  const giveConflicts = useMemo(() => {
    const map = new Map<string, string>();
    for (const id of swap.giving) {
      if (conflicts.giving.has(id)) {
        const spares = Math.max(0, (counts[id] ?? 0) - 1);
        const n = conflicts.giveSwapCounts.get(id) ?? 0;
        map.set(id, `Promised in ${n} swap${n !== 1 ? 's' : ''} · ${spares} spare${spares !== 1 ? 's' : ''} available`);
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

  const giving = new Set(swap.giving.filter((id) => !deselectedGiving.has(id)));
  const receiving = new Set(swap.receiving.filter((id) => !deselectedReceiving.has(id)));

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
    updateSwap(swap.id, {
      deselectedGiving: [...deselectedGiving],
      deselectedReceiving: [...deselectedReceiving],
    });
    setJustSaved(true);
    if (savedTimer.current) clearTimeout(savedTimer.current);
    savedTimer.current = window.setTimeout(() => setJustSaved(false), 1500);
  };

  const exportList = async () => {
    const text = buildSwapExport([...giving], [...receiving]);
    const ok = await copyToClipboard(text);
    if (!ok) return;
    setJustCopied(true);
    if (copiedTimer.current) clearTimeout(copiedTimer.current);
    copiedTimer.current = window.setTimeout(() => setJustCopied(false), 1500);
  };

  const remove = () => {
    if (confirm(`Delete swap “${swap.name}”? This won't change your collection.`)) {
      deleteSwap(swap.id);
      onClose();
    }
  };

  const rollback = () => {
    if (
      confirm(
        `Roll back “${swap.name}”? Your collection counts will be restored and the swap reopened.`,
      )
    ) {
      rollbackSwap(swap.id);
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
            ? 'Tap a sticker to unselect it. Tap again to add it back.'
            : 'This swap is concluded. Counts were updated when it closed.'}
        </p>

        {conflictCount > 0 && (
          <div className="conflict-banner">
            ⚠️ {conflictCount} sticker{conflictCount > 1 ? 's' : ''} here{' '}
            {conflictCount > 1 ? 'are' : 'is'} also promised in another open swap.
          </div>
        )}

        <div className="section-title">You give ({giving.size})</div>
        <StickerChips
          ids={swap.giving}
          selected={giving}
          conflicts={giveConflicts}
          onToggle={toggleGiving}
          readOnly={!isOpen}
        />

        <div className="section-title">You get ({receiving.size})</div>
        <StickerChips
          ids={swap.receiving}
          selected={receiving}
          conflicts={recvConflicts}
          onToggle={toggleReceiving}
          readOnly={!isOpen}
        />

        <button
          className={`btn full ${justCopied ? 'success' : ''}`}
          style={{ marginTop: 14 }}
          onClick={exportList}
        >
          {justCopied ? '✓ Copied to clipboard' : 'Export'}
        </button>

        {isOpen && (
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
          <button className="btn danger" onClick={remove}>
            Delete
          </button>
          {!isOpen && (
            <button className="btn" onClick={rollback}>
              ↩ Rollback
            </button>
          )}
          {isOpen && (
            <button className="btn" onClick={() => setEditing(true)}>
              ✎ Edit
            </button>
          )}
          <button className="btn" onClick={onClose}>
            Close
          </button>
          {isOpen && (
            <button className="btn primary full" onClick={() => setClosing(true)}>
              🤝 Mark as swapped
            </button>
          )}
        </div>

        {closing && (
          <SwapClose
            swap={swap}
            onClose={() => {
              setClosing(false);
              onClose();
            }}
          />
        )}

        {editing && <NewSwapDialog editSwap={swap} onClose={() => setEditing(false)} />}
      </div>
    </div>
  );
}
