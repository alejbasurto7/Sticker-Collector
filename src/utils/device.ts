/**
 * True on the desktop build (mouse-primary): a fine pointer that can hover.
 * Touch devices — the installed PWA on a phone or tablet — report a coarse
 * pointer and no hover, so they fall through to the tap / long-press wording.
 *
 * The gestures themselves live in StickerCell, which already handles both mouse
 * and touch at runtime; this only picks which instructions to show.
 */
export function isDesktop(): boolean {
  return (
    typeof window !== 'undefined' &&
    window.matchMedia?.('(hover: hover) and (pointer: fine)').matches === true
  );
}

/**
 * The primary "activate" verb for the current device: "Click" on a mouse-primary
 * desktop, "Tap" on touch. Capitalized for use at the start of a sentence or
 * clause — lower-case it at the call site if it lands mid-sentence.
 */
export function tapVerb(): 'Click' | 'Tap' {
  return isDesktop() ? 'Click' : 'Tap';
}
