import { useMemo, useState } from 'react';
import { album } from '../data/sampleAlbum';
import { useCollection } from '../store/collectionStore';
import FilterBar, { type AlbumFilter } from './FilterBar';
import PageSection from './PageSection';
import ImportDialog from './ImportDialog';

export default function AlbumView() {
  const [filter, setFilter] = useState<AlbumFilter>('all');
  const [importOpen, setImportOpen] = useState(false);
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

  return (
    <div>
      <div className="toolbar">
        <button className="btn" onClick={() => setImportOpen(true)}>
          ⬆ Import list
        </button>
      </div>

      <FilterBar value={filter} onChange={setFilter} counts={filterCounts} />

      <p className="empty-note" style={{ paddingTop: 0 }}>
        Tap a sticker to add it · long-press to remove.
      </p>

      {album.pages.map((p) => (
        <PageSection key={p.id} page={p} filter={filter} />
      ))}

      {importOpen && <ImportDialog onClose={() => setImportOpen(false)} />}
    </div>
  );
}
