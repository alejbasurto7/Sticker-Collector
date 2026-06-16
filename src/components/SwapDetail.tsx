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
  const deleteSwap = useCollection((s) => s.deleteSwap);
  const [closing, setClosing] = useState(false);
  const [deselectedGiving, setDeselectedGiving] = useState(new Set<string>());
  const [deselectedReceiving, setDeselectedReceiving] = useState(new Set<string>());

  const isOpen = swap.status === 'open';

  // Conflicts ignoring this swap's own contribution, so we see clashes with OTHERS.
  // minCount=1 because we already excluded this swap — appearing once in another swap is enough.
  const conflicts = useMemo(
    () => computeConflicts(swaps.filter((s) => s.id !== swap.id), 1),
    [swaps, swap.id],
  );
  const giveConflicts = new Set(swap.giving.filter((id) => conflicts.giving.has(id)));
  const recvConflicts = new Set(swap.receiving.filter((id) => conflicts.receiving.has(id)));
  const conflictCount = giveConflicts.size + recvConflicts.size;

  const giving = new Set(swap.giving.filter((id) => !deselectedGiving.has(id)));
  const receiving = new Set(swap.receiving.filter((id) => !deselectedReceiving.has(id)));

  const toggleGiving = (id: string) => {
    setDeselectedGiving((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };
  const toggleReceiving = (id: string) => {
    setDeselectedReceiving((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
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

        <div className="btn-row">
          <button className="btn danger" onClick={remove}>
            Delete
          </button>
          <button className="btn" onClick={onClose}>
            Close
          </button>
          {isOpen && (
            <button className="btn primary full" onClick={() => setClosing(true)}>
              ✓ Conclude swap
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
