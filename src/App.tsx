import { useEffect, useMemo, useState } from 'react';
import { ALBUM_TYPE } from './config';
import { useCollection } from './store/collectionStore';
import { useSyncBoot } from './sync/useSync';
import { computeStats, displayPct } from './utils/stats';
import TabBar, { type Tab } from './components/TabBar';
import ProgressBar from './components/ProgressBar';
import AlbumView from './components/AlbumView';
import SwapsView from './components/SwapsView';
import StatsView from './components/StatsView';
import EditionDialog from './components/EditionDialog';
import HelpDialog from './components/HelpDialog';
import ShareListDialog from './components/ShareListDialog';
import AchievementToaster from './components/AchievementToaster';
import ReloadPrompt from './components/ReloadPrompt';

export default function App() {
  const [tab, setTab] = useState<Tab>('album');
  const [editionOpen, setEditionOpen] = useState(false);
  const [shareOpen, setShareOpen] = useState(false);
  const [helpOpen, setHelpOpen] = useState(false);
  const counts = useCollection((s) => s.counts);
  const swaps = useCollection((s) => s.swaps);
  const edition = useCollection((s) => s.edition);
  const trackCC = useCollection((s) => s.trackCC);
  const albumName = useCollection((s) => s.albumName);
  const activeAlbumId = useCollection((s) => s.activeAlbumId);
  const theme = useCollection((s) => s.theme);
  const locked = useCollection((s) => s.locked);
  const toggleLocked = useCollection((s) => s.toggleLocked);

  // Boot cross-device sync (no-op unless Supabase is configured and a link exists).
  useSyncBoot();

  // Mirror the chosen colour scheme onto the document root so the light-mode
  // CSS variable overrides (see styles.css) take effect app-wide.
  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
  }, [theme]);

  // Prevent iOS PWA window-drag everywhere except the two scrollable surfaces
  // (.content and .modal). iOS ignores touch-action:none alone; the
  // passive:false document listener is required to call preventDefault().
  useEffect(() => {
    const preventWindowDrag = (e: Event) => {
      const target = e.target as Element | null;
      if (target?.closest('.content, .modal')) return;
      e.preventDefault();
    };
    document.addEventListener('touchmove', preventWindowDrag, { passive: false });
    return () => document.removeEventListener('touchmove', preventWindowDrag);
  }, []);

  // edition/trackCC are deps so totals recompute when the album layout changes.
  const stats = useMemo(() => computeStats(counts), [counts, edition, trackCC]);
  const openSwaps = swaps.filter((s) => s.status === 'open').length;

  return (
    <div className="app">
      <header className="app-header">
        <div className="header-top">
          <h1>{albumName}</h1>
          <div className="header-actions">
            <button
              className={`icon-btn lock-toggle${locked ? ' locked' : ''}`}
              onClick={toggleLocked}
              role="switch"
              aria-checked={locked}
              aria-label={locked ? 'Album locked — tap to unlock and edit' : 'Album unlocked — tap to lock'}
              title={locked ? 'Locked (read-only)' : 'Unlocked (editable)'}
            >
              {locked ? '🔒' : '🔓'}
            </button>
            <button className="icon-btn" onClick={() => setShareOpen(true)} aria-label="Share list">
              <svg
                width="19"
                height="19"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
              >
                <path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8" />
                <polyline points="16 6 12 2 8 6" />
                <line x1="12" y1="2" x2="12" y2="15" />
              </svg>
            </button>
            <button className="icon-btn" onClick={() => setEditionOpen(true)} aria-label="Settings">
              ⚙️
            </button>
            <button
              className="icon-btn help-btn"
              onClick={() => setHelpOpen(true)}
              aria-label="How it works"
              title="How it works"
            >
              ?
            </button>
          </div>
        </div>
        <div className="subtitle">{ALBUM_TYPE}</div>
        <div className="header-progress">
          <ProgressBar
            label="Album progress"
            value={`${stats.ownedUnique}/${stats.totalStickers} · ${displayPct(
              stats.completionPct,
            )}%`}
            pct={stats.completionPct}
          />
        </div>
      </header>

      {/* key by edition + CC tracking so views remount and recompute when the layout changes */}
      <main className="content" key={`${activeAlbumId}-${edition}-${trackCC}`}>
        {tab === 'album' && <AlbumView />}
        {tab === 'swaps' && <SwapsView />}
{tab === 'stats' && <StatsView />}
      </main>

      <TabBar active={tab} onChange={setTab} openSwaps={openSwaps} />

      {shareOpen && <ShareListDialog onClose={() => setShareOpen(false)} />}
      {editionOpen && <EditionDialog onClose={() => setEditionOpen(false)} />}
      {helpOpen && <HelpDialog onClose={() => setHelpOpen(false)} />}

      <AchievementToaster />
      <ReloadPrompt />
    </div>
  );
}
