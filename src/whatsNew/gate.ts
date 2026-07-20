// Pure, node-safe gating for the post-upgrade "What's New" carousel. No store or
// React import, so this module (and its tests) run in the plain-node Vitest env —
// mirroring the sync/albumMode.ts + sync/joinAlbum.ts convention.

export interface WhatsNewGateInput {
  /** True when a persisted collection already existed at startup — a returning user
   *  (an upgrader), not a brand-new install. */
  existingUser: boolean;
  /** The release id the user last saw the carousel for (undefined if never). */
  lastSeenId: string | undefined;
  /** The id of the current build's What's New content. */
  latestId: string;
}

/**
 * Show the carousel only to a returning user who hasn't yet seen the latest release's
 * content. Brand-new installs are suppressed (everything is already new to them), and
 * a user who has seen `latestId` won't see it again until a newer release ships.
 */
export function shouldShowWhatsNew({ existingUser, lastSeenId, latestId }: WhatsNewGateInput): boolean {
  return existingUser && lastSeenId !== latestId;
}
