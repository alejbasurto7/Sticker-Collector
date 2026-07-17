import { useMemo, useState } from 'react';
import { useCollection } from '../store/collectionStore';
import { activeReceiving, computeConflicts, totalGiving } from '../utils/swap';
import type { Swap } from '../types';
import NewSwapDialog from './NewSwapDialog';
import SwapDetail from './SwapDetail';

export default function SwapsView() {
  const swaps = useCollection((s) => s.swaps);
  const counts = useCollection((s) => s.counts);
  const [creating, setCreating] = useState(false);
  const [openSwap, setOpenSwap] = useState<Swap | null>(null);

  const conflicts = useMemo(() => computeConflicts(swaps, counts), [swaps, counts]);

  const swapConflictCount = (s: Swap) => {
    if (s.status !== 'open') return 0;
    let n = 0;
    for (const id of s.giving) if (conflicts.giving.has(id)) n++;
    for (const id of s.receiving) if (conflicts.receiving.has(id)) n++;
    return n;
  };

  const open = swaps.filter((s) => s.status === 'open');
  const closed = swaps.filter((s) => s.status === 'closed');

  // Re-read the live swap object so the detail modal reflects edits.
  const liveOpenSwap = openSwap ? swaps.find((s) => s.id === openSwap.id) ?? null : null;

  return (
    <div>
      <div className="toolbar">
        <button className="btn primary" onClick={() => setCreating(true)}>
          ＋ New swap
        </button>
      </div>

      {swaps.length === 0 && (
        <div className="empty-state">
          <div className="big-emoji">🔄</div>
          <p>
            No swaps yet. Tap <b>New swap</b>, paste another collector's list, and the app
            finds which stickers you can trade.
          </p>
        </div>
      )}

      {open.map((s) => (
        <SwapCard key={s.id} swap={s} conflicts={swapConflictCount(s)} onOpen={() => setOpenSwap(s)} />
      ))}

      {closed.length > 0 && <div className="section-title">Concluded</div>}
      {closed.map((s) => (
        <SwapCard key={s.id} swap={s} conflicts={0} onOpen={() => setOpenSwap(s)} />
      ))}

      {creating && <NewSwapDialog onClose={() => setCreating(false)} />}
      {liveOpenSwap && <SwapDetail swap={liveOpenSwap} onClose={() => setOpenSwap(null)} />}
    </div>
  );
}

function SwapCard({
  swap,
  conflicts,
  onOpen,
}: {
  swap: Swap;
  conflicts: number;
  onOpen: () => void;
}) {
  return (
    <div className={`swap-card ${swap.status}`} onClick={onOpen} role="button">
      <div className="swap-top">
        <span className="swap-name">{swap.name}</span>
        <span className={`pill ${swap.status}`}>{swap.status}</span>
      </div>
      <div className="swap-summary">
        <span className="give">↑ Give {totalGiving(swap)}</span>
        <span className="get">↓ Get {activeReceiving(swap).length}</span>
      </div>
      {conflicts > 0 && (
        <div className="conflict-banner">
          ⚠️ {conflicts} sticker{conflicts > 1 ? 's' : ''} also promised in another swap.
        </div>
      )}
    </div>
  );
}
