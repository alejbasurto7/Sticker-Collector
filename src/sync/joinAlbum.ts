// Pure, node-safe join-decision logic. A type-only import of PeekResult keeps this module free of
// the engine's Supabase runtime (mirrors albumMode.ts), so it and its tests run in the node Vitest env.
import type { PeekResult } from './engine';

/** The name a joined album gets on this device by default; the joiner can rename it in the dialog
 *  and later in the album's Settings. Kept non-empty so the owner's name never surfaces. */
export const DEFAULT_JOIN_NAME = 'Shared album';

/**
 * The message to show for a peeked code that can't be joined, or `null` when the code is a joinable
 * album share (`ok && kind === 'album'`). Centralises the copy so the dialog and its tests share one
 * source of truth.
 */
export function joinErrorMessage(peek: PeekResult): string | null {
  if (peek.ok) {
    if (peek.kind === 'album') return null;
    return "That’s a Cloud code (for syncing your own devices), not a shared-album code. Use the Cloud option for that.";
  }
  switch (peek.reason) {
    case 'invalid':
      return "That code doesn’t look right — it should be 12 letters/numbers.";
    case 'not-found':
      return "No shared album found for that code. Double-check it with the person who shared it.";
    default: // 'network' | 'unconfigured'
      return "Couldn’t reach sync. Check your connection and try again.";
  }
}
