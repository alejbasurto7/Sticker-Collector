import type { ReactNode } from 'react';
import SlideManageAlbums from '../components/whatsNew/SlideManageAlbums';
import SlideAlbumModes from '../components/whatsNew/SlideAlbumModes';

/**
 * Id of the current build's What's New content. Gating is keyed on THIS, not the app
 * semver (which may not bump on every deploy). Whenever a release adds new what's-new
 * slides, bump this id + `versionLabel` and swap the `slides` list below.
 */
export const LATEST_WHATS_NEW_ID = '2026.07-albums';

export interface WhatsNewRelease {
  id: string;
  /** Curated label shown in the eyebrow, e.g. "v1.1". */
  versionLabel: string;
  slides: ReactNode[];
}

/** The single release surfaced by the carousel (we only show the newest one). */
export const LATEST_RELEASE: WhatsNewRelease = {
  id: LATEST_WHATS_NEW_ID,
  versionLabel: 'v1.1',
  slides: [
    <SlideManageAlbums key="manage-albums" />,
    <SlideAlbumModes key="album-modes" />,
  ],
};
