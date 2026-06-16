import { useMemo, useState } from 'react';
import { album } from './data/sampleAlbum';
import { useCollection } from './store/collectionStore';
import { computeStats } from './utils/stats';
import TabBar, { type Tab } from './components/TabBar';
import ProgressBar from './components/ProgressBar';
import AlbumView from './components/AlbumView';
import SwapsView from './components/SwapsView';
import StatsView from './components/StatsView';
import EditionDialog from './components/EditionDialog';

export default function App() {
  const [tab, setTab] = useState<Tab>('album');
  const [editionOpen, setEditionOpen] = useState(false);
  const counts = useCollection((s) => s.counts);
  const swaps = useCollection((s) => s.swaps);
  const edition = useCollection((s) => s.edition);

  // edition is a dep so totals recompute when the album layout changes.
  const stats = useMemo(() => computeStats(counts), [counts, edition]);
  const openSwaps = swaps.filter((s) => s.status === 'open').length;

  return (
    <div className="app">
      <header className="app-header">
        <div className="header-top">
          <h1>{album.name}</h1>
          <button className="icon-btn" onClick={() => setEditionOpen(true)} aria-label="Album edition">
            ⚙️
          </button>
        </div>
        <div className="subtitle">FIFA World Cup 2026 · {album.stickers.length} stickers</div>
        <div className="header-progress">
          <ProgressBar
            label="Album progress"
            value={`${stats.ownedUnique}/${stats.totalStickers} · ${Math.round(
              stats.completionPct * 100,
            )}%`}
            pct={stats.completionPct}
          />
        </div>
      </header>

      {/* key by edition so views remount and recompute when the layout changes */}
      <main className="content" key={edition}>
        {tab === 'album' && <AlbumView />}
        {tab === 'swaps' && <SwapsView />}
{tab === 'stats' && <StatsView />}
      </main>

      <TabBar active={tab} onChange={setTab} openSwaps={openSwaps} />

      {editionOpen && <EditionDialog onClose={() => setEditionOpen(false)} />}
    </div>
  );
}
