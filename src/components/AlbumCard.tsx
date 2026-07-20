import { useMemo } from 'react';
import type { AlbumSnapshot } from '../store/collectionStore';
import { useAlbumMode, useResolvedAlbumName } from '../sync/useAlbumMode';
import { MODE_BADGE } from '../sync/albumMode';
import { computeStatsFor, displayPct } from '../utils/stats';
import { monogram, coverTint } from '../utils/albumCover';

interface Props {
  album: AlbumSnapshot;
  isActive: boolean;
  onOpen: () => void;   // switch to this album + close the sheet
  onManage: () => void; // switch + open this album's detail
}

export default function AlbumCard({ album, isActive, onOpen, onManage }: Props) {
  const name = useResolvedAlbumName(album.id, album.albumName);
  const mode = useAlbumMode(album.id);
  const stats = useMemo(
    () => computeStatsFor(album.counts, album.edition, album.trackCC),
    [album.counts, album.edition, album.trackCC],
  );
  const badge = MODE_BADGE[mode];
  const pct = displayPct(stats.completionPct);

  return (
    <div className={`album-card${isActive ? ' active' : ''}`}>
      <button type="button" className="album-card-main" onClick={onOpen}>
        <span className={`album-cover tint-${coverTint(album.id)}`} aria-hidden="true">
          {monogram(name)}
        </span>
        <span className="album-card-body">
          <span className="album-card-top">
            <span className="album-card-name">{name}</span>
            <span className="album-card-badge">{badge.icon} {badge.label}</span>
          </span>
          <span className="album-card-bar"><span style={{ width: `${pct}%` }} /></span>
          <span className="album-card-meta">
            {stats.ownedUnique}/{stats.totalStickers} · {pct}%
            {isActive && <span className="album-card-current"> · Current</span>}
          </span>
        </span>
      </button>
      <button type="button" className="album-card-manage" onClick={onManage} aria-label={`Manage ${name}`}>
        ⚙️
      </button>
    </div>
  );
}
