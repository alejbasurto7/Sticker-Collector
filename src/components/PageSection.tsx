import { useState } from 'react';
import type { Page } from '../types';
import { stickerById } from '../data/sampleAlbum';
import { useCollection } from '../store/collectionStore';
import StickerCell from './StickerCell';
import type { AlbumFilter } from './FilterBar';

interface Props {
  page: Page;
  filter: AlbumFilter;
}

export default function PageSection({ page, filter }: Props) {
  const [open, setOpen] = useState(false);
  const counts = useCollection((s) => s.counts);
  const addOne = useCollection((s) => s.addOne);
  const removeOne = useCollection((s) => s.removeOne);

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

      {open && (
        <div className="sticker-grid">
          {visibleIds.map((id) => (
            <StickerCell
              key={id}
              sticker={stickerById[id]}
              count={counts[id] ?? 0}
              onAdd={() => addOne(id)}
              onRemove={() => removeOne(id)}
            />
          ))}
        </div>
      )}
    </section>
  );
}
