import { Fragment } from 'react';
import type { CSSProperties } from 'react';
import type { Page } from '../types';
import { stickerById } from '../data/sampleAlbum';
import { layoutFor } from '../data/layouts';
import type { LayoutCell, LayoutPage } from '../data/layouts';
import { useCollection } from '../store/collectionStore';
import StickerCell from './StickerCell';
import type { AlbumFilter } from './FilterBar';

interface Props {
  page: Page;
  filter: AlbumFilter;
  open: boolean;
  onToggle: () => void;
}

/** Inline CSS-grid placement for a layout cell (1-based col/row, optional spans). */
function placement(cell: LayoutCell): CSSProperties {
  return {
    gridColumn: cell.colSpan ? `${cell.col} / span ${cell.colSpan}` : cell.col,
    gridRow: cell.rowSpan ? `${cell.row} / span ${cell.rowSpan}` : cell.row,
  };
}

/** Group printed pages into spreads of two (each rendered as a side-by-side row). */
function spreadsOf(pages: LayoutPage[]): LayoutPage[][] {
  const spreads: LayoutPage[][] = [];
  for (let i = 0; i < pages.length; i += 2) spreads.push(pages.slice(i, i + 2));
  return spreads;
}

export default function PageSection({ page, filter, open, onToggle }: Props) {
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

  // The printed-album layout only applies under the "all" filter (it shows every
  // sticker in album order). Filtered views and untemplated pages keep the flow
  // grid.
  const layout = layoutFor(page);
  const useSpread = Boolean(layout) && filter === 'all';

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

  // A single layout cell: a pre-printed decorative placeholder, or a real sticker
  // placed by its 1-based index into the page's stickerIds.
  const renderLayoutCell = (cell: LayoutCell, key: number) => {
    const style = placement(cell);
    if (cell.decorative || cell.index == null) {
      return <div key={`d${key}`} className="cell decorative" style={style} aria-hidden="true" />;
    }
    const id = page.stickerIds[cell.index - 1];
    if (!id) return null;
    return renderCell(id, style, cell.landscape);
  };

  return (
    <section className="page-section">
      <button className="page-head" onClick={onToggle} aria-expanded={open}>
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
        (useSpread && layout ? (
          <div className="album-spread">
            {spreadsOf(layout.pages).map((spread, si) => (
              <div className="album-spread-row" key={si}>
                {spread.map((lp, pi) => (
                  <Fragment key={pi}>
                    {pi > 0 && <div className="album-fold" aria-hidden="true" />}
                    <div
                      className="album-page"
                      style={
                        {
                          gridTemplateColumns: `repeat(${lp.cols}, minmax(0, 1fr))`,
                          gridTemplateRows: `repeat(${lp.rows}, auto)`,
                          '--cols': lp.cols,
                        } as CSSProperties
                      }
                    >
                      {lp.cells.map((cell, ci) => renderLayoutCell(cell, ci))}
                    </div>
                  </Fragment>
                ))}
              </div>
            ))}
          </div>
        ) : (
          <div className="sticker-grid">
            {visibleIds.map((id) => renderCell(id))}
          </div>
        ))}
    </section>
  );
}
