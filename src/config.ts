/** App-wide display strings. Keep branding in one place. */

/** Display name of the app, used in share exports, titles, etc. */
export const APP_NAME = 'Sticker Collector';

// The album's collection/type label now comes from the album's own AlbumType.name
// (see src/data/albumTypes.ts) so each album shows its real collection.

/** Canonical, installable production URL — used for the Share link + QR. Hardcoded
 *  (not derived from window.location) so a localhost/preview build still shares the
 *  real, installable site. */
export const APP_URL = 'https://alejbasurto7.github.io/Sticker-Collector/';
