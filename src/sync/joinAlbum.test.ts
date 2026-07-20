import { describe, it, expect } from 'vitest';
import { joinErrorMessage, DEFAULT_JOIN_NAME } from './joinAlbum';
import type { PeekResult } from './engine';

// joinErrorMessage only reads `ok`, `kind`, and `reason`, so minimal shapes cast to
// PeekResult are enough to exercise every branch without a full AlbumSnapshot.
const album = { ok: true, kind: 'album' } as PeekResult;
const collection = { ok: true, kind: 'collection' } as PeekResult;
const fail = (reason: 'invalid' | 'not-found' | 'network' | 'unconfigured'): PeekResult =>
  ({ ok: false, reason });

describe('DEFAULT_JOIN_NAME', () => {
  it('is "Shared album"', () => {
    expect(DEFAULT_JOIN_NAME).toBe('Shared album');
  });
});

describe('joinErrorMessage', () => {
  it('returns null for a joinable album share', () => {
    expect(joinErrorMessage(album)).toBeNull();
  });
  it('rejects a Cloud (collection) code with the Cloud-code message', () => {
    expect(joinErrorMessage(collection)).toBe(
      "That's a Cloud code (for syncing your own devices), not a shared-album code. Use the Cloud option for that.",
    );
  });
  it('maps invalid to the format hint', () => {
    expect(joinErrorMessage(fail('invalid'))).toBe(
      "That code doesn't look right — it should be 12 letters/numbers.",
    );
  });
  it('maps not-found to the double-check message', () => {
    expect(joinErrorMessage(fail('not-found'))).toBe(
      "No shared album found for that code. Double-check it with the person who shared it.",
    );
  });
  it('maps network and unconfigured to the connectivity message', () => {
    const connectivity = "Couldn't reach sync. Check your connection and try again.";
    expect(joinErrorMessage(fail('network'))).toBe(connectivity);
    expect(joinErrorMessage(fail('unconfigured'))).toBe(connectivity);
  });
});
