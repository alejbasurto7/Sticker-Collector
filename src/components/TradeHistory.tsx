import { useCollection } from '../store/collectionStore';
import StickerChips from './StickerChips';

interface Props {
  onClose: () => void;
}

function formatDate(ts: number): string {
  const d = new Date(ts);
  const today = new Date();
  const isToday =
    d.getFullYear() === today.getFullYear() &&
    d.getMonth() === today.getMonth() &&
    d.getDate() === today.getDate();
  const time = d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  if (isToday) return `Today at ${time}`;
  return d.toLocaleDateString([], { month: 'short', day: 'numeric' }) + ` at ${time}`;
}

export default function TradeHistory({ onClose }: Props) {
  const swaps = useCollection((s) => s.swaps);
  const undoLastTrade = useCollection((s) => s.undoLastTrade);

  const last = [...swaps]
    .filter((s) => s.status === 'closed')
    .sort((a, b) => (b.closedAt ?? 0) - (a.closedAt ?? 0))[0];

  const handleUndo = () => {
    undoLastTrade();
    onClose();
  };

  const receivedSet = new Set(last?.receiving ?? []);
  const gaveSet = new Set(last?.giving ?? []);

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal trade-history-modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-drag-handle" />
        <h2>Last trade</h2>

        {!last ? (
          <p className="modal-sub">No completed trades yet.</p>
        ) : (
          <>
            <p className="trade-history-date">{formatDate(last.closedAt ?? last.createdAt)}</p>

            <div className="section-title">Received ({last.receiving.length})</div>
            <StickerChips
              ids={last.receiving}
              selected={receivedSet}
              readOnly
            />

            <div className="section-title" style={{ marginTop: 20 }}>Gave ({last.giving.length})</div>
            <StickerChips
              ids={last.giving}
              selected={gaveSet}
              readOnly
            />

            <button className="btn danger full trade-undo-btn" onClick={handleUndo}>
              ↩ Undo last trade
            </button>
          </>
        )}

        <div className="btn-row">
          <button className="btn full" onClick={onClose}>
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
