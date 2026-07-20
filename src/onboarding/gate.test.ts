import { describe, it, expect } from 'vitest';
import { shouldShowAlbumOnboarding } from './gate';

describe('shouldShowAlbumOnboarding', () => {
  it('shows on a fresh install that has not seen it', () => {
    expect(shouldShowAlbumOnboarding({ existingUser: false, hasSeen: false })).toBe(true);
  });

  it('suppresses once a fresh install has seen it', () => {
    expect(shouldShowAlbumOnboarding({ existingUser: false, hasSeen: true })).toBe(false);
  });

  it('never shows a returning user, seen or not', () => {
    expect(shouldShowAlbumOnboarding({ existingUser: true, hasSeen: false })).toBe(false);
    expect(shouldShowAlbumOnboarding({ existingUser: true, hasSeen: true })).toBe(false);
  });
});
