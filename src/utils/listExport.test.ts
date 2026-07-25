import { describe, it, expect } from 'vitest';
import { buildSwapExport, buildGroupListExport } from './listExport';
import { parseExport } from './import';
import { album, stickerById } from '../data/sampleAlbum';
import type { GroupPool } from './groupSwap';

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

describe('buildGroupListExport', () => {
  const getId = page.stickerIds[0];
  const giveId = page.stickerIds[1];

  it('emits I need / To Swap sections from the pool, round-trippable through parseExport', () => {
    const pool: GroupPool = {
      get: { [getId]: 2 }, writableGet: { [getId]: 2 }, give: { [giveId]: 1 }, internalMoves: [],
    };
    const text = buildGroupListExport(pool, 'Kids');
    expect(text).toContain('Figuritas App - List');
    expect(text).toContain('Kids');
    expect(text).toContain('I need');
    expect(text).toContain('To Swap');
    expect(text).toMatch(/\(×2\)/); // get qty > 1 survives as "(×2)"

    // Round-trips: the other collector parses my needs as their swaps and vice-versa.
    const parsed = parseExport(text);
    expect(parsed.needs).toContain(getId);
    expect(parsed.needQty[getId]).toBe(2);
    expect(parsed.swaps).toContain(giveId);
  });

  it('omits an empty section', () => {
    const text = buildGroupListExport(
      { get: {}, writableGet: {}, give: { [giveId]: 1 }, internalMoves: [] },
      'Kids',
    );
    expect(text).not.toContain('I need');
    expect(text).toContain('To Swap');
  });
});
