import { useState } from 'react';
import type { Swap } from '../types';
import { useCollection } from '../store/collectionStore';
import { activeGiving, activeReceiving, giveQtyOf } from '../utils/swap';
import StickerChips from './StickerChips';

interface Props {
  swap: Swap;
  onClose: () => void;
}

/** Confirm which promised stickers were actually exchanged, then settle counts. */
export default function SwapClose({ swap, onClose }: Props) {
  const closeSwap = useCollection((s) => s.closeSwap);
  // Start with only the active (still-selected) stickers checked; deselected ones
  // can still be re-checked here if they ended up being traded after all.
  const [given, setGiven] = useState<Set<string>>(() => new Set(activeGiving(swap)));
  const [received, setReceived] = useState<Set<string>>(() => new Set(activeReceiving(swap)));

  const toggle = (set: Set<string>, setSet: (s: Set<string>) => void, id: string) => {
    const next = new Set(set);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setSet(next);
  };

  // Copies-per-sticker for the give side, both for the count and the chip badges.
  const giveQty = new Map(swap.giving.map((id) => [id, giveQtyOf(swap, id)]));
  const givenCopies = [...given].reduce((n, id) => n + (giveQty.get(id) ?? 1), 0);

  const confirm = () => {
    // Carry the per-sticker copy counts so settlement removes every given copy.
    const settledQty: Record<string, number> = {};
    for (const id of given) {
      const q = giveQty.get(id) ?? 1;
      if (q > 1) settledQty[id] = q;
    }
    closeSwap(swap.id, {
      givenIds: [...given],
      receivedIds: [...received],
      giveQty: settledQty,
    });
    onClose();
  };

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <h2>Mark “{swap.name}” as swapped</h2>
        <p className="modal-sub">
          Confirm what was actually exchanged. Given stickers will be removed from your
          duplicates; received stickers will be added to your collection.
        </p>

        <div className="section-title">You gave ({givenCopies})</div>
        <StickerChips
          ids={swap.giving}
          selected={given}
          quantities={giveQty}
          onToggle={(id) => toggle(given, setGiven, id)}
        />

        <div className="section-title">You received ({received.size})</div>
        <StickerChips
          ids={swap.receiving}
          selected={received}
          onToggle={(id) => toggle(received, setReceived, id)}
        />

        <div className="btn-row">
          <button className="btn full" onClick={onClose}>
            Cancel
          </button>
          <button className="btn primary full" onClick={confirm}>
            🤝 Mark as swapped
          </button>
        </div>
      </div>
    </div>
  );
}
