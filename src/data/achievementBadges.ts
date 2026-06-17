/**
 * Emoji badge for each achievement key. Shared by the Achievements list and the
 * celebratory unlock banner so the icon shown stays consistent across the app.
 */
export const ACHIEVEMENT_BADGES: Record<string, string> = {
  'first-sticker': '⭐',
  'first-page': '📄',
  liftoff: '🚀',
  quarter: '🥉',
  halfway: '🥈',
  'on-a-roll': '🔥',
  'home-stretch': '🥇',
  'final-push': '💎',
  complete: '🏆',
  century: '🎯',
  bookworm: '📚',
  librarian: '🗂️',
  'shiny-hunter': '✨',
  'squad-goals': '👕',
  'by-the-book': '🟦',
  'first-dupe': '🃏',
  'swap-master': '🔄',
  hoarder: '📦',
  'seeing-double': '👯',
  'first-trade': '🤝',
  'wheeler-dealer': '🔁',
  'three-day-streak': '🗓️',
  'week-warrior': '📆',
  'speed-run': '⏱️',
};

/** Fallback badge for any achievement key without an explicit emoji. */
export const DEFAULT_BADGE = '🎖';

/** The emoji for an achievement key, falling back to a generic medal. */
export const badgeFor = (key: string): string => ACHIEVEMENT_BADGES[key] ?? DEFAULT_BADGE;
