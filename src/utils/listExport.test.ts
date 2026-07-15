import { describe, it, expect } from 'vitest';
import { buildSwapExport } from './listExport';
import { album, stickerById } from '../data/sampleAlbum';

// Grab a few real sticker ids from the first album page to build fixtures.
const page = album.pages[0];
const ids = page.stickerIds.slice(0, 3);
const numbers = ids.map((id) => stickerById[id].number);

describe('buildSwapExport', () => {
  it('renders both sides with grouped "emoji CODE: n, n, n" lines', () => {
    const text = buildSwapExport(ids, []);
    expect(text).toContain('You give:');
    expect(text).toContain(`${page.emoji} ${page.code}: ${numbers.join(', ')}`);
    expect(text).toContain('You get:');
  });

  it('shows "Nothing here." for an empty side, mirroring the screen', () => {
    const text = buildSwapExport([], ids);
    expect(text).toBe(
      ['You give:', 'Nothing here.', '', 'You get:', `${page.emoji} ${page.code}: ${numbers.join(', ')}`].join('\n'),
    );
  });

  it('keeps give above get and separates the two sides with a blank line', () => {
    const lines = buildSwapExport(ids, ids).split('\n');
    expect(lines[0]).toBe('You give:');
    expect(lines).toContain('');
    expect(lines.indexOf('You give:')).toBeLessThan(lines.indexOf('You get:'));
  });
});
