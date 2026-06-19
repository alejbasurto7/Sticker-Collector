import { Fragment } from 'react';
import type { CSSProperties } from 'react';
import type { Page } from '../types';
import { stickerById } from '../data/sampleAlbum';
import { templateFor } from '../data/layouts';
import { slotBox, bindTemplate } from '../data/layoutGeometry';
import type { SectionTemplate, Placement } from '../data/layoutGeometry';
import { useCollection } from '../store/collectionStore';
import StickerCell from './StickerCell';
import type { AlbumFilter } from './FilterBar';

interface Props {
  page: Page;
  filter: AlbumFilter;
  open: boolean;
  onToggle: () => void;
}

/** Absolute placement (centre-anchored) for one slot, in page percentages. */
function slotStyle(placement: Placement, t: SectionTemplate): CSSProperties {
  const b = slotBox(placement.slot, t);
  return {
    position: 'absolute',
    left: `${b.leftPct}%`,
    top: `${b.topPct}%`,
    width: `${b.widthPct}%`,
    height: `${b.heightPct}%`,
  };
}

/** Group printed pages into spreads of two (rendered side by side). */
function spreadsOf<T>(pages: T[]): T[][] {
  const spreads: T[][] = [];
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

  if (filter !== 'all' && visibleIds.length === 0) return null;

  // The printed-album layout only applies under the "all" filter; filtered and
  // untemplated pages keep the responsive flow grid.
  const template = templateFor(page);
  const useSpread = Boolean(template) && filter === 'all';
  const bound = template ? bindTemplate(template, page.stickerIds) : null;

  // Display-only: prefix the bare number with the section code (e.g. "CC1").
  const numberPrefix = page.prefixNumbers ? page.code : '';

  const renderCell = (id: string, style?: CSSProperties, landscape?: boolean) => (
    <StickerCell
      key={id}
      sticker={stickerById[id]}
      count={counts[id] ?? 0}
      locked={locked}
      landscape={landscape}
      numberPrefix={numberPrefix}
      style={style}
      onAdd={() => addOne(id)}
      onRemove={() => removeOne(id)}
    />
  );

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
        (useSpread && template && bound ? (
          <div className="album-spread">
            {spreadsOf(bound.pages).map((spread, si) => (
              <div className="album-spread-row" key={si}>
                {spread.map((bp, pi) => (
                  <Fragment key={pi}>
                    {pi > 0 && <div className="album-fold" aria-hidden="true" />}
                    <div
                      className="album-page"
                      style={{ '--page-aspect': template.pageAspect } as CSSProperties}
                    >
                      {bp.placements.map((pl, ci) => {
                        const style = slotStyle(pl, template);
                        if (pl.slot.decorative || !pl.stickerId) {
                          return (
                            <div
                              key={`d${ci}`}
                              className="cell decorative"
                              style={style}
                              aria-hidden="true"
                            />
                          );
                        }
                        return renderCell(
                          pl.stickerId,
                          style,
                          pl.slot.orientation === 'landscape',
                        );
                      })}
                    </div>
                  </Fragment>
                ))}
              </div>
            ))}
            {bound.unplaced.length > 0 && (
              <div className="sticker-grid">
                {bound.unplaced.map((id) => renderCell(id))}
              </div>
            )}
          </div>
        ) : (
          <div className="sticker-grid">{visibleIds.map((id) => renderCell(id))}</div>
        ))}
    </section>
  );
}
