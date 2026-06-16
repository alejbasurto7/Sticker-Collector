import { useMemo, useState } from 'react';
import type { Swap } from '../types';
import { useCollection } from '../store/collectionStore';
import { computeConflicts } from '../utils/swap';
import StickerChips from './StickerChips';
import SwapClose from './SwapClose';

interface Props {
  swap: Swap;
  onClose: () => void;
}

export default function SwapDetail({ swap, onClose }: Props) {
  const swaps = useCollection((s) => s.swaps);
  const updateSwap = useCollection((s) => s.updateSwap);
  const deleteSwap = useCollection((s) => s.deleteSwap);
  const [closing, setClosing] = useState(false);

  const isOpen = swap.status === 'open';

  // Conflicts ignoring this swap's own contribution, so we see clashes with OTHERS.
  const conflicts = useMemo(
    () => computeConflicts(swaps.filter((s) => s.id !== swap.id)),
    [swaps, swap.id],
  );
  const giveConflicts = new Set(swap.giving.filter((id) => conflicts.giving.has(id)));
  const recvConflicts = new Set(swap.receiving.filter((id) => conflicts.receiving.has(id)));
  const conflictCount = giveConflicts.size + recvConflicts.size;

  const giving = new Set(swap.giving);
  const receiving = new Set(swap.receiving);

  const toggleGiving = (id: string) => {
    const next = new Set(giving);
    if (next.has(id)) next.delete(id);
    updateSwap(swap.id, { giving: [...next] });
  };
  const toggleReceiving = (id: string) => {
    const next = new Set(receiving);
    if (next.has(id)) next.delete(id);
    updateSwap(swap.id, { receiving: [...next] });
  };

  const remove = () => {
    if (confirm(`Delete swap “${swap.name}”? This won't change your collection.`)) {
      deleteSwap(swap.id);
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
            ? 'Tap a sticker to drop it from this swap.'
            : 'This swap is concluded. Counts were updated when it closed.'}
        </p>

        {conflictCount > 0 && (
          <div className="conflict-banner">
            ⚠️ {conflictCount} sticker{conflictCount > 1 ? 's' : ''} here{' '}
            {conflictCount > 1 ? 'are' : 'is'} also promised in another open swap.
          </div>
        )}

        <div className="section-title">You give ({swap.giving.length})</div>
        <StickerChips
          ids={swap.giving}
          selected={giving}
          conflicts={giveConflicts}
          onToggle={toggleGiving}
          readOnly={!isOpen}
        />

        <div className="section-title">You get ({swap.receiving.length})</div>
        <StickerChips
          ids={swap.receiving}
          selected={receiving}
          conflicts={recvConflicts}
          onToggle={toggleReceiving}
          readOnly={!isOpen}
        />

        <div className="btn-row">
          <button className="btn danger" onClick={remove}>
            Delete
          </button>
          {isOpen && (
            <button className="btn primary full" onClick={() => setClosing(true)}>
              ✓ Conclude swap
            </button>
          )}
          {!isOpen && (
            <button className="btn full" onClick={onClose}>
              Close
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
      </div>
    </div>
  );
}
