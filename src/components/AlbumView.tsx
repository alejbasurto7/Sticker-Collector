import { useMemo, useState } from 'react';
import { album } from '../data/sampleAlbum';
import { useCollection } from '../store/collectionStore';
import FilterBar, { type AlbumFilter } from './FilterBar';
import PageSection from './PageSection';

type SortMode = 'album' | 'az' | 'progress-asc' | 'progress-desc';

export default function AlbumView() {
  const [filter, setFilter] = useState<AlbumFilter>('all');
  const [search, setSearch] = useState('');
  const [sort, setSort] = useState<SortMode>('album');
  const [openIds, setOpenIds] = useState<Set<string>>(() => new Set());
  const counts = useCollection((s) => s.counts);

  const filterCounts = useMemo(() => {
    let all = 0;
    let missing = 0;
    let swaps = 0;
    for (const s of album.stickers) {
      all++;
      const c = counts[s.id] ?? 0;
      if (c === 0) missing++;
      if (c > 1) swaps++;
    }
    return { all, missing, swaps };
  }, [counts]);

  const visiblePages = useMemo(() => {
    let pages = album.pages;

    if (search.trim()) {
      const q = search.trim().toLowerCase();
      pages = pages.filter(
        (p) => p.title.toLowerCase().includes(q) || p.code.toLowerCase().includes(q),
      );
    }

    if (sort === 'az') {
      pages = [...pages].sort((a, b) => a.title.localeCompare(b.title));
    } else if (sort === 'progress-asc' || sort === 'progress-desc') {
      pages = [...pages].sort((a, b) => {
        const pct = (p: (typeof pages)[number]) =>
          p.stickerIds.length === 0
            ? 0
            : p.stickerIds.filter((id) => (counts[id] ?? 0) >= 1).length / p.stickerIds.length;
        return sort === 'progress-asc' ? pct(a) - pct(b) : pct(b) - pct(a);
      });
    }

    return pages;
  }, [search, sort, counts]);

  // A single smart toggle drives every visible section: it expands all when
  // any are collapsed, and collapses all once everything is open.
  const allOpen =
    visiblePages.length > 0 && visiblePages.every((p) => openIds.has(p.id));

  const toggleAll = () => {
    setOpenIds((prev) => {
      if (allOpen) {
        const next = new Set(prev);
        for (const p of visiblePages) next.delete(p.id);
        return next;
      }
      const next = new Set(prev);
      for (const p of visiblePages) next.add(p.id);
      return next;
    });
  };

  const togglePage = (id: string) =>
    setOpenIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  return (
    <div>
      <FilterBar value={filter} onChange={setFilter} counts={filterCounts} />

      <div className="search-sort-bar">
        <input
          className="search-input"
          type="text"
          placeholder="Search pages…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <select
          className="sort-select"
          value={sort}
          onChange={(e) => setSort(e.target.value as SortMode)}
        >
          <option value="album">Album order</option>
          <option value="az">A → Z</option>
          <option value="progress-asc">Least complete</option>
          <option value="progress-desc">Most complete</option>
        </select>
      </div>

      <div className="album-toolbar">
        <p className="empty-note">Tap a sticker to add it · long-press to remove.</p>
        <button
          className="expand-toggle"
          onClick={toggleAll}
          disabled={visiblePages.length === 0}
          aria-pressed={allOpen}
        >
          <span className={`chevron ${allOpen ? 'open' : ''}`}>›</span>
          {allOpen ? 'Collapse all' : 'Expand all'}
        </button>
      </div>

      {visiblePages.map((p) => (
        <PageSection
          key={p.id}
          page={p}
          filter={filter}
          open={openIds.has(p.id)}
          onToggle={() => togglePage(p.id)}
        />
      ))}
    </div>
  );
}
