import { describe, it, expect } from 'vitest';
import { shouldShowWhatsNew } from './gate';

describe('shouldShowWhatsNew', () => {
  const latestId = '2026.07-albums';

  it('suppresses on a fresh install (no persisted collection)', () => {
    expect(shouldShowWhatsNew({ existingUser: false, lastSeenId: undefined, latestId })).toBe(false);
  });

  it('shows to a returning user who has never seen a What’s New', () => {
    expect(shouldShowWhatsNew({ existingUser: true, lastSeenId: undefined, latestId })).toBe(true);
  });

  it('shows to a returning user who last saw an older release', () => {
    expect(shouldShowWhatsNew({ existingUser: true, lastSeenId: '2026.05-swaps', latestId })).toBe(true);
  });

  it('suppresses once the latest release has been seen', () => {
    expect(shouldShowWhatsNew({ existingUser: true, lastSeenId: latestId, latestId })).toBe(false);
  });

  it('never shows a fresh install, even across an id boundary', () => {
    expect(shouldShowWhatsNew({ existingUser: false, lastSeenId: 'anything', latestId })).toBe(false);
  });
});
