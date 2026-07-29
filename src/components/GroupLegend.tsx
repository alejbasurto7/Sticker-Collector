import type { AlbumMarkInfo } from '../utils/chipBadges';
import AlbumMark from './AlbumMark';

interface Props {
  members: AlbumMarkInfo[];
}

/** Maps each mark to its album, so the badges are learnable on first sight. */
export default function GroupLegend({ members }: Props) {
  if (members.length === 0) return null;
  return (
    <div className="group-legend">
      {members.map((m) => (
        <span className="legend-item" key={m.id}>
          <AlbumMark {...m} size="md" />
          {m.name}
          {m.viewOnly && <span className="group-member-badge">view-only</span>}
        </span>
      ))}
    </div>
  );
}
