import { useEffect, useMemo, useState } from 'react';
import { useCollection, HAD_PERSISTED_COLLECTION } from './store/collectionStore';
import { useSyncBoot } from './sync/useSync';
import { useForcedReadOnly } from './sync/useAlbumMode';
import { computeStats, displayPct } from './utils/stats';
import TabBar, { type Tab } from './components/TabBar';
import ProgressBar from './components/ProgressBar';
import AlbumView from './components/AlbumView';
import SwapsView from './components/SwapsView';
import StatsView from './components/StatsView';
import SettingsView from './components/SettingsView';
import SettingsDialog from './components/SettingsDialog';
import ShareListDialog from './components/ShareListDialog';
import AchievementToaster from './components/AchievementToaster';
import ReloadPrompt from './components/ReloadPrompt';
import RevocationNotice from './components/RevocationNotice';
import AlbumSwitcher from './components/AlbumSwitcher';
import LibrarySheet from './components/LibrarySheet';
import AlbumDetailView from './components/AlbumDetailView';
import WhatsNewDialog from './components/WhatsNewDialog';
import { shouldShowWhatsNew } from './whatsNew/gate';
import { LATEST_WHATS_NEW_ID } from './whatsNew/releases';
import AlbumOnboardingDialog from './components/AlbumOnboardingDialog';
import { shouldShowAlbumOnboarding } from './onboarding/gate';

export default function App() {
  const [tab, setTab] = useState<Tab>('album');
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [shareOpen, setShareOpen] = useState(false);
  const [libraryOpen, setLibraryOpen] = useState(false);
  const [detailOpen, setDetailOpen] = useState(false);
  const [whatsNewOpen, setWhatsNewOpen] = useState(false);
  const [onboardingOpen, setOnboardingOpen] = useState(false);
  const counts = useCollection((s) => s.counts);
  const swaps = useCollection((s) => s.swaps);
  const edition = useCollection((s) => s.edition);
  const trackCC = useCollection((s) => s.trackCC);
  const activeAlbumId = useCollection((s) => s.activeAlbumId);
  const switchAlbum = useCollection((s) => s.switchAlbum);
  const theme = useCollection((s) => s.theme);
  const locked = useCollection((s) => s.locked);
  const toggleLocked = useCollection((s) => s.toggleLocked);
  const lastSeenWhatsNewId = useCollection((s) => s.lastSeenWhatsNewId);
  const setLastSeenWhatsNewId = useCollection((s) => s.setLastSeenWhatsNewId);
  const hasSeenAlbumOnboarding = useCollection((s) => s.hasSeenAlbumOnboarding);
  const setAlbumOnboardingSeen = useCollection((s) => s.setAlbumOnboardingSeen);
  const forcedReadOnly = useForcedReadOnly();

  // Boot cross-device sync (no-op unless Supabase is configured and a link exists).
  useSyncBoot();

  // Show the post-upgrade "What's New" carousel once to returning users who haven't
  // seen this release; silently seed fresh installs so it never fires retroactively.
  // Runs once on mount — the persisted store is already rehydrated synchronously.
  useEffect(() => {
    if (
      shouldShowWhatsNew({
        existingUser: HAD_PERSISTED_COLLECTION,
        lastSeenId: lastSeenWhatsNewId,
        latestId: LATEST_WHATS_NEW_ID,
      })
    ) {
      setWhatsNewOpen(true);
    } else if (!HAD_PERSISTED_COLLECTION && lastSeenWhatsNewId !== LATEST_WHATS_NEW_ID) {
      setLastSeenWhatsNewId(LATEST_WHATS_NEW_ID);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Show the first-album onboarding carousel once to brand-new users, so they learn
  // the tap / long-press gestures right away. Returning users are seeded as seen so it
  // never fires retroactively (the inverse of the What's New gate above). Runs once on
  // mount — the persisted store is already rehydrated synchronously.
  useEffect(() => {
    if (shouldShowAlbumOnboarding({ existingUser: HAD_PERSISTED_COLLECTION, hasSeen: hasSeenAlbumOnboarding })) {
      setOnboardingOpen(true);
    } else if (HAD_PERSISTED_COLLECTION && !hasSeenAlbumOnboarding) {
      setAlbumOnboardingSeen();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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
          <AlbumSwitcher onOpen={() => setLibraryOpen(true)} />
          <div className="header-actions">
            <button
              className={`icon-btn lock-toggle${locked || forcedReadOnly ? ' locked' : ''}`}
              onClick={forcedReadOnly ? undefined : toggleLocked}
              disabled={forcedReadOnly}
              role="switch"
              aria-checked={locked || forcedReadOnly}
              aria-label={
                forcedReadOnly
                  ? 'Read-only shared album — editing is disabled'
                  : locked
                    ? 'Album locked — tap to unlock and edit'
                    : 'Album unlocked — tap to lock'
              }
              title={forcedReadOnly ? 'Read-only shared album' : locked ? 'Locked (read-only)' : 'Unlocked (editable)'}
            >
              {locked || forcedReadOnly ? '🔒' : '🔓'}
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
          </div>
        </div>
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
        {tab === 'settings' && <SettingsView />}
      </main>

      <TabBar active={tab} onChange={setTab} openSwaps={openSwaps} />

      {shareOpen && <ShareListDialog onClose={() => setShareOpen(false)} />}
      {settingsOpen && <SettingsDialog onClose={() => setSettingsOpen(false)} />}

      {libraryOpen && (
        <LibrarySheet
          onClose={() => setLibraryOpen(false)}
          onManageAlbum={(id) => {
            switchAlbum(id);
            setLibraryOpen(false);
            setDetailOpen(true);
          }}
          onOpenCloudSync={() => {
            setLibraryOpen(false);
            setSettingsOpen(true);
          }}
        />
      )}

      {detailOpen && <AlbumDetailView onClose={() => setDetailOpen(false)} />}

      {whatsNewOpen && (
        <WhatsNewDialog
          onClose={() => {
            setLastSeenWhatsNewId(LATEST_WHATS_NEW_ID);
            setWhatsNewOpen(false);
          }}
        />
      )}

      {onboardingOpen && (
        <AlbumOnboardingDialog
          onClose={() => {
            setAlbumOnboardingSeen();
            setOnboardingOpen(false);
          }}
        />
      )}

      <RevocationNotice />
      <AchievementToaster />
      <ReloadPrompt />
    </div>
  );
}
