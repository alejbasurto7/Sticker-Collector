import { beforeEach, describe, expect, test } from 'vitest';
import {
  armGhostClickGuard,
  consumeGhostClick,
  disarmGhostClickGuard,
} from './ghostClickGuard';

// The guard is a module-level singleton: reset it before every case so tests
// don't leak state into one another.
beforeEach(() => disarmGhostClickGuard());

describe('ghostClickGuard', () => {
  test('a normal click is not suppressed when nothing armed it', () => {
    expect(consumeGhostClick()).toBe(false);
  });

  test('a long-press arms suppression of the very next click', () => {
    armGhostClickGuard();
    expect(consumeGhostClick()).toBe(true);
  });

  test('only ONE click is swallowed per long-press', () => {
    armGhostClickGuard();
    expect(consumeGhostClick()).toBe(true);
    // The follow-up genuine tap must still register.
    expect(consumeGhostClick()).toBe(false);
  });

  test('the guard is shared, so a DIFFERENT cell than the pressed one swallows the ghost click', () => {
    // The pressed cell arms the guard as its long-press fires...
    armGhostClickGuard();
    // ...then unmounts (its count dropped it out of the filter). The neighbour
    // that shifted under the finger receives the synthesized click and, because
    // the guard is global rather than per-cell, it too consumes the suppression.
    expect(consumeGhostClick()).toBe(true);
  });

  test('disarming clears a stale arm so a later genuine tap still adds', () => {
    // A long-press armed the guard but iOS never synthesized the ghost click.
    armGhostClickGuard();
    // A fresh press begins; disarming here prevents the stale arm from
    // swallowing the next real tap.
    disarmGhostClickGuard();
    expect(consumeGhostClick()).toBe(false);
  });
});
