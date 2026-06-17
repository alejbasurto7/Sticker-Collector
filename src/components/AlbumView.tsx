import { useMemo, useState } from 'react';
import { album } from '../data/sampleAlbum';
import { useCollection } from '../store/collectionStore';
import FilterBar, { type AlbumFilter } from './FilterBar';
import PageSection from './PageSection';
import ImportDialog from './ImportDialog';

type SortMode = 'album' | 'az' | 'progress-asc' | 'progress-desc';

export default function AlbumView() {
  const [filter, setFilter] = useState<AlbumFilter>('all');
  const [search, setSearch] = useState('');
  const [sort, setSort] = useState<SortMode>('album');
  const [importOpen, setImportOpen] = useState(false);
  const counts = useCollection((s) => s.counts);
  const locked = useCollection((s) => s.locked);
  const toggleLocked = useCollection((s) => s.toggleLocked);

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

  return (
    <div>
      <div className="toolbar">
        <button className="btn" onClick={() => setImportOpen(true)}>
          ⬆ Import list
        </button>
        <button
          className={`btn icon-btn lock-toggle${locked ? ' locked' : ''}`}
          onClick={toggleLocked}
          role="switch"
          aria-checked={locked}
          aria-label={locked ? 'Album locked — tap to unlock and edit' : 'Album unlocked — tap to lock'}
          title={locked ? 'Locked (read-only)' : 'Unlocked (editable)'}
        >
          {locked ? '🔒' : '🔓'}
        </button>
      </div>

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

      <p className="empty-note" style={{ paddingTop: 0 }}>
        Tap a sticker to add it · long-press to remove.
      </p>

      {visiblePages.map((p) => (
        <PageSection key={p.id} page={p} filter={filter} />
      ))}

      {importOpen && <ImportDialog onClose={() => setImportOpen(false)} />}
    </div>
  );
}
