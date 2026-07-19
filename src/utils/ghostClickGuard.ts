/**
 * Guards against the "ghost click" iOS synthesizes after a touch long-press.
 *
 * A long-press decrement can drop the pressed cell out of a filtered view (e.g.
 * a Dupes cell going 2 → 1), so it unmounts mid-gesture and the neighbour to its
 * right slides under the finger. On release iOS then synthesizes a click at
 * those coordinates — now over the neighbour — which would otherwise add a
 * sticker to the wrong cell.
 *
 * A per-cell flag can't catch this because the stray click lands on a DIFFERENT
 * cell than the one that was pressed. This shared, one-shot guard lets the
 * long-press arm suppression that the next click on ANY cell consumes.
 */

let pendingGhostClick = false;

/** Arm suppression of the next synthesized click (call as a long-press fires). */
export function armGhostClickGuard(): void {
  pendingGhostClick = true;
}

/** Clear any armed suppression (call when a fresh press begins). */
export function disarmGhostClickGuard(): void {
  pendingGhostClick = false;
}

/**
 * Returns true (and disarms) when the current click is the ghost click a recent
 * long-press armed; false for a genuine tap. Only one click is ever swallowed.
 */
export function consumeGhostClick(): boolean {
  if (!pendingGhostClick) return false;
  pendingGhostClick = false;
  return true;
}
