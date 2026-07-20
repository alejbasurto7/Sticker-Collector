// Pure, node-safe gating for the first-album onboarding carousel. No store or React
// import, so this module (and its tests) run in the plain-node Vitest env — mirroring
// the whatsNew/gate.ts convention.

export interface AlbumOnboardingGateInput {
  /** True when a persisted collection already existed at startup — a returning user,
   *  not a brand-new install. */
  existingUser: boolean;
  /** Whether the user has already seen (and dismissed) the onboarding carousel. */
  hasSeen: boolean;
}

/**
 * Show the onboarding carousel only to a brand-new install that hasn't seen it yet.
 * Returning users are suppressed here (they've been using the app already); App.tsx
 * seeds them as seen so the carousel never fires retroactively — the inverse of the
 * What's New gate, which suppresses new installs instead.
 */
export function shouldShowAlbumOnboarding({ existingUser, hasSeen }: AlbumOnboardingGateInput): boolean {
  return !existingUser && !hasSeen;
}
