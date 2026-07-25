export type Platform = 'ios' | 'android' | 'other';

/**
 * Classify the OS from a User-Agent string. Pure (UA-only) so it is unit-testable
 * in the Node test env. NOTE: iPadOS 13+ reports a *Mac* desktop UA and so resolves
 * to 'other' here — getPlatform() corrects that at runtime with a touch heuristic.
 * Classic (pre-iPadOS-13) iPad UAs still contain "iPad" and match 'ios'.
 */
export function parsePlatform(ua: string): Platform {
  if (/iPhone|iPad|iPod/i.test(ua)) return 'ios';
  if (/Android/i.test(ua)) return 'android';
  return 'other';
}

/** True when the app is running as an installed PWA (home-screen / standalone). */
export function isStandalone(): boolean {
  if (typeof window === 'undefined') return false;
  const displayMode = window.matchMedia?.('(display-mode: standalone)').matches === true;
  // iOS Safari exposes navigator.standalone instead of the display-mode media query.
  const iosStandalone =
    (window.navigator as Navigator & { standalone?: boolean }).standalone === true;
  return displayMode || iosStandalone;
}

/**
 * The current OS, with an iPadOS correction on top of the pure parse: iPadOS 13+
 * masquerades as macOS, so a Mac-like UA reporting multi-touch is treated as iOS.
 */
export function getPlatform(): Platform {
  if (typeof navigator === 'undefined') return 'other';
  const base = parsePlatform(navigator.userAgent);
  if (base !== 'other') return base;
  const looksMac = /Macintosh|Mac OS X/i.test(navigator.userAgent);
  if (looksMac && navigator.maxTouchPoints > 1) return 'ios';
  return 'other';
}
