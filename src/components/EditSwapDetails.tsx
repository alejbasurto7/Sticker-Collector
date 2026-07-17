import { useState } from 'react';
import type { Swap } from '../types';
import { useCollection } from '../store/collectionStore';

interface Props {
  swap: Swap;
  onClose: () => void;
}

/** Lightweight editor for a swap's name and notes only — used for concluded swaps,
 *  where the traded stickers are settled and must not be re-matched. */
export default function EditSwapDetails({ swap, onClose }: Props) {
  const updateSwap = useCollection((s) => s.updateSwap);
  const [name, setName] = useState(swap.name);
  const [notes, setNotes] = useState(swap.notes ?? '');

  const save = () => {
    updateSwap(swap.id, { name: name.trim() || 'Untitled swap', notes });
    onClose();
  };

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <h2>Edit details</h2>
        <p className="modal-sub">Update the swap name and notes.</p>

        <div className="field-label">Swap name</div>
        <input
          type="text"
          value={name}
          placeholder="e.g. Carlos"
          onChange={(e) => setName(e.target.value)}
        />

        <div className="field-label">Notes</div>
        <textarea
          className="notes-input"
          value={notes}
          placeholder="Anything to remember about this swap…"
          onChange={(e) => setNotes(e.target.value)}
        />

        <div className="btn-row">
          <button className="btn full" onClick={onClose}>
            Cancel
          </button>
          <button className="btn primary full" onClick={save}>
            Save changes
          </button>
        </div>
      </div>
    </div>
  );
}
