import type { InternalMove } from '../utils/groupSwap';
import type { ResolvedGroupMember } from '../sync/groupMembers';
import { labelFor } from '../utils/group';

interface Props {
  moves: InternalMove[];
  members: ResolvedGroupMember[];
  onApply: (m: InternalMove) => void;
}

/**
 * The netted A↔B shuffles between the family's own albums (§E): a copy one album has
 * spare that another is missing. Each is applied with one tap (decrement source,
 * increment target) — no external trade involved.
 */
export default function InternalMovesPanel({ moves, members, onApply }: Props) {
  if (moves.length === 0) return null;
  const nameOf = (id: string) => members.find((m) => m.id === id)?.name ?? id;
  return (
    <div className="internal-moves">
      <div className="section-title">Internal moves ({moves.length})</div>
      {moves.map((m, i) => (
        <div className="internal-move-row" key={`${m.id}-${m.fromId}-${m.toId}-${i}`}>
          <span>
            {labelFor(m.id)}: {nameOf(m.fromId)} → {nameOf(m.toId)}
          </span>
          <button type="button" className="btn" onClick={() => onApply(m)}>
            Apply
          </button>
        </div>
      ))}
    </div>
  );
}
