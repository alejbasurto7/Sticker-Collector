import { useState } from 'react';
import type { CSSProperties } from 'react';
import type { Page } from '../types';
import { stickerById } from '../data/sampleAlbum';
import { useCollection } from '../store/collectionStore';
import StickerCell from './StickerCell';
import type { AlbumFilter } from './FilterBar';

interface Props {
  page: Page;
  filter: AlbumFilter;
}

/**
 * Grid placement for a country spread, mirroring the printed album so users can
 * eye the real pages against the app while tapping. A team page is two 4×3 pages
 * side by side: stickers 1–10 on the left, 11–20 on the right. Index = position
 * (0-based) within each page; `span` marks the landscape sticker 13.
 */
type Cell = { col: number; row: number; span?: number };

const LEFT_LAYOUT: Cell[] = [
  { col: 3, row: 1 }, // 1
  { col: 4, row: 1 }, // 2
  { col: 1, row: 2 }, // 3
  { col: 2, row: 2 }, // 4
  { col: 3, row: 2 }, // 5
  { col: 4, row: 2 }, // 6
  { col: 1, row: 3 }, // 7
  { col: 2, row: 3 }, // 8
  { col: 3, row: 3 }, // 9
  { col: 4, row: 3 }, // 10
];

const RIGHT_LAYOUT: Cell[] = [
  { col: 1, row: 1 }, // 11
  { col: 2, row: 1 }, // 12
  { col: 3, row: 1, span: 2 }, // 13 — landscape, spans columns 3–4
  { col: 1, row: 2 }, // 14
  { col: 2, row: 2 }, // 15
  { col: 3, row: 2 }, // 16
  { col: 4, row: 2 }, // 17
  { col: 2, row: 3 }, // 18
  { col: 3, row: 3 }, // 19
  { col: 4, row: 3 }, // 20
];

function placement(cell: Cell): CSSProperties {
  return {
    gridColumn: cell.span ? `${cell.col} / span ${cell.span}` : cell.col,
    gridRow: cell.row,
  };
}

export default function PageSection({ page, filter }: Props) {
  const [open, setOpen] = useState(false);
  const counts = useCollection((s) => s.counts);
  const addOne = useCollection((s) => s.addOne);
  const removeOne = useCollection((s) => s.removeOne);
  const locked = useCollection((s) => s.locked);

  const owned = page.stickerIds.filter((id) => (counts[id] ?? 0) >= 1).length;
  const total = page.stickerIds.length;

  const visibleIds = page.stickerIds.filter((id) => {
    const c = counts[id] ?? 0;
    if (filter === 'missing') return c === 0;
    if (filter === 'swaps') return c > 1;
    return true;
  });

  // Hide pages with nothing to show under a non-"all" filter.
  if (filter !== 'all' && visibleIds.length === 0) return null;

  // The printed-album spread only applies to full country pages (20 stickers in
  // album order). Filtered views and intro/extra pages keep the flow grid.
  const useSpread = page.type === 'team' && filter === 'all';

  const renderCell = (id: string, style?: CSSProperties, landscape?: boolean) => (
    <StickerCell
      key={id}
      sticker={stickerById[id]}
      count={counts[id] ?? 0}
      locked={locked}
      landscape={landscape}
      style={style}
      onAdd={() => addOne(id)}
      onRemove={() => removeOne(id)}
    />
  );

  return (
    <section className="page-section">
      <button className="page-head" onClick={() => setOpen((o) => !o)}>
        <span className="emoji">{page.emoji}</span>
        <span className="titles">
          <div className="code">{page.code}</div>
          <div className="name">{page.title}</div>
        </span>
        <span className="mini-bar">
          <span style={{ width: `${total ? (owned / total) * 100 : 0}%` }} />
        </span>
        <span className="count">
          {owned}/{total}
        </span>
        <span className={`chevron ${open ? 'open' : ''}`}>›</span>
      </button>

      {open &&
        (useSpread ? (
          <div className="album-spread">
            <div className="album-page left">
              {visibleIds
                .slice(0, 10)
                .map((id, i) => renderCell(id, placement(LEFT_LAYOUT[i])))}
            </div>
            <div className="album-page right">
              {visibleIds.slice(10).map((id, i) => {
                const cell = RIGHT_LAYOUT[i];
                return renderCell(id, placement(cell), Boolean(cell.span));
              })}
            </div>
          </div>
        ) : (
          <div className="sticker-grid">
            {visibleIds.map((id) => renderCell(id))}
          </div>
        ))}
    </section>
  );
}
